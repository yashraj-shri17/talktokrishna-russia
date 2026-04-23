"""
Flask API server for Talk to Krishna web interface.
This provides a REST API endpoint for the web frontend.
"""
from flask import Flask, request, jsonify, Response, stream_with_context, make_response, send_file
from flask_cors import CORS
import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash, check_password_hash
import sys
import os
import io
import time
import re
import json
import uuid
import hmac
import hashlib
import asyncio
import threading
from datetime import datetime, timedelta
import resend
import razorpay
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import requests

# Ensure stdout/stderr handle Unicode safely
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# MUST load environment variables before using os.getenv()
# Root directory is two levels up from website/api_server.py
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    print(f"✅ Loaded .env from: {env_path}")
else:
    print(f"❌ .env file NOT FOUND at: {env_path}")
    load_dotenv() # Fallback to default

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.gita_api import GitaAPI
from src.config import settings
import edge_tts

# Create audio cache directory
AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'audio_cache')
if not os.path.exists(AUDIO_DIR):
    os.makedirs(AUDIO_DIR)

# In-memory audio cache for fast serving
audio_cache = {}

# ---------------------------------------------------------------------------
# Email & Auth Configuration
# ---------------------------------------------------------------------------
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
    print("✅ Resend client initialized.")
else:
    print("⚠️ RESEND_API_KEY missing. Email notifications will be disabled.")

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '617777461318-r4k9arqp5lid84ien6q3ooirp88i6hmq.apps.googleusercontent.com')

# OTP storage (In-memory for login)
otp_storage = {} # {mobile: {"otp": otp, "expires_at": timestamp, "user_id": user_id}}

# ---------------------------------------------------------------------------
# Azure Cognitive Services TTS helper
# ---------------------------------------------------------------------------
try:
    import azure.cognitiveservices.speech as speechsdk
    _AZURE_SDK_AVAILABLE = True
except ImportError:
    _AZURE_SDK_AVAILABLE = False
    print("[TTS] azure-cognitiveservices-speech not installed — falling back to Edge TTS.")

AZURE_SPEECH_KEY    = os.getenv('AZURE_SPEECH_KEY', '')
AZURE_SPEECH_REGION = os.getenv('AZURE_SPEECH_REGION', 'centralindia')

# Azure TTS voice names
AZURE_RUSSIAN_VOICE = os.getenv("AZURE_RUSSIAN_VOICE", "ru-RU-DmitryNeural")
AZURE_ENGLISH_VOICE = os.getenv("AZURE_ENGLISH_VOICE", "en-IN-AaravNeural")
AZURE_HINDI_VOICE_NAME = os.getenv("AZURE_HINDI_VOICE_NAME", "hi-IN-AaravNeural")

# Edge TTS Voice Mappings
EDGE_RUSSIAN_VOICE = "ru-RU-DmitryNeural"
EDGE_ENGLISH_VOICE = "en-IN-PrabhatNeural"
EDGE_HINDI_VOICE = "hi-IN-MadhurNeural"


def _azure_tts_universal(text, platform_lang='russian'):
    if not _AZURE_SDK_AVAILABLE or not AZURE_SPEECH_KEY: return b''
    lines = text.split('\n')
    ssml_parts = []
    def _get_voice(t):
        if any('\u0900' <= c <= '\u097F' for c in t): return AZURE_HINDI_VOICE_NAME, "hi-IN"
        if any('\u0400' <= c <= '\u04FF' for c in t): return AZURE_RUSSIAN_VOICE, "ru-RU"
        if platform_lang == 'russian': return AZURE_RUSSIAN_VOICE, "ru-RU"
        return AZURE_ENGLISH_VOICE, "en-IN"
    cv, cb = None, []
    def _get_rate(voice):
        if voice == AZURE_HINDI_VOICE_NAME: return "-5%"   # Shloka - slow & reverent
        if voice == AZURE_RUSSIAN_VOICE:    return "+0%"   # Russian - natural pace
        return "+5%"                                        # English - slightly faster
    for line in lines:
        s = line.strip()
        if not s: continue
        v, l = _get_voice(s)
        if v != cv:
            if cb:
                rate = _get_rate(cv)
                ssml_parts.append(f'<voice name="{cv}"><prosody rate="{rate}">{_escape_xml(" ".join(cb))}</prosody></voice>')
            cv, cb = v, [s]
        else: cb.append(s)
    if cb:
        rate = _get_rate(cv)
        ssml_parts.append(f'<voice name="{cv}"><prosody rate="{rate}">{_escape_xml(" ".join(cb))}</prosody></voice>')
    if not ssml_parts: return b''
    ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">{"".join(ssml_parts)}</speak>'
    try:
        sc = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        sc.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=sc, audio_config=None)
        res = synthesizer.speak_ssml_async(ssml).get()
        if res.reason == speechsdk.ResultReason.SynthesizingAudioCompleted: return res.audio_data
    except Exception as e: print(f"❌ [Azure Universal] Exception: {e}")
    return b''



def _clean_text_for_tts(text: str) -> str:
    """Clean answer text before TTS: removes emojis, redundant citations, and narrator markers."""
    import re
    # Remove emojis
    emoji_pattern = re.compile("["
        "\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF"
        "\U00002702-\U000027B0\U000024C2-\U0001F251\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F\u200d"
    "]+", flags=re.UNICODE)
    text = emoji_pattern.sub('', text)
    
    # Remove citations at the very end
    trailing_citation = re.compile(r'\s*(?:भगवद\s*गीता|Бхагавад-гита|Bhagavad\s*Gita)[,،\s]*(?:अध्याय|Глава|Chapter)\s*\d+[,،\s]*(?:श्लोक|Текст|Shloka)\s*\d+\s*$', re.UNICODE | re.IGNORECASE)
    text = trailing_citation.sub('', text).strip()

    
    # Remove shloka number markers like | 1.1 | or ॥ १.१ ॥
    text = re.sub(r'([।॥|])\s*[0-9०-९\.]+\s*[।॥|]?', r'\1', text)
    
    # Remove common narrator markers
    narrator_pattern = re.compile(r'(?:(?:श्री\s*)?भगवानुवाच|(?:Shri\s*)?Bhagavan\s*uvacha|(?:Shri\s*)?Krishna\s*uvacha|श्रीकृष्ण\s*उवाच|Sanjaya\s*uvacha|Arjuna\s*uvacha|Dhritarashtra\s*uvacha|सञ्जय\s*उवाच|धृतराष्ट्र\s*उवाच|अर्जुन\s*उवाच)[:\s]*', re.IGNORECASE | re.UNICODE)
    text = narrator_pattern.sub('', text)
    
    # Remove Markdown formatting
    text = re.sub(r'\*\*\*', '', text) # Bold Italic
    text = re.sub(r'\*\*', '', text)  # Bold
    text = re.sub(r'^\s*[\*\-]\s+', '', text, flags=re.MULTILINE) # List bullets
    text = re.sub(r'(?<!\*)\*(?!\*)', '', text) # Single asterisks (italic)
    text = re.sub(r'#+\s+', '', text) # Headers
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE) # Numbered lists (1. 2. 3.)
    text = re.sub(r'__+', '', text) # Bold underscores
    
    return text.strip()

def _escape_xml(text: str) -> str:
    """Escape special characters for SSML (XML)."""
    if not text: return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def _split_text_for_tts(text: str):
    """Splits text into chunks based on language (Devanagari vs others) for optimal TTS."""
    import re
    lines = text.split('\n')
    
    chunks = []
    current_type = None
    current_lines = []

    def _get_lang_type(t):
        if any('\u0900' <= c <= '\u097F' for c in t): return 'sanskrit'
        return 'latin'

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines: current_lines.append(line)
            continue
            
        ltype = _get_lang_type(stripped)
        if current_type is None:
            current_type = ltype
            current_lines.append(line)
        elif ltype == current_type:
            current_lines.append(line)
        else:
            chunks.append((current_type, '\n'.join(current_lines).strip()))
            current_type = ltype
            current_lines = [line]
            
    if current_lines:
        chunks.append((current_type, '\n'.join(current_lines).strip()))

    before, header, verse, after = "", "", "", ""
    latin_found = False
    sanskrit_found = False
    
    for ctype, ctext in chunks:
        if ctype == 'latin':
            if not latin_found:
                before = ctext; latin_found = True
            else:
                after += "\n" + ctext
        else:
            if not sanskrit_found:
                verse = ctext; sanskrit_found = True
            else:
                after += "\n" + ctext

    return before.strip(), header.strip(), verse.strip(), after.strip(), False

def _generate_audio_async(text: str, language: str = 'russian') -> str:
    """Generate audio asynchronously using Azure TTS and cache it."""
    audio_id = str(uuid.uuid4())
    def generate():
        try:
            print(f"[TTS] Processing {audio_id} | Lang: {language}")
            cleaned = _clean_text_for_tts(text)
            cleaned = re.sub(r'<[^>]*>', '', cleaned).strip()
            before, header, verse, after, detected_en = _split_text_for_tts(cleaned)
            print(f"[DEBUG] TTS Split: Before={len(before)}, Header={len(header)}, Verse={len(verse)}, After={len(after)}")
            is_eng = (language == 'english' or detected_en)

            def _has_hindi(t): return any('\u0900' <= c <= '\u097F' for c in t)
            
            # Use Azure if SDK is available and key is present (regardless of length)
            use_azure = _AZURE_SDK_AVAILABLE and AZURE_SPEECH_KEY
            
            # Use the new Universal Azure TTS
            audio_bytes = b''
            if use_azure:
                try:
                    print(f"[DEBUG] Attempting Universal Azure TTS for {language}...")
                    # Combine all parts into one cleaned string for universal detection
                    all_text = "\n".join(filter(None, [before, header, verse, after]))
                    if not all_text.strip(): all_text = cleaned
                    audio_bytes = _azure_tts_universal(all_text, platform_lang=language)
                except Exception as e:
                    print(f"[Azure TTS] Universal Error: {e}")




            if not audio_bytes: # Fallback to Edge TTS
                print(f"⚠️ Using Edge TTS Fallback...")
                async def _edge_gen_all():
                    v_main = EDGE_RUSSIAN_VOICE if language == 'russian' else (EDGE_ENGLISH_VOICE if is_eng else EDGE_HINDI_VOICE)
                    v_slk = EDGE_HINDI_VOICE
                    async def _gen_part(name, t, v, r):
                        if not t.strip(): return b''
                        current_v = EDGE_HINDI_VOICE if _has_hindi(t) and v != EDGE_HINDI_VOICE else v
                        print(f"[DEBUG] Edge TTS Part '{name}': Voice={current_v}, Rate={r}, TextLen={len(t)}")
                        b = io.BytesIO()
                        try:
                            # Clean any leftover markdown or special chars just for TTS
                            t_clean = re.sub(r'[*#_\[\]()]', '', t)
                            async for chunk in edge_tts.Communicate(t_clean, current_v, rate=r).stream():
                                if chunk["type"] == "audio": b.write(chunk["data"])
                            res = b.getvalue()
                            if not res: print(f"⚠️ No audio received for part '{name}'")
                            return res
                        except Exception as e:
                            print(f"❌ Edge TTS Part '{name}' Error: {e}")
                            return b''
                            
                    tasks = []
                    if before: tasks.append(_gen_part("Before", before, v_main, "+0%"))
                    if header: tasks.append(_gen_part("Header", header, v_main, "+0%"))
                    if verse:  tasks.append(_gen_part("Verse", verse, v_slk, "-10%"))
                    if after:  tasks.append(_gen_part("After", after, v_main, "+0%"))
                    
                    if not tasks and cleaned:
                        tasks.append(_gen_part("Cleaned", cleaned, v_main, "+0%"))
                        
                    results = await asyncio.gather(*tasks)
                    return b''.join(results)

    
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try: 
                    audio_bytes = loop.run_until_complete(_edge_gen_all())
                    print(f"✅ Edge TTS Generation Complete: {len(audio_bytes)//1024}KB")
                finally: loop.close()

            audio_cache[audio_id] = audio_bytes
            print(f"[TTS] Complete: {audio_id} | Size: {len(audio_bytes)//1024}KB")
        except Exception as e:
            print(f"[TTS] Error: {e}"); audio_cache[audio_id] = None

    threading.Thread(target=generate, daemon=True).start()
    return audio_id


app = Flask(__name__)

# CORS configuration
from dotenv import load_dotenv
import re

load_dotenv()

frontend_url = os.getenv('FRONTEND_URL')
# Default local development origins
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://talk-to-krishna-russia.vercel.app",
    "https://russia.talktokrishna.ai"
]

if frontend_url:
    for url in frontend_url.split(','):
        normalized_url = url.strip().rstrip('/')
        if normalized_url:
            allowed_origins.extend([normalized_url, f"{normalized_url}/"])


CORS(app, origins=allowed_origins, supports_credentials=True)

# Initialize Razorpay Client
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', '').strip()
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', '').strip()

if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    print(f"Initializing Razorpay client with ID: {RAZORPAY_KEY_ID[:8]}...")
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
else:
    print("Warning: Razorpay credentials not found in environment variables.")
    razorpay_client = None

def ensure_razorpay_plan():
    """Ensure a plan for RUB 999 monthly exists in Razorpay or fallback."""
    if not razorpay_client:
        return os.getenv('RAZORPAY_PLAN_ID_MONTHLY', 'plan_Se8igPe1bUasb2')
    
    try:
        # Search for existing plan with RUB 999
        # Note: All plans fetch might be rate limited or paginated, but usually we have few plans
        plans = razorpay_client.plan.all()
        for plan in plans.get('items', []):
            item = plan.get('item', {})
            if item.get('amount') == 99900 and plan.get('period') == 'monthly' and item.get('currency') == 'RUB':
                return plan['id']
        
        # Create if not found
        plan_data = {
            "period": "monthly",
            "interval": 1,
            "item": {
                "name": "Talk to Krishna Russia",
                "amount": 99900,
                "currency": "RUB",
                "description": "Monthly subscription for Talk to Krishna Russia"
            }
        }
        new_plan = razorpay_client.plan.create(data=plan_data)
        return new_plan['id']
    except Exception as e:
        print(f"Plan Discovery Error: {e}")
        return os.getenv('RAZORPAY_PLAN_ID_MONTHLY', 'plan_Se8igPe1bUasb2')

@app.before_request
def log_request_info():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {request.method} {request.path} from {request.remote_addr}")
    if request.headers.get('Origin'):
        print(f"  Origin: {request.headers.get('Origin')}")


# ── SESSION-BASED SHLOKA TRACKER ─────────────────────────────────────────────
# Tracks recently shown shloka IDs per session_id IN MEMORY.
# This ensures the repeat-penalty system works for ALL users — including
# anonymous users and tests — not just logged-in users with DB history.
# Structure: { session_id: ['2.14', '6.5', ...] }  (keeps last 7 IDs)
# Thread-safe for reads/appends on CPython (GIL protected); no Lock needed.
SESSION_HISTORY: dict = {}
SESSION_HISTORY_LIMIT = 7  # Match the "last 5-7 conversations" requirement

# Initialize GitaAPI once
print("Initializing Talk to Krishna API...")
gita_api = GitaAPI()
gita_api._load_resources()
print("API Ready!\n")

@app.route('/api/ask', methods=['POST'])
def ask_question():
    """
    Handle question from web interface.
    
    Request JSON:
        {
            "question": "user's question here",
            "include_audio": true/false (optional, default: false),
            "user_id": 123 (optional, for logged-in users)
        }
    
    Response JSON:
        {
            "answer": "Krishna's response",
            "shlokas": [...],
            "audio_url": "/api/audio/<id>" (if include_audio=true),
            "success": true
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'question' not in data:
            return jsonify({
                'error': 'Вопрос не предоставлен',
                'success': False
            }), 400
        
        question = data['question'].strip()
        include_audio = data.get('include_audio', False)
        user_id = data.get('user_id')  # Optional: for logged-in users
        
        print(f"--- Chat Request Start ---")
        print(f"User ID from request: {user_id} (Type: {type(user_id)})")
        print(f"Question: {question[:30]}...")
        
        session_id = data.get('session_id')  # New: Session ID for context filtering
        language = data.get('language', 'russian') # 'russian' or 'english'
        
        # Check chat access for logged-in users
        if user_id:
            try:
                conn = get_db_connection()
                c = conn.cursor()
                c.execute('SELECT has_chat_access, role FROM users WHERE id = %s', (user_id,))
                user_access = c.fetchone()
                conn.close()
                
                if user_access:
                    has_access, role = user_access
                    # For current requirements, we ensure everyone has chat access
                    if not has_access:
                        try:
                            conn_update = get_db_connection()
                            c_update = conn_update.cursor()
                            c_update.execute('UPDATE users SET has_chat_access = TRUE WHERE id = %s', (user_id,))
                            conn_update.commit()
                            conn_update.close()
                            has_access = True
                        except Exception as e:
                            print(f"Error auto-granting access in ask_question: {e}")
                    
                    if not has_access and role != 'admin':
                        return jsonify({
                            'error': 'У вас нет прав для использования функции чата. Пожалуйста, свяжитесь с администратором.',
                            'success': False,
                            'access_denied': True
                        }), 403
            except Exception as e:
                print(f"Error checking chat access: {e}")
                # Log the error and continue - don't block user if DB check fails
        
        if not question:
            return jsonify({
                'error': 'Вопрос не может быть пустым',
                'success': False
            }), 400

        # ---- FREE MESSAGE LIMIT ENFORCEMENT ----
        FREE_LIMIT = 5
        if user_id:
            try:
                conn = get_db_connection()
                c = conn.cursor()
                c.execute('SELECT is_paid, COALESCE(message_count, 0) FROM users WHERE id = %s', (user_id,))
                user_limit_row = c.fetchone()
                conn.close()
                
                if user_limit_row:
                    is_paid_status, msg_count = user_limit_row
                    if not is_paid_status and msg_count >= FREE_LIMIT:
                        return jsonify({
                            'success': False,
                            'limit_reached': True,
                            'error': 'Вы исчерпали лимит бесплатных сообщений. Пожалуйста, обновите подписку, чтобы продолжить.',
                            'messages_used': msg_count,
                            'free_limit': FREE_LIMIT
                        }), 403
            except Exception as e:
                print(f"Error checking message limit: {e}")
        # ----------------------------------------

        # --- FAST GREETING CHECK (Backup) ---
        # This ensures we catch greetings at the API layer 
        # to guarantee instant response without DB lookup.
        greetings_backup = {
            # English greetings
            "hi", "hello", "hey", "hii", "hiii", "helo", "heyy", "heya", "yo",
            "greetings", "good morning", "good afternoon", "good evening", "good night",
            "gm", "ge", "gn", "ga", "morning", "evening", "afternoon",
            
            # Hindi/Sanskrit greetings (Romanized)
            "namaste", "namaskar", "namaskaram", "pranam", "pranaam", "pranaams",
            "radhe radhe", "radhey radhey", "radhe", "radhey",
            "jai shri krishna", "jai shree krishna", "jai sri krishna", 
            "hare krishna", "hare krsna", "krishna", "krsna",
            "jai", "jay", "om", "aum",
            
            # Hindi Devanagari Script Greetings
            "हेलो", "हेल्लो", "हाय", "हाई", "हलो",
            "नमस्ते", "नमस्कार", "नमस्कारम", "प्रणाम", "प्रनाम",
            "राधे राधे", "राधे", "राधेय राधेय",
            "जय श्री कृष्ण", "जय श्रीकृष्ण", "जय कृष्ण",
            "हरे कृष्ण", "हरे कृष्णा", "कृष्ण",
            "जय", "ओम", "ॐ",
            "सुप्रभात", "शुभ संध्या", "शुभ रात्रि",
            "कैसे हो", "कैसे हैं", "क्या हाल", "क्या हाल है",
            
            # Casual/Informal
            "sup", "wassup", "whatsup", "howdy", "hola",
            "kaise ho", "kaise hain", "kya haal", "kya hal", "namaskaar",

            # Casual/Greetings
            "hola", "namaskaar",
        }
        
        import unicodedata
        q_lower = "".join(c for c in question.lower() if c.isalnum() or c.isspace() or unicodedata.category(c).startswith('M'))
        q_words = q_lower.split()
        
        is_greeting = False
        if q_words:
            # Check if entire query is a greeting phrase
            full_query = ' '.join(q_words)
            if full_query in greetings_backup:
                is_greeting = True
            
            # Check for two-word greeting phrases
            elif len(q_words) >= 2:
                two_word = f"{q_words[0]} {q_words[1]}"
                if two_word in greetings_backup:
                    if len(q_words) <= 3:
                        is_greeting = True
                    else:
                        q_words_set = {'what', 'how', 'why', 'who', 'when', 'where', 
                                     'kya', 'kyun', 'kaise', 'kab', 'kahan', 'kaun',
                                     'explain', 'tell', 'batao', 'bataiye', 'btao'}
                        if not any(qw in q_words for qw in q_words_set):
                            is_greeting = True
            
            # Case 1: Very short (just greeting)
            elif len(q_words) <= 3 and any(w in greetings_backup for w in q_words):
                is_greeting = True
                
            # Case 2: Greeting start, no question words
            elif len(q_words) <= 6 and q_words[0] in greetings_backup:
                q_words_set = {'what', 'how', 'why', 'who', 'when', 'where', 
                             'kya', 'kyun', 'kaise', 'kab', 'kahan', 'kaun',
                             'explain', 'tell', 'batao', 'bataiye', 'btao',
                             'is', 'are', 'can', 'should', 'would', 'could'}
                if not any(qw in q_words for qw in q_words_set):
                    is_greeting = True



        if is_greeting:
            print(f"Greeting detected in API: {question}")
            
            # Check for history to personalize greeting
            has_history = False
            if user_id:
                history = get_user_history(user_id, session_id=session_id, limit=1)
                has_history = len(history) > 0
            
            # Return greeting in Russian format
            if has_history:
                greeting_text = "Namaste! Надеюсь, вы узнали что-то полезное из нашего прошлого разговора. С каким вопросом вы пришли сегодня?"
            else:
                greeting_text = "Namaste! Я — Шри Кришна. Могу ли я чем-то вам помочь?"
            
            response = {
                'success': True,
                'answer': greeting_text,
                'shlokas': [],
                'llm_used': True 
            }
            
            # Save greeting conversation if user is logged in
            if user_id:
                save_conversation(user_id, question, greeting_text, [], session_id=session_id)
            
            # Generate audio if requested
            if include_audio:
                audio_id = _generate_audio_async(greeting_text, language)
                response['audio_url'] = f'/api/audio/{audio_id}'
                print(f"Greeting audio generated: {audio_id}")
            
            # Casual greetings do NOT count towards the message limit
            if user_id:
                try:
                    conn_cl = get_db_connection()
                    c_cl = conn_cl.cursor()
                    c_cl.execute('SELECT is_paid, COALESCE(message_count, 0) FROM users WHERE id = %s', (user_id,))
                    cl_row = c_cl.fetchone()
                    conn_cl.close()
                    
                    if cl_row:
                        is_p, m_c = cl_row
                        response['chat_limit'] = {
                            'is_paid': bool(is_p),
                            'messages_used': m_c,
                            'remaining': max(0, 5 - m_c) if not is_p else -1,
                            'limit_reached': (not is_p and m_c >= 5)
                        }
                except Exception as mc_err:
                    print(f"[WARNING] Failed to get chat limit for greeting: {mc_err}")
            
            return jsonify(response)
        # ------------------------------------
        
        # Get user's conversation history if logged in
        conversation_history = []
        if user_id:
            # Fetch last 5 conversations for diversity filtering (avoid repeat shlokas/chapters)
            conversation_history = get_user_history(user_id, session_id=session_id, limit=5)
            print(f"Retrieved {len(conversation_history)} previous conversations for user {user_id} (Session: {session_id})")
        
        # Extract recently used shloka IDs for the diversity filter
        # This prevents the same shloka or chapter from repeating across consecutive answers
        recent_shloka_ids = []
        for conv in conversation_history:
            # Each conversation stores the chosen shloka in the answer text.
            # We re-parse it here to get the shloka ID.
            ans = conv.get('answer', '')
            import re as _re
            m = _re.search(
                r'(?:Chapter\s*(\d+)\s*Shloka\s*(\d+)|第(\d+)章\s*第(\d+)節)',
                ans, _re.IGNORECASE
            )
            if m:
                ch  = m.group(1) or m.group(3)
                ver = m.group(2) or m.group(4)
                if ch and ver:
                    recent_shloka_ids.append(f"{ch}.{ver}")

        # ── MERGE IN-MEMORY SESSION HISTORY ──────────────────────────────────
        # For anonymous users (no user_id), DB history is empty so recent_shloka_ids
        # would always be []. Pull from in-memory SESSION_HISTORY as the source of truth.
        # For logged-in users, this supplements the DB history (deduped below).
        if session_id and session_id in SESSION_HISTORY:
            session_recent = SESSION_HISTORY[session_id]
            # Merge: DB history first, then session memory; deduplicate preserving order
            combined = recent_shloka_ids + [s for s in session_recent if s not in recent_shloka_ids]
            recent_shloka_ids = combined[:SESSION_HISTORY_LIMIT]

        if recent_shloka_ids:
            print(f"Recent shloka IDs (DB + session, will be penalised): {recent_shloka_ids}")

        # Get answer from GitaAPI — pass full conversation history + recent IDs for diversity
        import time
        start_time = time.time()
        result = gita_api.search_with_llm(
            question,
            conversation_history=conversation_history,
            language=language,
            recent_shloka_ids=recent_shloka_ids
        )
        llm_time = time.time() - start_time
        
        answer_text = result.get('answer')
        
        all_shlokas = result.get('shlokas', [])
        chosen_shloka_id = result.get('chosen_shloka_id')
        
        # Only keep the shloka that was ACTUALLY chosen and spoken by the LLM
        shlokas_to_save = []
        if chosen_shloka_id:
            shlokas_to_save = [s for s in all_shlokas if s['id'] == chosen_shloka_id]
            # If for some reason the LLM quoted one not in the retrieved top 5, just store the ID
            if not shlokas_to_save:
                shlokas_to_save = [{'id': chosen_shloka_id}]
        else:
            # Fallback if regex failed to extract
            shlokas_to_save = all_shlokas[:1] if all_shlokas else []
        
        # Save conversation if user is logged in
        is_rejected = result.get('rejected', False)
        
        if user_id and answer_text:
            # We still save rejected conversations for history context, but we do NOT count them towards the limit
            save_conversation(user_id, question, answer_text, shlokas_to_save, session_id=session_id)
            print(f"Saved conversion for user {user_id}. Rejected? {is_rejected}")
            
            # Increment message count ONLY if not rejected
            if not is_rejected:
                try:
                    conn_inc = get_db_connection()
                    c_inc = conn_inc.cursor()
                    c_inc.execute('UPDATE users SET message_count = COALESCE(message_count, 0) + 1 WHERE id = %s', (user_id,))
                    conn_inc.commit()
                    conn_inc.close()
                    print(f"Incremented message_count for user {user_id}")
                except Exception as mc_err:
                    print(f"[WARNING] Failed to increment message_count: {mc_err}")
            else:
                print(f"Skipping message_count increment for rejected query (User {user_id})")

        # ── UPDATE IN-MEMORY SESSION HISTORY ─────────────────────────────────
        # Push the chosen shloka into the session tracker so the NEXT question
        # in this session automatically avoids it. Works for all users.
        actual_shloka_id = chosen_shloka_id or (shlokas_to_save[0]['id'] if shlokas_to_save else None)
        if session_id and actual_shloka_id:
            if session_id not in SESSION_HISTORY:
                SESSION_HISTORY[session_id] = []
            SESSION_HISTORY[session_id].append(actual_shloka_id)
            # Keep only last SESSION_HISTORY_LIMIT entries
            SESSION_HISTORY[session_id] = SESSION_HISTORY[session_id][-SESSION_HISTORY_LIMIT:]
            print(f"Session {session_id[:12]}... history → {SESSION_HISTORY[session_id]}")

        # Format response (Can still return all to UI if needed, or just the chosen one. Returning only chosen one for consistency)
        response = {
            'success': True,
            'answer': answer_text,
            'shlokas': shlokas_to_save,
            'llm_used': result.get('llm_used', False)
        }
        
        # Get updated chat limit info for real-time frontend update
        chat_limit_info = {}
        if user_id:
            try:
                # Re-select after increment to get latest value
                conn_cl = get_db_connection()
                c_cl = conn_cl.cursor()
                c_cl.execute('SELECT is_paid, COALESCE(message_count, 0) FROM users WHERE id = %s', (user_id,))
                cl_row = c_cl.fetchone()
                conn_cl.close()
                if cl_row:
                    is_p, m_c = cl_row
                    chat_limit_info = {
                        'is_paid': bool(is_p),
                        'messages_used': m_c,
                        'remaining': max(0, 5 - m_c) if not is_p else -1,
                        'limit_reached': (not is_p and m_c >= 5)
                    }
            except Exception as e:
                print(f"Chat limit re-fetch error: {e}")
        response['chat_limit'] = chat_limit_info

        # Generate audio in parallel if requested
        if include_audio and answer_text:
            audio_start = time.time()
            audio_id = _generate_audio_async(answer_text, language)
            audio_time = time.time() - audio_start
            response['audio_url'] = f'/api/audio/{audio_id}'
            print(f"Timing: LLM={llm_time:.2f}s, Audio={audio_time:.2f}s")
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error processing request: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/speak', methods=['POST'])
def speak_text():
    """Generate audio from text using Neural TTS in-memory (Azure or Edge TTS)."""
    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        language = data.get('language', 'russian')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400

        print(f"[DEBUG] TTS Speak Request - Lang: {language} | Text: {text[:50]}...")
        cleaned = _clean_text_for_tts(text)
        cleaned = re.sub(r'<[^>]*>', '', cleaned).strip()
        before, header, verse, after, detected_en = _split_text_for_tts(cleaned)
        is_eng = (language == 'english' or detected_en)

        audio_bytes = b''
        # 1. Try Azure TTS first if available
        if _AZURE_SDK_AVAILABLE and AZURE_SPEECH_KEY:
            try:
                # Combine all parts for universal detection
                all_text = "\n".join(filter(None, [before, header, verse, after]))
                if not all_text.strip(): all_text = cleaned
                audio_bytes = _azure_tts_universal(all_text, platform_lang=language)
            except Exception as e:
                print(f"[Azure TTS] SDK/REST Error in /api/speak: {e}")

        # 2. Fallback to Edge TTS if Azure failed or is unavailable
        if not audio_bytes:
            v_main = "ru-RU-DmitryNeural" if language == 'russian' else ("en-US-GuyNeural" if is_eng else "hi-IN-MadhurNeural")
            v_slk = "hi-IN-MadhurNeural"
            
            async def _gen_part(t, v, r):
                if not t.strip(): return b''
                buf = io.BytesIO()
                async for chunk in edge_tts.Communicate(t, v, rate=r).stream():
                    if chunk["type"] == "audio": buf.write(chunk["data"])
                return buf.getvalue()

            async def _gen_all():
                tasks = []
                if before: tasks.append(_gen_part(before, v_main, "+5%"))
                if header: tasks.append(_gen_part(header, v_main, "+5%"))
                if verse:  tasks.append(_gen_part(verse, v_slk, "-5%"))
                if after:  tasks.append(_gen_part(after, v_main, "+5%"))
                if not tasks and cleaned: tasks.append(_gen_part(cleaned, v_main, "+5%"))
                results = await asyncio.gather(*tasks)
                return b''.join(results)

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try: audio_bytes = loop.run_until_complete(_gen_all())
            finally: loop.close()

        # Return file from memory
        audio_buffer = io.BytesIO(audio_bytes)
        audio_buffer.seek(0)
        return send_file(
            audio_buffer,
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="response.mp3"
        )

    except Exception as e:
        print(f"TTS Error: {e}")
        return jsonify({'error': str(e)}), 500

def _check_audio_has_speech(file_path: str, rms_threshold: float = 0.015) -> bool:
    """
    Decode audio file → numpy → RMS energy check.
    Returns True  → audio has real speech, proceed to Whisper AI.
    Returns False → audio is silence/background noise, discard immediately.

    Empirical RMS thresholds:
      PC fan / AC background noise : 0.001 – 0.012
      Soft whisper                 : 0.015  – 0.05
    Threshold 0.015 sits in the gap.
    """
    try:
        from pydub import AudioSegment
        import numpy as np

        # Decode any format → 16kHz mono PCM
        audio = AudioSegment.from_file(file_path)
        audio = audio.set_channels(1).set_frame_rate(16000)

        # Convert raw bytes → float32 numpy array, normalised to [-1.0, 1.0]
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
        samples /= float(2 ** (audio.sample_width * 8 - 1))

        # RMS energy
        rms = float(np.sqrt(np.mean(samples ** 2)))
        print(f"[VAD] RMS energy: {rms:.6f} | threshold: {rms_threshold}")

        # Basic word count guard: if audio is shorter than 0.3s, likely just a click
        if len(audio) < 300:
            print(f"[VAD] Audio too short ({len(audio)}ms). Treating as silent.")
            return False

        return rms >= rms_threshold

    except Exception as e:
        print(f"[VAD] Energy check error ({e}). Allowing by default.")
        return True

@app.route('/api/transcribe', methods=['POST'])

def transcribe_audio():
    """
    Transcribe audio using Groq Whisper-large-v3.
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided', 'success': False}), 400
        
        audio_file = request.files['audio']
        language = request.form.get('language', 'russian')
        
        # Save temp file
        temp_path = os.path.join(AUDIO_DIR, f"temp_{uuid.uuid4()}.webm")
        audio_file.save(temp_path)
        
        # ─── VAD CHECK (Silence detection) ──────────────────────────
        if not _check_audio_has_speech(temp_path):
            if os.path.exists(temp_path):
                os.remove(temp_path)
            print("🤫 [VAD] Silence detected. Skipping transcription.")
            return jsonify({'is_silent': True, 'success': False})

        # Call Groq
        with open(temp_path, "rb") as file:
            # Select language hint and prompt for Whisper
            if language == 'english':
                prompt_str = "The user is asking a question to Lord Krishna in English. Please transcribe clearly. Bhagavad Gita, Krishna, Karma, Dharma, Soul."
                lang_code = "en"
            else:
                # Default: Russian — Focus on Cyrillic transcription, allowing for common spiritual terms
                prompt_str = "Разговор с Господом Кришной на русском языке. Пожалуйста, используйте кириллицу. Бхагавад-гита, душа, карма, покой, как мне быть?"
                lang_code = "ru"
                
            transcription = gita_api.groq_client.audio.transcriptions.create(
                file=(audio_file.filename, file.read()),
                model="whisper-large-v3",
                prompt=prompt_str,
                language=lang_code
            )
        
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        print(f"Transcribed Text: {transcription.text}")
        return jsonify({'text': transcription.text, 'success': True})
        
    except Exception as e:
        print(f"Transcription error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/audio/<audio_id>', methods=['GET'])
def get_audio(audio_id):
    """
    Serve pre-generated audio from cache.
    Polls for audio to be ready if still generating.
    """
    import time
    max_wait = 120  # Poll for up to 120 seconds for Edge TTS generation
    start_time = time.time()
    
    print(f"Audio request for ID: {audio_id}")
    
    while time.time() - start_time < max_wait:
        if audio_id in audio_cache:
            audio_data = audio_cache[audio_id]
            
            if audio_data is None:
                print(f"Audio generation failed for {audio_id}")
                return jsonify({'error': 'Audio generation failed'}), 500
            
            elapsed = time.time() - start_time
            print(f"Audio ready after {elapsed:.2f}s")
            
            # Serve from memory
            import io
            audio_buffer = io.BytesIO(audio_data)
            audio_buffer.seek(0)
            
            return send_file(
                audio_buffer,
                mimetype="audio/mpeg",
                as_attachment=False,
                download_name="response.mp3"
            )
        
        # Wait a bit before checking again
        time.sleep(0.1)
    
    elapsed = time.time() - start_time
    print(f"Audio timeout after {elapsed:.2f}s for {audio_id}")
    return jsonify({'error': 'Audio not ready yet', 'waited': f'{elapsed:.2f}s'}), 404


# ---------------------------------------------------------------------------
# Email Notification System (Russian)
# ---------------------------------------------------------------------------
def _get_email_template(name, content_html):
    """Base HTML template for emails in Russian, matching the JustLearn style."""
    return f"""
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <style type="text/css">
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; }}
            @media only screen and (max-width: 480px) {{
              .content-table {{ width: 100% !important; border-radius: 16px !important; }}
              .body-pad {{ padding: 0 20px 24px 20px !important; font-size: 14px !important; }}
            }}
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #FFF7E6;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#FFF7E6">
            <tr>
              <td align="center" style="padding: 40px 10px;">
                <table class="content-table" border="0" cellpadding="0" cellspacing="0" width="600"
                  style="background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #D4AF37;">
                  <tr>
                    <td align="center" bgcolor="#1E3A8A" style="padding: 0;">
                      <img src="cid:banner" alt="Поговорите с Кришной" width="600" style="display: block; width: 100%; height: auto; border: 0;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding: 40px 36px 16px 36px;">
                      <h2 style="color: #D4AF37; font-size: 12px; letter-spacing: 5px; text-transform: uppercase;">Поговорите с Кришной</h2>
                    </td>
                  </tr>
                  <tr>
                    <td class="body-pad" style="padding: 0 40px 32px 40px; text-align: left; color: #334155; font-size: 15px; line-height: 1.75;">
                      <p style="margin: 0 0 16px 0;">Здравствуйте, <strong>{name if name else 'Искатель'}</strong>!</p>
                      {content_html}
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding: 36px 32px; background-color: #1E3A8A; color: #ffffff;">
                      <p style="margin: 0 0 10px 0; font-size: 13px;">Вы никогда не одиноки.</p>
                      <p style="font-size: 12px;">Команда «Поговорите с Кришной»</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
    """

def send_welcome_email(to_email, name, plain_password):
    """Sends a welcome email in Russian."""
    if not RESEND_API_KEY: return False
    content_html = f"""
        <h1 style="color: #1E3A8A; font-size: 24px;">Добро пожаловать в священное путешествие</h1>
        <p>Вы здесь не случайно. Ваш путь к мудрости начинается сейчас.</p>
        <div style="background-color: #F8FAFC; border-radius: 12px; padding: 20px; border: 1px solid #E2E8F0; margin: 24px 0;">
            <p><strong>Информация об аккаунте:</strong></p>
            <p>Электронная почта: {to_email}</p>
            <p>Пароль: {plain_password}</p>
        </div>
        <a href="https://talktokrishna.ai" style="background-color: #D4AF37; color: #ffffff; padding: 14px 28px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block;">Начать диалог</a>
    """
    html_body = _get_email_template(name, content_html)
    banner_path = os.path.join(os.path.dirname(__file__), 'static', 'email', 'banner.jpg')
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
        attachments = [{"filename": "banner.jpg", "content": banner_b64, "content_id": "banner"}]
    try:
        result = resend.Emails.send({
            "from": "Поговорите с Кришной <hello@talktokrishna.ai>",
            "to": [to_email],
            "subject": "Добро пожаловать в священное путешествие - Поговорите с Кришной",
            "html": html_body,
            "attachments": attachments
        })
        print(f"✅ Welcome email sent successfully to {to_email}. Result: {result}")
        return True
    except Exception as e:
        print(f"❌ Welcome email error for {to_email}: {e}")
        return False

def send_google_welcome_email(to_email, name):
    """Sends a specialized welcome email in Russian for users who signed up via Google."""
    if not RESEND_API_KEY: return False
    content_html = f"""
        <h1 style="color: #1E3A8A; font-size: 24px;">Добро пожаловать в священное путешествие</h1>
        <p>Вы здесь не случайно. Ваш путь к мудрости начинается сейчас.</p>
        <div style="background-color: #F8FAFC; border-radius: 12px; padding: 20px; border: 1px solid #E2E8F0; margin: 24px 0;">
            <p><strong>Информация об аккаунте:</strong></p>
            <p>Электронная почта: {to_email}</p>
            <p>Способ входа: Google Login</p>
        </div>
        <p>Пароль не установлен. Если в будущем вам потребуется войти с паролем, вы можете установить его через функцию «Забыли пароль?».</p>
        <a href="https://talktokrishna.ai" style="background-color: #D4AF37; color: #ffffff; padding: 14px 28px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block;">Начать диалог</a>
    """
    html_body = _get_email_template(name, content_html)
    banner_path = os.path.join(os.path.dirname(__file__), 'static', 'email', 'banner.jpg')
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
        attachments = [{"filename": "banner.jpg", "content": banner_b64, "content_id": "banner"}]
    try:
        result = resend.Emails.send({
            "from": "Поговорите с Кришной <hello@talktokrishna.ai>",
            "to": [to_email],
            "subject": "Добро пожаловать в священное путешествие - Поговорите с Кришной",
            "html": html_body,
            "attachments": attachments
        })
        print(f"✅ Google welcome email sent successfully to {to_email}. Result: {result}")
        return True
    except Exception as e:
        print(f"❌ Google welcome email error for {to_email}: {e}")
        return False

def send_otp_email(to_email, name, otp):
    """Sends OTP email in Russian."""
    if not RESEND_API_KEY: return False
    content_html = f"""
        <h1 style="color: #1E3A8A; font-size: 24px;">Подтверждение кода доступа</h1>
        <p>Ваш одноразовый пароль (OTP) для входа в систему:</p>
        <div style="font-size: 36px; font-weight: bold; color: #1E3A8A; padding: 24px; text-align: center; border: 1px dashed #D4AF37;">
            {otp}
        </div>
        <p style="font-size: 12px; color: #94A3B8;">Этот код действителен в течение 5 минут.</p>
    """
    html_body = _get_email_template(name, content_html)
    banner_path = os.path.join(os.path.dirname(__file__), 'static', 'email', 'banner.jpg')
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
        attachments = [{"filename": "banner.jpg", "content": banner_b64, "content_id": "banner"}]
    try:
        result = resend.Emails.send({
            "from": "Поговорите с Кришной <hello@talktokrishna.ai>",
            "to": [to_email],
            "subject": "Код подтверждения (OTP) - Поговорите с Кришной",
            "html": html_body,
            "attachments": attachments
        })
        print(f"✅ OTP email sent successfully to {to_email}. Result: {result}")
        return True
    except Exception as e:
        print(f"❌ OTP email error for {to_email}: {e}")
        return False

def send_admin_notification_email(user_name, user_email, user_mobile):
    """Send a professional admin notification to hello@talktokrishna.ai in Russian."""
    if not RESEND_API_KEY: return False
    
    # Get the banner image path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    banner_path = os.path.join(current_dir, 'static', 'email', 'banner.jpg')
    
    # Prepare the styled content
    content_html = f"""
        <h2 style="color: #1E3A8A; font-size: 22px; margin: 0 0 20px 0;">Новый искатель присоединился</h2>
        <p style="margin: 0 0 16px 0;"><strong>{user_name}</strong> только что зарегистрировался в Talk to Krishna Russia.</p>
        
        <div style="background-color: #F8FAFC; border-radius: 12px; padding: 20px; border: 1px solid #E2E8F0; margin-bottom: 24px;">
            <table style="width:100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #64748B; width: 35%;"><strong>Имя</strong></td>
                    <td style="padding: 8px 0; color: #1E293B;">{user_name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #64748B;"><strong>Email</strong></td>
                    <td style="padding: 8px 0; color: #1E293B;">{user_email}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #64748B;"><strong>Телефон</strong></td>
                    <td style="padding: 8px 0; color: #1E293B;">{user_mobile}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #64748B;"><strong>Дата регистрации</strong></td>
                    <td style="padding: 8px 0; color: #1E293B;">{datetime.now().strftime('%Y-%m-%d %H:%M')}</td>
                </tr>
            </table>
        </div>
        <p style="color: #94A3B8; font-size: 13px;">Это автоматическое системное уведомление от «Поговорите с Кришной».</p>
    """
    
    # Wrap in the main template
    html_body = _get_email_template("Уведомление администратора", content_html)
    
    # Prepare attachments (banner)
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
            attachments.append({
                "filename": "banner.jpg",
                "content": banner_b64,
                "content_id": "banner"
            })
            
    try:
        result = resend.Emails.send({
            "from": "Talk to Krishna <hello@talktokrishna.ai>",
            "to": ["hello@talktokrishna.ai"],
            "subject": f"Новый искатель: {user_name}",
            "html": html_body,
            "attachments": attachments
        })
        print(f"✅ Admin alert sent to hello@talktokrishna.ai. Result: {result}")
        return True
    except Exception as e:
        print(f"❌ Admin notification error: {e}")
        return False

def send_password_reset_email(to_email, name, reset_url):
    """Sends a password reset link in Russian."""
    if not RESEND_API_KEY: return False
    content_html = f"""
        <h1 style="color: #1a202c; font-size: 22px; margin: 0 0 16px 0; font-weight: 700;">Сброс пароля</h1>
        <p style="margin: 0 0 16px 0; color: #334155;">Был получен запрос на сброс пароля для вашего аккаунта «Поговорите с Кришной».</p>
        <p style="margin: 0 0 24px 0; color: #334155;">Нажмите на кнопку ниже, чтобы сбросить пароль. Ссылка действительна в течение 15 минут.</p>
        
        <div style="text-align: center; margin: 32px 0;">
            <a href="{reset_url}" style="background-color: #D4AF37; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 16px;">Сбросить пароль</a>
        </div>
        
        <p style="font-size: 13px; color: #718096; margin: 24px 0 16px 0;">
            Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Ваш аккаунт в безопасности.
        </p>
        
        <div style="border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px;">
            <p style="font-size: 12px; color: #a0aec0; line-height: 1.6; margin: 0;">
                <strong>Если кнопка не работает:</strong><br/>
                Скопируйте следующий URL и вставьте его в адресную строку вашего браузера:<br/>
                <span style="word-break: break-all; color: #4a5568;">{reset_url}</span>
            </p>
        </div>
    """
    html_body = _get_email_template(name, content_html)
    banner_path = os.path.join(os.path.dirname(__file__), 'static', 'email', 'banner.jpg')
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
        attachments = [{"filename": "banner.jpg", "content": banner_b64, "content_id": "banner"}]
    try:
        result = resend.Emails.send({
            "from": "Поговорите с Кришной <hello@talktokrishna.ai>",
            "to": [to_email],
            "subject": "Сброс пароля - Поговорите с Кришной",
            "html": html_body,
            "attachments": attachments
        })
        print(f"✅ Reset email sent to {to_email}. Result: {result}")
        return True
    except Exception as e:
        print(f"❌ Reset email error for {to_email}: {e}")
        return False

def send_password_reset_success_email(to_email, name, new_password=""):
    """Sends a confirmation email after successful password reset in Russian."""
    if not RESEND_API_KEY: return False
    content_html = f"""
        <h1 style="color: #14532d; font-size: 22px; margin: 0 0 16px 0; font-weight: 700;">Пароль успешно изменен</h1>
        <p style="margin: 0 0 16px 0; color: #334155;">Пароль для вашего аккаунта «Поговорите с Кришной» был успешно обновлен.</p>
        
        <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0; color: #4a5568; font-size: 14px;"><strong>Информация об аккаунте:</strong></p>
            <p style="margin: 0 0 4px 0; color: #2d3748;"><strong>Email:</strong> {to_email}</p>
            <p style="margin: 0; color: #2d3748;"><strong>Новый пароль:</strong> {new_password}</p>
        </div>

        <p style="margin: 0 0 24px 0; color: #334155;">Теперь вы можете войти, используя новый пароль. В целях безопасности удалите это письмо или сохраните пароль в надежном месте.</p>
        
        <div style="text-align: center; margin: 32px 0;">
            <a href="https://talktokrishna.ai/login" style="background-color: #D4AF37; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 16px;">Войти сейчас</a>
        </div>
        
        <p style="font-size: 13px; color: #166534; margin: 24px 0 0 0; border-top: 1px solid #edf2f7; padding-top: 16px;">
            Если вы не совершали этих изменений, немедленно свяжитесь с нашей службой поддержки (hello@talktokrishna.ai).
        </p>
    """
    html_body = _get_email_template(name, content_html)
    banner_path = os.path.join(os.path.dirname(__file__), 'static', 'email', 'banner.jpg')
    attachments = []
    if os.path.exists(banner_path):
        import base64
        with open(banner_path, "rb") as f:
            banner_b64 = base64.b64encode(f.read()).decode()
        attachments = [{"filename": "banner.jpg", "content": banner_b64, "content_id": "banner"}]
    try:
        resend.Emails.send({
            "from": "Поговорите с Кришной <hello@talktokrishna.ai>",
            "to": [to_email],
            "subject": "Пароль успешно изменен - Поговорите с Кришной",
            "html": html_body,
            "attachments": attachments
        })
        return True
    except Exception:
        return False

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'Talk to Krishna API',
        'email_ready': bool(RESEND_API_KEY),
        'version': '2.0.0'
    }), 200

@app.route('/api/test-email', methods=['GET'])
def test_email():
    """Diagnostic route to test email sending."""
    target_email = request.args.get('email', 'test_diagnostic@resend.dev')
    print(f"Testing email to: {target_email}")
    success = send_welcome_email(target_email, "Test User", "welcome123")
    if success:
        return jsonify({'message': f'Success! Test email sent to {target_email}', 'success': True}), 200
    else:
        return jsonify({'message': 'Failed to send test email. Check server logs.', 'success': False}), 500

@app.route('/')
def index():
    """Serve basic info."""
    return jsonify({
        'message': 'Talk to Krishna API',
        'endpoints': {
            '/api/ask': 'POST - Ask a question',
            '/api/health': 'GET - Health check'
        }
    })

import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash, check_password_hash
import json
from datetime import datetime
import re
from collections import defaultdict
import time

# Database setup
# Allow overriding db path for production environments (like Render persistent disks)
import os
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://neondb_owner:npg_AIJCOKgs6hN4@ep-twilight-field-ail5wonj-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

def get_db_connection():
    max_retries = 5
    base_delay = 0.5
    
    start_time = time.time()
    last_error = None
    
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(DATABASE_URL)
            elapsed = time.time() - start_time
            if elapsed > 1.0:
                print(f"  DB Connect took {elapsed:.2f}s")
            return conn
        except psycopg2.OperationalError as e:
            last_error = e
            if attempt == max_retries - 1:
                print(f"Database connection error (Failed after {max_retries} attempts): {e}")
                raise e
            
            sleep_time = base_delay * (2 ** attempt)
            print(f"Database connection transient error: {e}. Retrying in {sleep_time} seconds (Attempt {attempt + 1}/{max_retries})")
            time.sleep(sleep_time)
        except Exception as e:
            print(f"Unexpected database connection error: {e}")
            raise e

# Rate limiting setup
login_attempts = defaultdict(list)
signup_attempts = defaultdict(list)
MAX_ATTEMPTS = 5  # Maximum attempts
WINDOW_SECONDS = 300  # 5 minutes window

def check_rate_limit(ip_address, attempts_dict):
    """Check if IP has exceeded rate limit. (Disabled as per user request)"""
    return True, None

def record_attempt(ip_address, attempts_dict):
    """Record an attempt from IP."""
    attempts_dict[ip_address].append(time.time())

def validate_password(password):
    """
    Validate password strength.
    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special character
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character (!@#$%^&*...)"
    
    return True, "Password is strong"

def validate_email(email):
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        return False, "Invalid email format"
    return True, None

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            mobile TEXT,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            has_chat_access BOOLEAN DEFAULT TRUE,
            has_received_welcome_message BOOLEAN DEFAULT FALSE,
            is_paid BOOLEAN DEFAULT FALSE,
            message_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    c = conn.cursor()
    
    # Migration to remove UNIQUE constraint from mobile if it exists
    try:
        # Check if mobile has a unique constraint. In PostgreSQL, these are often named users_mobile_key
        # We find the constraint name dynamically.
        c.execute("""
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'users'::regclass 
            AND contype = 'u' 
            AND conkey @> (SELECT array_agg(attnum) 
                            FROM pg_attribute 
                            WHERE attrelid = 'users'::regclass 
                            AND attname = 'mobile');
        """)
        row = c.fetchone()
        if row:
            constraint_name = row[0]
            print(f"Migrating DB: Dropping unique constraint '{constraint_name}' from mobile column...")
            c.execute(f"ALTER TABLE users DROP CONSTRAINT {constraint_name}")
            conn.commit()
            c = conn.cursor()
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Migration: No unique constraint to drop or error: {e}")
    
    # Ensure has_chat_access exists and is TRUE by default (Migration)
    try:
        c.execute("SELECT has_chat_access FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding has_chat_access column...")
        c.execute("ALTER TABLE users ADD COLUMN has_chat_access BOOLEAN DEFAULT TRUE")
        # For existing users, set it to true
        c.execute("UPDATE users SET has_chat_access = TRUE WHERE has_chat_access IS NULL OR has_chat_access = FALSE")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating has_chat_access: {e}")
    
    # Migration for role if it doesn't exist
    try:
        c.execute("SELECT role FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding role column...")
        c.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating role: {e}")

    # Migration for has_received_welcome_message if it doesn't exist
    try:
        c.execute("SELECT has_received_welcome_message FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding has_received_welcome_message column...")
        c.execute("ALTER TABLE users ADD COLUMN has_received_welcome_message BOOLEAN DEFAULT FALSE")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating has_received_welcome_message column: {e}")
    
    # Migration for is_paid and message_count
    try:
        c.execute("SELECT is_paid FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding is_paid column...")
        c.execute("ALTER TABLE users ADD COLUMN is_paid BOOLEAN DEFAULT FALSE")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating is_paid: {e}")

    try:
        c.execute("SELECT message_count FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding message_count column...")
        c.execute("ALTER TABLE users ADD COLUMN message_count INTEGER DEFAULT 0")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating message_count: {e}")
    
    # Sync message_count with actual conversations to update existing accounts
    try:
        # Check if conversations table exists first to avoid error
        c.execute("SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations'")
        if c.fetchone():
            print("Database sync: Initializing message_count from existing conversations...")
            c.execute('''
                UPDATE users u
                SET message_count = (
                    SELECT COUNT(*) 
                    FROM conversations c 
                    WHERE c.user_id = u.id
                )
            ''')
            conn.commit()
            c = conn.cursor()
            print("Database sync: Completed message_count initialization.")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error syncing message_count: {e}")
    
    # User Mobile column migration
    try:
        c.execute("SELECT mobile FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding mobile column to users table...")
        c.execute("ALTER TABLE users ADD COLUMN mobile TEXT UNIQUE")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating mobile column: {e}")
    
    # ── DELETE STATUS MIGRATION ──────────────────────────────────────────────
    try:
        c.execute("SELECT status FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding status column to users table...")
        c.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
        # For existing users, set it to active
        c.execute("UPDATE users SET status = 'active' WHERE status IS NULL")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating status: {e}")

    try:
        c.execute("SELECT deleted_at FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding deleted_at column to users table...")
        c.execute("ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating deleted_at: {e}")
    # ─────────────────────────────────────────────────────────────────────────
    
    # Coupons table
    c.execute('''
        CREATE TABLE IF NOT EXISTS coupons (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            discount_type TEXT DEFAULT 'free_access',
            discount_value NUMERIC DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    c = conn.cursor()

    # Subscriptions table for payment tracking
    c.execute('''
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id),
            razorpay_order_id TEXT UNIQUE NOT NULL,
            razorpay_payment_id TEXT,
            razorpay_subscription_id TEXT,
            plan_id TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            currency TEXT DEFAULT 'JPY',
            status TEXT DEFAULT 'pending',
            subscription_status TEXT,
            next_billing_date TIMESTAMP,
            coupon_applied TEXT,
            discount_amount NUMERIC DEFAULT 0,
            receipt_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    c = conn.cursor()
    
    # Add index for order_id
    c.execute('CREATE INDEX IF NOT EXISTS idx_subscriptions_order_id ON subscriptions(razorpay_order_id)')

    # Migration for subscriptions table: add missing recurring payment columns
    for column, col_type in [
        ('razorpay_subscription_id', 'TEXT'),
        ('subscription_status', 'TEXT'),
        ('next_billing_date', 'TIMESTAMP'),
        ('coupon_applied', 'TEXT'),
        ('discount_amount', 'NUMERIC DEFAULT 0')
    ]:
        try:
            c.execute(f"SELECT {column} FROM subscriptions LIMIT 1")
        except errors.UndefinedColumn:
            conn.rollback()
            c = conn.cursor()
            print(f"Migrating DB: Adding {column} column to subscriptions table...")
            c.execute(f'ALTER TABLE subscriptions ADD COLUMN {column} {col_type}')
            conn.commit()
        except Exception as e:
            conn.rollback()
            c = conn.cursor()
            print(f"Error checking/migrating subscriptions.{column}: {e}")

    # Create index for subscription_id after ensuring columns exist
    c.execute('CREATE INDEX IF NOT EXISTS idx_subscriptions_sub_id ON subscriptions(razorpay_subscription_id)')

    # Migration for coupons table: add discount_value if it doesn't exist
    try:
        c.execute("SELECT discount_value FROM coupons LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding discount_value column to coupons table...")
        c.execute('ALTER TABLE coupons ADD COLUMN discount_value NUMERIC DEFAULT 0')
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating discount_value column: {e}")
    
    # Conversations table
    c.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id),
            session_id TEXT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            shlokas TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    c = conn.cursor()
    
    # Add index for timestamp and user_id to speed up analytics
    c.execute('CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)')
    
    # Check if session_id column exists (migration for existing DB)
    try:
        c.execute("SELECT session_id FROM conversations LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        print("Migrating DB: Adding session_id column...")
        c.execute('ALTER TABLE conversations ADD COLUMN session_id TEXT')
    except Exception as e:
        conn.rollback()
        print(f"Error checking/migrating session_id column: {e}")
    
    # Password reset tokens table
    c.execute('''
        CREATE TABLE IF NOT EXISTS reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id),
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE
        )
    ''')
    conn.commit()
    c = conn.cursor()
    
    # Check if role column exists (migration)
    try:
        c.execute("SELECT role FROM users LIMIT 1")
    except errors.UndefinedColumn:
        conn.rollback()
        c = conn.cursor()
        print("Migrating DB: Adding role and has_chat_access columns...")
        c.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        c.execute("ALTER TABLE users ADD COLUMN has_chat_access BOOLEAN DEFAULT TRUE")
        c.execute("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    except Exception as e:
        conn.rollback()
        c = conn.cursor()
        print(f"Error checking/migrating role column: {e}")

    
    # Force grant access to all current users on startup (for the time being)
    try:
        c.execute("UPDATE users SET has_chat_access = TRUE WHERE has_chat_access = FALSE OR has_chat_access IS NULL")
        print("Database sync: All users verified for chat access.")
    except Exception as e:
        print(f"Startup sync error: {e}")
        conn.rollback()
        c = conn.cursor()

    # Ensure the default admin exists
    admin_email = "abhishek@justlearnindia.in"
    c.execute("SELECT id FROM users WHERE email = %s", (admin_email,))
    if not c.fetchone():
        print(f"Creating default admin: {admin_email}")
        admin_password = generate_password_hash("AdminPassword123!")
        c.execute('''
            INSERT INTO users (name, email, password, role, has_chat_access, is_paid)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', ("Admin Abhishek", admin_email, admin_password, "admin", True, True))
    
    conn.commit()
    conn.close()

def get_user_history(user_id, session_id=None, limit=5):
    """Get recent conversation history for a user, optionally filtered by session."""
    conn = get_db_connection()
    c = conn.cursor()
    
    if session_id:
        # If session_id provided, only get history for THAT session
        c.execute('''
            SELECT question, answer, shlokas, timestamp 
            FROM conversations 
            WHERE user_id = %s AND session_id = %s
            ORDER BY timestamp DESC 
            LIMIT %s
        ''', (user_id, session_id, limit))
    else:
        # Fallback to global history (or maybe just empty if we want strict sessions?)
        c.execute('''
            SELECT question, answer, shlokas, timestamp 
            FROM conversations 
            WHERE user_id = %s 
            ORDER BY timestamp DESC 
            LIMIT %s
        ''', (user_id, limit))
        
    history = c.fetchall()
    conn.close()
    
    # Format history for LLM context
    formatted_history = []
    for q, a, shlokas, ts in reversed(history):  # Reverse to get chronological order
        formatted_history.append({
            'question': q,
            'answer': a,
            'timestamp': ts
        })
    return formatted_history

def save_conversation(user_id, question, answer, shlokas, session_id=None):
    """Save a conversation to the database."""
    conn = get_db_connection()
    c = conn.cursor()
    shlokas_json = json.dumps(shlokas) if shlokas else None
    c.execute('''
        INSERT INTO conversations (user_id, session_id, question, answer, shlokas)
        VALUES (%s, %s, %s, %s, %s)
    ''', (user_id, session_id, question, answer, shlokas_json))
    conn.commit()
    conn.close()

def generate_reset_token():
    """Generate a secure random token."""
    import secrets
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hash a token using SHA-256."""
    return hashlib.sha256(token.encode()).hexdigest()

def create_reset_token(user_id):
    """Create and store a hashed password reset token for a user (15 min expiry, IST)."""
    raw_token = generate_reset_token()
    hashed_token = hash_token(raw_token)
    
    # Use IST (UTC+5:30) for consistency
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    expires_at = ist_now + timedelta(minutes=15)
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # First, deactivate any existing tokens for this user
    c.execute('UPDATE reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE', (user_id,))
    
    # Store new token
    c.execute('''
        INSERT INTO reset_tokens (user_id, token, expires_at)
        VALUES (%s, %s, %s)
    ''', (user_id, hashed_token, expires_at.isoformat()))
    
    conn.commit()
    conn.close()
    
    return raw_token

def validate_reset_token(raw_token):
    """Validate a raw reset token and return user_id if valid."""
    hashed_token = hash_token(raw_token)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT user_id, expires_at, used 
        FROM reset_tokens 
        WHERE token = %s
    ''', (hashed_token,))
    result = c.fetchone()
    conn.close()
    
    if not result:
        return None, "Эта ссылка для сброса недействительна или не распознана."
    
    user_id, expires_at, used = result
    
    if used:
        return None, "Эта ссылка для сброса уже была использована."
    
    # Check if token has expired
    # Handle both string (isoformat) and datetime objects
    if isinstance(expires_at, str):
        # Remove trailing Z or T if necessary for fromisoformat if they exist
        clean_date = expires_at.replace('Z', '').replace('T', ' ')
        try:
            expires_datetime = datetime.fromisoformat(clean_date)
        except:
            # Fallback if isoformat fails
            expires_datetime = datetime.strptime(clean_date.split('.')[0], '%Y-%m-%d %H:%M:%S')
    else:
        expires_datetime = expires_at
        
    # Ensure expires_datetime is naive for comparison
    if expires_datetime.tzinfo is not None:
        expires_datetime = expires_datetime.replace(tzinfo=None)
        
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    if ist_now > expires_datetime:
        return None, "Эта ссылка для сброса истекла (действительна 15 минут)."
    
    return user_id, None

def delete_reset_token(raw_token):
    """Delete a reset token from the database after successful use."""
    hashed_token = hash_token(raw_token)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM reset_tokens WHERE token = %s', (hashed_token,))
    conn.commit()
    conn.close()

@app.route('/api/history', methods=['GET'])
def get_history_api():
    """Fetch all history for a specific user to display in the UI"""
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'error': 'User ID is required', 'success': False}), 400
            
        # Get all history up to 50 conversations for the sidebar
        raw_history = get_user_history(user_id, limit=50)
        
        return jsonify({
            'success': True,
            'history': raw_history
        })
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify({'error': 'Failed to fetch history', 'success': False}), 500

# Initialize DB
init_db()

@app.route('/api/signup', methods=['POST'])
def signup():
    # Get client IP for rate limiting
    client_ip = request.remote_addr
    
    # Check rate limit
    allowed, error_msg = check_rate_limit(client_ip, signup_attempts)
    if not allowed:
        return jsonify({'error': error_msg, 'success': False}), 429
    
    # Record this attempt
    record_attempt(client_ip, signup_attempts)
    
    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    mobile = data.get('mobile', '').strip()
    password = data.get('password', '')

    # Validate required fields
    if not name or not email or not password or not mobile:
        return jsonify({'error': 'All fields are required', 'success': False}), 400
    
    # ... other validations ...
    hashed_pw = generate_password_hash(password)

    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('INSERT INTO users (name, email, mobile, password, has_chat_access, has_received_welcome_message) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id', (name, email, mobile, hashed_pw, True, False))
        user_id = c.fetchone()[0]
        conn.commit()
        conn.close()
        
        # Async send welcome email
        threading.Thread(target=send_welcome_email, args=(email, name, password)).start()
        # Async send admin notification
        threading.Thread(target=send_admin_notification_email, args=(name, email, mobile)).start()

        print(f"New user registered: {email} (Mobile: {mobile})")
        return jsonify({
            'message': 'Account created successfully!', 
            'success': True,
            'user': {
                'id': user_id,
                'name': name,
                'email': email,
                'mobile': mobile,
                'role': 'user',
                'has_chat_access': True,
                'has_received_welcome_message': False,
                'is_paid': False
            }
        }), 201
    except psycopg2.IntegrityError:
        # Since mobile is no longer unique, any IntegrityError here is almost certainly a duplicate email
        return jsonify({'error': 'This email is already registered', 'success': False}), 409
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({'error': 'Registration failed. Please try again.', 'success': False}), 500

@app.route('/api/google-auth', methods=['POST'])
def google_auth():
    """Verify Google token and login/signup user."""
    data = request.get_json()
    token = data.get('token')
    
    if not token:
        return jsonify({'error': 'Google token is required', 'success': False}), 400
        
    try:
        # Verify the token with Google
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)
        
        # ID token is valid. Extract user info.
        email = idinfo.get('email')
        name = idinfo.get('name')
        
        if not email:
            return jsonify({'error': 'Email not found in Google token', 'success': False}), 400
            
        # Check if user exists in database
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT id, name, email, role, has_chat_access, has_received_welcome_message, is_paid, status FROM users WHERE email = %s', (email,))
        user = c.fetchone()
        
        if user and user[7] == 'deleted':
            conn.close()
            print(f"Google login attempt for deleted account: {email}")
            return jsonify({'error': 'Этот аккаунт удален.', 'success': False}), 403

        if not user:
            # Create new user for first-time Google sign-in
            # Password is set to empty, mobile is set to 'Google-User'
            try:
                c.execute('INSERT INTO users (name, email, password, mobile, has_chat_access) VALUES (%s, %s, %s, %s, %s) RETURNING id', 
                           (name, email, '', 'Google-User', True))
                user_id = c.fetchone()[0]
                conn.commit()
                
                # Fetch updated user info
                c.execute('SELECT id, name, email, role, has_chat_access, has_received_welcome_message, is_paid FROM users WHERE id = %s', (user_id,))
                user = c.fetchone()
                print(f"New user registered via Google: {email}")
                
                # Send welcome notification (specialized for Google)
                threading.Thread(target=send_google_welcome_email, args=(email, name)).start()
                threading.Thread(target=send_admin_notification_email, args=(name, email, 'Google-User')).start()
                
            except Exception as db_err:
                print(f"Error creating Google user in DB: {db_err}")
                conn.rollback()
                return jsonify({'error': 'Failed to create user account', 'success': False}), 500
            finally:
                conn.close()
        else:
            conn.close()
            print(f"Existing user logged in via Google: {email}")
            
        return jsonify({
            'message': 'Login successful',
            'success': True,
            'user': {
                'id': user[0],
                'name': user[1],
                'email': user[2],
                'role': user[3],
                'has_chat_access': bool(user[4]),
                'has_received_welcome_message': bool(user[5]),
                'is_paid': bool(user[6])
            }
        }), 200
        
    except ValueError as e:
        print(f"Google token verification failed: {e}")
        return jsonify({'error': 'Invalid Google token', 'success': False}), 401
    except Exception as e:
        print(f"Google authentication error: {e}")
        return jsonify({'error': 'Authentication failed', 'success': False}), 500

@app.route('/api/login', methods=['POST'])
def login():
    # Get client IP for rate limiting
    client_ip = request.remote_addr
    
    # Check rate limit
    allowed, error_msg = check_rate_limit(client_ip, login_attempts)
    if not allowed:
        return jsonify({'error': error_msg, 'success': False}), 429
    
    # Record this attempt
    record_attempt(client_ip, login_attempts)
    
    data = request.get_json()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required', 'success': False}), 400
    
    # Validate email format
    email_valid, email_error = validate_email(email)
    if not email_valid:
        return jsonify({'error': 'Invalid email format', 'success': False}), 400

    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT id, name, email, password, role, has_chat_access, has_received_welcome_message, is_paid, status FROM users WHERE email = %s', (email,))
        user = c.fetchone()
        conn.close()

        if user:
            # Check if account is deleted
            if user[8] == 'deleted':
                print(f"Login attempt for deleted account: {email}")
                return jsonify({'error': 'Этот аккаунт удален.', 'success': False}), 403
            
            if check_password_hash(user[3], password):
                print(f"Successful login: {email}")
                # For the time being, ensure user has chat access on login
                if not user[5]:
                    try:
                        conn_update = get_db_connection()
                        c_update = conn_update.cursor()
                        c_update.execute('UPDATE users SET has_chat_access = TRUE WHERE id = %s', (user[0],))
                        conn_update.commit()
                        conn_update.close()
                        # Use updated access for response
                        has_access = True
                    except Exception as e:
                        print(f"Error auto-granting access on login: {e}")
                        has_access = user[5]
                else:
                    has_access = user[5]

                return jsonify({
                    'message': 'Login successful',
                    'success': True,
                    'user': {
                        'id': user[0],
                        'name': user[1],
                        'email': user[2],
                        'role': user[4],
                        'has_chat_access': has_access,
                        'has_received_welcome_message': user[6],
                        'is_paid': bool(user[7])
                    }
                }), 200
        else:
            print(f"Failed login attempt: {email}")
            return jsonify({'error': 'Invalid email or password', 'success': False}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': 'Login failed. Please try again.', 'success': False}), 500

@app.route('/api/login/request-otp', methods=['POST'])
def request_otp():
    """Request OTP for email login."""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    
    if not email:
        return jsonify({'error': 'Email is required', 'success': False}), 400
        
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT id, name, status FROM users WHERE email = %s', (email,))
        user = c.fetchone()
        conn.close()
        
        if not user:
            return jsonify({'error': 'Email address not registered', 'success': False}), 404
            
        user_id, name, status = user
        
        if status == 'deleted':
            print(f"OTP request for deleted account: {email}")
            return jsonify({'error': 'Этот аккаунт удален.', 'success': False}), 403
        
        # Generate 6-digit OTP
        import random
        otp = str(random.randint(100000, 999999))
        
        # Save OTP in-memory with 5 mins expiry
        expires_at = time.time() + 300
        otp_storage[email] = {
            'otp': otp,
            'expires_at': expires_at,
            'user_id': user_id
        }
        
        # Send OTP via email
        threading.Thread(target=send_otp_email, args=(email, name, otp)).start()
        
        return jsonify({
            'message': 'OTP sent to your email address',
            'success': True
        }), 200
        
    except Exception as e:
        print(f"OTP request error: {e}")
        return jsonify({'error': 'Failed to request OTP', 'success': False}), 500

@app.route('/api/login/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP and login user."""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()
    
    if not email or not otp:
        return jsonify({'error': 'Email and OTP are required', 'success': False}), 400
        
    stored_data = otp_storage.get(email)
    
    if not stored_data:
        return jsonify({'error': 'OTP expired or not requested', 'success': False}), 400
        
    if time.time() > stored_data['expires_at']:
        del otp_storage[email]
        return jsonify({'error': 'OTP has expired', 'success': False}), 400
        
    if stored_data['otp'] != otp:
        return jsonify({'error': 'Invalid OTP', 'success': False}), 401
        
    # Valid OTP - log user in
    user_id = stored_data['user_id']
    del otp_storage[email]
    
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT id, name, email, role, has_chat_access, has_received_welcome_message, is_paid FROM users WHERE id = %s', (user_id,))
        user = c.fetchone()
        conn.close()
        
        if user:
            return jsonify({
                'message': 'Login successful',
                'success': True,
                'user': {
                    'id': user[0],
                    'name': user[1],
                    'email': user[2],
                    'role': user[3],
                    'has_chat_access': user[4],
                    'has_received_welcome_message': user[5],
                    'is_paid': bool(user[6])
                }
            }), 200
        else:
            return jsonify({'error': 'User not found', 'success': False}), 404
    except Exception as e:
        print(f"OTP verification login error: {e}")
        return jsonify({'error': 'Login failed', 'success': False}), 500

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    """Request a password reset link."""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    
    if not email:
        return jsonify({'error': 'Требуется адрес электронной почты', 'success': False}), 400
    
    # Validate email format
    email_valid, email_error = validate_email(email)
    if not email_valid:
        return jsonify({'error': 'Неверный формат электронной почты', 'success': False}), 400
    
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT id, name, status FROM users WHERE email = %s', (email,))
        user_row = c.fetchone()
        conn.close()
        
        # Always return success to prevent email enumeration, 
        # but skip token creation for deleted accounts
        if user_row and user_row[2] != 'deleted':
            user_id, name = user_row
            raw_token = create_reset_token(user_id)
            
            # Determine base URL for reset link dynamically
            # Priority: Localhost (for dev) > Production Domain (https://japan.talktokrishna.ai)
            origin = request.headers.get('Origin')
            if origin and 'localhost' in origin:
                f_url = origin.rstrip('/')
            else:
                f_url = "https://japan.talktokrishna.ai"
            
            reset_url = f"{f_url}/reset-password?token={raw_token}"
            print(f"[Auth] Generated Reset URL: {reset_url} (Origin was: {origin})")
            
            # Send email in background
            threading.Thread(target=send_password_reset_email, args=(email, name, reset_url)).start()
            
        return jsonify({
            'success': True,
            'message': 'Если аккаунт существует, ссылка для сброса пароля была отправлена.'
        }), 200
            
    except Exception as e:
        print(f"Forgot password error: {e}")
        return jsonify({'error': 'Запрос не удался. Пожалуйста, попробуйте еще раз.', 'success': False}), 500

@app.route('/api/verify-token', methods=['GET'])
def verify_token():
    """Verify if a reset token is still valid."""
    token = request.args.get('token', '').strip()
    
    if not token:
        return jsonify({'valid': False, 'error': 'Токен не предоставлен'}), 400
        
    user_id, error = validate_reset_token(token)
    
    if error:
        return jsonify({'valid': False, 'error': error}), 200
        
    return jsonify({'valid': True}), 200

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    """Reset password using a valid token."""
    data = request.get_json()
    token = data.get('token', '').strip()
    new_password = data.get('password', '')
    
    if not token or not new_password:
        return jsonify({'error': 'Требуются токен и новый пароль', 'success': False}), 400
    
    # Validate password strength
    password_valid, password_error = validate_password(new_password)
    # Error if validation fails
    if not password_valid:
        return jsonify({'error': 'Пароль должен содержать не менее 8 символов, включая прописные и строчные буквы, цифры и специальные символы.', 'success': False}), 400
    
    # Validate token
    user_id, error = validate_reset_token(token)
    if error:
        return jsonify({'error': error, 'success': False}), 400
    
    try:
        # Get user details for confirmation email
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT name, email FROM users WHERE id = %s', (user_id,))
        user_row = c.fetchone()
        
        if not user_row:
            conn.close()
            return jsonify({'error': 'Пользователь не найден', 'success': False}), 404
            
        user_name, user_email = user_row

        # Update password
        hashed_pw = generate_password_hash(new_password)
        c.execute('UPDATE users SET password = %s WHERE id = %s', (hashed_pw, user_id))
        conn.commit()
        conn.close()
        
        # Delete token after successful use (as per security flowchart)
        delete_reset_token(token)
        
        # Send confirmation email
        threading.Thread(target=send_password_reset_success_email, args=(user_email, user_name, new_password)).start()
        
        print(f"Password reset successful for user ID: {user_id}")
        return jsonify({
            'success': True,
            'message': 'Пароль успешно сброшен. Теперь вы можете войти с новым паролем.'
        }), 200
        
    except Exception as e:
        print(f"Reset password error: {e}")
        return jsonify({'error': 'Сброс пароля не удался. Пожалуйста, попробуйте еще раз.', 'success': False}), 500

@app.route('/api/user/welcome_received', methods=['POST'])
def welcome_received():
    """Mark that the user has received the welcome message."""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'error': 'User ID is required', 'success': False}), 400
        
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('UPDATE users SET has_received_welcome_message = TRUE WHERE id = %s', (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating welcome message status: {e}")
        return jsonify({'error': 'Failed to update status', 'success': False}), 500

@app.route('/api/user/stats', methods=['GET'])
def get_user_stats():
    """Get statistics for a specific user."""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'User ID is required', 'success': False}), 400
    
    try:
        # Ensure user_id is an integer for DB query
        user_id_int = int(user_id)
        conn = get_db_connection()
        c = conn.cursor()
        
        # 1. Total conversations
        c.execute('SELECT COUNT(*) FROM conversations WHERE user_id = %s', (user_id_int,))
        count_row = c.fetchone()
        total_conversations = count_row[0] if count_row else 0
        
        # 3. Subscription info
        c.execute('''
            SELECT plan_id, status, subscription_status, next_billing_date, razorpay_subscription_id 
            FROM subscriptions 
            WHERE user_id = %s 
            ORDER BY created_at DESC LIMIT 1
        ''', (user_id_int,))
        sub_row = c.fetchone()
        
        sub_data = None
        if sub_row:
            db_status = sub_row[1] # 'paid', 'pending'
            sub_status = sub_row[2] # 'created', 'active', 'cancelled'
            
            # Show mandate pending if paid for first payment but mandate not yet authorized
            status_to_show = sub_status
            if db_status == 'paid' and sub_status == 'created':
                status_to_show = 'pending_mandate'
            
            sub_data = {
                'plan_id': sub_row[0],
                'status': status_to_show,
                'next_billing_at': sub_row[3].isoformat() if sub_row[3] else None,
                'subscription_id': sub_row[4]
            }
        
        # Calculate hours of wisdom (Estimate: 2 minutes per shloka/conversation)
        hours_of_wisdom = round((total_conversations * 2) / 60, 2)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': {
                'conversations_count': total_conversations,
                'hours_of_wisdom': hours_of_wisdom,
                'subscription': sub_data,
                'razorpay_key': RAZORPAY_KEY_ID
            }
        })
    except Exception as e:
        print(f"Error fetching user stats: {e}")
        return jsonify({'error': 'Failed to fetch user statistics', 'success': False}), 500

@app.route('/api/grant-access', methods=['POST'])
def grant_chat_access_after_payment():
    """
    Grant chat access to a user after successful payment/checkout.
    Called automatically from frontend after purchase is complete.
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'error': 'User ID is required', 'success': False}), 400

        conn = get_db_connection()
        c = conn.cursor()

        # Verify user exists
        c.execute('SELECT id, name, email FROM users WHERE id = %s', (user_id,))
        user = c.fetchone()

        if not user:
            conn.close()
            return jsonify({'error': 'ユーザーが見つかりません', 'success': False}), 404

        # Grant chat access
        c.execute('UPDATE users SET has_chat_access = TRUE WHERE id = %s', (user_id,))
        conn.commit()
        conn.close()

        print(f"✅ Chat access granted to user: {user[2]} (ID: {user_id})")
        return jsonify({
            'success': True,
            'message': 'Chat access granted successfully',
            'has_chat_access': True
        }), 200

    except Exception as e:
        print(f"Grant access error: {e}")
        return jsonify({'error': 'Failed to grant access. Please try again.', 'success': False}), 500

@app.route('/api/user/chat-limit', methods=['GET'])
def get_chat_limit():
    """Return the user's current chat usage and limit status."""
    user_id = request.args.get('user_id')
    FREE_LIMIT = 5

    if not user_id:
        return jsonify({
            'success': False,
            'error': 'user_id is required'
        }), 400

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid user_id'}), 400

    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT is_paid, COALESCE(message_count, 0) FROM users WHERE id = %s', (user_id,))
        row = c.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        is_paid = bool(row[0])
        message_count = int(row[1] or 0)

        return jsonify({
            'success': True,
            'is_paid': is_paid,
            'messages_used': message_count,
            'free_limit': FREE_LIMIT,
            'remaining': max(0, FREE_LIMIT - message_count) if not is_paid else -1,
            'limit_reached': (not is_paid and message_count >= FREE_LIMIT)
        })
    except Exception as e:
        print(f"[ERROR] get_chat_limit: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/create-razorpay-order', methods=['POST'])
def create_razorpay_order():
    """Create a new Razorpay order for TTK Japan."""
    if not razorpay_client:
        return jsonify({'error': 'Razorpay is not configured', 'success': False}), 500

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        plan_id = data.get('plan_id')
        amount = data.get('amount') # in JPY
        email = data.get('email')
        coupon_code = data.get('coupon_code')
        discount_amount = data.get('discount_amount', 0)

        print(f"DEBUG: create_razorpay_order called - user_id={user_id}, plan_id={plan_id}, amount={amount}, email={email}, coupon={coupon_code}")

        # Explicit check for missing fields
        if user_id is None or plan_id is None or amount is None or email is None:
            return jsonify({'error': 'Missing required fields', 'success': False}), 400

        # If amount is 0, handle separately
        if int(amount) <= 0:
            return jsonify({'error': 'Amount must be greater than zero for Razorpay. Use free-access endpoint instead.', 'success': False}), 400

        # Unique receipt ID for this platform
        receipt_id = f"ttk_jp_{user_id}_{int(time.time())}"

        order_options = {
            'amount': int(amount), 
            'currency': 'JPY',
            'receipt': receipt_id,
            'notes': {
                'Platform': 'TTK Japan',
                'Plan_Type': plan_id,
                'User_Email': email,
                'Internal_Reference_ID': f"USER_{user_id}",
                'Description': f"Talk to Krishna Japan {plan_id} Plan"
            }
        }

        # Create order in Razorpay
        print(f"Attempting Razorpay order creation for receipt: {receipt_id}...")
        order = razorpay_client.order.create(data=order_options)
        print(f"Razorpay API Success: {order.get('id')}")

        # Store pending order in our database with discount info
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO subscriptions (user_id, razorpay_order_id, plan_id, amount, currency, receipt_id, status, coupon_applied, discount_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (user_id, order['id'], plan_id, amount, 'JPY', receipt_id, 'pending', coupon_code, discount_amount))
        conn.commit()
        conn.close()

        print(f"Created RZP Order {order['id']} for {email} (Plan: {plan_id})")
        
        return jsonify({
            'success': True,
            'order_id': order['id'],
            'amount': order['amount'],
            'currency': order['currency'],
            'key_id': RAZORPAY_KEY_ID
        }), 200

    except Exception as e:
        import traceback
        print(f"Razorpay Order Error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/verify-payment', methods=['POST'])
def verify_payment():
    """Verify Razorpay payment signature and grant access."""
    if not razorpay_client:
        return jsonify({'error': 'Razorpay is not configured', 'success': False}), 500

    try:
        data = request.get_json()
        razorpay_order_id = data.get('razorpay_order_id')
        razorpay_payment_id = data.get('razorpay_payment_id')
        razorpay_signature = data.get('razorpay_signature')
        user_id = data.get('user_id')

        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id]):
            return jsonify({'error': 'Missing verification data', 'success': False}), 400

        # Verify signature
        try:
            razorpay_client.utility.verify_payment_signature({
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature
            })
        except Exception as e:
            print(f"Signature Verification Failed: {e}")
            return jsonify({'error': 'Invalid payment signature', 'success': False}), 400

        # Update database
        conn = get_db_connection()
        c = conn.cursor()
        
        # 1. Update order status
        c.execute('''
            UPDATE subscriptions 
            SET status = 'paid', razorpay_payment_id = %s, updated_at = CURRENT_TIMESTAMP
            WHERE razorpay_order_id = %s
        ''', (razorpay_payment_id, razorpay_order_id))
        
        # 2. Grant chat access to user (Initial access)
        c.execute('UPDATE users SET has_chat_access = TRUE, is_paid = TRUE WHERE id = %s', (user_id,))
        
        conn.commit()
        conn.close()

        print(f"✅ Order Verified: {razorpay_payment_id} for User {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Payment successful and access granted',
            'has_chat_access': True
        }), 200

    except Exception as e:
        print(f"Verification Error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/create-razorpay-subscription', methods=['POST'])
def create_razorpay_subscription():
    """Create a new Razorpay subscription (Mandate) for TTK Japan."""
    if not razorpay_client:
        return jsonify({'error': 'Razorpay is not configured', 'success': False}), 500

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        plan_type = data.get('plan_id') # e.g. 'monthly_30'
        
        if not user_id:
            return jsonify({'error': 'Missing user_id', 'success': False}), 400

        # We only support monthly subscriptions for now as per requirement
        if plan_type != 'monthly_30':
             return jsonify({'error': 'Only monthly plan supports recurring billing', 'success': False}), 400

        # Plan ID discovery
        rzp_plan_id = ensure_razorpay_plan()

        # Check if they already have an active/pending subscription attempt
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            SELECT razorpay_subscription_id, subscription_status 
            FROM subscriptions 
            WHERE user_id = %s AND plan_id = %s AND (subscription_status = 'created' OR subscription_status = 'active')
            ORDER BY created_at DESC LIMIT 1
        ''', (user_id, plan_type))
        existing_sub = c.fetchone()

        if existing_sub and existing_sub[0]:
            print(f"User {user_id} already has a subscription {existing_sub[0]}. Returning existing.")
            return jsonify({
                'success': True,
                'subscription_id': existing_sub[0],
                'key_id': RAZORPAY_KEY_ID
            }), 200

        # Create new subscription mandate
        subscription_options = {
            'plan_id': rzp_plan_id,
            'customer_notify': 1,
            'total_count': 120, # 10 years
            'notes': {
                'user_id': user_id,
                'plan_type': plan_type,
                'Platform': 'TTK Japan'
            }
        }
        
        # Mandate starts in 30 days
        start_at = int(time.time()) + (30 * 24 * 60 * 60)
        subscription_options['start_at'] = start_at

        print(f"Attempting Razorpay subscription creation for user {user_id}...")
        subscription = razorpay_client.subscription.create(data=subscription_options)
        
        # Update DB: Link this subscription to the latest paid order
        c.execute('''
            UPDATE subscriptions 
            SET razorpay_subscription_id = %s, subscription_status = %s, next_billing_date = %s
            WHERE user_id = %s AND plan_id = %s AND status = 'paid'
        ''', (subscription['id'], 'created', datetime.utcfromtimestamp(start_at), user_id, plan_type))
        
        # If no paid record found (maybe they are doing mandate from Profile without checkout flow), create a dummy paid record
        if c.rowcount == 0:
             c.execute('''
                INSERT INTO subscriptions (user_id, razorpay_order_id, razorpay_subscription_id, plan_id, amount, currency, status, subscription_status, next_billing_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (user_id, 'PROFILE_MANDATE_' + str(int(time.time())), subscription['id'], plan_type, 14999, 'JPY', 'paid', 'created', datetime.utcfromtimestamp(start_at)))
        
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'subscription_id': subscription['id'],
            'key_id': RAZORPAY_KEY_ID
        }), 200

    except Exception as e:
        import traceback
        print(f"Razorpay Subscription Error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/razorpay-webhook', methods=['POST'])
def razorpay_webhook():
    """Handle Razorpay webhooks for recurring payments."""
    webhook_body = request.data
    webhook_signature = request.headers.get('X-Razorpay-Signature')
    webhook_secret = os.getenv('RAZORPAY_WEBHOOK_SECRET', '')

    if webhook_secret:
        try:
            razorpay_client.utility.verify_webhook_signature(webhook_body.decode('utf-8'), webhook_signature, webhook_secret)
        except Exception as e:
            print(f"Webhook Signature Verification Failed: {e}")
            return jsonify({'status': 'error', 'message': 'Invalid signature'}), 400

    event_data = request.get_json()
    event = event_data.get('event')
    payload = event_data.get('payload', {})

    print(f"🔔 Received Razorpay Webhook: {event}")

    try:
        conn = get_db_connection()
        c = conn.cursor()

        if event == 'subscription.authenticated':
            sub_payload = payload.get('subscription', {}).get('entity', {})
            sub_id = sub_payload.get('id')
            c.execute('UPDATE subscriptions SET subscription_status = %s, updated_at = CURRENT_TIMESTAMP WHERE razorpay_subscription_id = %s', ('active', sub_id))
            print(f"Subscription {sub_id} authenticated.")

        elif event == 'subscription.activated':
             sub_payload = payload.get('subscription', {}).get('entity', {})
             sub_id = sub_payload.get('id')
             c.execute('UPDATE subscriptions SET subscription_status = %s, updated_at = CURRENT_TIMESTAMP WHERE razorpay_subscription_id = %s', ('active', sub_id))
             print(f"Subscription {sub_id} activated.")

        elif event == 'invoice.paid':
            invoice_payload = payload.get('invoice', {}).get('entity', {})
            sub_id = invoice_payload.get('subscription_id')
            
            # Renew access
            c.execute('''
                UPDATE users SET has_chat_access = TRUE, is_paid = TRUE 
                WHERE id = (SELECT user_id FROM subscriptions WHERE razorpay_subscription_id = %s LIMIT 1)
            ''', (sub_id,))
            
            # Update next billing date if provided
            sub_ent = payload.get('subscription', {}).get('entity', {})
            if sub_ent.get('current_end'):
                next_date = datetime.utcfromtimestamp(sub_ent['current_end'])
                c.execute('UPDATE subscriptions SET next_billing_date = %s WHERE razorpay_subscription_id = %s', (next_date, sub_id))

        elif event == 'subscription.cancelled':
             sub_payload = payload.get('subscription', {}).get('entity', {})
             sub_id = sub_payload.get('id')
             c.execute('UPDATE subscriptions SET subscription_status = %s, updated_at = CURRENT_TIMESTAMP WHERE razorpay_subscription_id = %s', ('cancelled', sub_id))

        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'}), 200

    except Exception as e:
        print(f"Webhook processing error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/verify-subscription', methods=['POST'])
def verify_subscription_sync():
    """Manually sync subscription status from Razorpay."""
    if not razorpay_client:
        return jsonify({'error': 'Razorpay not configured', 'success': False}), 500

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        subscription_id = data.get('subscription_id')

        # Fetch from Razorpay
        sub_ent = razorpay_client.subscription.fetch(subscription_id)
        status = sub_ent.get('status')
        
        db_status = status
        if status in ['authenticated', 'active']:
            db_status = 'active'
            
        next_billing = None
        if sub_ent.get('current_end'):
             next_billing = datetime.utcfromtimestamp(sub_ent['current_end'])

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE subscriptions 
            SET subscription_status = %s, next_billing_date = %s 
            WHERE razorpay_subscription_id = %s AND user_id = %s
        ''', (db_status, next_billing, subscription_id, user_id))
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'status': db_status})
    except Exception as e:
        print(f"Sync error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/cancel-subscription', methods=['POST'])
def cancel_subscription():
    """Cancel a Razorpay subscription mandate."""
    if not razorpay_client:
        return jsonify({'error': 'Razorpay not configured', 'success': False}), 500

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        subscription_id = data.get('subscription_id')

        # Cancel in Razorpay
        razorpay_client.subscription.cancel(subscription_id, {'cancel_at_cycle_end': 1})
        
        # Update DB
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE subscriptions 
            SET subscription_status = 'cancelled' 
            WHERE razorpay_subscription_id = %s AND user_id = %s
        ''', (subscription_id, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Cancel error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/grant-free-access', methods=['POST'])
def grant_free_access():
    """Handle cases where 100% discount is applied."""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        plan_id = data.get('plan_id')
        coupon_code = data.get('coupon_code')

        if not all([user_id, plan_id, coupon_code]):
            return jsonify({'error': 'Missing required fields', 'success': False}), 400

        # Create record for tracking
        conn = get_db_connection()
        c = conn.cursor()
        
        # 1. Store as free subscription
        receipt_id = f"ttk_jp_free_{user_id}_{int(time.time())}"
        c.execute('''
            INSERT INTO subscriptions (user_id, razorpay_order_id, razorpay_payment_id, plan_id, amount, currency, receipt_id, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ''', (user_id, f"FREE_{int(time.time())}", f"FREE_PYMNT_{int(time.time())}", plan_id, 0, 'JPY', receipt_id, 'completed'))
        
        # 2. Grant access
        c.execute('UPDATE users SET has_chat_access = TRUE, is_paid = TRUE WHERE id = %s', (user_id,))
        
        conn.commit()
        conn.close()

        print(f"✅ Free Access Granted via Coupon {coupon_code} for User {user_id}")
        return jsonify({'success': True, 'message': '100% Discount applied. Access granted.'}), 200

    except Exception as e:
        print(f"Free Access Error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

# --- Admin Endpoints ---

def admin_required(f):
    """Decorator to require admin role."""
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = request.args.get('admin_id') or request.get_json().get('admin_id')
        if not user_id:
            return jsonify({'error': 'Admin ID is required', 'success': False}), 401
        
        try:
            conn = get_db_connection()
            c = conn.cursor()
            c.execute('SELECT role FROM users WHERE id = %s', (user_id,))
            user = c.fetchone()
            conn.close()
            
            if not user or user[0] != 'admin':
                return jsonify({'error': 'Admin privilege required', 'success': False}), 403
        except Exception as e:
            return jsonify({'error': str(e), 'success': False}), 500
            
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_all_users():
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('SELECT id, name, email, role, has_chat_access, created_at FROM users ORDER BY created_at DESC')
        users = c.fetchall()
        conn.close()
        return jsonify({'success': True, 'users': users})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/create-admin', methods=['POST'])
@admin_required
def create_admin():
    data = request.get_json()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = data.get('name', 'Admin').strip()
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required', 'success': False}), 400
        
    hashed_pw = generate_password_hash(password)
    
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO users (name, email, password, role, has_chat_access)
            VALUES (%s, %s, %s, 'admin', True)
        ''', (name, email, hashed_pw))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Admin created successfully', 'success': True})
    except psycopg2.IntegrityError:
        return jsonify({'error': 'Email already exists', 'success': False}), 409
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/grant-access', methods=['POST'])
@admin_required
def grant_access():
    data = request.get_json()
    user_email = data.get('email', '').strip()
    has_access = data.get('has_access', True)
    temporary_password = data.get('temporary_password') # Optional if user already exists
    
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # Check if user exists
        c.execute('SELECT id FROM users WHERE email = %s', (user_email,))
        user = c.fetchone()
        
        if not user:
            if not temporary_password:
                return jsonify({'error': 'User does not exist and no temporary password provided', 'success': False}), 400
            
            # Create user if doesn't exist
            hashed_pw = generate_password_hash(temporary_password)
            c.execute('''
                INSERT INTO users (name, email, password, has_chat_access)
                VALUES (%s, %s, %s, %s)
            ''', (user_email.split('@')[0], user_email, hashed_pw, has_access))
            message = "User created and access granted"
        else:
            # Update existing user
            c.execute('UPDATE users SET has_chat_access = %s WHERE email = %s', (has_access, user_email))
            message = f"Access {'granted' if has_access else 'revoked'} successfully"
            
        conn.commit()
        conn.close()
        return jsonify({'message': message, 'success': True})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/analytics', methods=['GET'])
@admin_required
def get_analytics():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # Total users
        c.execute('SELECT COUNT(*) FROM users')
        total_users = c.fetchone()[0]
        
        # Users used today
        c.execute('''
            SELECT COUNT(DISTINCT user_id) 
            FROM conversations 
            WHERE timestamp >= CURRENT_DATE
        ''')
        today_users = c.fetchone()[0]
        
        # Total conversations
        c.execute('SELECT COUNT(*) FROM conversations')
        total_convs = c.fetchone()[0]
        
        # Convs today
        c.execute('SELECT COUNT(*) FROM conversations WHERE timestamp >= CURRENT_DATE')
        today_convs = c.fetchone()[0]
        
        conn.close()
        return jsonify({
            'success': True,
            'analytics': {
                'total_users': total_users,
                'today_users': today_users,
                'total_conversations': total_convs,
                'today_conversations': today_convs
            }
        })
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/conversations', methods=['GET'])
@admin_required
def get_all_conversations():
    try:
        limit = request.args.get('limit', 50)
        offset = request.args.get('offset', 0)
        
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('''
            SELECT c.id, c.user_id, u.name as user_name, u.email as user_email, 
                   c.question, c.answer, c.timestamp 
            FROM conversations c 
            JOIN users u ON c.user_id = u.id 
            ORDER BY c.timestamp DESC 
            LIMIT %s OFFSET %s
        ''', (limit, offset))
        conversations = c.fetchall()
        conn.close()
        
        return jsonify({'success': True, 'conversations': conversations})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/conversation-users', methods=['GET'])
@admin_required
def get_conversation_users():
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('''
            SELECT u.id, u.name, u.email, 
                   COUNT(c.id) as conversation_count, 
                   MAX(c.timestamp) as last_active
            FROM users u
            JOIN conversations c ON u.id = c.user_id
            GROUP BY u.id, u.name, u.email
            ORDER BY last_active DESC
        ''')
        users = c.fetchall()
        conn.close()
        return jsonify({'success': True, 'users': users})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/user-conversations/<int:user_id>', methods=['GET'])
@admin_required
def get_specific_user_conversations(user_id):
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('''
            SELECT id, question, answer, timestamp, session_id
            FROM conversations 
            WHERE user_id = %s
            ORDER BY timestamp DESC
        ''', (user_id,))
        conversations = c.fetchall()
        
        # Get user info too
        c.execute('SELECT name, email FROM users WHERE id = %s', (user_id,))
        user_info = c.fetchone()
        
        conn.close()
        return jsonify({
            'success': True, 
            'conversations': conversations,
            'user': user_info
        })
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/coupons', methods=['GET'])
@admin_required
def get_coupons():
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('SELECT id, code, discount_type, discount_value, is_active, created_at FROM coupons ORDER BY created_at DESC')
        coupons = c.fetchall()
        conn.close()
        return jsonify({'success': True, 'coupons': coupons})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/coupons', methods=['POST'])
@admin_required
def add_coupon():
    data = request.get_json()
    code = data.get('code', '').strip().upper()
    discount_type = data.get('discount_type', 'free_access')
    discount_value = data.get('discount_value', 0)
    
    if not code:
        return jsonify({'error': 'Coupon code is required', 'success': False}), 400
        
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO coupons (code, discount_type, discount_value, is_active)
            VALUES (%s, %s, %s, TRUE)
        ''', (code, discount_type, discount_value))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Coupon added successfully', 'success': True})
    except psycopg2.IntegrityError:
        return jsonify({'error': 'Coupon code already exists', 'success': False}), 409
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/validate-coupon', methods=['POST'])
def validate_coupon():
    try:
        data = request.get_json()
        code = data.get('code', '').strip().upper()
        
        if not code:
            return jsonify({'error': 'Coupon code is required', 'success': False}), 400
            
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute('SELECT code, discount_type, discount_value, is_active FROM coupons WHERE code = %s', (code,))
        coupon = c.fetchone()
        conn.close()
        
        if not coupon:
            return jsonify({'error': 'Invalid coupon code', 'success': False}), 404
            
        if not coupon['is_active']:
            return jsonify({'error': 'Coupon is no longer active', 'success': False}), 400
            
        return jsonify({
            'success': True, 
            'coupon': {
                'code': coupon['code'],
                'discount_type': coupon['discount_type'],
                'discount_value': float(coupon['discount_value']) if coupon['discount_value'] else 0
            }
        })
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/coupons/<int:coupon_id>/toggle', methods=['POST'])
@admin_required
def toggle_coupon_status(coupon_id):
    try:
        data = request.get_json()
        is_active = data.get('is_active')
        
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('UPDATE coupons SET is_active = %s WHERE id = %s', (is_active, coupon_id))
        conn.commit()
        conn.close()
        return jsonify({'message': f'Coupon {"activated" if is_active else "deactivated"} successfully', 'success': True})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/admin/coupons/<int:coupon_id>', methods=['DELETE'])
@admin_required
def delete_coupon(coupon_id):
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('DELETE FROM coupons WHERE id = %s', (coupon_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Coupon deleted successfully', 'success': True})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

# ---------------------------------------------------------------------------
# Account Deletion (Soft Delete Strategy)
# ---------------------------------------------------------------------------
@app.route('/api/user/delete', methods=['POST'])
def delete_account():
    """
    Perform a soft delete of a user account.
    Mutates the email to original_email_deleteat_<timestamp>
    and sets status to 'deleted'.
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'User ID is required', 'success': False}), 400
            
        conn = get_db_connection()
        c = conn.cursor()
        
        # 1. Fetch current user
        c.execute('SELECT email, status FROM users WHERE id = %s', (user_id,))
        user = c.fetchone()
        
        if not user:
            conn.close()
            return jsonify({'error': 'ユーザーが見つかりません', 'success': False}), 404
            
        email, status = user
        
        if status == 'deleted':
            conn.close()
            return jsonify({'error': 'Этот аккаунт уже удален.', 'success': False}), 400
            
        # 2. Mutate email: example@gmail.com -> example@gmail.com_deleteat_1713333333
        timestamp = int(time.time())
        new_email = f"{email}_deleteat_{timestamp}"
        
        # 3. Perform atomic update
        try:
            # Set deleted_at in IST for consistency with other timestamps
            ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
            
            c.execute('''
                UPDATE users 
                SET email = %s, status = 'deleted', deleted_at = %s 
                WHERE id = %s
            ''', (new_email, ist_now, user_id))
            
            conn.commit()
            print(f"✅ Account soft-deleted: {email} -> {new_email} (ID: {user_id})")
            
            return jsonify({
                'success': True,
                'message': 'Аккаунт успешно удален.'
            }), 200
            
        except Exception as update_err:
            conn.rollback()
            print(f"❌ Error during email mutation: {update_err}")
            return jsonify({'error': 'Ошибка при удалении.', 'success': False}), 500
        finally:
            conn.close()
            
    except Exception as e:
        print(f"Account deletion error: {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера.', 'success': False}), 500

if __name__ == '__main__':
    print("\n" + "="*70)
    print("Talk to Krishna - Web API Server")
    print("="*70)
    print("\nStarting server on http://localhost:5000")
    print("Open website/index.html in your browser to use the web interface\n")
    
    # Initialize and migrate database
    try:
        init_db()
        print("✅ Database initialized and migrated successfully.")
    except Exception as e:
        print(f"❌ Database initialization FAILED: {e}")
        import traceback
        traceback.print_exc()

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False  # Set to True for development
    )
