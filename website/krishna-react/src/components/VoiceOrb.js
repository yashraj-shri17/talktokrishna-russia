import React from 'react';
import './VoiceOrb.css';

function VoiceOrb({ isListening, isSpeaking, isLoading }) {
    const getOrbState = () => {
        if (isListening) return 'listening';
        if (isSpeaking) return 'speaking';
        if (isLoading) return 'loading';
        return 'idle';
    };

    return (
        <div className={`voice-orb-container ${getOrbState()}`}>
            {/* Outer glow rings */}
            <div className="orb-ring ring-1"></div>
            <div className="orb-ring ring-2"></div>
            <div className="orb-ring ring-3"></div>

            {/* Main orb */}
            <div className="voice-orb">
                <div className="orb-gradient"></div>
                <div className="orb-shimmer"></div>

                {/* Animated waveform for speaking/listening */}
                {(isListening || isSpeaking) && (
                    <div className="waveform">
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                    </div>
                )}

                {/* Krishna icon */}
                {!isListening && !isSpeaking && (
                    <div className="orb-icon">
                        <span>🪈</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default React.memo(VoiceOrb);
