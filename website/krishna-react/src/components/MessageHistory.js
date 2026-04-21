
import React, { useState, useEffect } from 'react';
import './MessageHistory.css';

function MessageHistory({ messages, isOpen, onClose, onClearHistory, onSpeak, activeMessageId }) {
    const [selectedDate, setSelectedDate] = useState(null);
    const [dateToDelete, setDateToDelete] = useState(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    // Grouping logic: organize messages by day
    const groupedMessages = messages.reduce((groups, msg) => {
        try {
            if (!msg.timestamp) return groups;
            const date = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
            if (isNaN(date.getTime())) return groups;
            
            const dateKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(msg);
        } catch (e) {
            const fallbackKey = "Older Conversations";
            if (!groups[fallbackKey]) groups[fallbackKey] = [];
            groups[fallbackKey].push(msg);
        }
        return groups;
    }, {});

    // Helper to get formatted date labels (Today, Yesterday, etc.)
    const getDateLabel = (dateStr) => {
        if (dateStr === "Older Conversations") return "Более ранние беседы";
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const isToday = date.toLocaleDateString() === today.toLocaleDateString();
        const isYesterday = date.toLocaleDateString() === yesterday.toLocaleDateString();

        if (isToday) return "Сегодня"; // Today
        if (isYesterday) return "Вчера"; // Yesterday
        
        // Return Japanese formatted date for others
        return date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Sort dates by descending time
    const sortedDates = Object.keys(groupedMessages).sort((a, b) => {
        if (a === "Older Conversations") return 1;
        if (b === "Older Conversations") return -1;
        return new Date(b) - new Date(a);
    });

    // Reset view when closing
    useEffect(() => {
        if (!isOpen) {
            setSelectedDate(null);
        }
    }, [isOpen]);

    const formatMessage = (text) => {
        if (!text) return null;

        // Strip any legacy server-side heading prefix from old DB entries
        const cleanText = text.replace(/^🪈\s*Послание\s*Господа\s*Кришны:\s*/i, '').trim();

        // ── STEP 1: Find the shloka citation as the primary section divider ──
        // Supports Russian: "Бхагавад-гита, Глава X, Текст Y"
        // and English:      "Bhagwat geeta Chapter X Shloka Y"
        const shlokaCitationMatch = cleanText.match(
            /((?:Бхагавад-гита|Bhagwat\s*geeta|भगवद\s*गीता),?\s*(?:Глава|Chapter|अध्याय)\s*\d+,?\s*(?:Текст|Shloka|श्लोक)\s*\d+)/i
        );

        // Fallback: render as plain text (rejection messages, short responses, etc.)
        if (!shlokaCitationMatch) {
            return <div className="message-box general-box"><p>{cleanText}</p></div>;
        }

        const citation = shlokaCitationMatch[0];
        const splitIndex = cleanText.indexOf(citation);

        // Part A: everything before the citation → Intro (opening sentence)
        const intro = cleanText.substring(0, splitIndex).trim();

        // Part B: everything after the citation
        const rest = cleanText.substring(splitIndex + citation.length).trim();

        // ── STEP 2: Separate Steps from Shloka+Explanation ──
        // Steps begin at the first line that starts with "1."
        const stepsMarker = rest.match(/(?:^|\n)\s*1\./m);
        let shlokaAndExplanation = rest;
        let stepsPart = '';

        if (stepsMarker) {
            const stepsIndex = rest.indexOf(stepsMarker[0]);
            shlokaAndExplanation = rest.substring(0, stepsIndex).trim();
            stepsPart = rest.substring(stepsIndex).trim();
        }

        // ── STEP 3: Split shlokaAndExplanation using Devanagari script detection ──
        // Lines with Devanagari chars (U+0900–U+097F) = Sanskrit verse → Box 2
        // First line with Cyrillic or Latin text = start of explanation → Box 3
        const allLines = shlokaAndExplanation.split('\n').map(l => l.trim()).filter(l => l !== '');
        const shlokaLines = [];
        const explanationLines = [];
        let foundExplanation = false;

        for (const line of allLines) {
            if (foundExplanation) {
                explanationLines.push(line);
                continue;
            }
            const hasDevanagari = /[\u0900-\u097F]/.test(line);
            const hasCyrillic   = /[\u0400-\u04FF]/.test(line);
            const hasLatin      = /[a-zA-Z]{4,}/.test(line);

            if (hasDevanagari) {
                // Definitely Sanskrit verse
                shlokaLines.push(line);
            } else if (hasCyrillic || hasLatin) {
                // Switched to explanation language
                foundExplanation = true;
                explanationLines.push(line);
            } else {
                // Punctuation-only line or transitional — keep in shloka
                shlokaLines.push(line);
            }
        }

        const shlokaText = shlokaLines.join('\n');
        const explanation = explanationLines.join(' ').trim();

        // ── STEP 4: Render each numbered step as its own paragraph (Bug 3 fix) ──
        const renderSteps = (rawSteps) => {
            const lines = rawSteps.split('\n').map(l => l.trim()).filter(l => l !== '');
            return lines.map((line, i) => (
                <p key={i} style={{ marginBottom: i < lines.length - 1 ? '10px' : '0' }}>{line}</p>
            ));
        };

        // ── STEP 5: hardcoded Russian labels (never generated by AI) ──
        const getBoxTitle = (key) => {
            switch (key) {
                case 'intro':       return 'Божественное послание';
                case 'shloka':      return 'Священная шлока';
                case 'explanation': return 'Глубинный смысл';
                case 'steps':       return 'Ваш путь';
                default:            return '';
            }
        };

        return (
            <div className="response-boxes">
                {/* Box 1: Introduction */}
                {intro && (
                    <div className="message-box opening-box">
                        <span className="box-title">{getBoxTitle('intro')}</span>
                        <p>{intro}</p>
                    </div>
                )}

                {/* Box 2: Shloka (citation + Sanskrit verse) */}
                <div className="message-box shloka-box">
                    <span className="box-title">{getBoxTitle('shloka')}</span>
                    <div className="shloka-content">
                        <div className="citation-label">{citation}</div>
                        {shlokaText && <p>{shlokaText}</p>}
                    </div>
                </div>

                {/* Box 3: Explanation */}
                {explanation && (
                    <div className="message-box explanation-box">
                        <span className="box-title">{getBoxTitle('explanation')}</span>
                        <p>{explanation}</p>
                    </div>
                )}

                {/* Box 4: Action Steps — each step on its own paragraph */}
                {stepsPart && (
                    <div className="message-box steps-box">
                        <span className="box-title">{getBoxTitle('steps')}</span>
                        {renderSteps(stepsPart)}
                    </div>
                )}
            </div>
        );
    };

    const handleClearHistory = () => {
        if (dateToDelete) {
            onClearHistory(dateToDelete);
        } else {
            onClearHistory();
        }
        setShowConfirmDialog(false);
        setDateToDelete(null);
        if (selectedDate === dateToDelete) {
            setSelectedDate(null);
        }
    };

    const confirmDeleteDate = (e, date) => {
        e.stopPropagation();
        setDateToDelete(date);
        setShowConfirmDialog(true);
    };

    const confirmClearAll = () => {
        setDateToDelete(null);
        setShowConfirmDialog(true);
    };

    return (
        <>
            <div className={`history-overlay ${isOpen ? 'show' : ''}`} onClick={onClose} />
            <div className={`message-history ${isOpen ? 'open' : ''}`}>
                <div className="history-header">
                    {selectedDate ? (
                        <div className="header-nav">
                            <button className="back-header-button" onClick={() => setSelectedDate(null)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>Назад</span>
                            </button>
                            <h2>{getDateLabel(selectedDate)}</h2>
                        </div>
                    ) : (
                        <>
                            <h2>Божественный диалог</h2>
                            <div className="header-actions">
                                {messages.length > 0 && (
                                    <button className="clear-history-button" onClick={confirmClearAll} title="Очистить всю историю">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                )}
                                <button className="close-button" onClick={onClose} title="Закрыть">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="history-content">
                    {messages.length === 0 ? (
                        <div className="empty-state">
                            Ваше путешествие только началось. Начните беседу, и она появится здесь.
                        </div>
                    ) : selectedDate ? (
                        <div className="date-messages">
                            {groupedMessages[selectedDate].map((message) => (
                                <div key={message.id} className={`history-message ${message.type}`}>
                                    <div className="message-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="message-author">
                                                {message.type === 'krishna' ? '🪈 Кришна' : '👤 Вы'}
                                            </span>
                                            {message.type === 'krishna' && (
                                                <button
                                                    className={`speak-button ${activeMessageId === message.id ? 'speaking' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSpeak(message.text, message.id);
                                                    }}
                                                    title={activeMessageId === message.id ? "Остановить" : "Прочитать"}
                                                >
                                                    {activeMessageId === message.id ? (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <rect x="6" y="6" width="12" height="12" />
                                                        </svg>
                                                    ) : (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                                                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <span className="message-time">
                                            {(() => {
                                                try {
                                                    if (!message.timestamp) return '';
                                                    let date = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
                                                    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                                                } catch (e) { return ''; }
                                            })()}
                                        </span>
                                    </div>
                                    <div className="message-body">
                                        {message.type === 'krishna' ? formatMessage(message.text) : <p>{message.text}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="date-list">
                            {sortedDates.map((date) => (
                                <div
                                    key={date}
                                    className="date-item"
                                    onClick={() => setSelectedDate(date)}
                                >
                                    <div className="date-item-info">
                                        <div className="date-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                <line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" />
                                                <line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                        </div>
                                        <div className="date-text">
                                            <h4>{getDateLabel(date)}</h4>
                                            <span>{Math.max(1, Math.floor(groupedMessages[date].length / 2))} записей бесед</span>
                                        </div>
                                    </div>
                                    <div className="date-item-actions">
                                        <button
                                            className="date-delete-btn"
                                            onClick={(e) => confirmDeleteDate(e, date)}
                                            title="Удалить историю за этот день"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6"></polyline>
                                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a2 2 0 012-2h2a2 2 0 012 2v2"></path>
                                            </svg>
                                        </button>
                                        <div className="date-chevron">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="confirm-overlay" onClick={() => setShowConfirmDialog(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>{dateToDelete ? `Удалить историю за ${getDateLabel(dateToDelete)}?` : "Вы уверены, что хотите удалить всю историю?"}</h3>
                        <p>Это действие нельзя отменить. Записи вашего путешествия будут навсегда удалены.</p>
                        <div className="confirm-actions">
                            <button className="btn-cancel" onClick={() => setShowConfirmDialog(false)}>Отмена</button>
                            <button className="btn-confirm" onClick={handleClearHistory}>Удалить</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default React.memo(MessageHistory);
