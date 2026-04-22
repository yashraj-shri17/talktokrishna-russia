import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Silence common non-critical ResizeObserver error during dev
const handleResizeObserverError = (e) => {
    const messages = [
        'ResizeObserver loop completed with undelivered notifications.',
        'ResizeObserver loop limit exceeded',
        'Script error.'
    ];
    
    // Check if the error message matches any known ResizeObserver noise
    const isResizeObserverError = messages.some(msg => 
        (e.message && e.message.includes(msg)) || 
        (e.reason && e.reason.message && e.reason.message.includes(msg))
    );

    if (isResizeObserverError) {
        // GUID for the Create React App (CRA) error overlay
        const resizeObserverErrGuid = '80932545-2f99-473d-8865-c3f29013f412';
        const resizeObserverErr = document.getElementById(resizeObserverErrGuid);
        if (resizeObserverErr) {
            resizeObserverErr.style.display = 'none';
        }
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
    }
};

window.addEventListener('error', handleResizeObserverError);
window.addEventListener('unhandledrejection', handleResizeObserverError);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
