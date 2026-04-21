import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import './Auth.css';

function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [token, setToken] = useState('');
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

    const [verifying, setVerifying] = useState(true);

    useEffect(() => {
        const verifyToken = async () => {
            const tokenFromUrl = searchParams.get('token');
            if (!tokenFromUrl) {
                setError('Недействительная ссылка. Пожалуйста, запросите сброс пароля еще раз.');
                setVerifying(false);
                return;
            }
            
            setToken(tokenFromUrl);
            
            try {
                const response = await fetch(`${API_ENDPOINTS.VERIFY_TOKEN}?token=${tokenFromUrl}`);
                const data = await response.json();
                
                if (!data.valid) {
                    setError(data.error || 'Эта ссылка недействительна или срок ее действия истек.');
                }
            } catch (err) {
                setError('Ошибка подключения. Не удалось проверить ссылку.');
            } finally {
                setVerifying(false);
            }
        };
        
        verifyToken();
    }, [searchParams]);

    // Calculate password strength
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!token) {
            setError('Недействительная ссылка для сброса');
            return;
        }

        if (password !== confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }

        if (passwordStrength.score < 5) {
            setError('Пароль должен соответствовать всем требованиям');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.RESET_PASSWORD, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (response.ok) {
                navigate('/login', { state: { message: 'Пароль успешно сброшен. Пожалуйста, войдите с новым паролем.' } });
            } else {
                setError(data.error || 'Не удалось сбросить пароль');
            }
        } catch (err) {
            setError('Ошибка подключения. Проверьте интернет-соединение.');
        } finally {
            setLoading(false);
        }
    };

    const renderContent = () => {
        if (verifying) {
            return (
                <div className="verifying-container">
                    <span className="spinner"></span>
                    <p>Проверка ссылки...</p>
                </div>
            );
        }

        if (error && !token) {
            return (
                <div className="error-container">
                    <div className="error-message">{error}</div>
                    <div className="auth-footer" style={{ marginTop: '20px' }}>
                        <p><Link to="/forgot-password">Запросить сброс снова</Link></p>
                    </div>
                </div>
            );
        }

        return (
            <>
                <div className="auth-header">
                    <h2>Сброс пароля</h2>
                    <p>Введите новый пароль</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Новый пароль</label>
                        <div className="password-input-wrapper">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                disabled={loading || !token}
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

                        {/* Password Strength Meter */}
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

                        {/* Password Requirements */}
                        {password && (
                            <div className="password-requirements">
                                <div className={`requirement ${passwordStrength.checks.length ? 'met' : ''}`}>
                                    {passwordStrength.checks.length ? '✓' : '○'} Минимум 8 символов
                                </div>
                                <div className={`requirement ${passwordStrength.checks.uppercase ? 'met' : ''}`}>
                                    {passwordStrength.checks.uppercase ? '✓' : '○'} Минимум одна заглавная буква
                                </div>
                                <div className={`requirement ${passwordStrength.checks.lowercase ? 'met' : ''}`}>
                                    {passwordStrength.checks.lowercase ? '✓' : '○'} Минимум одна строчная буква
                                </div>
                                <div className={`requirement ${passwordStrength.checks.number ? 'met' : ''}`}>
                                    {passwordStrength.checks.number ? '✓' : '○'} Минимум одна цифра
                                </div>
                                <div className={`requirement ${passwordStrength.checks.special ? 'met' : ''}`}>
                                    {passwordStrength.checks.special ? '✓' : '○'} Минимум один спецсимвол
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Подтвердите новый пароль</label>
                        <div className="password-input-wrapper">
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                disabled={loading || !token}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                tabIndex="-1"
                            >
                                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                        </div>
                        {confirmPassword && password !== confirmPassword && (
                            <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px' }}>
                                Пароли не совпадают
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn-primary btn-block"
                        disabled={loading || !token || (password && passwordStrength.score < 5) || password !== confirmPassword}
                    >
                        {loading ? (
                            <>
                                <span className="spinner"></span>
                                Сброс...
                            </>
                        ) : 'Сбросить пароль'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Вспомнили пароль? <Link to="/login">Войти</Link></p>
                </div>
            </>
        );
    };

    return (
        <div className="page-container auth-page">
            <Navbar />
            <div className="auth-card glass">
                {renderContent()}
            </div>
        </div>
    );
}

export default ResetPassword;
