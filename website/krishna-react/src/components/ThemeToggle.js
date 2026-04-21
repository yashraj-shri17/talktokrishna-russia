import React from 'react';
import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
            {theme === 'light' ? (
                <span className="toggle-icon">🌙</span>
            ) : (
                <span className="toggle-icon">☀️</span>
            )}
        </button>
    );
};

export default ThemeToggle;
