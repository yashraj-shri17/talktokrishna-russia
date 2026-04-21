import React, { useState, useRef, useEffect } from 'react';
import './PhoneInput.css';

const COUNTRIES = [
    { name: 'Russia',               flag: '🇷🇺', code: 'RU', dial: '+7' },
    { name: 'India',                flag: '🇮🇳', code: 'IN', dial: '+91' },
    { name: 'United States',        flag: '🇺🇸', code: 'US', dial: '+1' },
    { name: 'United Kingdom',       flag: '🇬🇧', code: 'GB', dial: '+44' },
    { name: 'United Arab Emirates', flag: '🇦🇪', code: 'AE', dial: '+971' },
    { name: 'Canada',               flag: '🇨🇦', code: 'CA', dial: '+1' },
    { name: 'Australia',            flag: '🇦🇺', code: 'AU', dial: '+61' },
    { name: 'Singapore',            flag: '🇸🇬', code: 'SG', dial: '+65' },
    { name: 'Germany',              flag: '🇩🇪', code: 'DE', dial: '+49' },
    { name: 'France',               flag: '🇫🇷', code: 'FR', dial: '+33' },
    { name: 'Italy',                flag: '🇮🇹', code: 'IT', dial: '+39' },
    { name: 'Spain',                flag: '🇪🇸', code: 'ES', dial: '+34' },
    { name: 'Netherlands',          flag: '🇳🇱', code: 'NL', dial: '+31' },
    { name: 'Switzerland',          flag: '🇨🇭', code: 'CH', dial: '+41' },
    { name: 'Sweden',               flag: '🇸🇪', code: 'SE', dial: '+46' },
    { name: 'Norway',               flag: '🇳🇴', code: 'NO', dial: '+47' },
    { name: 'Denmark',              flag: '🇩🇰', code: 'DK', dial: '+45' },
    { name: 'Japan',                flag: '🇯🇵', code: 'JP', dial: '+81' },
    { name: 'South Korea',          flag: '🇰🇷', code: 'KR', dial: '+82' },
    { name: 'China',                flag: '🇨🇳', code: 'CN', dial: '+86' },
    { name: 'Hong Kong',            flag: '🇭🇰', code: 'HK', dial: '+852' },
    { name: 'New Zealand',          flag: '🇳🇿', code: 'NZ', dial: '+64' },
    { name: 'South Africa',         flag: '🇿🇦', code: 'ZA', dial: '+27' },
    { name: 'Brazil',               flag: '🇧🇷', code: 'BR', dial: '+55' },
    { name: 'Mexico',               flag: '🇲🇽', code: 'MX', dial: '+52' },
    { name: 'Argentina',            flag: '🇦🇷', code: 'AR', dial: '+54' },
    { name: 'Saudi Arabia',         flag: '🇸🇦', code: 'SA', dial: '+966' },
    { name: 'Qatar',                flag: '🇶🇦', code: 'QA', dial: '+974' },
    { name: 'Kuwait',               flag: '🇰🇼', code: 'KW', dial: '+965' },
    { name: 'Oman',                 flag: '🇴🇲', code: 'OM', dial: '+968' },
    { name: 'Bahrain',              flag: '🇧🇭', code: 'BH', dial: '+973' },
    { name: 'Nepal',                flag: '🇳🇵', code: 'NP', dial: '+977' },
    { name: 'Bangladesh',           flag: '🇧🇩', code: 'BD', dial: '+880' },
    { name: 'Sri Lanka',            flag: '🇱🇰', code: 'LK', dial: '+94' },
    { name: 'Pakistan',             flag: '🇵🇰', code: 'PK', dial: '+92' },
    { name: 'Malaysia',             flag: '🇲🇾', code: 'MY', dial: '+60' },
    { name: 'Indonesia',            flag: '🇮🇩', code: 'ID', dial: '+62' },
    { name: 'Thailand',             flag: '🇹🇭', code: 'TH', dial: '+66' },
    { name: 'Philippines',          flag: '🇵🇭', code: 'PH', dial: '+63' },
    { name: 'Vietnam',              flag: '🇻🇳', code: 'VN', dial: '+84' },
    { name: 'Turkey',               flag: '🇹🇷', code: 'TR', dial: '+90' },
    { name: 'Israel',               flag: '🇮🇱', code: 'IL', dial: '+972' },
    { name: 'Egypt',                flag: '🇪🇬', code: 'EG', dial: '+20' },
    { name: 'Nigeria',              flag: '🇳🇬', code: 'NG', dial: '+234' },
    { name: 'Kenya',                flag: '🇰🇪', code: 'KE', dial: '+254' },
    { name: 'Ghana',                flag: '🇬🇭', code: 'GH', dial: '+233' },
    { name: 'Portugal',             flag: '🇵🇹', code: 'PT', dial: '+351' },
    { name: 'Belgium',              flag: '🇧🇪', code: 'BE', dial: '+32' },
    { name: 'Austria',              flag: '🇦🇹', code: 'AT', dial: '+43' },
    { name: 'Poland',               flag: '🇵🇱', code: 'PL', dial: '+48' },
];

/**
 * PhoneInput — country selector + number field
 * Props:
 *   value        : full phone string, e.g. "+91 9876543210"
 *   onChange     : (fullValue) => void   — called with "+91 XXXXXXXX"
 *   disabled     : bool
 *   placeholder  : string (optional)
 */
function PhoneInput({ value = '', onChange, disabled = false, placeholder = '9876543210' }) {
    // Parse initial value
    const parseValue = (v) => {
        const country = COUNTRIES.find(c => v.startsWith(c.dial + ' ')) ||
                        COUNTRIES.find(c => v.startsWith(c.dial)) ||
                        COUNTRIES.find(c => c.code === 'RU'); // default Russia
        const num = v.replace(country.dial, '').replace(/^\s+/, '');
        return { country, num };
    };

    const { country: initCountry, num: initNum } = parseValue(value);
    const [selected, setSelected]   = useState(initCountry);
    const [number,   setNumber]     = useState(initNum);
    const [open,     setOpen]       = useState(false);
    const [search,   setSearch]     = useState('');
    const dropdownRef = useRef(null);
    const searchRef   = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus search box when dropdown opens
    useEffect(() => {
        if (open && searchRef.current) searchRef.current.focus();
    }, [open]);

    const notify = (country, num) => {
        if (onChange) onChange(`${country.dial} ${num}`);
    };

    const handleSelect = (country) => {
        setSelected(country);
        setOpen(false);
        setSearch('');
        notify(country, number);
    };

    const handleNumberChange = (e) => {
        // Only digits, spaces, hyphens
        const raw = e.target.value.replace(/[^\d\s-]/g, '');
        setNumber(raw);
        notify(selected, raw);
    };

    const filtered = search.trim()
        ? COUNTRIES.filter(c =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.dial.includes(search) ||
            c.code.toLowerCase().includes(search.toLowerCase())
          )
        : COUNTRIES;

    return (
        <div className={`phone-input-wrapper${disabled ? ' disabled' : ''}`} ref={dropdownRef}>
            {/* Country Selector Trigger */}
            <button
                type="button"
                className="country-trigger"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                aria-label="Select country code"
            >
                <span className="country-flag">{selected.flag}</span>
                <span className="country-dial">{selected.dial}</span>
                <span className={`chevron${open ? ' open' : ''}`}>▾</span>
            </button>

            <div className="phone-divider" />

            {/* Number Field */}
            <input
                type="tel"
                className="phone-number-input"
                value={number}
                onChange={handleNumberChange}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="tel-national"
            />

            {/* Dropdown */}
            {open && (
                <div className="country-dropdown">
                    <div className="country-search-wrap">
                        <input
                            ref={searchRef}
                            type="text"
                            className="country-search"
                            placeholder="Поиск страны..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <ul className="country-list">
                        {filtered.length === 0 && (
                            <li className="country-no-result">Результатов не найдено</li>
                        )}
                        {filtered.map((c) => (
                            <li
                                key={c.code + c.dial}
                                className={`country-option${c.code === selected.code ? ' active' : ''}`}
                                onClick={() => handleSelect(c)}
                            >
                                <span className="opt-flag">{c.flag}</span>
                                <span className="opt-name">{c.name}</span>
                                <span className="opt-dial">{c.dial}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default PhoneInput;
