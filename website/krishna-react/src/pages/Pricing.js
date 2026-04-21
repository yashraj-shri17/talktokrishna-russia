import React from 'react';
import Navbar from '../components/Navbar';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, Star, Zap, ShieldCheck } from 'lucide-react';
import './Pricing.css';

function Pricing() {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const isFromChat = searchParams.get('source') === 'chat';
    const highlightPlan = searchParams.get('plan');

    React.useEffect(() => {
        if (highlightPlan === 'basic') {
            const basicCard = document.querySelector('.pricing-card:not(.popular)');
            if (basicCard) {
                basicCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                basicCard.classList.add('highlight-pulse');
            }
        }
    }, [highlightPlan]);

    const plans = [
        {
            name: 'Месячный план',
            price: '8 990 ₽',
            period: '/мес',
            description: 'Идеально для ежемесячных духовных бесед',
            features: [
                '30 божественных чатов в месяц',
                'Сохранение истории разговоров',
                'Доступ ко всем 700+ шлокам',
                'Персональное руководство',
                'Доступно 24/7'
            ],
            buttonText: 'Начать сейчас',
            isPopular: false,
            color: 'var(--blue-glow)',
            plan_id: 'monthly_30'
        },
        {
            name: 'Премиум план',
            price: '53 990 ₽',
            period: '/год',
            description: 'Годовой план для тех, кто ищет лучший опыт',
            features: [
                '30 божественных чатов ежемесячно (12 мес.)',
                'Все функции месячного плана',
                'Приоритетная генерация голоса',
                'Сохранение истории разговоров',
                'Приоритетная поддержка'
            ],
            buttonText: 'Самый популярный выбор',
            isPopular: true,
            color: 'var(--accent-glow)',
            plan_id: 'premium_30_yearly'
        }
    ];

    return (
        <div className="pricing-page">
            <Navbar />

            <div className="pricing-container container">
                <header className="pricing-header">
                    <div className="pricing-badge">
                        <Zap size={14} />
                        <span>ТАРИФЫ</span>
                    </div>
                    <h1 className="pricing-title">
                        Выберете <span className="gradient-text-animated">путь души</span>
                    </h1>
                    <p className="pricing-subtitle">
                        Начните инвестировать в свой внутренний покой и духовный рост <br />
                        с планом, подходящим именно вам.
                    </p>

                    {isFromChat && (
                        <div className="chat-upgrade-notice">
                            <div className="notice-icon">✨</div>
                            <div className="notice-text">
                                <strong>Лимит исчерпан:</strong> 
                                Пожалуйста, выберите план, чтобы продолжить чат.
                            </div>
                        </div>
                    )}
                </header>

                <div className="pricing-grid">
                    {plans.map((plan, index) => (
                        <div
                            key={index}
                            className={`pricing-card ${plan.isPopular ? 'popular' : ''}`}
                        >
                            {plan.isPopular && <div className="popular-badge">Популярно</div>}

                            <div className="plan-name">{plan.name}</div>

                            <div className="plan-price">
                                <span className="currency">{plan.price}</span>
                                <span className="period">{plan.period}</span>
                            </div>

                            <p className="plan-description">{plan.description}</p>

                            <div className="plan-features">
                                {plan.features.map((feature, fIndex) => (
                                    <div key={fIndex} className="feature-item">
                                        <div className="check-icon">
                                            <Check size={16} />
                                        </div>
                                        <span>{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                className={`plan-button ${plan.isPopular ? 'btn-premium-primary' : 'btn-premium-secondary'}`}
                                onClick={() => navigate('/checkout', { state: { plan } })}
                            >
                                {plan.buttonText}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="pricing-trust">
                    <div className="trust-item">
                        <ShieldCheck size={24} />
                        <span>Безопасные платежи</span>
                    </div>
                    <div className="trust-item">
                        <Star size={24} />
                        <span>100% удовлетворенность</span>
                    </div>
                    <div className="trust-item">
                        <Zap size={24} />
                        <span>Мгновенный доступ</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Pricing;
