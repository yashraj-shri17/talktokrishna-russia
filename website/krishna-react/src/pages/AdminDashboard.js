import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart3,
    Users,
    MessageSquare,
    ShieldAlert,
    ChevronRight,
    ArrowLeft,
    History,
    Activity,
    Lock,
    Unlock,
    Ticket,
    Plus,
    Trash2,
    Home as HomeIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import API_BASE_URL from '../config/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('analytics');
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [conversationUsers, setConversationUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userConversations, setUserConversations] = useState([]);
    const [, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Form states
    const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
    const [accessForm, setAccessForm] = useState({ email: '', temporary_password: '', has_access: true });
    const [coupons, setCoupons] = useState([]);
    const [couponForm, setCouponForm] = useState({ code: '', discount_type: 'free_access', discount_value: '' });

    const fetchAnalytics = useCallback(async () => {
        if (!user || user.role !== 'admin') return;
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/analytics`, {
                params: { admin_id: user.id }
            });
            if (response.data.success) {
                setAnalytics(response.data.analytics);
            }
        } catch (err) {
            setError('Failed to fetch analytics payload');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const fetchUsers = useCallback(async () => {
        if (!user || user.role !== 'admin') return;
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
                params: { admin_id: user.id }
            });
            if (response.data.success) {
                setUsers(response.data.users);
            }
        } catch (err) {
            setError('Failed to sync user records');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const fetchConversationUsers = useCallback(async () => {
        if (!user || user.role !== 'admin') return;
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/conversation-users`, {
                params: { admin_id: user.id }
            });
            if (response.data.success) {
                setConversationUsers(response.data.users);
            }
        } catch (err) {
            setError('Failed to index conversation clusters');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const fetchCoupons = useCallback(async () => {
        if (!user || user.role !== 'admin') return;
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/coupons`, {
                params: { admin_id: user.id }
            });
            if (response.data.success) {
                setCoupons(response.data.coupons);
            }
        } catch (err) {
            setError('Failed to fetch coupons');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const fetchUserConversations = async (userId) => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/user-conversations/${userId}`, {
                params: { admin_id: user.id }
            });
            if (response.data.success) {
                setUserConversations(response.data.conversations);
                setSelectedUser(response.data.user);
            }
        } catch (err) {
            setError('Failed to retrieve full stream');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && user.role !== 'admin') {
            navigate('/');
            return;
        }

        if (activeTab === 'analytics') fetchAnalytics();
        if (activeTab === 'users' || activeTab === 'access') fetchUsers();
        if (activeTab === 'coupons') fetchCoupons();
        if (activeTab === 'conversations') {
            fetchConversationUsers();
            setSelectedUser(null);
            setUserConversations([]);
        }
    }, [activeTab, user, navigate, fetchAnalytics, fetchUsers, fetchConversationUsers, fetchCoupons]);

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage('');
        try {
            const response = await axios.post(`${API_BASE_URL}/api/admin/create-admin`, {
                ...adminForm,
                admin_id: user.id
            });
            if (response.data.success) {
                setSuccessMessage('Elevated privileges granted to new admin.');
                setAdminForm({ name: '', email: '', password: '' });
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Auth escalation failed');
        }
    };

    const handleGrantAccess = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage('');
        try {
            const response = await axios.post(`${API_BASE_URL}/api/admin/grant-access`, {
                ...accessForm,
                admin_id: user.id
            });
            if (response.data.success) {
                setSuccessMessage(response.data.message);
                setAccessForm({ email: '', temporary_password: '', has_access: true });
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Access grant failed');
        }
    };

    const handleToggleAccess = async (user_email, current_access) => {
        try {
            await axios.post(`${API_BASE_URL}/api/admin/grant-access`, {
                email: user_email,
                has_access: !current_access,
                admin_id: user.id
            });
            fetchUsers();
        } catch (err) {
            setError('Status toggle failed');
        }
    };

    const handleAddCoupon = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage('');
        try {
            const response = await axios.post(`${API_BASE_URL}/api/admin/coupons`, {
                ...couponForm,
                admin_id: user.id
            });
            if (response.data.success) {
                setSuccessMessage('New coupon generated successfully.');
                setCouponForm({ code: '', discount_type: 'free_access', discount_value: '' });
                fetchCoupons();
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Coupon generation failed');
        }
    };

    const handleDeleteCoupon = async (couponId) => {
        if (!window.confirm('CRITICAL: Erase this coupon code permanently? This choice cannot be undone.')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/admin/coupons/${couponId}`, {
                params: { admin_id: user.id }
            });
            setSuccessMessage('Coupon purged from registry.');
            fetchCoupons();
        } catch (err) {
            setError('Coupon deletion failed');
        }
    };

    const handleToggleCoupon = async (couponId, currentStatus) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/admin/coupons/${couponId}/toggle`, {
                is_active: !currentStatus,
                admin_id: user.id
            });
            if (response.data.success) {
                setSuccessMessage(response.data.message);
                fetchCoupons();
            }
        } catch (err) {
            setError('Status update failed');
        }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const renderAnalytics = () => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stats-grid">
            <div className="stat-card">
                <div className="stat-label">System Users</div>
                <div className="stat-value">{analytics?.total_users || 0}</div>
                <div className="stat-trend"><Activity size={12} /> Global Registry</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Active Presence</div>
                <div className="stat-value">{analytics?.today_users || 0}</div>
                <div className="stat-trend"><Users size={12} /> Daily Cycle</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Neural Interactions</div>
                <div className="stat-value">{analytics?.total_conversations || 0}</div>
                <div className="stat-trend"><History size={12} /> Sequence Total</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Today's Flow</div>
                <div className="stat-value">{analytics?.today_conversations || 0}</div>
                <div className="stat-trend"><Activity size={12} /> Current Batch</div>
            </div>
        </motion.div>
    );

    const renderConversations = () => (
        <AnimatePresence mode="wait">
            {!selectedUser ? (
                <motion.div
                    key="list"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                >
                    <div className="glass-table-wrapper">
                        <table className="glass-table">
                            <thead>
                                <tr>
                                    <th>Neural ID</th>
                                    <th>Interaction Count</th>
                                    <th>Last Pulsed</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {conversationUsers.map(u => (
                                    <tr key={u.id}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{u.name}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{u.email}</div>
                                        </td>
                                        <td>{u.conversation_count} Segments</td>
                                        <td>{formatDate(u.last_active)}</td>
                                        <td>
                                            <button className="nav-item active" style={{ padding: '0.5rem 1rem' }} onClick={() => fetchUserConversations(u.id)}>
                                                Retrieve Stream <ChevronRight size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="detail"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                >
                    <button className="nav-item" onClick={() => setSelectedUser(null)} style={{ marginBottom: '2rem' }}>
                        <ArrowLeft size={18} /> Back to Nodes
                    </button>

                    <div className="chat-window">
                        {userConversations.map(conv => (
                            <React.Fragment key={conv.id}>
                                <div className="bubble user">
                                    {conv.question}
                                    <span className="bubble-meta">{formatDate(conv.timestamp)}</span>
                                </div>
                                <div className="bubble krishna">
                                    {conv.answer}
                                    <span className="bubble-meta">Krishna Intelligence Pulse</span>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const renderCoupons = () => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="form-panel" style={{ marginBottom: '2rem' }}>
                <div className="sidebar-header" style={{ padding: 0, marginBottom: '2rem' }}>
                    <h3>Generate Coupon Code</h3>
                </div>
                <form onSubmit={handleAddCoupon} className="coupon-form">
                    <div className="control-group">
                        <label>COUPON CODE</label>
                        <input
                            type="text"
                            className="fancy-input"
                            value={couponForm.code}
                            onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                            required
                            placeholder="KRISHNA2024"
                        />
                    </div>
                    <div className="control-group">
                        <label>DISCOUNT TYPE</label>
                        <select
                            className="fancy-input"
                            value={couponForm.discount_type}
                            onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })}
                            style={{ background: 'var(--admin-panel-bg)' }}
                        >
                            <option value="free_access">Full Access Unlock</option>
                            <option value="percentage">Percentage (%)</option>
                            <option value="fixed_value">Fixed Value (¥)</option>
                        </select>
                    </div>
                    {couponForm.discount_type !== 'free_access' && (
                        <div className="control-group">
                            <label>{couponForm.discount_type === 'percentage' ? 'PERCENTAGE (%)' : 'FIXED VALUE (¥)'}</label>
                            <input
                                type="number"
                                className="fancy-input"
                                value={couponForm.discount_value}
                                onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })}
                                required
                                placeholder={couponForm.discount_type === 'percentage' ? 'e.g. 50' : 'e.g. 100'}
                            />
                        </div>
                    )}
                    <div className="coupon-submit-wrapper">
                        <button type="submit" className="action-button coupon-submit-btn">
                            <Plus size={18} /> GENERATE
                        </button>
                    </div>
                </form>
            </div>

            <div className="glass-table-wrapper">
                <table className="glass-table">
                    <thead>
                        <tr>
                            <th>Coupon Code</th>
                            <th>Type</th>
                            <th>Reward Value</th>
                            <th>Status</th>
                            <th>Created At</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {coupons.map(coupon => (
                            <tr key={coupon.id}>
                                <td style={{ fontWeight: 700, letterSpacing: '1px' }}>{coupon.code}</td>
                                <td>{coupon.discount_type.replace('_', ' ').toUpperCase()}</td>
                                <td style={{ fontWeight: 600 }}>
                                    {coupon.discount_type === 'free_access' ? 'FULL UNLOCK' :
                                        coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` :
                                            `¥${coupon.discount_value}`}
                                </td>
                                <td>
                                    <span className={`badge ${coupon.is_active ? 'badge-success' : 'badge-danger'}`}>
                                        {coupon.is_active ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                </td>
                                <td>{formatDate(coupon.created_at)}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                            className={`badge ${coupon.is_active ? 'badge-danger' : 'badge-success'}`}
                                            onClick={() => handleToggleCoupon(coupon.id, coupon.is_active)}
                                            style={{ cursor: 'pointer', border: 'none' }}
                                        >
                                            {coupon.is_active ? <Lock size={12} /> : <Unlock size={12} />} {coupon.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCoupon(coupon.id)}
                                            style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', padding: 0 }}
                                            title="Delete permanently"
                                        >
                                            <Trash2 size={16} /> <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>PURGE</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {coupons.length === 0 && (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                                    No coupons registered in the system.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );

    return (
        <div className="admin-dashboard" data-theme="dark">
            <div className="admin-container">
                <div className="admin-shell">
                    {/* Sidebar */}
                    <aside className="admin-sidebar">
                        <div className="sidebar-header">
                            <h1>KRISHNA COMMAND</h1>
                        </div>

                        <nav className="nav-group">
                            <div className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                                <BarChart3 /> <span>System Stats</span>
                            </div>
                            <div className={`nav-item ${activeTab === 'conversations' ? 'active' : ''}`} onClick={() => setActiveTab('conversations')}>
                                <MessageSquare /> <span>Neural history</span>
                            </div>
                            <div className={`nav-item ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>
                                <ShieldAlert /> <span>Access control</span>
                            </div>
                            <div className={`nav-item ${activeTab === 'create-admin' ? 'active' : ''}`} onClick={() => setActiveTab('create-admin')}>
                                <ShieldAlert /> <span>Elevate admin</span>
                            </div>
                            <div className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                                <Users /> <span>Node Registry</span>
                            </div>
                            <div className={`nav-item ${activeTab === 'coupons' ? 'active' : ''}`} onClick={() => setActiveTab('coupons')}>
                                <Ticket /> <span>Coupon Engine</span>
                            </div>

                            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--admin-panel-border)', paddingTop: '1rem' }}>
                                <div className="nav-item" onClick={() => navigate('/')} style={{ color: 'var(--accent-color)' }}>
                                    <HomeIcon /> <span>Back to Home</span>
                                </div>
                            </div>
                        </nav>
                    </aside>

                    {/* Main Content Area */}
                    <main className="admin-main">
                        <header className="main-top-bar">
                            <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')}</h2>
                            <div className="admin-user-info">
                                <span className="badge badge-indigo">ADMIN_OPS</span>
                                <span style={{ marginLeft: '1rem', fontWeight: 600 }}>{user.name}</span>
                            </div>
                        </header>

                        <div className="admin-content-scroll">
                            {error && (
                                <motion.div initial={{ y: -10 }} animate={{ y: 0 }} className="badge badge-danger" style={{ display: 'block', marginBottom: '2rem', padding: '1rem' }}>
                                    SYSTEM_ERR: {error}
                                </motion.div>
                            )}
                            {successMessage && (
                                <motion.div initial={{ y: -10 }} animate={{ y: 0 }} className="badge badge-success" style={{ display: 'block', marginBottom: '2rem', padding: '1rem' }}>
                                    CORE_SYNC: {successMessage}
                                </motion.div>
                            )}

                            {activeTab === 'analytics' && renderAnalytics()}

                            {activeTab === 'conversations' && renderConversations()}
                            {activeTab === 'coupons' && renderCoupons()}

                            {activeTab === 'access' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="form-panel">
                                    <div className="sidebar-header" style={{ padding: 0, marginBottom: '2rem' }}>
                                        <h3>Provision Network Access</h3>
                                    </div>
                                    <form onSubmit={handleGrantAccess}>
                                        <div className="control-group">
                                            <label>NODE EMAIL IDENTIFIER</label>
                                            <input type="email" className="fancy-input" value={accessForm.email} onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })} required placeholder="identity@node.network" />
                                        </div>
                                        <div className="control-group">
                                            <label>PRIMARY SECURITY KEY (NEW NODES)</label>
                                            <input type="password" className="fancy-input" value={accessForm.temporary_password} onChange={(e) => setAccessForm({ ...accessForm, temporary_password: e.target.value })} placeholder="••••••••" />
                                        </div>
                                        <button type="submit" className="action-button">AUTHORIZE ACCESS</button>
                                    </form>
                                </motion.div>
                            )}

                            {activeTab === 'create-admin' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="form-panel">
                                    <div className="sidebar-header" style={{ padding: 0, marginBottom: '2rem' }}>
                                        <h3>Elevate Authority Level</h3>
                                    </div>
                                    <form onSubmit={handleCreateAdmin}>
                                        <div className="control-group">
                                            <label>ADMINISTRATOR NAME</label>
                                            <input type="text" className="fancy-input" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} required />
                                        </div>
                                        <div className="control-group">
                                            <label>SECURE EMAIL</label>
                                            <input type="email" className="fancy-input" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} required />
                                        </div>
                                        <div className="control-group">
                                            <label>ENCRYPTION KEY</label>
                                            <input type="password" className="fancy-input" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
                                        </div>
                                        <button type="submit" className="action-button">ESCALATE PRIVILEGES</button>
                                    </form>
                                </motion.div>
                            )}

                            {activeTab === 'users' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <div className="glass-table-wrapper">
                                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--admin-panel-border)' }}>
                                            <div className="control-group" style={{ margin: 0 }}>
                                                <input
                                                    type="text"
                                                    className="fancy-input"
                                                    placeholder="Search Registry..."
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <table className="glass-table">
                                            <thead>
                                                <tr>
                                                    <th>Identify</th>
                                                    <th>Role</th>
                                                    <th>Access Level</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredUsers.map(u => (
                                                    <tr key={u.id}>
                                                        <td>
                                                            <div style={{ fontWeight: 700 }}>{u.name}</div>
                                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{u.email}</div>
                                                        </td>
                                                        <td><span className={`badge ${u.role === 'admin' ? 'badge-indigo' : 'badge-success'}`}>{u.role}</span></td>
                                                        <td>
                                                            <span className={`badge ${u.has_chat_access ? 'badge-success' : 'badge-danger'}`}>
                                                                {u.has_chat_access ? <Unlock size={10} /> : <Lock size={10} />} {u.has_chat_access ? 'SYNCED' : 'LOCKED'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            {u.role !== 'admin' && (
                                                                <button
                                                                    className={`badge ${u.has_chat_access ? 'badge-danger' : 'badge-success'}`}
                                                                    style={{ cursor: 'pointer', border: 'none' }}
                                                                    onClick={() => handleToggleAccess(u.email, u.has_chat_access)}
                                                                >
                                                                    {u.has_chat_access ? 'REVOKE' : 'GRANT'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
