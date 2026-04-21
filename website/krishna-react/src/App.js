import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import './App.css'; // Global styles

// Pages
import Home from './pages/Home';
import About from './pages/About';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Pricing from './pages/Pricing';
import Refund from './pages/Refund';
import Checkout from './pages/Checkout';
import AdminDashboard from './pages/AdminDashboard';
import VoiceChat from './components/VoiceChat';
import ScrollToTop from './components/ScrollToTop';
import BackToTopButton from './components/BackToTopButton';
import Footer from './components/Footer';

import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID } from './config/api';

function App() {
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <ThemeProvider>
                <AuthProvider>
                    <Router>
                        <div className="app">
                            {/* Animated Background - Global for all pages */}
                            <ScrollToTop />
                            <BackToTopButton />
                            <div className="app-background">
                                <div className="gradient-mesh"></div>
                            </div>

                            <div className="content-wrapper">
                                <Routes>
                                    <Route path="/" element={<Home />} />
                                    <Route path="/about" element={<About />} />
                                    <Route path="/contact" element={<Contact />} />
                                    <Route path="/pricing" element={<Pricing />} />
                                    <Route path="/privacy" element={<Privacy />} />
                                    <Route path="/refund" element={<Refund />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/signup" element={<Signup />} />
                                    <Route path="/forgot-password" element={<ForgotPassword />} />
                                    <Route path="/reset-password" element={<ResetPassword />} />

                                    {/* Protected Routes */}
                                    <Route element={<ProtectedRoute />}>
                                        <Route path="/chat" element={<VoiceChat />} />
                                        <Route path="/profile" element={<Profile />} />
                                        <Route path="/checkout" element={<Checkout />} />
                                        <Route path="/admin" element={<AdminDashboard />} />
                                    </Route>
                                </Routes>
                                <FooterWrapper />
                            </div>
                        </div>
                    </Router>
                </AuthProvider>
            </ThemeProvider>
        </GoogleOAuthProvider>
    );
}

// Wrapper to use useLocation
const FooterWrapper = () => {
    const location = useLocation();
    if (location.pathname === '/admin') return null;
    return <Footer />;
};

export default App;
