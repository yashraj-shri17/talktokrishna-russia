import React from 'react';
import './VoiceControls.css';

function VoiceControls({ isListening, isSpeaking, isLoading, onToggleListening, onStopSpeaking }) {
    return (
        <div className="voice-controls">
            {/* Stop speaking button (only show when Krishna is speaking) */}
            {isSpeaking && (
                <button
                    className="stop-button"
                    onClick={onStopSpeaking}
                    title="Stop speaking"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                </button>
            )}

            {/* Main voice button */}
            <button
                className={`voice-button ${isListening ? 'active' : ''}`}
                onClick={(e) => {
                    e.preventDefault();
                    onToggleListening();
                }}
                disabled={isLoading || (isSpeaking && !isListening)}
                title={isListening ? 'Stop listening' : 'Start speaking'}
            >
                {isListening ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
        </div>
    );
}

export default VoiceControls;
