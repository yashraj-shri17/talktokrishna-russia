import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import './Navbar.css';

function Navbar() {
    const location = useLocation();
    const { user } = useAuth();
    const [scrolled, setScrolled] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleMenu = () => setIsOpen(!isOpen);

    const closeMenu = () => setIsOpen(false);

    const getInitials = (name) => {
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <nav className={`navbar glass ${scrolled ? 'scrolled' : ''}`}>
            <div className="container navbar-content">
                <Link to="/" className="navbar-logo" onClick={closeMenu}>
                    <span className="logo-icon">🕉️</span>
                    <div className="brand-text-group">
                        <span className="logo-text">Поговорить с Кришной</span>
                        <span className="trademark">®</span>
                    </div>
                </Link>

                <div className="mobile-toggle" onClick={toggleMenu}>
                    <div className={`hamburger ${isOpen ? 'active' : ''}`}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <div className={`navbar-links ${isOpen ? 'active' : ''}`}>
                    <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} onClick={closeMenu}>Главная</Link>
                    <Link to="/about" className={`nav-link ${location.pathname === '/about' ? 'active' : ''}`} onClick={closeMenu}>О нас</Link>
                    <Link to="/pricing" className={`nav-link ${location.pathname === '/pricing' ? 'active' : ''}`} onClick={closeMenu}>Тарифы</Link>
                    <Link to="/contact" className={`nav-link ${location.pathname === '/contact' ? 'active' : ''}`} onClick={closeMenu}>Контакты</Link>
                    <Link to="/privacy" className={`nav-link ${location.pathname === '/privacy' ? 'active' : ''}`} onClick={closeMenu}>Конфиденциальность</Link>

                    {user ? (
                        <>
                            {(user.has_chat_access || user.role === 'admin') && (
                                <Link to="/chat" className={`nav-link ${location.pathname === '/chat' ? 'active' : ''}`} onClick={closeMenu}>Чат</Link>
                            )}
                            {user.role === 'admin' && (
                                <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''} admin-link-pill`} onClick={closeMenu}>Админ</Link>
                            )}
                            <Link to="/profile" className="nav-link profile-link" onClick={closeMenu}>
                                <div className="nav-avatar">
                                    {getInitials(user.name)}
                                </div>
                                <span>{user.name.split(' ')[0]}</span>
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className={`nav-link ${location.pathname === '/login' ? 'active' : ''}`} onClick={closeMenu}>Войти</Link>
                            <Link to="/signup" className="btn-primary" onClick={closeMenu}>Регистрация</Link>
                        </>
                    )}

                    <ThemeToggle />
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
