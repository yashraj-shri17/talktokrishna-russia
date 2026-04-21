import React, { useState, useEffect } from 'react';
import './BackToTopButton.css';

const BackToTopButton = () => {
    const [showBackToTop, setShowBackToTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowBackToTop(window.scrollY > 500);
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!showBackToTop) {
        return null;
    }

    return (
        <button className="back-to-top" onClick={scrollToTop} aria-label="Back to top">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
};

export default BackToTopButton;
