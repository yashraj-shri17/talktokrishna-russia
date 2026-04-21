import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import { Link } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import './Auth.css';

function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(API_ENDPOINTS.FORGOT_PASSWORD, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
            } else {
                setError(data.error || 'Ошибка запроса');
            }
        } catch (err) {
            setError('Ошибка подключения. Проверьте интернет и попробуйте снова.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container auth-page">
            <Navbar />
            <div className="auth-card glass">
                <div className="auth-header">
                    <h2>Забыли пароль?</h2>
                    <p>Введите ваш email, чтобы получить ссылку для восстановления пароля.</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                {success ? (
                    <div className="success-container">
                        <div className="success-message">
                            Если аккаунт существует, мы отправили ссылку для сброса на вашу почту.
                        </div>

                        <div className="auth-footer" style={{ marginTop: '20px' }}>
                            <p><Link to="/login">Вернуться ко входу</Link></p>
                        </div>
                    </div>
                ) : (
                    <>
                        <form onSubmit={handleSubmit} className="auth-form">
                            <div className="form-group">
                                <label>Электронная почта</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Напр.: user@example.com"
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn-primary btn-block"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner"></span>
                                        Отправка...
                                    </>
                                ) : 'Отправить ссылку'}
                            </button>
                        </form>

                        <div className="auth-footer">
                            <p>Вспомнили пароль? <Link to="/login">Войти</Link></p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ForgotPassword;
