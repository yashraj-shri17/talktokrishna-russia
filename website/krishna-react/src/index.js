import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Silence common non-critical ResizeObserver error during dev
window.addEventListener('error', (e) => {
    if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
        const resizeObserverErrGuid = '80932545-2f99-473d-8865-c3f29013f412';
        const resizeObserverErr = document.getElementById(resizeObserverErrGuid);
        if (resizeObserverErr) {
            resizeObserverErr.style.display = 'none';
        }
        e.stopImmediatePropagation();
    }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
