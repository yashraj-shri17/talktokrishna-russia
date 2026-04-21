import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS } from '../config/api';
import { GoogleLogin } from '@react-oauth/google';
import './Auth.css';

function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otpEmail, setOtpEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'mobile'
    const [otpStep, setOtpStep] = useState(1); // 1: Request, 2: Verify
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Show success message if redirected from signup
    useEffect(() => {
        if (location.state?.message) {
            setSuccessMessage(location.state.message);
            // Clear the message after 5 seconds
            setTimeout(() => setSuccessMessage(''), 5000);
        }
    }, [location]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                login(data.user);
                navigate('/chat');
            } else {
                setError(data.error || 'Ошибка входа');
            }
        } catch (err) {
            setError('Ошибка подключения. Проверьте интернет-соединение.');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestOTP = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.REQUEST_OTP, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: otpEmail }),
            });

            const data = await response.json();

            if (response.ok) {
                setOtpStep(2);
                setSuccessMessage(data.message || 'Код подтверждения отправлен на почту');
            } else {
                setError(data.error || 'Ошибка запроса кода');
            }
        } catch (err) {
            setError('Ошибка подключения. Попробуйте еще раз.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.VERIFY_OTP, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: otpEmail, otp }),
            });

            const data = await response.json();

            if (response.ok) {
                login(data.user);
                navigate('/chat');
            } else {
                setError(data.error || 'Ошибка аутентификации');
            }
        } catch (err) {
            setError('Ошибка подключения. Попробуйте еще раз.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        setLoading(true);
        setError('');
        
        try {
            const response = await fetch(API_ENDPOINTS.GOOGLE_AUTH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: credentialResponse.credential }),
            });

            const data = await response.json();

            if (response.ok) {
                login(data.user);
                navigate('/chat');
            } else {
                setError(data.error || 'Ошибка Google-авторизации');
            }
        } catch (err) {
            setError('Произошла ошибка при подключении к Google');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleError = () => {
        setError('Не удалось войти через Google. Попробуйте еще раз.');
    };

    return (
        <div className="page-container auth-page">
            <Navbar />
            <div className="auth-card glass">
                <div className="auth-header">
                    <h2>С возвращением</h2>
                    <p>Продолжите свое духовное путешествие</p>
                </div>

                {successMessage && <div className="success-message">{successMessage}</div>}
                {error && <div className="error-message">{error}</div>}

                <div className="google-auth-container">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={handleGoogleError}
                        useOneTap
                        theme="filled_blue"
                        shape="pill"
                        text="continue_with"
                        width="100%"
                    />
                </div>

                <div className="social-auth-separator">
                    <span>или</span>
                </div>

                <div className="login-method-toggle">
                    <button 
                        className={`method-tab ${loginMethod === 'email' ? 'active' : ''}`}
                        onClick={() => { setLoginMethod('email'); setError(''); setSuccessMessage(''); }}
                    >
                        Email
                    </button>
                    <button 
                        className={`method-tab ${loginMethod === 'mobile' ? 'active' : ''}`}
                        onClick={() => { setLoginMethod('mobile'); setError(''); setSuccessMessage(''); }}
                    >
                        Email (OTP)
                    </button>
                </div>

                {loginMethod === 'email' ? (
                    <form onSubmit={handleLogin} className="auth-form">
                        <div className="form-group">
                            <label>Электронная почта</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label>Пароль</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex="-1"
                                >
                                    {showPassword ? '👁️' : '👁️‍🗨️'}
                                </button>
                            </div>
                            <div className="forgot-password-link-container">
                                <Link to="/forgot-password" title="Forgot Password?" className="forgot-password-link">
                                    Забыли пароль?
                                </Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary btn-block"
                            disabled={loading}
                        >
                            {loading ? 'Вход...' : 'Войти'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={otpStep === 1 ? handleRequestOTP : handleVerifyOTP} className="auth-form">
                        <div className="form-group">
                            <label>Электронная почта</label>
                            <input
                                type="email"
                                value={otpEmail}
                                onChange={(e) => setOtpEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                disabled={loading || otpStep === 2}
                            />
                        </div>

                        {otpStep === 2 && (
                            <div className="form-group">
                                <label>Введите 6-значный код</label>
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    required
                                    disabled={loading}
                                    autoFocus
                                    className="otp-input"
                                    style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '24px' }}
                                />
                                <p className="otp-helper">Код подтверждения был отправлен на вашу почту.</p>
                                <div style={{ textAlign: 'right' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setOtpStep(1)} 
                                        className="text-btn"
                                        disabled={loading}
                                    >
                                        Изменить почту
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn-primary btn-block"
                            disabled={loading}
                        >
                            {loading ? 'Обработка...' : (otpStep === 1 ? 'Отправить код на email' : 'Подтвердить и войти')}
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    <p>Нет аккаунта? <Link to="/signup">Зарегистрироваться</Link></p>
                </div>
            </div>
        </div>
    );
}

export default Login;
