import React, { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate } from 'react-router-dom';
import './Home.css';

function Home() {
    const navigate = useNavigate();
    const observerRef = useRef(null);

    useEffect(() => {
        // Handle back button redirect to talktokrishna.ai
        // This ensures that if a user lands on this page and presses back,
        // they are redirected to the main portal instead of exiting or going to previous history.
        const redirectUrl = 'https://talktokrishna.ai';

        const pushRedirectState = () => {
            if (!window.history.state?.isForcedRedirect) {
                // Merge with existing state to avoid breaking React Router
                const newState = { ...(window.history.state || {}), isForcedRedirect: true };
                window.history.pushState(newState, '', window.location.href);
            }
        };

        const handlePopState = (event) => {
            // If the user goes back, land them on the main portal
            window.location.replace(redirectUrl);
        };

        const handlePageShow = (event) => {
            if (event.persisted || !window.history.state?.isForcedRedirect) {
                pushRedirectState();
            }
        };

        // Initialize with a slight delay to let the browser settle
        const timeoutId = setTimeout(pushRedirectState, 500);

        window.addEventListener('popstate', handlePopState);
        window.addEventListener('pageshow', handlePageShow);

        // Intersection Observer for scroll animations
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-in');
                    }
                });
            },
            { threshold: 0.1 }
        );

        // Observe all animated elements
        const animatedElements = document.querySelectorAll('.fade-in-section');
        animatedElements.forEach((el) => observerRef.current.observe(el));

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('pageshow', handlePageShow);
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, []);

    useEffect(() => {
        // 1. Push a dummy state so there's a "back" to go to
        window.history.pushState(null, null, window.location.href);

        // 2. Listen for the back button (popstate)
        const handlePopState = () => {
            // 3. Redirect to the main domain
            window.location.replace('https://talktokrishna.ai');
        };

        window.addEventListener('popstate', handlePopState);

        // Cleanup when component unmounts
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    return (
        <div className="home-page">
            <Navbar />

            {/* Floating Elements Background */}
            <div className="floating-elements">
                <div className="float-element om-symbol">🕉️</div>
                <div className="float-element lotus">🪷</div>
                <div className="float-element peacock">🦚</div>
                <div className="float-element om-symbol-2">ॐ</div>
            </div>

            {/* Hero Section */}
            <section className="hero-section-premium">
                <div className="container hero-grid">
                    <div className="hero-content-left">
                        <div className="badge-premium">
                            <span className="badge-dot"></span>
                            Духовное руководство на базе ИИ
                        </div>

                        <h1 className="hero-headline-premium">
                            Древняя мудрость,
                            <br />
                            <span className="gradient-text-animated">современный голос</span>
                        </h1>

                        <p className="hero-description-premium">
                            Познайте вечные учения Бхагавад-гиты с помощью передовых голосовых технологий ИИ.
                            Получите персональное духовное руководство через диалог с Кришной в реальном времени.
                        </p>

                        <div className="hero-cta-group">
                            <button className="btn-premium-primary" onClick={() => navigate('/chat')}>
                                <span className="btn-icon">🎙️</span>
                                Начать общение
                                <span className="btn-arrow">→</span>
                            </button>
                            <button className="btn-premium-secondary" onClick={() => navigate('/about')}>
                                <span className="btn-icon">📖</span>
                                Узнать больше
                            </button>
                        </div>

                        <div className="stats-row">
                            <div className="stat-item">
                                <div className="stat-number">700+</div>
                                <div className="stat-label">Шлоки</div>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat-item">
                                <div className="stat-number">24/7</div>
                                <div className="stat-label">Доступно</div>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat-item">
                                <div className="stat-number">∞</div>
                                <div className="stat-label">Мудрость</div>
                            </div>
                        </div>
                    </div>

                    <div className="hero-visual-right">
                        {/* 3D Orb Illustration */}
                        <div className="orb-container-3d">
                            <div className="orb-main">
                                <div className="orb-inner-glow"></div>
                                <div className="orb-particles">
                                    {/* 8 particles — visually identical to 20, but 60% fewer GPU layers */}
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className={`particle p-${i}`}></div>
                                    ))}
                                </div>
                                <div className="orb-rings">
                                    <div className="ring ring-1"></div>
                                    <div className="ring ring-2"></div>
                                    <div className="ring ring-3"></div>
                                </div>
                                <div className="orb-center-icon">🕉️</div>
                            </div>

                            {/* Floating Cards */}
                            <div className="floating-card card-1">
                                <div className="card-icon">🎯</div>
                                <div className="card-content">
                                    <strong>Мгновенно</strong>
                                    <span>Ответы ИИ</span>
                                </div>
                            </div>

                            <div className="floating-card card-2">
                                <div className="card-icon">🧘</div>
                                <div className="card-content">
                                    <strong>Рост</strong>
                                    <span>Духовный путь</span>
                                </div>
                            </div>

                            <div className="floating-card card-3">
                                <div className="card-icon">💬</div>
                                <div className="card-content">
                                    <strong>Чат</strong>
                                    <span>Живой голос</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section - Premium Design */}
            <section className="features-section-premium fade-in-section">
                <div className="container">
                    <div className="section-header-premium">
                        <span className="section-badge">Особенности</span>
                        <h2 className="section-title-premium">
                            Почему выбирают <span className="gradient-text">Поговорить с Кришной</span><span className="trademark">®</span>
                        </h2>
                        <p className="section-subtitle">
                            Сочетание древней мудрости и современного ИИ для вашего духовного пути
                        </p>
                    </div>

                    <div className="features-grid-premium">
                        <div className="feature-card-premium">
                            <div className="feature-icon-wrapper">
                                <div className="feature-icon-bg"></div>
                                <div className="feature-icon">🎙️</div>
                            </div>
                            <h3>Голосовой чат с ИИ</h3>
                            <p>Общайтесь естественно на русском или английском и получайте ответы живым голосом благодаря технологии нейронного TTS.</p>
                            <div className="feature-tags">
                                <span className="tag">Реальное время</span>
                                <span className="tag">Естественно</span>
                            </div>
                        </div>

                        <div className="feature-card-premium featured">
                            <div className="featured-badge">Самое популярное</div>
                            <div className="feature-icon-wrapper">
                                <div className="feature-icon-bg"></div>
                                <div className="feature-icon">📜</div>
                            </div>
                            <h3>Точные цитаты</h3>
                            <p>Все ответы основаны на подлинных шлоках Бхагавад-гиты с использованием архитектуры RAG.</p>
                            <div className="feature-tags">
                                <span className="tag">Проверено</span>
                                <span className="tag">Аутентично</span>
                            </div>
                        </div>

                        <div className="feature-card-premium">
                            <div className="feature-icon-wrapper">
                                <div className="feature-icon-bg"></div>
                                <div className="feature-icon">✨</div>
                            </div>
                            <h3>Персональный подход</h3>
                            <p>Получайте советы, адаптированные к вашим жизненным ситуациям и эмоциональному состоянию.</p>
                            <div className="feature-tags">
                                <span className="tag">Индивидуально</span>
                                <span className="tag">Контекстуально</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="how-it-works-section fade-in-section">
                <div className="container">
                    <div className="section-header-premium">
                        <span className="section-badge">Процесс</span>
                        <h2 className="section-title-premium">
                            Как это <span className="gradient-text">работает</span>
                        </h2>
                    </div>

                    <div className="steps-container">
                        <div className="step-card">
                            <div className="step-number">01</div>
                            <div className="step-icon">🎤</div>
                            <h3>Задайте вопрос</h3>
                            <p>Спрашивайте о чем угодно: о жизни, дхарме, карме или ищите духовного наставления</p>
                        </div>

                        <div className="step-connector"></div>

                        <div className="step-card">
                            <div className="step-number">02</div>
                            <div className="step-icon">🧠</div>
                            <h3>ИИ обрабатывает</h3>
                            <p>Наша система RAG анализирует более 700 шлок, чтобы найти лучший ответ</p>
                        </div>

                        <div className="step-connector"></div>

                        <div className="step-card">
                            <div className="step-number">03</div>
                            <div className="step-icon">🔊</div>
                            <h3>Получите мудрость</h3>
                            <p>Слушайте подлинное руководство на основе Гиты голосом Кришны</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section-premium fade-in-section">
                <div className="container">
                    <div className="cta-card-premium">
                        <div className="cta-content">
                            <h2>Готовы начать свой духовный путь?</h2>
                            <p>Присоединяйтесь к тысячам людей, ищущих мудрость через общение с ИИ.</p>
                            <button className="btn-premium-primary btn-large" onClick={() => navigate('/chat')}>
                                <span className="btn-icon">🕉️</span>
                                Начать разговор с Кришной
                                <span className="btn-arrow">→</span>
                            </button>
                        </div>
                        <div className="cta-decoration">
                            <div className="decoration-circle c1"></div>
                            <div className="decoration-circle c2"></div>
                            <div className="decoration-circle c3"></div>
                        </div>
                    </div>
                </div>
            </section>




        </div>
    );
}

export default Home;
