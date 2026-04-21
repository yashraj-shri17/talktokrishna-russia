import React from 'react';
import Navbar from '../components/Navbar';
import './Refund.css';

function Refund() {
    return (
        <div className="page-container refund-page">
            <Navbar />

            <section className="refund-hero">
                <div className="container">
                    <div className="refund-hero-content">
                        <span className="section-badge">ПОЛИТИКА</span>
                        <h1 className="refund-title">
                            Условия <span className="gradient-text">возврата</span>
                        </h1>
                        <p className="refund-subtitle">
                            Последнее обновление: 19 марта 2026 г.
                        </p>
                    </div>
                </div>
            </section>

            <section className="refund-content">
                <div className="container">
                    <div className="refund-wrapper">
                        <div className="refund-section">
                            <h2>Политика возврата средств</h2>
                            <p>
                                Благодарим вас за использование платформы «Поговорить с Кришной». Мы ценим ваше стремление к духовному росту и стремимся обеспечить наилучший опыт на нашем сайте.
                            </p>
                        </div>

                        <div className="refund-section">
                            <h2>Нематериальные и безотзывные товары («Цифровые продукты»)</h2>
                            <p>
                                Мы не производим возврат средств за нематериальные и безотзывные товары («Цифровые продукты») после подтверждения заказа и отправки продукта.
                            </p>
                            <p>
                                Наши основные услуги включают доступ к священным беседам под руководством ИИ и духовному контенту. Из-за цифровой природы этих продуктов их невозможно «вернуть» после предоставления доступа.
                            </p>
                        </div>

                        <div className="refund-section">
                            <h2>Поддержка и помощь</h2>
                            <p>
                                Если у вас возникли проблемы с получением услуг, доступом к чату или технические неполадки, мы рекомендуем вам обратиться в нашу службу поддержки.
                            </p>
                            <p>
                                Наша команда сделает все возможное, чтобы ваше духовное путешествие было непрерывным и значимым.
                            </p>
                        </div>

                        <div className="refund-section">
                            <h2>Контакты</h2>
                            <p>Если у вас есть вопросы по политике возврата, свяжитесь с нами:</p>
                            <ul>
                                <li>Email: <a href="mailto:support@talktokrishna.ai">support@talktokrishna.ai</a></li>
                                <li>Сайт: <a href="/contact">Форма обратной связи</a></li>
                            </ul>
                        </div>

                        <div className="refund-footer-note">
                            <p>
                                <strong>Духовное обязательство:</strong> Совершая покупку, вы подтверждаете и соглашаетесь с условиями данной политики.
                                Мы искренне благодарим вас за то, что вы стали частью семьи «Поговорить с Кришной».
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Refund;
