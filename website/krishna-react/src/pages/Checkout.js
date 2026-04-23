import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Check, Ticket, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Checkout.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://talk-to-krishna-japan.onrender.com';

function Checkout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, login } = useAuth();

    // Fallback if accessed directly without state
    const selectedPlan = location.state?.plan || {
        name: 'План не выбран',
        price: '0 ₽',
        period: '',
        description: ''
    };

    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [checkoutComplete, setCheckoutComplete] = useState(false);
    const [isMandateStep, setIsMandateStep] = useState(false);

    const basePriceNum = parseInt(selectedPlan.price.replace(/[^\d]/g, '')) || 0;
    const [finalPrice, setFinalPrice] = useState(basePriceNum);
    const [recommendedCoupons, setRecommendedCoupons] = useState([]);

    useEffect(() => {
        const fetchRecommendedCoupons = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/active-coupons`);
                if (res.data.success) {
                    setRecommendedCoupons(res.data.coupons);
                }
            } catch (err) {
                console.warn('Failed to fetch recommended coupons:', err);
            }
        };
        fetchRecommendedCoupons();
    }, []);

    useEffect(() => {
        if (!location.state?.plan) {
            navigate('/pricing');
        }
    }, [location.state, navigate]);

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;

        setIsLoading(true);
        setCouponError('');

        try {
            const response = await axios.post(`${API_BASE_URL}/api/validate-coupon`, {
                code: couponCode
            });

            if (response.data.success) {
                const coupon = response.data.coupon;
                setAppliedCoupon(coupon);
                setCouponCode('');

                // Calculate discount (Ensuring integer values for Rubles)
                let discountAmount = 0;
                if (coupon.discount_type === 'percentage') {
                    discountAmount = Math.round((basePriceNum * coupon.discount_value) / 100);
                } else if (coupon.discount_type === 'fixed_value') {
                    discountAmount = Math.round(coupon.discount_value);
                } else if (coupon.discount_type === 'free_access') {
                    discountAmount = basePriceNum;
                }

                setFinalPrice(Math.max(0, basePriceNum - discountAmount));
            }
        } catch (err) {
            setCouponError(err.response?.data?.error || 'Неверный код купона');
            setAppliedCoupon(null);
            setFinalPrice(basePriceNum);
        } finally {
            setIsLoading(false);
        }
    };

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setFinalPrice(basePriceNum);
    };

    const setupSubscription = async (userId, planId) => {
        try {
            setIsLoading(true);
            const subRes = await axios.post(`${API_BASE_URL}/api/create-razorpay-subscription`, {
                user_id: userId,
                plan_id: planId
            });

            if (!subRes.data.success) throw new Error(subRes.data.error || "Не удалось создать подписку");

            const { subscription_id, key_id } = subRes.data;

            const options = {
                key: key_id,
                subscription_id: subscription_id,
                name: "TTK Russia",
                description: "Включить автопродление ежемесячного плана",
                image: "/logo.png",
                handler: function (response) {
                    console.log("Subscription mandate successful");
                    const updatedUser = { ...user, has_chat_access: true };
                    login(updatedUser);
                    setCheckoutComplete(true);
                    setTimeout(() => {
                        navigate('/chat');
                    }, 3000);
                },
                prefill: {
                    name: user.name,
                    email: user.email,
                },
                theme: {
                    color: "#4f46e5"
                },
                modal: {
                    ondismiss: function() {
                        // If they close the mandate, they already paid once, 
                        // so we can still let them in but notify them
                        alert("Автопродление не настроено. Вы можете сделать это позже в профиле.");
                        const updatedUser = { ...user, has_chat_access: true };
                        login(updatedUser);
                        setCheckoutComplete(true);
                        setTimeout(() => navigate('/chat'), 3000);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            console.error('Subscription setup error:', err);
            // Don't block access if main payment succeeded
            alert("Возникла проблема с настройкой автопродления. Мы предоставили вам доступ на один месяц.");
            const updatedUser = { ...user, has_chat_access: true };
            login(updatedUser);
            setCheckoutComplete(true);
            setTimeout(() => navigate('/chat'), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompletePurchase = async () => {
        if (!user) {
            navigate('/login', { state: { from: location } });
            return;
        }

        setIsLoading(true);

        try {
            // CASE: 100% Discount (FREE)
            if (finalPrice === 0 && appliedCoupon) {
                const res = await axios.post(`${API_BASE_URL}/api/grant-free-access`, {
                    user_id: user.id,
                    plan_id: selectedPlan.plan_id || 'monthly_30',
                    coupon_code: appliedCoupon.code
                });

                if (res.data.success) {
                    const updatedUser = { ...user, has_chat_access: true };
                    login(updatedUser);
                    setCheckoutComplete(true);
                    setTimeout(() => {
                        navigate('/chat');
                    }, 3000);
                    return;
                } else {
                    throw new Error(res.data.error || 'Не удалось предоставить доступ');
                }
            }

            // Step 1: Create Razorpay Order on the backend
            const orderRes = await axios.post(`${API_BASE_URL}/api/create-razorpay-order`, {
                user_id: user.id,
                plan_id: selectedPlan.plan_id || 'monthly_30',
                amount: finalPrice,
                email: user.email,
                coupon_code: appliedCoupon?.code,
                discount_amount: basePriceNum - finalPrice
            });

            if (!orderRes.data.success) {
                throw new Error(orderRes.data.error || 'Не удалось создать заказ');
            }

            const { order_id, amount, currency, key_id } = orderRes.data;

            // Step 2: Initialize Razorpay Checkout
            const options = {
                key: key_id,
                amount: amount,
                currency: currency,
                name: "TTK Russia",
                description: `Оплата за первый месяц (${selectedPlan.name})`,
                image: "/logo.png",
                order_id: order_id,
                handler: async function (response) {
                    // Step 3: Verify payment on the backend
                    try {
                        setIsLoading(true);
                        const verifyRes = await axios.post(`${API_BASE_URL}/api/verify-payment`, {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            user_id: user.id
                        });

                        if (verifyRes.data.success) {
                            // If this was a monthly plan, trigger subscription mandate
                            if (selectedPlan.plan_id === 'monthly_30') {
                                setIsMandateStep(true);
                                setupSubscription(user.id, selectedPlan.plan_id);
                            } else {
                                // For yearly plans, just complete
                                const updatedUser = { ...user, has_chat_access: true };
                                login(updatedUser);
                                setCheckoutComplete(true);
                                setTimeout(() => {
                                    navigate('/chat');
                                }, 3000);
                            }
                        } else {
                            alert('Не удалось подтвердить платеж. Обратитесь в службу поддержки.');
                            setIsLoading(false);
                        }
                    } catch (err) {
                        console.error('Verification error:', err);
                        alert('Произошла ошибка при подтверждении платежа.');
                        setIsLoading(false);
                    }
                },
                prefill: {
                    name: user.name,
                    email: user.email,
                },
                theme: {
                    color: "#4f46e5"
                },
                modal: {
                    ondismiss: function() {
                        setIsLoading(false);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                alert('Платеж не удался: ' + response.error.description);
                setIsLoading(false);
            });
            rzp.open();

        } catch (err) {
            console.error('Checkout error:', err);
            alert(err.message || 'Произошла ошибка при оформлении заказа. Попробуйте еще раз.');
            setIsLoading(false);
        }
    };

    if (checkoutComplete) {
        return (
            <div className="checkout-page">
                <Navbar />
                <div className="checkout-success-container container">
                    <div className="success-content">
                        <div className="success-icon-wrapper">
                            <Check size={48} />
                        </div>
                        <h1>Заказ выполнен!</h1>
                        <p>Ваш план успешно активирован. Перенаправляем в чат...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="checkout-page">
            <Navbar />

            <div className="checkout-container container">
                <div className="checkout-layout">
                    {/* Left: Plan Summary */}
                    <div className="checkout-summary">
                        <div className="checkout-card">
                            <h2 className="section-title">Ваш заказ</h2>
                            <div className="plan-item">
                                <div className="plan-info">
                                    <h3>Тариф {selectedPlan.name}</h3>
                                    <p>{selectedPlan.description}</p>
                                </div>
                                <div className="plan-price-side">
                                    {selectedPlan.price}
                                </div>
                            </div>

                            <hr className="divider" />

                            <div className="price-details">
                                {selectedPlan.plan_id === 'monthly_30' && (
                                    <div className="subscription-info-badge">
                                        Первый платеж {finalPrice.toLocaleString()} ₽, далее {basePriceNum.toLocaleString()} ₽ ежемесячно
                                    </div>
                                )}
                                <div className="price-row">
                                    <span>Сумма</span>
                                    <span>{basePriceNum.toLocaleString()} ₽</span>
                                </div>

                                {appliedCoupon && (
                                    <div className="price-row discount">
                                        <span>Купон ({appliedCoupon.code})</span>
                                        <span>- {(basePriceNum - finalPrice).toLocaleString()} ₽</span>
                                    </div>
                                )}

                                <div className="price-row total">
                                    <span>Итого</span>
                                    <span className="final-total">{finalPrice.toLocaleString()} ₽</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Payment & Options */}
                    <div className="checkout-actions">
                        {/* Coupon Form */}
                        <div className="checkout-card coupon-section">
                            <h3>Использовать купон</h3>
                            {!appliedCoupon ? (
                                <div className="coupon-input-group">
                                    <input
                                        type="text"
                                        placeholder="Введите код купона"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                        className="coupon-input"
                                    />
                                    <button
                                        onClick={handleApplyCoupon}
                                        disabled={isLoading || !couponCode}
                                        className="apply-btn"
                                    >
                                        Применить
                                    </button>
                                </div>
                            ) : (
                                <div className="applied-badge">
                                    <Ticket size={18} />
                                    <span>Купон {appliedCoupon.code} применен</span>
                                    <button onClick={removeCoupon} className="remove-btn">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                            {couponError && <p className="coupon-error">{couponError}</p>}

                            {/* Recommended Coupons Chips */}
                            {!appliedCoupon && recommendedCoupons.length > 0 && (
                                <div className="recommended-coupons">
                                    <p className="recommended-title">Рекомендуемые купоны:</p>
                                    <div className="coupon-chips">
                                        {recommendedCoupons.map((coupon) => (
                                            <button
                                                key={coupon.code}
                                                className="coupon-chip"
                                                onClick={() => {
                                                    setCouponCode(coupon.code);
                                                    // Trigger apply logic manually since state update is async
                                                    const autoApply = async () => {
                                                        setIsLoading(true);
                                                        setCouponError('');
                                                        try {
                                                            const response = await axios.post(`${API_BASE_URL}/api/validate-coupon`, {
                                                                code: coupon.code
                                                            });
                                                            if (response.data.success) {
                                                                const cp = response.data.coupon;
                                                                setAppliedCoupon(cp);
                                                                setCouponCode('');
                                                                let discountAmount = 0;
                                                                if (cp.discount_type === 'percentage') {
                                                                    discountAmount = Math.round((basePriceNum * cp.discount_value) / 100);
                                                                } else if (cp.discount_type === 'fixed_value') {
                                                                    discountAmount = Math.round(cp.discount_value);
                                                                } else if (cp.discount_type === 'free_access') {
                                                                    discountAmount = basePriceNum;
                                                                }
                                                                setFinalPrice(Math.max(0, basePriceNum - discountAmount));
                                                            }
                                                        } catch (err) {
                                                            setCouponError(err.response?.data?.error || 'Ошибка применения');
                                                        } finally {
                                                            setIsLoading(false);
                                                        }
                                                    };
                                                    autoApply();
                                                }}
                                                disabled={isLoading}
                                            >
                                                <Ticket size={14} />
                                                <span>{coupon.code}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Payment Button */}
                        <div className="checkout-card payment-section">
                            <div className="security-tag">
                                <ShieldCheck size={16} />
                                <span>Безопасное SSL-соединение</span>
                            </div>

                            <button
                                className="complete-btn"
                                onClick={handleCompletePurchase}
                                disabled={isLoading}
                            >
                                {isLoading ? (isMandateStep ? 'Настройка продления...' : 'Обработка...') : 'Перейти к оплате'}
                                {!isLoading && <ArrowRight size={20} />}
                            </button>

                            <p className="payment-note">
                                Нажимая кнопку, вы соглашаетесь с Условиями использования.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Checkout;
