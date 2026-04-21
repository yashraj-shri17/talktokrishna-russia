import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import './Profile.css';

function Profile() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [stats, setStats] = useState({ conversations_count: 0, hours_of_wisdom: 0 });
    const [loadingStats, setLoadingStats] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    React.useEffect(() => {
        // Load Razorpay Script
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);

        const fetchStats = async () => {
            if (!user?.id) return;
            try {
                const response = await axios.get(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/user/stats`, {
                    params: { user_id: user.id }
                });
                
                if (response.data.success) {
                    setStats(response.data.stats);
                }
            } catch (error) {
                console.error("Error fetching user stats:", error);
            } finally {
                setLoadingStats(false);
            }
        };

        fetchStats();
    }, [user]);

    const handleRedoMandate = (subscriptionId) => {
        if (!window.Razorpay || !stats.razorpay_key) {
            alert("Система оплаты подготавливается. Попробуйте через несколько секунд.");
            return;
        }

        const options = {
            key: stats.razorpay_key,
            subscription_id: subscriptionId,
            name: "TTK Russia",
            description: "Включить автопродление подписки",
            image: "/logo.png",
            handler: async function (response) {
                console.log("Mandate authorized successfully!");
                try {
                    setIsProcessing(true);
                    const syncRes = await axios.post(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/verify-subscription`, {
                        subscription_id: subscriptionId,
                        user_id: user.id
                    });
                    
                    if (syncRes.data.success) {
                        // Refresh stats
                        const refreshRes = await axios.get(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/user/stats`, { params: { user_id: user.id } });
                        if (refreshRes.data.success) setStats(refreshRes.data.stats);
                    }
                } catch (err) {
                    console.error("Error syncing subscription:", err);
                } finally {
                    setIsProcessing(false);
                }
            },
            prefill: {
                name: user.name,
                email: user.email,
            },
            theme: {
                color: "#4f46e5"
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    };

    const handleCancelSubscription = async (subscriptionId) => {
        if (!window.confirm("Вы уверены, что хотите отменить подписку? Вы сможете пользоваться сервисом до конца оплаченного периода.")) {
            return;
        }

        try {
            setIsProcessing(true);
            const response = await axios.post(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/cancel-subscription`, {
                subscription_id: subscriptionId,
                user_id: user.id
            });

            if (response.data.success) {
                alert("Подписка отменена. Она не будет продлена после окончания текущего цикла.");
                // Refresh stats
                const refreshRes = await axios.get(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/user/stats`, { params: { user_id: user.id } });
                if (refreshRes.data.success) setStats(refreshRes.data.stats);
            }
        } catch (err) {
            console.error("Error cancelling subscription:", err);
            alert("Не удалось отменить подписку. Пожалуйста, обратитесь в службу поддержки.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleDeleteAccount = async () => {
        if (!user?.id) return;
        
        setIsDeleting(true);
        try {
            const response = await axios.post(`${API_ENDPOINTS.ASK.replace('/api/ask', '')}/api/user/delete`, {
                user_id: user.id
            });
            
            if (response.data.success) {
                // Account deleted, logout immediately
                logout();
                navigate('/login', { state: { message: 'Аккаунт успешно удален.' } });
            }
        } catch (error) {
            console.error("Error deleting account:", error);
            alert(error.response?.data?.error || "Произошла ошибка при удалении аккаунта.");
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    if (!user) {
        navigate('/login');
        return null;
    }

    // Get user initials for avatar
    const getInitials = (name) => {
        if (!name) return 'K';
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    // Get member since date (from user creation or current date)
    const getMemberSince = () => {
        // In a real app, this would come from the database
        const date = user.created_at ? new Date(user.created_at) : new Date();
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long'
        });
    };

    return (
        <div className="page-container profile-page">
            <Navbar />

            <div className="profile-container">
                {/* Profile Header */}
                <div className="profile-header glass">
                    <div className="profile-avatar">
                        <div className="avatar-circle">
                            {getInitials(user.name)}
                        </div>
                        <div className="avatar-glow"></div>
                    </div>

                    <div className="profile-info">
                        <h1 className="profile-name">{user.name}</h1>
                        <p className="profile-email">{user.email}</p>
                        <p className="profile-member-since">
                            🕉️ Путь начат: {getMemberSince()}
                        </p>
                    </div>
                </div>

                {/* Profile Stats */}
                <div className="profile-stats">
                    <div className="stat-card glass">
                        <div className="stat-icon">💬</div>
                        <div className="stat-value">{loadingStats ? '--' : stats.conversations_count}</div>
                        <div className="stat-label">Бесед</div>
                    </div>

                    <div className="stat-card glass">
                        <div className="stat-icon">⏱️</div>
                        <div className="stat-value">{loadingStats ? '--' : stats.hours_of_wisdom}</div>
                        <div className="stat-label">Часов мудрости</div>
                    </div>
                </div>

                {/* Subscription Management */}
                {!loadingStats && stats.subscription && (
                    <div className="subscription-card glass animate-fade-in">
                        <div className="subscription-header">
                            <div className="subscription-title">
                                <span className="icon">💳</span>
                                <h3>{stats.subscription.plan_id === 'monthly_30' ? 'Ежемесячный план' : stats.subscription.plan_id}</h3>
                            </div>
                            <span className={`status-badge ${stats.subscription.status}`}>
                                {stats.subscription.status === 'active' ? '● Активна' : 
                                 stats.subscription.status === 'pending_mandate' ? '⚠️ Автопродление не настроено' : 
                                 stats.subscription.status === 'cancelled' ? 'Отменена' : stats.subscription.status}
                            </span>
                        </div>

                        <div className="subscription-body">
                            {stats.subscription.status === 'active' ? (
                                <>
                                    <p className="status-note success">
                                        Подписка активна. Следующее списание: <strong>{new Date(stats.subscription.next_billing_at).toLocaleDateString('ru-RU')}</strong>
                                    </p>
                                    <button 
                                        className="btn-cancel-subscription"
                                        onClick={() => handleCancelSubscription(stats.subscription.subscription_id)}
                                        disabled={isProcessing}
                                    >
                                        Отменить подписку
                                    </button>
                                </>
                            ) : stats.subscription.status === 'pending_mandate' ? (
                                <>
                                    <p className="status-note warning">
                                        Первый платеж прошел успешно, но <strong>автопродление не включено.</strong>
                                    </p>
                                    <button 
                                        className="btn-enable-autopay"
                                        onClick={() => handleRedoMandate(stats.subscription.subscription_id)}
                                        disabled={isProcessing}
                                    >
                                        Включить автопродление
                                    </button>
                                </>
                            ) : stats.subscription.status === 'cancelled' && (
                                <p className="status-note info">
                                    Подписка отменена. {stats.subscription.next_billing_at && (
                                        <>Доступно до: <strong>{new Date(stats.subscription.next_billing_at).toLocaleDateString('ru-RU')}</strong></>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Profile Actions */}
                <div className="profile-actions">
                    <div className="action-card glass">
                        <h3>Настройки аккаунта</h3>
                        <div className="action-list">
                            <button className="action-item" onClick={() => navigate('/chat')}>
                                <span className="action-icon">💬</span>
                                <span className="action-text">Продолжить беседу</span>
                                <span className="action-arrow">→</span>
                            </button>

                            <button className="action-item" disabled>
                                <span className="action-icon">✏️</span>
                                <span className="action-text">Редактировать профиль</span>
                                <span className="action-badge">Скоро</span>
                            </button>

                            <button className="action-item" disabled>
                                <span className="action-icon">🔔</span>
                                <span className="action-text">Уведомления</span>
                                <span className="action-badge">Скоро</span>
                            </button>

                            <button className="action-item" onClick={() => navigate('/reset-password')}>
                                <span className="action-icon">🔒</span>
                                <span className="action-text">Сменить пароль</span>
                                <span className="action-arrow">→</span>
                            </button>
                        </div>
                    </div>

                    <div className="action-card glass danger-zone">
                        <h3>Опасная зона</h3>
                        <div className="action-list">
                            <button
                                className="action-item danger"
                                onClick={() => setShowLogoutConfirm(true)}
                            >
                                <span className="action-icon">🚪</span>
                                <span className="action-text">Выйти</span>
                                <span className="action-arrow">→</span>
                            </button>

                            <button 
                                className="action-item danger"
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                <span className="action-icon">🗑️</span>
                                <span className="action-text">Удалить аккаунт</span>
                                <span className="action-arrow">→</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Logout Confirmation Dialog */}
            {showLogoutConfirm && (
                <div className="confirm-overlay" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-icon logout-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Подтверждение выхода</h3>
                        <p>Вы действительно хотите выйти? Возвращайтесь в любое время за божественной мудростью.</p>
                        <div className="confirm-actions">
                            <button className="btn-cancel" onClick={() => setShowLogoutConfirm(false)}>
                                Отмена
                            </button>
                            <button className="btn-confirm logout-btn" onClick={handleLogout}>
                                Выйти
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Account Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="confirm-overlay" onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-icon danger-icon" style={{ color: '#ef4444' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Подтверждение удаления</h3>
                        <p>Это действие нельзя отменить. Вы действительно хотите удалить аккаунт? Вся история бесед и данные станут недоступны.</p>
                        <div className="confirm-actions">
                            <button 
                                className="btn-cancel" 
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                            >
                                Отмена
                            </button>
                            <button 
                                className="btn-confirm" 
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}
                            >
                                {isDeleting ? 'Удаление...' : 'Удалить аккаунт'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Profile;
