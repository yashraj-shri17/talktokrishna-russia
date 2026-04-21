import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import './Contact.css';

function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        alert('Спасибо за обращение! Мы ответим вам в ближайшее время.');
        setFormData({ name: '', email: '', subject: '', message: '' });
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    return (
        <div className="page-container contact-page">
            <Navbar />

            <section className="contact-hero">
                <div className="container">
                    <div className="contact-hero-content">
                        <span className="section-badge">КОНТАКТЫ</span>
                        <h1 className="contact-title">
                            Мы всегда <span className="gradient-text">поможем</span>
                        </h1>
                        <p className="contact-subtitle">
                            У вас есть вопросы или отзывы? Мы будем рады их услышать.
                        </p>
                    </div>
                </div>
            </section>

            <section className="contact-content">
                <div className="container">
                    <div className="contact-grid">
                        <div className="contact-info">
                            <h2>Контактная информация</h2>
                            <p className="info-subtitle">Заполните форму, и наша команда свяжется с вами в течение 24 часов.</p>

                            <div className="contact-cards">
                                <div className="contact-card">
                                    <div className="contact-icon">📧</div>
                                    <h3>Email</h3>
                                    <p>hello@talktokrishna.ai</p>
                                </div>

                                <div className="contact-card">
                                    <div className="contact-icon">💬</div>
                                    <h3>Онлайн-чат</h3>
                                    <p>Доступен 24/7</p>
                                </div>

                                <div className="contact-card">
                                    <div className="contact-icon">🌐</div>
                                    <h3>Социальные сети</h3>
                                    <div className="social-links">
                                        <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="social-link">Twitter</a>
                                        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="social-link">LinkedIn</a>
                                        <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-link">Instagram</a>
                                    </div>
                                </div>
                            </div>

                            <div className="faq-section">
                                <h3>Часто задаваемые вопросы</h3>
                                <div className="faq-item">
                                    <strong>Как работает ИИ?</strong>
                                    <p>Наш ИИ использует технологию RAG для поиска в более чем 700 подлинных стихах Бхагавад-гиты.</p>
                                </div>
                                <div className="faq-item">
                                    <strong>Это бесплатно?</strong>
                                    <p>Да! Базовое использование «Поговорить с Кришной» доступно бесплатно для всех пользователей.</p>
                                </div>
                                <div className="faq-item">
                                    <strong>Какие языки поддерживаются?</strong>
                                    <p>В настоящее время мы поддерживаем русский и английский языки.</p>
                                </div>
                            </div>
                        </div>

                        <div className="contact-form-wrapper">
                            <form onSubmit={handleSubmit} className="contact-form">
                                <h2>Отправить сообщение</h2>

                                <div className="form-group">
                                    <label>Ваше имя</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Арджуна"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Электронная почта</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Тема</label>
                                    <input
                                        type="text"
                                        name="subject"
                                        value={formData.subject}
                                        onChange={handleChange}
                                        placeholder="О чем ваше сообщение?"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Сообщение</label>
                                    <textarea
                                        name="message"
                                        value={formData.message}
                                        onChange={handleChange}
                                        placeholder="Опишите ваш вопрос или отзыв подробнее..."
                                        rows="5"
                                        required
                                    ></textarea>
                                </div>

                                <button type="submit" className="btn-premium-primary btn-large">
                                    <span className="btn-icon">📨</span>
                                    Отправить
                                    <span className="btn-arrow">→</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Contact;
