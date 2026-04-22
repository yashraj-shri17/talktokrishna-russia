// API Configuration
// This file centralizes all API endpoint URLs

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://talktokrishna-russia-testing.onrender.com';

export const API_ENDPOINTS = {
    // Authentication
    LOGIN: `${API_BASE_URL}/api/login`,
    REQUEST_OTP: `${API_BASE_URL}/api/login/request-otp`,
    VERIFY_OTP: `${API_BASE_URL}/api/login/verify-otp`,
    SIGNUP: `${API_BASE_URL}/api/signup`,
    FORGOT_PASSWORD: `${API_BASE_URL}/api/forgot-password`,
    RESET_PASSWORD: `${API_BASE_URL}/api/reset-password`,
    VERIFY_TOKEN: `${API_BASE_URL}/api/verify-token`,
    GOOGLE_AUTH: `${API_BASE_URL}/api/google-auth`,

    // AI Chat
    ASK: `${API_BASE_URL}/api/ask`,
    HISTORY: `${API_BASE_URL}/api/history`,

    // Audio (if needed)
    SPEAK: `${API_BASE_URL}/api/speak`,
    TRANSCRIBE: `${API_BASE_URL}/api/transcribe`,

    // Payment & Access
    GRANT_ACCESS: `${API_BASE_URL}/api/grant-access`,
    VALIDATE_COUPON: `${API_BASE_URL}/api/validate-coupon`,
    
    // User Pref
    WELCOME_RECEIVED: `${API_BASE_URL}/api/user/welcome_received`,
    CHAT_LIMIT: `${API_BASE_URL}/api/user/chat-limit`,
    USER_STATS: `${API_BASE_URL}/api/user/stats`,
};

export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '617777461318-r4k9arqp5lid84ien6q3ooirp88i6hmq.apps.googleusercontent.com';

export default API_BASE_URL;
