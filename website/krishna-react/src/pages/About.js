import React from 'react';
import Navbar from '../components/Navbar';
import './About.css';

function About() {
    return (
        <div className="page-container about-page">
            <Navbar />

            <section className="about-hero">
                <div className="container">
                    <div className="about-hero-content">
                        <span className="section-badge">Наша миссия</span>
                        <h1 className="about-title">
                            Мост между <span className="gradient-text">древней мудростью</span> и
                            <br />современными технологиями
                        </h1>
                        <p className="about-subtitle">
                            Мы доносим вечные учения Бхагавад-гиты до каждого через возможности ИИ
                        </p>
                    </div>
                </div>
            </section>

            <section className="vision-section">
                <div className="container">
                    <div className="vision-grid">
                        <div className="vision-content">
                            <h2 className="section-heading">Видение</h2>
                            <p className="vision-text">
                                В мире, полном шума и хаоса, трудно найти ясное, этичное и духовное руководство.
                                Проект «Поговорить с Кришной» родился из идеи сделать вечную мудрость Бхагавад-гиты доступной каждому,
                                в любое время и в любом месте, в режиме реального времени.
                            </p>
                            <p className="vision-text">
                                Объединив передовые языковые модели (LLM) с подлинными текстами писаний,
                                мы создали систему, которая не просто отвечает на вопросы, но ведет вас с божественным состраданием.
                            </p>

                            <div className="vision-stats">
                                <div className="vision-stat-card">
                                    <div className="stat-icon">📜</div>
                                    <div className="stat-info">
                                        <div className="stat-value">700+</div>
                                        <div className="stat-desc">Подлинных шлок</div>
                                    </div>
                                </div>
                                <div className="vision-stat-card">
                                    <div className="stat-icon">🌍</div>
                                    <div className="stat-info">
                                        <div className="stat-value">Глобальный</div>
                                        <div className="stat-desc">Доступ</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="vision-visual">
                            <div className="visual-card">
                                <div className="visual-icon">🧠</div>
                                <div className="visual-plus">+</div>
                                <div className="visual-icon">📖</div>
                                <div className="visual-equals">=</div>
                                <div className="visual-icon">✨</div>
                            </div>
                            <p className="visual-caption">Слияние ИИ и древних писаний</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="tech-section">
                <div className="container">
                    <div className="section-header-center">
                        <span className="section-badge">Технологии</span>
                        <h2 className="section-heading-center">
                            На базе <span className="gradient-text">передового ИИ</span>
                        </h2>
                        <p className="section-desc">
                            Наша платформа объединяет несколько передовых технологий для обеспечения подлинного духовного опыта
                        </p>
                    </div>

                    <div className="tech-grid">
                        <div className="tech-card">
                            <div className="tech-icon-wrapper">
                                <div className="tech-icon">🔍</div>
                            </div>
                            <h3>Архитектура RAG</h3>
                            <p>Генерация с расширенным поиском гарантирует, что все ответы основаны на реальных шлоках Бхагавад-гиты.</p>
                            <ul className="tech-features">
                                <li>Семантический поиск</li>
                                <li>Учет контекста</li>
                                <li>Проверенные источники</li>
                            </ul>
                        </div>

                        <div className="tech-card featured-tech">
                            <div className="tech-badge">Основная технология</div>
                            <div className="tech-icon-wrapper">
                                <div className="tech-icon">🎙️</div>
                            </div>
                            <h3>Нейронный голос</h3>
                            <p>Современные модели TTS обеспечивают реалистичное и спокойное звучание голоса Кришны.</p>
                            <ul className="tech-features">
                                <li>Естественные интонации</li>
                                <li>Эмоциональное выражение</li>
                                <li>Генерация в реальном времени</li>
                            </ul>
                        </div>

                        <div className="tech-card">
                            <div className="tech-icon-wrapper">
                                <div className="tech-icon">🧠</div>
                            </div>
                            <h3>Обработка LLM</h3>
                            <p>Мощные языковые модели понимают не просто слова, а намерение, стоящее за вашим вопросом.</p>
                            <ul className="tech-features">
                                <li>Понимание контекста</li>
                                <li>Мультиязычная поддержка</li>
                                <li>Персональные ответы</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section className="values-section">
                <div className="container">
                    <div className="section-header-center">
                        <span className="section-badge">Наши ценности</span>
                        <h2 className="section-heading-center">
                            Построено на <span className="gradient-text">Доверии</span>
                        </h2>
                    </div>

                    <div className="values-grid">
                        <div className="value-card">
                            <div className="value-number">01</div>
                            <h3>Точность писаний</h3>
                            <p>Все ответы проверяются на соответствие подлинным шлокам. Мы не искажаем учение.</p>
                        </div>
                        <div className="value-card">
                            <div className="value-number">02</div>
                            <h3>Доступность</h3>
                            <p>Мы несем древнюю мудрость всем, независимо от их опыта или подготовки.</p>
                        </div>
                        <div className="value-card">
                            <div className="value-number">03</div>
                            <h3>Приватность</h3>
                            <p>Ваш духовный путь — это личное. Мы уважаем вашу конфиденциальность и не передаем ваши диалоги.</p>
                        </div>
                        <div className="value-card">
                            <div className="value-number">04</div>
                            <h3>Инновации</h3>
                            <p>Мы постоянно совершенствуем технологии, чтобы предоставлять еще более глубокое руководство.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="founder-section">
                <div className="container">
                    <div className="section-header-center">
                        <span className="section-badge">Руководство</span>
                        <h2 className="section-heading-center">
                            О <span className="gradient-text">Основателе</span>
                        </h2>
                    </div>

                    <div className="founder-card">
                        <div className="founder-image-wrapper">
                            <div className="founder-image-bg"></div>
                            <img
                                src="/founder.jpg"
                                alt="Abhishek Chola - Founder & CEO"
                                className="founder-image"
                                onError={(e) => {
                                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23f0f0f0" width="400" height="400"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="24" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EFounder%3C/text%3E%3C/svg%3E';
                                }}
                            />
                        </div>
                        <div className="founder-content">
                            <h3 className="founder-name">Абхишек Чола</h3>
                            <p className="founder-title">Основатель и генеральный директор Just Learn</p>
                            <div className="founder-divider"></div>
                            <p className="founder-bio">
                                Глобальный инноватор в области EdTech и SkillTech, посвятивший себя демократизации образования. 
                                Абхишек руководит стратегическими инициативами в нескольких странах, развивая сотрудничество между образованием и технологиями.
                            </p>
                            <p className="founder-bio">
                                Его лидерство сосредоточено на масштабируемых решениях с использованием ИИ, AR/VR и иммерсивных технологий.
                            </p>
                            <div className="founder-highlights">
                                <div className="highlight-item">
                                    <div className="highlight-icon">🌍</div>
                                    <div className="highlight-text">
                                        <strong>Глобальное влияние</strong>
                                        <span>Присутствие в разных странах</span>
                                    </div>
                                </div>
                                <div className="highlight-item">
                                    <div className="highlight-icon">🚀</div>
                                    <div className="highlight-text">
                                        <strong>Лидер инноваций</strong>
                                        <span>ИИ, AR/VR технологии</span>
                                    </div>
                                </div>
                                <div className="highlight-item">
                                    <div className="highlight-icon">🎓</div>
                                    <div className="highlight-text">
                                        <strong>Пионер EdTech</strong>
                                        <span>Доступное образование</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="cta-about">
                <div className="container">
                    <div className="cta-about-card">
                        <h2>Готовы прикоснуться к божественной мудрости?</h2>
                        <p>Начните свой путь с ИИ-наставником по Бхагавад-гите</p>
                        <button className="btn-premium-primary btn-large" onClick={() => window.location.href = '/chat'}>
                            <span className="btn-icon">🕉️</span>
                            Поговорить с Кришной сейчас
                            <span className="btn-arrow">→</span>
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default About;
