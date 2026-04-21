import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer-premium">
            <div className="container">
                <div className="footer-content">
                    <div className="footer-brand">
                        <div className="footer-logo">
                            <span className="logo-icon">🕉️</span>
                            <div className="brand-text-group">
                                <span className="logo-text-footer">Поговорить с Кришной</span>
                                <span className="trademark">®</span>
                            </div>
                        </div>
                        <p>Древняя мудрость в сочетании с современными технологиями</p>
                    </div>
                    <div className="footer-links">
                        <Link to="/about">О нас</Link>
                        <Link to="/pricing">Тарифы</Link>
                        <Link to="/contact">Контакты</Link>
                        <Link to="/privacy">Конфиденциальность</Link>
                        <Link to="/refund">Условия возврата</Link>
                        <Link to="/login">Войти</Link>
                        <Link to="/signup">Регистрация</Link>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>© 2026 Поговорить с Кришной<span className="trademark" style={{ verticalAlign: 'middle', fontSize: '0.8em' }}>®</span>. Все права защищены.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
