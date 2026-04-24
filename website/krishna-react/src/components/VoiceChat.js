import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoiceOrb from './VoiceOrb';
import MessageHistory from './MessageHistory';
import VoiceControls from './VoiceControls';
import './VoiceChat.css';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS } from '../config/api';

const API_URL = API_ENDPOINTS.ASK;

// Master toggle for Divine Ambient Music
const ENABLE_DIVINE_MUSIC = false;
const NORMAL_MUSIC_VOLUME = 0; // 0% volume for idle state
const DUCKED_MUSIC_VOLUME = 0; // 0% volume when Krishna is speaking


// ⚡ Feature toggle: true = fast multi-part greeting, false = original single-pass (safe fallback)
const ENABLE_OPTIMIZED_GREETING = true;

function VoiceChat() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [hasStarted, setHasStarted] = useState(false);
    const [chatLimitInfo, setChatLimitInfo] = useState({
        is_paid: false,
        messages_used: 0,
        free_limit: 5,
        remaining: 5,
        limit_reached: false,
        is_unlimited: false
    });

    // Parse query params for active state
    const searchParams = new URLSearchParams(location.search);
    const isActiveParam = searchParams.get('active') === 'true';

    // Use the URL param to drive the modal state
    const [showLanguageModal, setShowLanguageModal] = useState(!isActiveParam);
    const [selectedLanguage, setSelectedLanguage] = useState(null);
    const [activeMessageId, setActiveMessageId] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const hasGreetedRef = useRef(false);
    const persistentAudioRef = useRef(null); // Primary audio element for iOS compatibility
    const isAudioUnlockedRef = useRef(false);
    const isCancelledRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const activeMessageIdRef = useRef(null);
    // ── Divine Ambient Music refs ──────────────────────────────
    const divineAudioRef = useRef(null);          // The ambient <audio> element
    const divineStoppedForSessionRef = useRef(false); // Once true, never plays again this session
    const divineFadingRef = useRef(null);         // Holds setInterval id for fade ramps

    // Generate Session ID once per mount
    const [sessionId] = useState(() => 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));

    // ── Divine Music Helpers ───────────────────────────────────
    /**
     * Smoothly fade the divine ambient track to targetVol over durationMs.
     * If targetVol === 0 and permanent === true, the track is paused after fade
     * and flagged so it will never play again in this session.
     */
    const fadeDivineMusic = useCallback((targetVol, durationMs, permanent = false) => {
        if (!ENABLE_DIVINE_MUSIC) return;
        const audio = divineAudioRef.current;
        if (!audio) return;

        // Clear any in-progress fade
        if (divineFadingRef.current) {
            clearInterval(divineFadingRef.current);
            divineFadingRef.current = null;
        }

        const steps = 30;
        const intervalMs = durationMs / steps;

        // Ensure audio is playing if we are fading into a volume > 0
        if (targetVol > 0 && audio.paused && !divineStoppedForSessionRef.current) {
            audio.play().catch(e => console.warn('[Divine] Auto-play during fade failed:', e.message));
        }

        const startVol = audio.volume;
        const delta = (targetVol - startVol) / steps;
        let step = 0;

        divineFadingRef.current = setInterval(() => {
            step++;
            const next = Math.min(1, Math.max(0, startVol + delta * step));
            audio.volume = next;
            if (step >= steps) {
                clearInterval(divineFadingRef.current);
                divineFadingRef.current = null;
                audio.volume = targetVol;
                if (targetVol === 0) {
                    audio.pause();
                    if (permanent) {
                        divineStoppedForSessionRef.current = true;
                        console.log('[Divine] Ambient music stopped permanently for this session.');
                    }
                }
            }
        }, intervalMs);
    }, []);

    /** Start playing the ambient track from the beginning and fade in. */
    const startDivineMusic = useCallback(() => {
        if (!ENABLE_DIVINE_MUSIC) return;
        const audio = divineAudioRef.current;
        if (!audio || divineStoppedForSessionRef.current) return;

        console.log('[Divine] Fading in ambient music (Post-Greeting)...');
        audio.volume = 0;
        audio.loop = true;
        audio.play().then(() => {
            fadeDivineMusic(NORMAL_MUSIC_VOLUME, 3000); // 3s fade in
        }).catch(e => {
            console.warn('[Divine] Ambient play failed (likely autoplay policy):', e);
        });
    }, [fadeDivineMusic]);

    const stopAudio = useCallback((reason = "unspecified", isTransitioningToListening = false) => {
        console.log(`Stopping audio... (Reason: ${reason})`);
        isCancelledRef.current = true; // Signal cancellation

        const audio = persistentAudioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }

        isSpeakingRef.current = false;
        activeMessageIdRef.current = null;
        setIsSpeaking(false);
        setActiveMessageId(null);

        // -- Resume background music if it was ducked/paused --
        // EXCEPT if we are about to start the mic (listening)
        if (ENABLE_DIVINE_MUSIC && divineAudioRef.current && !divineStoppedForSessionRef.current && !isTransitioningToListening) {
            fadeDivineMusic(NORMAL_MUSIC_VOLUME, 1000);
        }
    }, [fadeDivineMusic]);

    // ─────────────────────────────────────────────────────────

    const unlockAudio = useCallback(async () => {
        if (isAudioUnlockedRef.current) return;

        console.log("Unlocking audio systems for iOS/Mobile...");
        try {
            // 1. Initialize/Resume AudioContext
            if (!audioContextRef.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioContextRef.current = new AudioContextClass();
                }
            }

            if (audioContextRef.current) {
                if (audioContextRef.current.state === 'suspended') {
                    await audioContextRef.current.resume();
                }

                // Create and play a very short silent buffer
                // This is the key "gesture" required by iOS to allow future async audio
                const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
                const node = audioContextRef.current.createBufferSource();
                node.buffer = buffer;
                node.connect(audioContextRef.current.destination);
                node.start(0);
                node.onended = () => {
                    node.disconnect();
                    console.log("Web Audio systems primed");
                };
            }

            // 2. Unlock HTMLAudioElement (Fallback)
            if (persistentAudioRef.current) {
                // Ensure playsinline and preload are set
                persistentAudioRef.current.setAttribute('playsinline', 'true');
                persistentAudioRef.current.setAttribute('webkit-playsinline', 'true');
                persistentAudioRef.current.preload = 'auto';

                // Silent wav data to "wake up" the element
                persistentAudioRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                const playPromise = persistentAudioRef.current.play();
                if (playPromise !== undefined) {
                    await playPromise.catch(e => console.warn("Silent play failed, but intent was registered:", e));
                    persistentAudioRef.current.pause();
                }
            }

            isAudioUnlockedRef.current = true;
            console.log("Audio systems successfully unlocked");
        } catch (err) {
            console.error("Audio systems unlock failed:", err);
        }
    }, []);

    // Global listener to unlock audio on first interaction
    useEffect(() => {
        const handleInteraction = () => {
            console.log("User interaction detected, attempting to unlock audio...");
            unlockAudio();
        };

        window.addEventListener('touchstart', handleInteraction, { once: true, capture: true });
        window.addEventListener('click', handleInteraction, { once: true, capture: true });
        window.addEventListener('mousedown', handleInteraction, { once: true, capture: true });

        return () => {
            window.removeEventListener('touchstart', handleInteraction, { capture: true });
            window.removeEventListener('click', handleInteraction, { capture: true });
            window.removeEventListener('mousedown', handleInteraction, { capture: true });
        };
    }, [unlockAudio]);

    const fetchChatLimit = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await axios.get(`${API_ENDPOINTS.CHAT_LIMIT}?user_id=${user.id}`);
            if (res.data.success) {
                setChatLimitInfo(res.data);
            }
        } catch (e) {
            console.error("Failed to fetch chat limit:", e);
        }
    }, [user?.id]);

    // Fetch conversation history and chat limit
    useEffect(() => {
        const fetchHistory = async () => {
            if (user?.id) {
                try {
                    const res = await axios.get(`${API_ENDPOINTS.HISTORY}?user_id=${user.id}`);
                    if (res.data.success && res.data.history) {
                        const loadedMessages = [];
                        res.data.history.forEach((h, i) => {
                            loadedMessages.push({
                                id: `user_${i}`,
                                type: 'user',
                                text: h.question,
                                timestamp: h.timestamp
                            });
                            loadedMessages.push({
                                id: `krishna_${i}`,
                                type: 'krishna',
                                text: h.answer,
                                timestamp: h.timestamp
                            });
                        });
                        if (loadedMessages.length > 0) {
                            setMessages(loadedMessages);
                        }
                    }
                } catch (e) {
                    console.error("Failed to load history:", e);
                }
            }
        };
        fetchHistory();
        fetchChatLimit();
    }, [user?.id, fetchChatLimit]);

    const speakText = useCallback(async (text, messageId = null, audioUrl = null, onEnd = null, chainNext = false, languageOverride = null) => {
        // Use refs to read live values — avoids stale closure bug that stops audio after 1 sec
        if (isSpeakingRef.current && activeMessageIdRef.current === messageId && messageId !== null && !audioUrl) {
            stopAudio();
            return;
        }

        // For MPA continuation calls (pre-fetched blob), skip stopAudio() entirely.
        // Calling stopAudio() would set isSpeaking=false in React state, causing the orb
        // to flicker off between Part1 end and Part2 start. For continuations the audio
        // element is already idle, so there's nothing to stop — just reset the cancel flag.
        const isMPAContinuation = audioUrl != null && audioUrl.startsWith('blob:');
        if (!isMPAContinuation) {
            stopAudio();
        }
        isCancelledRef.current = false;
        isSpeakingRef.current = true;
        activeMessageIdRef.current = messageId;
        setIsSpeaking(true);
        setActiveMessageId(messageId);

        // -- Audio Ducking: Lower background music during Krishna's speech --
        const musicIsActive = ENABLE_DIVINE_MUSIC && divineAudioRef.current && !divineStoppedForSessionRef.current;
        if (musicIsActive) {
            fadeDivineMusic(DUCKED_MUSIC_VOLUME, 500); // Duck background music
        }


        // ── Smart URL resolution ───────────────────────────────────────────
        // If audioUrl is already a blob: URL (pre-fetched Part 2), use it directly.
        // If it's a relative server path, prefix with baseUrl.
        // This is the critical glue that makes MPA work on both iOS and Android.
        const baseUrl = API_ENDPOINTS.ASK.split('/api/ask')[0];
        let fullUrl = null;
        if (audioUrl) {
            if (audioUrl.startsWith('blob:') || audioUrl.startsWith('http')) {
                fullUrl = audioUrl; // Already absolute — use as-is
            } else {
                fullUrl = `${baseUrl}${audioUrl}`; // Relative server path
            }
        }

        try {
            const audio = persistentAudioRef.current;
            if (!audio) throw new Error("Audio element missing");

            // Ensure playsinline for iOS
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');

            let src;
            const languageProp = languageOverride || selectedLanguage || 'russian';

            if (fullUrl) {
                src = fullUrl; // Use pre-resolved URL (blob or server path)
            } else {
                const response = await axios.post(API_ENDPOINTS.SPEAK, { text, language: languageProp }, { responseType: 'blob', timeout: 60000 });
                src = URL.createObjectURL(response.data);
            }

            if (isCancelledRef.current) {
                console.warn("⚡ Speech cancelled before playback:", text.substring(0, 30));
                if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
                isSpeakingRef.current = false;
                activeMessageIdRef.current = null;
                setIsSpeaking(false);
                setActiveMessageId(null);
                return;
            }

            audio.src = src;
            audio.load();

            // Set up the end handler first
            audio.onended = () => {
                isSpeakingRef.current = false;
                activeMessageIdRef.current = null;
                if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);

                if (chainNext && onEnd && typeof onEnd === 'function') {
                    onEnd();
                } else {
                    setIsSpeaking(false);
                    setActiveMessageId(null);
                    if (musicIsActive) fadeDivineMusic(NORMAL_MUSIC_VOLUME, 1000);
                    if (onEnd && typeof onEnd === 'function') onEnd();
                }
            };

            // Enhanced Play Logic with immediate fallback on failure
            try {
                await audio.play();
                console.log("✅ Audio playing");
            } catch (playErr) {
                // If the initial play failed (common for /api/audio timeouts on Render),
                // we trigger the manual fallback to /api/speak.
                if (playErr.name === 'NotSupportedError' || playErr.name === 'NotAllowedError' || !fullUrl) {
                    throw playErr; // Rethrow actual fatal errors
                }
                
                console.warn('⚠️ Primary audio failed, attempting fallback...', playErr.message);
                const fallbackResp = await axios.post(API_ENDPOINTS.SPEAK, { text, language: languageProp }, { responseType: 'blob', timeout: 60000 });
                const fallbackSrc = URL.createObjectURL(fallbackResp.data);
                
                audio.src = fallbackSrc;
                audio.load();
                audio.onended = () => {
                    isSpeakingRef.current = false;
                    activeMessageIdRef.current = null;
                    URL.revokeObjectURL(fallbackSrc);
                    setIsSpeaking(false);
                    setActiveMessageId(null);
                    if (musicIsActive) fadeDivineMusic(NORMAL_MUSIC_VOLUME, 1000);
                    if (onEnd && typeof onEnd === 'function') onEnd();
                };
                await audio.play();
                console.log('✅ Fallback playback started.');
            }

        } catch (err) {
            console.error("❌ Speech failed:", err);
            isSpeakingRef.current = false;
            activeMessageIdRef.current = null;
            setIsSpeaking(false);
            setActiveMessageId(null);
            if (onEnd && typeof onEnd === 'function') {
                onEnd();
            }
        }

    }, [stopAudio, selectedLanguage, fadeDivineMusic]);

    const handleAudioUpload = async (audioBlob) => {
        setIsLoading(true);
        setTranscript('Transcribing...');

        // Resume audio context on gesture
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => { });
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'record.webm');
        formData.append('language', selectedLanguage || 'russian');

        try {
            const res = await axios.post(API_ENDPOINTS.TRANSCRIBE, formData);
            if (res.data.success && res.data.text) {
                const transcriptText = res.data.text;
                // don't set transcript text as it will flash quickly before answer
                await handleVoiceInput(transcriptText);
            } else if (res.data.is_silent) {
                // RMS energy / word count guard detected silence — reset cleanly
                console.log("🤫 [Frontend] Server detected silence. Resetting to idle.");
                setIsLoading(false);
                setTranscript('');
            } else {
                setTranscript("Could not transcribe.");
                setIsLoading(false);
            }

        } catch (e) {
            console.error("Transcription error", e);
            setTranscript("Error understanding audio.");
            setIsLoading(false);
        }
    };

    const handleVoiceInput = useCallback(async (text) => {
        if (!text.trim()) return;

        // Keep what you said visible while LLM thinks
        setTranscript(text);

        // Add user message
        const userMessage = {
            id: Date.now(),
            type: 'user',
            text: text,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);

        // ---- REAL-TIME UI UPDATE START ----
        // Pre-emptively update usage count on UI for immediate feedback
        if (user?.id && !chatLimitInfo.is_paid) {
            setChatLimitInfo(prev => ({
                ...prev,
                messages_used: prev.messages_used + 1,
                remaining: Math.max(0, prev.remaining - 1)
            }));
        }
        // -------------------------------------

        setIsLoading(true);

        try {
            const startTime = performance.now();

            const response = await axios.post(API_URL, {
                question: text,
                include_audio: true, // Request audio URL directly
                session_id: sessionId,
                user_id: user?.id,
                language: selectedLanguage || 'russian'
            }, {
                timeout: 60000
            });

            const textTime = performance.now() - startTime;
            console.log(`⏱️ Text response received in ${textTime.toFixed(0)}ms`);

            const krishnaMessageId = Date.now() + 1;
            const krishnaMessage = {
                id: krishnaMessageId,
                type: 'krishna',
                text: response.data.answer || 'Извините, сейчас я не могу ответить.',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, krishnaMessage]);

            // Define what happens when audio finishes (or fails)
            const onAudioEnd = () => {
                if (response.data.chat_limit?.limit_reached) {
                    setChatLimitInfo(response.data.chat_limit);
                }
            };

            // If audio_url is present, use it directly for faster playback
            if (response.data.audio_url) {
                speakText(krishnaMessage.text, krishnaMessageId, response.data.audio_url, onAudioEnd);
            } else {
                speakText(krishnaMessage.text, krishnaMessageId, null, onAudioEnd);
            }

            // Mark user as 'Returning' now that they asked a legit question
            const welcomeLocalKey = `has_received_welcome_${user?.id || 'guest'}`;
            localStorage.setItem(welcomeLocalKey, 'true');
            if (user?.id) {
                axios.post(API_ENDPOINTS.WELCOME_RECEIVED, { user_id: user.id })
                    .catch(e => console.warn("Failed to mark welcome as seen in DB", e));
            }

            // Update COUNTER (messages_used/remaining) immediately, but keep limit_reached FALSE
            // This ensures the badge updates while the user is listening
            if (response.data.chat_limit && Object.keys(response.data.chat_limit).length > 0) {
                setChatLimitInfo(prev => ({
                    ...response.data.chat_limit,
                    limit_reached: prev.limit_reached // Do NOT trigger modal yet
                }));
            }

        } catch (error) {
            console.error('Error:', error);

            // Check for limit reached error
            if (error.response?.status === 403 && error.response?.data?.limit_reached) {
                setChatLimitInfo(prev => ({
                    ...prev,
                    limit_reached: true,
                    messages_used: error.response.data.messages_used || prev.messages_used
                }));
                return;
            }

            const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
            const errorMsgId = Date.now() + 1;
            const errorMsg = {
                id: errorMsgId,
                type: 'krishna',
                text: isTimeout
                    ? 'Запускаю сервер. Пожалуйста, подождите около 30 секунд и попробуйте снова. 🙏'
                    : 'Извините, произошла ошибка. Попробуйте еще раз.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
            speakText(errorMsg.text, errorMsgId);
        } finally {
            setIsLoading(false);
            setTranscript('');
        }
    }, [speakText, user, sessionId, selectedLanguage, chatLimitInfo.is_paid]);

    // ─────────────────────────────────────────────────────────────────────────
    // Start Journey Handler — Optimized with Multi-Part Audio (MPA) + Caching
    // ─────────────────────────────────────────────────────────────────────────
    // STRATEGY:
    //   A) localStorage FIRST: Instant welcome-state decision (<5ms, no DB round-trip)
    //   B) Part1 "Namaste!" fires immediately to TTS (short = fast, ~300-400ms)
    //   C) Part2 (Japanese body) is pre-fetched in background while Part1 plays
    //   D) Part2 plays seamlessly when Part1 ends (blob already in memory, no gap)
    //   E) Feature toggle: ENABLE_OPTIMIZED_GREETING=false → safe original single-pass
    // ─────────────────────────────────────────────────────────────────────────
    const handleStartJourney = useCallback(async (lang) => {
        if (hasGreetedRef.current) {
            console.warn("handleStartJourney already called, skipping duplicate.");
            return;
        }
        console.log("⚡ Starting journey — MPA optimized greeting path");

        // 1. Unlock audio first (critical user gesture for iOS/Safari)
        await unlockAudio();

        // 2. Show the interface immediately
        setHasStarted(true);

        // ── A: Instant welcome-state decision ──────
        // STRICT CHECK: Only mark as "returning" if they have sent at least one legit question in the past.
        // We ignore welcome flags — only REAL message history (DB count or loaded history/messages) counts.
        const alreadySeen = (chatLimitInfo.messages_used > 0) || (messages.length > 0);


        // Cache user's first name to localStorage so future sessions don't need DB
        const cachedFirstName = localStorage.getItem('user_first_name');
        const isEnglish = lang === 'english';
        const defaultName = isEnglish ? 'Friend' : 'Друг';
        const firstName = cachedFirstName
            || (user?.name ? user.name.split(' ')[0] : defaultName);

        // Persist first name for future fast lookups
        if (user?.name && !cachedFirstName) {
            localStorage.setItem('user_first_name', user.name.split(' ')[0]);
        }

        const seenInDB = user?.has_received_welcome_message;
        console.log(`Welcome check — DB: ${seenInDB}, alreadySeen: ${alreadySeen}, name: ${firstName}`);

        // ── B: Build Part1 + Part2 (Russia multi-voice split on \n) ──────────
        // The \n is the signal to the backend TTS to switch voice:
        //   Part before \n → English (Edge TTS) for "Namaste"
        //   Part after  \n → Russian TTS for the body
        // We split these so Part1 is ultra-short and fires first.
        const part1Text = `Namaste ${firstName}!`;
        let part2Text;
        if (alreadySeen) {
            part2Text = 'Надеюсь, наши прошлые беседы были полезны. Что беспокоит вас сегодня?';
        } else {
            part2Text = 'Я — Кришна. Спрашивайте о чём угодно: о жизни или ваших трудностях.';
        }
        const fullText = `${part1Text}\n${part2Text}`; // For display in MessageHistory

        // ── C: Show the combined greeting message in UI ───────────────────
        const msgId = Date.now();
        const greetMsg = {
            id: msgId,
            type: 'krishna',
            text: fullText,
            timestamp: new Date()
        };

        setMessages(prev => {
            if (alreadySeen) {
                // Returning user — append after history
                if (prev.length > 0 && prev[prev.length - 1].text === fullText) return prev;
                return [...prev, greetMsg];
            } else {
                // First-time user — only show if history is empty
                if (prev.length > 0) return prev;
                return [greetMsg];
            }
        });

        // ── D: Mark welcome logic moved to handleVoiceInput ────
        // We only consider them a 'returning user' once they ask their first real question.
        hasGreetedRef.current = true;

        // ── F: Play greeting using MPA or safe fallback ──────────────────
        if (ENABLE_OPTIMIZED_GREETING) {
            console.log("⚡ [MPA] Firing Part1 immediately + pre-fetching Part2 in background...");

            // STEP 1: Request Part2 audio in background IMMEDIATELY (parallel to Part1 request)
            // Using 'russian' lang for Part2 — the body is always Russian
            const part2Promise = axios.post(
                API_ENDPOINTS.SPEAK,
                { text: part2Text, language: 'russian' },
                { responseType: 'blob', timeout: 60000 }
            );

            // STEP 2: Request + play Part1 now (short text → fast TTS, ~300-400ms)
            // chainNext=true tells speakText NOT to reset isSpeaking when Part1 ends.
            // We force 'english' (Aarav voice) for Namaste to match the spiritual brand.
            speakText(part1Text, msgId, null, async () => {
                console.log("⚡ [MPA] Part1 done — awaiting pre-fetched Part2...");
                try {
                    const response = await part2Promise;
                    const blobSrc = URL.createObjectURL(response.data);
                    speakText(part2Text, `${msgId}_p2`, blobSrc, () => {
                        startDivineMusic();
                    }, false); // No languageOverride needed here, defaults to selectedLanguage (Russian)
                } catch (err) {
                    console.warn("⚡ [MPA] Part2 pre-fetch failed, falling back to dynamic fetch:", err);
                    speakText(part2Text, `${msgId}_p2`, null, () => {
                        startDivineMusic();
                    }, false);
                }
            }, true, 'english'); // Force English voice for "Namaste"

        } else {
            // ── SAFE FALLBACK: Original single-pass blocking logic ──────────
            console.log("🛡️ [Fallback] Running original single-pass greeting...");
            speakText(fullText, msgId, null, () => {
                startDivineMusic();
            });
        }

    }, [unlockAudio, speakText, user, startDivineMusic, chatLimitInfo.messages_used, messages.length]);

    // Synchronize showLanguageModal with URL param
    useEffect(() => {
        if (isActiveParam) {
            setShowLanguageModal(false);
        } else {
            setShowLanguageModal(true);
            setHasStarted(false); // Reset to allow a fresh start of the journey
            // If we go back to modal, arguably we should stop any current speech
            stopAudio();
        }
    }, [isActiveParam, stopAudio]);

    // Initialise divine ambient audio element on mount
    useEffect(() => {
        if (!ENABLE_DIVINE_MUSIC) {
            console.log('[Divine] Ambient music is currently disabled by master flag.');
            return;
        }

        const divineAudio = new Audio('/sacred-flute.mp3');
        divineAudio.loop = true;
        divineAudio.volume = 0;

        divineAudio.preload = 'auto';
        divineAudio.setAttribute('playsinline', 'true');
        divineAudio.setAttribute('webkit-playsinline', 'true');
        divineAudioRef.current = divineAudio;
        console.log('[Divine] Ambient audio element initialised.');

        return () => {
            // Clean up on unmount (user leaves chat page)
            if (divineFadingRef.current) clearInterval(divineFadingRef.current);
            divineAudio.pause();
            divineAudio.src = '';
            // Reset session flag so music plays again on next visit
            divineStoppedForSessionRef.current = false;
        };
    }, []);

    // Stop audio + divine music when location/route TRULY changes (path, not search params)
    // IMPORTANT: Must watch location.pathname ONLY — watching the full `location` object
    // means navigate('/chat?active=true') (adding a search param) also triggers the cleanup,
    // setting isCancelledRef=true mid-TTS-request and killing Part1 before it plays.
    useEffect(() => {
        return () => {
            console.log("Route changing/unmounting - stopping audio");
            isCancelledRef.current = true;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            // Stop divine music immediately on route change (no fade needed)
            if (divineAudioRef.current) {
                divineAudioRef.current.pause();
            }
        };
    }, [location.pathname]);

    const toggleListening = () => {
        // Unlock audio on first interaction for iOS
        unlockAudio();

        // ── Step 4: Mic clicked → Duck music during listening (temporary) ──
        if (ENABLE_DIVINE_MUSIC && !divineStoppedForSessionRef.current) {
            console.log('[Divine] Mic activated — ducking ambient music.');
            fadeDivineMusic(0, 500, false); // Fast 0.5s fade, NOT permanent
        }

        // Prevent starting a new recording if already processing or speaking
        if (!isListening && (isLoading || isSpeaking)) {
            console.log("Mic blocked: Still loading or speaking");
            if (isSpeaking) stopAudio("mic-gesture-stop", true); // Pass true to avoid resuming music too early
            return;
        }


        if (isListening) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            setIsListening(false);
        } else {
            // Stop speaking if Krishna is talking
            if (isSpeaking) {
                stopAudio();
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('Audio recording is not supported in this browser.');
                return;
            }

            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                // Try choosing a widely supported mimeType
                let mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/mp4';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = ''; // fallback to default
                    }
                }

                const mediaRecorder = new MediaRecorder(stream, { mimeType });
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];

                mediaRecorder.ondataavailable = event => {
                    if (event.data.size > 0) audioChunksRef.current.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(track => track.stop());
                    if (audioChunksRef.current.length > 0) {
                        // Keep using webm for the blob to not confuse backed
                        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });

                        // Resume music after recording stops (it will duck again if Krishna speaks)
                        if (ENABLE_DIVINE_MUSIC && !divineStoppedForSessionRef.current) {
                            fadeDivineMusic(NORMAL_MUSIC_VOLUME, 800);
                        }

                        await handleAudioUpload(audioBlob);
                    }
                };


                mediaRecorder.start();
                setIsListening(true);
                setHasStarted(true);
            }).catch(e => {
                console.error("Microphone access denied:", e);
                alert("Please allow microphone access to use voice chat.");
            });
        }
    };

    const stopSpeaking = () => {
        stopAudio();
    };

    const clearHistory = (date = null) => {
        // Stop any ongoing speech
        if (isSpeaking) {
            stopAudio();
        }

        if (date) {
            // Remove only messages from that date
            setMessages(prev => prev.filter(msg => {
                try {
                    if (!msg.timestamp) return true;
                    const msgDate = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
                    const dateKey = msgDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                    return dateKey !== date;
                } catch (e) {
                    return true;
                }
            }));
        } else {
            // Clear all messages
            setMessages([]);
            // Reset to initial state
            setHasStarted(false);
        }
    };

    return (
        <div className="voice-chat-container">
            {/* Header */}
            <header className="app-header">
                <button className="icon-button back-button" onClick={() => {
                    // Stop audio when navigating back
                    stopAudio();
                    if (showLanguageModal) {
                        navigate('/');
                    } else {
                        // Go back to the language selection state (modal)
                        navigate('/chat');
                    }
                }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                <div className="header-title-container">
                    <span className="logo-icon">🕉️</span>
                    <span className="header-title">
                        {selectedLanguage === 'english' ? 'Divine Voice' : 'Божественный голос'}
                    </span>
                </div>

                <button
                    className="history-toggle-new"
                    onClick={() => {
                        // Stop audio when toggling history
                        if (isSpeaking) {
                            stopAudio();
                        }
                        setShowHistory(!showHistory);
                    }}
                    title="История"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>История</span>
                </button>

                {/* Chat Limit Badge */}
                {user && !chatLimitInfo.is_unlimited && (
                    <div className={`chat-limit-badge ${chatLimitInfo.remaining <= (chatLimitInfo.is_paid ? 5 : 1) ? 'critical' : ''} ${chatLimitInfo.is_paid ? 'paid-badge' : ''}`}>
                        <div className="limit-icon">{chatLimitInfo.is_paid ? '⭐' : '✨'}</div>
                        <div className="limit-text">
                            {chatLimitInfo.is_paid ? (
                                <>Лимит: <span>{chatLimitInfo.messages_used}/{chatLimitInfo.paid_limit || 30}</span></>
                            ) : (
                                <>Осталось: <span>{chatLimitInfo.remaining}</span></>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* Language Selection Modal */}
            {showLanguageModal && (
                <div className="language-modal-overlay">
                    <div className="language-modal">
                        <button
                            className="modal-back-button"
                            onClick={() => navigate('/')}
                            title="Вернуться на главную"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                        <div className="language-modal-icon">
                            <img src="/om-icon.png" alt="OM" className="om-icon-fallback"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                            <div className="om-text-fallback" style={{ display: 'none' }}>🕉️</div>
                        </div>
                        <h2 className="language-modal-title">Как вы хотите<br /><span className="highlight">общаться с Кришной?</span></h2>
                        <p className="language-modal-subtitle">Выберите язык, на котором<br />Кришна будет отвечать</p>

                        <div className="language-options">
                            <button
                                className="language-option-btn english-btn"
                                onClick={() => {
                                    setSelectedLanguage('english');
                                    // Navigate to active state
                                    navigate('/chat?active=true');
                                    handleStartJourney('english');
                                }}
                            >
                                <div className="lang-code">EN</div>
                                <div className="lang-name">English</div>
                                <div className="lang-desc">Отвечать на английском</div>
                            </button>

                            <div className="language-divider">ИЛИ</div>

                            <button
                                className="language-option-btn russian-btn"
                                onClick={() => {
                                    setSelectedLanguage('russian');
                                    // Navigate to active state
                                    navigate('/chat?active=true');
                                    handleStartJourney('russian');
                                }}
                            >
                                <div className="lang-code">RU</div>
                                <div className="lang-name">Русский</div>
                                <div className="lang-desc">Отвечать на русском</div>
                            </button>
                        </div>

                        <p className="language-modal-footer">Вы можете говорить на английском или русском.</p>
                    </div>
                </div>
            )}

            {/* Main Voice Interface */}
            <main className="main-content">
                {!hasStarted && (
                    <div className="hero-section">
                        <h1 className="hero-title">
                            {selectedLanguage === 'english' ? 'Seek Divine' : 'Ищите'} <br />
                            <span className="highlight">
                                {selectedLanguage === 'english' ? 'Guidance' : 'наставления'}
                            </span>
                        </h1>
                        <div className="quick-actions">
                            <button className="action-chip active" onClick={() => handleStartJourney(selectedLanguage)}>
                                {selectedLanguage === 'english' ? 'Start Journey' : 'Начать путь'}
                            </button>
                            <button className="action-chip" onClick={() => setShowHistory(true)}>
                                {selectedLanguage === 'english' ? 'History' : 'История'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="orb-section">
                    <h2 className="section-label">
                        {selectedLanguage === 'english' ? 'Dialogue with the Soul' : 'Диалог с душой'}
                    </h2>
                    <VoiceOrb
                        isListening={isListening}
                        isSpeaking={isSpeaking}
                        isLoading={isLoading}
                    />
                </div>

                {/* Status Text & Instructions */}
                <div className="status-container">
                    <div className="status-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        {isListening ? (
                            <>
                                <span style={{ color: '#fff', fontSize: '1.2rem', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>
                                    {selectedLanguage === 'english' ? 'Listening to your voice...' : 'Слушаю ваш голос...'}
                                </span>
                                <span style={{ color: '#ffb347', fontSize: '0.9rem', animation: 'pulse 2s infinite', fontWeight: 'bold' }}>
                                    {selectedLanguage === 'english' ? '(Tap the mic again when you finish speaking)' : '(Нажмите на микрофон еще раз, когда закончите)'}
                                </span>
                            </>
                        ) : isSpeaking ? (
                            <span style={{ color: '#fff' }}>
                                {selectedLanguage === 'english' ? 'Krishna is guiding...' : 'Кришна наставляет...'}
                            </span>
                        ) : isLoading ? (
                            <span style={{ color: '#fff' }}>
                                {selectedLanguage === 'english' ? 'Exploring the Gita...' : 'Поиск в Гите...'}
                            </span>
                        ) : (
                            <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                {transcript ? `"${transcript}"` : (selectedLanguage === 'english' ? 'Tap to connect' : 'Нажмите для связи')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Voice Controls */}
                <VoiceControls
                    isListening={isListening}
                    isSpeaking={isSpeaking}
                    isLoading={isLoading}
                    onToggleListening={toggleListening}
                    onStopSpeaking={stopSpeaking}
                />
            </main>

            {/* Message History Sidebar */}
            <MessageHistory
                messages={messages}
                isOpen={showHistory}
                onSpeak={speakText}
                activeMessageId={activeMessageId}
                onClose={() => {
                    // Stop audio when closing history
                    if (isSpeaking) {
                        stopAudio();
                    }
                    setShowHistory(false);
                }}
                onClearHistory={clearHistory}
            />

            {/* Hidden fallback audio element */}
            <audio
                ref={persistentAudioRef}
                style={{ display: 'none' }}
                preload="auto"
                playsInline
            />

            {chatLimitInfo.limit_reached && (
                <div className="limit-overlay">
                    <div className="limit-modal">
                        <div className="limit-modal-icon">{chatLimitInfo.is_paid ? '⏳' : '🔒'}</div>
                        <h3>{chatLimitInfo.is_paid ? 'Лимит сообщений исчерпан' : 'Лимит исчерпан'}</h3>
                        <p>
                            {chatLimitInfo.is_paid 
                                ? 'Вы использовали все 30 сообщений вашего текущего плана. Продлите подписку, чтобы продолжить общение.' 
                                : 'Вы достигли бесплатного лимита. Пожалуйста, обновите тариф, чтобы продолжить диалог.'}
                        </p>
                        {!chatLimitInfo.is_paid && (
                            <div className="promo-nudge">
                                <span className="nudge-icon">🎁</span>
                                <p>Примените <strong>KRISHNA499</strong>, чтобы получить Базовый план за <strong>499 ₽</strong></p>
                            </div>
                        )}
                        <button
                            className="upgrade-btn-primary"
                            onClick={() => {
                                if (chatLimitInfo.is_paid) {
                                    navigate('/pricing');
                                } else {
                                    const basicPlan = {
                                        name: 'Базовый',
                                        price: '8 990 ₽',
                                        period: '',
                                        description: 'Идеально для первого опыта духовных бесед',
                                        features: [
                                            '30 чатов',
                                            'Все функции ИИ-чата',
                                            'Высокое качество голоса',
                                            'Доступ 24/7',
                                            'История бесед'
                                        ],
                                        buttonText: 'Начать сейчас',
                                        isPopular: false,
                                        color: 'var(--blue-glow)',
                                        plan_id: 'basic_30'
                                    };
                                    navigate('/checkout', { state: { plan: basicPlan } });
                                }
                            }}
                        >
                            {chatLimitInfo.is_paid ? 'Продлить подписку' : 'Обновить сейчас'}
                        </button>
                        <button
                            className="limit-close-btn"
                            onClick={() => navigate('/')}
                        >
                            Вернуться на главную
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}

export default VoiceChat;
