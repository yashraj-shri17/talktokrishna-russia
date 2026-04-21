import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import PhoneInput from '../components/PhoneInput';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS } from '../config/api';
import { GoogleLogin } from '@react-oauth/google';
import './Auth.css';

function Signup() {
    const navigate = useNavigate();
    const { login } = useAuth();

    // Form state
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('+81 '); // Default to Japan
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState({
        score: 0,
        label: '',
        color: '',
        checks: {
            length: false,
            uppercase: false,
            lowercase: false,
            number: false,
            special: false
        }
    });

    // Calculate password strength in real-time
    useEffect(() => {
        if (!password) {
            setPasswordStrength({
                score: 0,
                label: '',
                color: '',
                checks: {
                    length: false,
                    uppercase: false,
                    lowercase: false,
                    number: false,
                    special: false
                }
            });
            return;
        }

        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        const score = Object.values(checks).filter(Boolean).length;

        let label = '';
        let color = '';

        if (score === 0) {
            label = '';
            color = '';
        } else if (score <= 2) {
            label = 'Слабый';
            color = '#ef4444';
        } else if (score === 3) {
            label = 'Средний';
            color = '#f59e0b';
        } else if (score === 4) {
            label = 'Хороший';
            color = '#3b82f6';
        } else {
            label = 'Сильный';
            color = '#10b981';
        }

        setPasswordStrength({ score, label, color, checks });
    }, [password]);

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');

        // Client-side validation
        if (passwordStrength.score < 5) {
            setError('Пароль должен соответствовать всем требованиям безопасности');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.SIGNUP, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, mobile, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Auto login after signup
                if (data.user) {
                    login(data.user);
                    navigate('/chat');
                } else {
                    navigate('/login', { state: { message: 'Аккаунт успешно создан. Пожалуйста, войдите.' } });
                }
            } else {
                setError(data.error || 'Ошибка регистрации');
            }
        } catch (err) {
            setError('Ошибка подключения. Проверьте интернет-соединение.');
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
                    <h2>Создать аккаунт</h2>
                    <p>Начните свое путешествие с Кришной</p>
                </div>

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

                <form onSubmit={handleSignup} className="auth-form">
                    <div className="form-group">
                        <label>Полное имя</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Введите ваше имя"
                            required
                            disabled={loading}
                        />
                    </div>

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
                        <label>Номер телефона</label>
                        <PhoneInput
                            value={mobile}
                            onChange={(val) => setMobile(val)}
                            disabled={loading}
                            placeholder="Введите номер телефона"
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

                        {password && (
                            <div className="password-strength">
                                <div className="strength-bars">
                                    {[1, 2, 3, 4, 5].map((bar) => (
                                        <div
                                            key={bar}
                                            className={`strength-bar ${bar <= passwordStrength.score ? 'active' : ''}`}
                                            style={{
                                                backgroundColor: bar <= passwordStrength.score ? passwordStrength.color : '#e5e7eb'
                                            }}
                                        ></div>
                                    ))}
                                </div>
                                {passwordStrength.label && (
                                    <span className="strength-label" style={{ color: passwordStrength.color }}>
                                        {passwordStrength.label}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn-primary btn-block"
                        disabled={loading || (password && passwordStrength.score < 5)}
                    >
                        {loading ? 'Создание...' : 'Зарегистрироваться'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Уже есть аккаунт? <Link to="/login">Войти</Link></p>
                </div>
            </div>
        </div>
    );
}

export default Signup;
