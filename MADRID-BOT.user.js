// ==UserScript==
// @name         MADRID BOT
// @namespace    http://tampermonkey.net/
// @version      4.1.1
// @description  Fixed – globalWindow works, console is silent, everything polished
// @author       FIXED
// @match        https://algeria.blsspainglobal.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      api.telegram.org
// @connect      api.mail.tm
// @connect      url5603.blsinternational.com
// @connect      gist.githubusercontent.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @resource     settingsCSS https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css
// @icon         https://cdn.pixabay.com/animation/2022/09/13/17/55/17-55-34-595_512.gif
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    console.log = console.error = console.warn = console.info = () => {};
    const globalWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  // ============================================================
    // RESOURCE BLOCKER
    // ============================================================
    (function initResourceBlocker() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/appointment/livenessrequest') || path.includes('/appointment/payment')) return;

        const BLOCKED = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiny-slider', 'carousel', 'banner', 'analytics', 'favicon', 'flags', 'language', '/assets/videos/', '/assets/images/logo', 'logo.png'];
        const isImportant = el => !!(el?.closest?.('form')) || (el?.outerHTML || '').toLowerCase().includes('captcha');

        const origXHR = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) { if (typeof url === 'string' && BLOCKED.some(k => url.includes(k))) return this.abort(); return origXHR.apply(this, arguments); };
        const origFetch = window.fetch;
        window.fetch = function (...args) { const url = args[0] ? args[0].toString() : ''; if (BLOCKED.some(k => url.includes(k))) return new Promise(() => {}); return origFetch.apply(this, args); };

        const s = document.createElement('style');
        s.textContent = '*{transition:none!important;animation:none!important;scroll-behavior:auto!important;}';
        (document.head || document.documentElement).appendChild(s);

        function cleanup() {
            document.querySelectorAll("link[rel='preload'][as='font']").forEach(el => el.remove());
            document.querySelectorAll("header,footer,video,iframe,.banner,.slider,.tiny-slider,.ads,.social,.breadcrumb,.copyright," +
             "img[src*='logo'],img[src*='flag'],.global-overlay-loader").forEach(el => { if (!isImportant(el)) el.remove(); });
        }

        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => { cleanup(); window.addEventListener('load', cleanup); }) : cleanup();
    })();
    // ============================================================
    // CONFIG CACHE
    // ============================================================
    let _configDirty = false;
    let _configCache = null;
    let _configWriteTimer = null;

    function loadConfig() {
        const saved = localStorage.getItem('anis_config');
        if (!saved) return null;
        try { return JSON.parse(saved); } catch { return null; }
    }

    function _flushConfig() {
        if (_configDirty && _configCache) {
            try { localStorage.setItem('anis_config', JSON.stringify(_configCache)); } catch {}
            _configDirty = false;
        }
    }

    function saveConfig(cfg) {
        _configCache = cfg;
        _configDirty = true;
        clearTimeout(_configWriteTimer);
        _configWriteTimer = setTimeout(_flushConfig, 2000);
    }

    window.addEventListener('beforeunload', _flushConfig);

    // ============================================================
    // SINGLE GLOBAL OBSERVER
    // ============================================================
    const _domCallbacks = new Map();
    function registerDOMCallback(key, fn) { _domCallbacks.set(key, fn); }
    function unregisterDOMCallback(key) { _domCallbacks.delete(key); }

    let _rafPending = false;
    let _globalObserver = null;

    function startGlobalObserver() {
        if (_globalObserver) return;
        _globalObserver = new MutationObserver(() => {
            if (_rafPending) return;
            _rafPending = true;
            requestAnimationFrame(() => {
                _rafPending = false;
                _domCallbacks.forEach(fn => { try { fn(); } catch {} });
            });
        });
        _globalObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    if (document.body) startGlobalObserver();
    else document.addEventListener('DOMContentLoaded', startGlobalObserver, { once: true });

    // ============================================================
    // TELEGRAM
    // ============================================================
    class TelegramSender {
        static async sendMessage(text) {
            try {
                return await new Promise(resolve => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: 'https://api.telegram.org/bot7119126686:AAHLmDqWaqPLC59eKIHeE2avg/sendMessage',
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ chat_id: '-1002760500944', text, parse_mode: 'HTML', disable_web_page_preview: true }),
                        onload: r => resolve(r.status === 200),
                        onerror: () => resolve(false),
                        timeout: 10000
                    });
                });
            } catch { return false; }
        }
    }

    // ============================================================
    // OTP MANAGER
    // ============================================================
    class OTPManager {
        constructor() {
            this.token = null;
            this.intervalId = null;
            this.lastMessageId = null;
        }
        async init() {
            const cfg = config.otpServer;
            if (cfg?.enabled && cfg.email && cfg.password) {
                await this.loginMailTm();
                this.startMonitoring();
            }
        }
        async loginMailTm() {
            try {
                const res = await this._request('POST', 'https://api.mail.tm/token', {
                    address: config.otpServer.email,
                    password: config.otpServer.password
                });
                this.token = res?.token || res?.accessToken || res?.access_token;
            } catch {}
        }
        detectConnectedEmail() {
            try {
                for (const sel of ['.avatar + p.small', '.user-email', '[class*="email"]']) {
                    for (const el of document.querySelectorAll(sel)) {
                        if (el?.textContent?.includes('@')) {
                            const m = el.textContent.trim().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                            if (m) return m[0];
                        }
                    }
                }
                const m = (document.body.textContent || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (m?.length) return m[0];
            } catch {}
            return null;
        }
        async fetchOTP() {
            if (!this.token) return;
            const email = this.detectConnectedEmail();
            if (!email) return;
            try {
                const res = await this._request('GET', 'https://api.mail.tm/messages?sort=-createdAt', null, true);
                const messages = (res?.['hydra:member'] || []).filter(msg =>
                    (msg.from?.name?.includes('BLS') || msg.from?.address?.includes('bls')) &&
                    msg.to?.some(r => r.address === email)
                );
                if (!messages.length) return;
                const latest = messages[0];
                if (latest.id === this.lastMessageId) return;
                this.lastMessageId = latest.id;
                const details = await this._request('GET', `https://api.mail.tm/messages/${latest.id}`, null, true);
                const content = (details?.text || details?.intro || '') + ' ' + (details?.html || '');
                const m = content.match(/\b\d{4,8}\b/) || content.match(/OTP[\s:]*(\d{4,8})/i) || content.match(/Code[\s:]*(\d{4,8})/i);
                if (m) {
                    const otp = m[1] || m[0];
                    try { GM_setValue('anis_otp_value', otp); } catch { localStorage.setItem('anis_otp_value', otp); }
                    this._fillOtpField(otp);
                }
            } catch {}
        }
        _fillOtpField(otp) {
            const field = document.getElementById('EmailCode');
            if (!field) return;
            field.value = otp;
            field.style.border = '2px solid #27ae60';
            setTimeout(() => { field.style.border = ''; }, 1000);
            if (/on|true/.test(config.autoSubmitForms?.applicantSelection)) {
                const delay = config.submitTiming.applicantSelection || 1000;
                setTimeout(() => { document.getElementById('btnSubmit')?.click(); }, delay);
            }
        }
        async _request(method, url, data, useAuth) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method, url,
                    headers: Object.assign(
                        { 'Content-Type': 'application/json' },
                        useAuth && this.token ? { Authorization: `Bearer ${this.token}` } : {}
                    ),
                    data: data ? JSON.stringify(data) : undefined,
                    onload: r => { try { resolve(JSON.parse(r.responseText)); } catch { resolve(r.responseText); } },
                    onerror: reject,
                    timeout: 20000
                });
            });
        }
        startMonitoring() {
            if (this.intervalId) clearInterval(this.intervalId);
            const interval = Math.max(1000, config.otpServer?.checkInterval || 5000);
            this.intervalId = setInterval(() => this.fetchOTP(), interval);
        }
        stopMonitoring() {
            if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
        }
        async testConnection() {
            try {
                await this.loginMailTm();
                return this.token ? { success: true } : { success: false };
            } catch { return { success: false }; }
        }
    }

    // ============================================================
    // CLIENTS (Google Sheets CSV) - fixed
    // ============================================================
    async function loadClientsFromSheet() {
        // If the URL is empty, return empty array (no error)
        const url = '';
        if (!url) return [];
        try {
            const res = await fetch(url);
            const text = await res.text();
            const rows = text.trim().split('\n').map(r => r.split(','));
            const headers = rows.shift().map(h => h.trim().toLowerCase());
            return rows.map(row => {
                const obj = {};
                headers.forEach((h, i) => obj[h] = row[i]?.trim() || '');
                return obj;
            }).filter(c => c.email && c.password);
        } catch { return []; }
    }

    function getVisaSubTypeText(loc, vType, sub) {
        if (loc === 0) {
            if (vType === 0) return 'Oran 1';
            if (vType === 1) return ['Family reunification visa', 'Self Employed residence visa', 'Study visa'][sub] || 'Family reunification visa';
            if (vType === 2) return ['Oran 2', 'Oran 3', 'Oran 4'][sub] || 'Oran 2';
        }
        if (loc === 1) {
            if (vType === 0) return 'ALG 1';
            if (vType === 1) return 'FAMILY GROUP';
            if (vType === 2) return 'Schengen visa (Estonia)';
            if (vType === 3) return ['ALG 2', 'ALG 3', 'ALG 4'][sub] || 'ALG 2';
        }
        return '';
    }

    function getAvailableSubTypesCount(loc, vType) {
        if (loc === 0) { if (vType === 0) return 1; if (vType === 1) return 3; if (vType === 2) return 3; }
        if (loc === 1) { if (vType === 0) return 1; if (vType === 1) return 1; if (vType === 2) return 1; if (vType === 3) return 3; }
        return 1;
    }

    function validateVisaSubType(loc, vType, sub) {
        const max = getAvailableSubTypesCount(loc, vType);
        return (sub >= 0 && sub < max) ? sub : 0;
    }

    function createClientButtons() {
        document.getElementById('client-buttons-container')?.remove();
        const container = document.createElement('div');
        container.id = 'client-buttons-container';
        container.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#3D0C02,#5C1A08);padding:15px 20px;border-radius:25px;z-index:9997;display:flex;flex-direction:column;gap:10px;max-width:95%;box-shadow:0 4px 12px rgba(0,0,0,0.5);border:1px solid rgba(201,133,58,0.4);';
        loadClientsFromSheet().then(clients => {
            if (!clients.length) {
                const msg = document.createElement('div');
                msg.style.cssText = 'color:#F5E6D0;text-align:center;padding:10px;font-size:14px;';
                msg.textContent = 'No client found';
                container.appendChild(msg);
                document.body.appendChild(container);
                return;
            }
            const totalRows = Math.ceil(clients.length / 10);
            for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:nowrap;overflow-x:auto;padding:5px 0;';
                for (let i = rowIdx * 10; i < Math.min(rowIdx * 10 + 10, clients.length); i++) {
                    const client = clients[i];
                    const btn = document.createElement('button');
                    btn.className = 'client-btn';
                    btn.innerHTML = ' ' + client.name;
                    btn.title = 'Email: ' + client.email;
                    btn.addEventListener('click', () => {
                        localStorage.setItem('selected_client', JSON.stringify(client));
                        const locIdx = client.locationIndex !== undefined ? client.locationIndex : config.globalVisaSettings.locationIndex;
                        const typeIdx = client.visaTypeIndex !== undefined ? client.visaTypeIndex : config.globalVisaSettings.visaTypeIndex;
                        let subIdx = validateVisaSubType(locIdx, typeIdx, client.visaSubTypeIndex ?? config.globalVisaSettings.visaSubTypeIndex);
                        config.applicants = [{ name: client.name, mail: client.email, password: client.password, applicantCount: client.applicantCount || 1, categoryIndex: client.categoryIndex ?? config.globalVisaSettings.categoryIndex, locationIndex: locIdx, visaTypeIndex: typeIdx, visaSubTypeIndex: subIdx, clickbtnsubmit: client.clickbtnsubmit ?? true }];
                        saveConfig(config);
                        window.settingsUIInstance?.updateEmailBar();
                        document.querySelectorAll('.client-btn').forEach(b => { b.style.background = 'linear-gradient(90deg,#5C1A08,#8B2500)'; b.classList.remove('selected'); });
                        btn.style.background = 'linear-gradient(90deg,#28a745,#20c997)';
                        btn.classList.add('selected');
                        try { showNotification('Client selected: ' + client.name, 'info'); } catch {}
                    });
                    row.appendChild(btn);
                }
                container.appendChild(row);
            }
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕ Close';
            closeBtn.style.cssText = 'background:linear-gradient(135deg,#8B0000,#C0392B);color:white;border:none;padding:8px 16px;border-radius:15px;cursor:pointer;font-size:12px;font-weight:bold;margin-top:10px;align-self:center;';
            closeBtn.addEventListener('click', () => container.remove());
            container.appendChild(closeBtn);
            document.body.appendChild(container);
            const saved = localStorage.getItem('selected_client');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    document.querySelectorAll('.client-btn').forEach(b => {
                        if (b.innerHTML.includes(parsed.name)) { b.style.background = 'linear-gradient(90deg,#28a745,#20c997)'; b.classList.add('selected'); }
                    });
                } catch {}
            }
        });
    }

    // ============================================================
    // UPDATE CHECK (once per 24h)
    // ============================================================
    function checkForUpdates() {
        const currentVer = GM_info?.script?.version || '0.0.0';
        const lastCheck = parseInt(localStorage.getItem('anis_lastUpdateCheck') || '0', 10);
        if (Date.now() - lastCheck < 86400000) return;
        localStorage.setItem('anis_lastUpdateCheck', String(Date.now()));
        GM_xmlhttpRequest({
            method: 'GET',
            url: '',
            onload(r) {
                try {
                    const m = r.responseText.match(/@version\s+([\d.]+)/);
                    if (!m) return;
                    const remote = m[1].split('.').map(Number);
                    const local = currentVer.split('.').map(Number);
                    let newer = false;
                    for (let i = 0; i < Math.max(remote.length, local.length); i++) {
                        if ((remote[i] || 0) > (local[i] || 0)) { newer = true; break; }
                        if ((remote[i] || 0) < (local[i] || 0)) break;
                    }
                    if (newer) {
                        const n = document.createElement('div');
                        n.style.cssText = 'position:fixed;top:60px;right:10px;background:linear-gradient(135deg,#3D0C02,#5C1A08);color:#F5E6D0;padding:15px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.4);max-width:350px;border-left:5px solid #C9853A;font-family:Arial,sans-serif;';
                        n.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;color:#E8A84E;">Update available (v${m[1]})</div><button id="upd-now-btn" style="background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">Update now</button><button id="upd-later-btn" style="background:transparent;color:#C4A882;border:none;padding:8px 12px;cursor:pointer;font-size:11px;">Later</button>`;
                        document.body.appendChild(n);
                        document.getElementById('upd-now-btn').onclick = () => { window.open('https://gist.githubusercontent.com/blsmetz60-dev/e2560b0a27887f21611d643ea44ee85e/raw/mon_script.user.js'); n.remove(); };
                        document.getElementById('upd-later-btn').onclick = () => { n.remove(); localStorage.setItem('anis_lastUpdateCheck', String(Date.now() - 72000000)); };
                        setTimeout(() => { if (n.isConnected) { n.style.opacity = '0'; setTimeout(() => n.remove(), 500); } }, 30000);
                    }
                } catch {}
            }
        });
    }
    setTimeout(checkForUpdates, 1000);

    // ============================================================
    // DEFAULT CONFIG
    // ============================================================
    const defaultConfig = {
        captcha: { enabled: 'off', apiKey: '' },
        autoSubmitForms: { login: 'on', loginCaptcha: 'on', appointmentCaptcha: 'off', visaType: 'on', slotSelection: 'on', applicantSelection: 'on' },
        submitTiming: { login: 0, loginCaptcha: 0, appointmentCaptcha: 0, visaType: 0, slotSelection: 0, applicantSelection: 0 },
        multiAccount: { enabled: false, currentAccountIndex: 0, accountsFile: null, autoSwitch: true, aliasSwitchEnabled: true },
        globalVisaSettings: { categoryIndex: 0, locationIndex: 0, visaTypeIndex: 1, visaSubTypeIndex: 0, applicantCount: 1, clickbtnsubmit: true },
        applicants: [{ name: '', mail: '', password: '', profilePhotoId: '', applicantCount: 1, categoryIndex: 0, locationIndex: 0, visaTypeIndex: 1, visaSubTypeIndex: 0, clickbtnsubmit: true, surName: '', firstName: '', lastName: '', dateOfBirth: '', passportNumber: '', passportIssueDate: '', passportExpiryDate: '', issuePlace: '', mobile: '', email: '' }],
        otpServer: { enabled: false, email: '', password: '', checkInterval: 5000 },
        settingsVisible: false,
        currentStep: 'Not connected',
        refreshIntervalSeconds: 1
    };

    let config = loadConfig() || defaultConfig;

    function mergeDefaults(target, defaults) {
        for (const key in defaults) {
            if (typeof target[key] === 'undefined') target[key] = defaults[key];
            else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) mergeDefaults(target[key], defaults[key]);
        }
    }
    mergeDefaults(config, defaultConfig);
    _configDirty = false;

    // ============================================================
    // PAGE DETECTION
    // ============================================================
    function detectCurrentPage() {
        if (isDataProtectionPage()) return 'data_protection';
        const p = window.location.pathname;
        if (p.includes('/account/login'))                  return 'login';
        if (p.includes('/newcaptcha/logincaptcha'))        return 'Captcha login';
        if (p.includes('/appointment/appointmentcaptcha')) return 'Captcha';
        if (p.includes('/appointment/visatype'))           return 'Visa type';
        if (p.includes('/appointment/slotSelection'))      return 'Slot Selection';
        if (p.includes('/appointment/ApplicantSelection')) return 'Applicant';
        return 'Navigation';
    }

    function isDataProtectionPage() {
        const el = document.querySelector('p.alert.alert-success.text-center');
        if (!el) return false;
        const t = el.textContent || '';
        return t.includes('Thank you for accepting the data protection information') && t.includes('Kindly open the email');
    }

    function showNotification(message, type = 'info') {
        // show notification but no console logging
        const colors = {
            auto:    { bg: 'linear-gradient(135deg,#3D0C02,#5C1A08)', border: '#C9853A', icon: '' },
            warning: { bg: 'linear-gradient(135deg,#3D0C02,#5C1A08)', border: '#E8A84E', icon: '' },
            info:    { bg: 'linear-gradient(135deg,#3D0C02,#5C1A08)', border: '#C9853A', icon: '' }
        };
        const c = colors[type] || colors.info;
        document.getElementById('bottom-notification')?.remove();
        const n = document.createElement('div');
        n.id = 'bottom-notification';
        n.style.cssText = `position:fixed;bottom:20px;right:20px;background:${c.bg};color:#F5E6D0;padding:15px 20px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.4);max-width:350px;border-left:5px solid ${c.border};font-family:Arial,sans-serif;font-weight:bold;`;
        n.innerHTML = `<div style="display:flex;align-items:center;"><span style="margin-right:10px;font-size:18px;">${c.icon}</span><div style="font-size:14px;">${message}</div></div>`;
        document.body.appendChild(n);
        setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 150); }, 4000);
    }

    function isTooManyRequestsError() {
        return /Too Many Requests|429|Rate Limit|Trop de requ/i.test(document.title || '');
    }

    function isOnImportantPage() {
        return ['/appointment/applicantselection', '/appointment/slotselection', '/appointment/liveness', '/appointment/payment', '/appointment/livenessrequest', '/appointment/livenessresponse']
            .some(p => window.location.pathname.toLowerCase().includes(p));
    }

    // ============================================================
    // AUTO SWITCH ON 429
    // ============================================================
    function setupAutoSwitchOnError() {
        if (isOnImportantPage()) return;
        function checkAndSwitch() {
            if (!config.multiAccount.autoSwitch || isOnImportantPage()) return;
            if (isTooManyRequestsError()) {
                const cur = config.multiAccount.currentAccountIndex || 0;
                if (config.applicants.length > 1) {
                    config.multiAccount.currentAccountIndex = (cur + 1) % config.applicants.length;
                    saveConfig(config);
                    window.settingsUIInstance?.updateEmailBar();
                    showNotification(`Auto switch - Alias ${config.multiAccount.currentAccountIndex + 1}`, 'auto');
                    setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/home/index'; }, 1000);
                } else {
                    showNotification('Only one account available', 'warning');
                }
            }
        }
        registerDOMCallback('autoSwitch429', checkAndSwitch);
        checkAndSwitch();
    }

    // ============================================================
    // DATA PROTECTION HANDLER
    // ============================================================
    class DataProtectionHandler {
        constructor() {
            this.retryDelay = 1000;
            this.keepWaiting = true;
            this.otpManager = window.otpManager || new OTPManager();
        }
        start() {
            if (this.isDataProtectionPage()) this.pollForAcceptanceLink();
            this.checkFinalAcceptancePage();
        }
        isDataProtectionPage() {
            const el = document.querySelector('p.alert.alert-success.text-center');
            if (!el) return false;
            const t = el.textContent || '';
            return t.includes('Thank you for accepting the data protection information') && t.includes('Kindly open the email');
        }
        async pollForAcceptanceLink() {
            this.showStatusMessage('Waiting for BLS email...');
            while (this.keepWaiting) {
                try {
                    const email = this.otpManager.detectConnectedEmail();
                    if (!email) { this.showStatusMessage('Email not found'); return; }
                    const link = await this.findAcceptanceLink(email);
                    if (link) {
                        const clean = this.validateAndCleanUrl(link);
                        if (this.isValidHttpUrl(clean) && clean.includes('blsinternational.com')) {
                            this.showStatusMessage('Link found! Redirecting...');
                            this.keepWaiting = false;
                            setTimeout(() => { window.location.href = clean; }, 1000);
                            return;
                        }
                    } else { this.showStatusMessage('No link found, retrying...'); }
                } catch {}
                await new Promise(r => setTimeout(r, this.retryDelay));
            }
        }
        async findAcceptanceLink(email) {
            try {
                if (!this.otpManager.token) await this.otpManager.loginMailTm();
                const res = await this.otpManager._request('GET', 'https://api.mail.tm/messages?sort=-createdAt', null, true);
                const messages = (res?.['hydra:member'] || []).filter(msg =>
                    (msg.from?.name?.includes('BLS') || msg.from?.address?.includes('bls') || msg.subject?.includes('Data Protection')) &&
                    msg.to?.some(r => r.address === email)
                );
                if (!messages.length) return null;
                const details = await this.otpManager._request('GET', `https://api.mail.tm/messages/${messages[0].id}`, null, true);
                const html = details?.html || '';
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return Array.from(doc.querySelectorAll('a[href]')).find(a => a.href.includes('blsinternational.com') && a.href.includes('upn='))?.href || null;
            } catch { return null; }
        }
        validateAndCleanUrl(url) { let u = url.trim(); if (!u.startsWith('http')) u = 'https://' + u; return u; }
        isValidHttpUrl(url) { try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
        showStatusMessage(msg) {
            let el = document.getElementById('data-protection-status');
            if (!el) {
                el = document.createElement('div');
                el.id = 'data-protection-status';
                el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#3D0C02,#5C1A08);color:#F5E6D0;padding:20px 30px;border-radius:10px;border:2px solid #C9853A;font-size:18px;font-weight:bold;text-align:center;font-family:Arial,sans-serif;z-index:10000;';
                document.body.appendChild(el);
            }
            el.innerHTML = `<div>${msg}</div>`;
        }
        checkFinalAcceptancePage() {
            const el = document.querySelector('p.alert.alert-success');
            if (el?.textContent.includes('Successfully received your data protection information acceptance')) {
                this.showStatusMessage('Acceptance confirmed! Redirecting...');
                setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/appointmentdata/myappointments'; }, 1000);
            }
        }
    }

    // ============================================================
    // REGISTRATION PAGE HANDLER
    // ============================================================
    class RegistrationPageHandler {
        start() {
            setTimeout(() => {
                const idx = config.multiAccount.currentAccountIndex || 0;
                const a = config.applicants[idx] || config.applicants[0];
                if (!a) return;
                try {
                    if (a.surName)            $('#SurName').val(a.surName).trigger('change');
                    if (a.firstName)          $('#FirstName').val(a.firstName).trigger('change');
                    if (a.lastName)           $('#LastName').val(a.lastName).trigger('change');
                    if (a.dateOfBirth)        { $('#DateOfBirth').val(a.dateOfBirth).trigger('change'); $('#DateOfBirth').data('flatpickr')?.setDate(a.dateOfBirth); }
                    if (a.passportNumber)     $('#PassportNumber').val(a.passportNumber).trigger('change');
                    if (a.passportIssueDate)  { $('#PassportIssueDate').val(a.passportIssueDate).trigger('change'); $('#PassportIssueDate').data('flatpickr')?.setDate(a.passportIssueDate); }
                    if (a.passportExpiryDate) { $('#PassportExpiryDate').val(a.passportExpiryDate).trigger('change'); $('#PassportExpiryDate').data('flatpickr')?.setDate(a.passportExpiryDate); }
                    if (a.issuePlace)         $('#IssuePlace').val(a.issuePlace).trigger('change');
                    if (a.mobile)             $('#Mobile').val(a.mobile).trigger('change');
                    if (a.email)              $('#Email').val(a.email).trigger('change');
                } catch {}
                setTimeout(() => {
                    try {
                        const setTS = (sel, text) => { const ts = document.querySelector(sel)?.tomselect; if (ts) { const opt = Object.values(ts.options).find(o => o.text === text); if (opt) ts.setValue(opt.value); } };
                        setTS('#BirthCountry', 'Algeria');
                        setTS('#PassportType', 'Ordinary Passport');
                        setTS('#CountryOfResidence', 'Algeria');
                    } catch {}
                }, 500);
                try { this.handleConsentAndGenerate(); } catch {}
                try { this.watchOtpAndSubmit(); } catch {}
            }, 1000);
        }
        handleConsentAndGenerate() {
            let attempts = 0;
            const iv = setInterval(() => {
                try {
                    document.querySelector('button.btn.btn-success.btn-block[onclick*="onBioDisclaimerAccept"]')?.click();
                    document.querySelector('button.btn.btn-success.btn-block[onclick*="onDpAccept"]')?.click();
                    const gen = document.getElementById('btnGenerate');
                    if (gen && gen.style.display !== 'none' && gen.offsetParent !== null) {
                        gen.click();
                        clearInterval(iv);
                        return;
                    }
                } catch {}
                if (++attempts > 30) clearInterval(iv);
            }, 1000);
        }
        watchOtpAndSubmit() {
            const field = document.getElementById('EmailOtp');
            if (!field) return;
            const obs = new MutationObserver(() => {
                if (field.value?.length >= 6) {
                    const btn = document.getElementById('btnSubmit');
                    if (btn?.style.display !== 'none' && btn?.offsetParent) { try { btn.click(); } catch {} obs.disconnect(); }
                }
            });
            obs.observe(field, { attributes: true, attributeFilter: ['value'] });
            if (field.value?.length >= 6) { try { document.getElementById('btnSubmit')?.click(); } catch {} }
        }
    }

    // ============================================================
    // SETTINGS UI
    // ============================================================
    class SettingsUI {
        constructor() { this.container = null; this.init(); }
        escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }
        renderCreationTab() {
            const idx = config.multiAccount.currentAccountIndex || 0;
            const a = config.applicants[idx] || config.applicants[0] || {};
            const e = this.escapeHtml.bind(this);
            return `
                <div class="form-group"><label>Surname</label><input type="text" id="creation-surName" value="${e(a.surName || '')}"></div>
                <div class="form-group"><label>First Name</label><input type="text" id="creation-firstName" value="${e(a.firstName || '')}"></div>
                <div class="form-group"><label>Last Name</label><input type="text" id="creation-lastName" value="${e(a.lastName || '')}"></div>
                <div class="form-group"><label>Date of Birth (YYYY-MM-DD)</label><input type="text" id="creation-dob" value="${a.dateOfBirth || ''}" placeholder="2025-01-01"></div>
                <div class="form-group"><label>Passport Number</label><input type="text" id="creation-passportNumber" value="${e(a.passportNumber || '')}"></div>
                <div class="form-group"><label>Passport Issue Date (YYYY-MM-DD)</label><input type="text" id="creation-passportIssueDate" value="${a.passportIssueDate || ''}"></div>
                <div class="form-group"><label>Passport Expiry Date (YYYY-MM-DD)</label><input type="text" id="creation-passportExpiryDate" value="${a.passportExpiryDate || ''}"></div>
                <div class="form-group"><label>Place of Issue</label><input type="text" id="creation-issuePlace" value="${e(a.issuePlace || '')}"></div>
                <div class="form-group"><label>Mobile (without leading zero or country code)</label><input type="text" id="creation-mobile" value="${e(a.mobile || '')}"></div>
                <div class="form-group"><label>Email (registration)</label><input type="email" id="creation-email" value="${e(a.email || '')}"></div>
            `;
        }
        init() {
            this.injectStyles();
            this.createSettingsContainer();
            this.createSettingsButton();
            this.createUpdateButton();
            this.createEmailBar();
            this.updateEmailBar();
            if (!config.settingsVisible) this.container.style.display = 'none';
            config.currentStep = detectCurrentPage();
            saveConfig(config);
            window.settingsUIInstance = this;
        }
        createSettingsButton() {
            if (document.getElementById('settings-toggle-button')) return;
            const btn = document.createElement('button');
            btn.id = 'settings-toggle-button';
            btn.innerHTML = '⚙';
            btn.title = 'Settings';
            btn.addEventListener('click', () => this.toggleSettings());
            document.body.appendChild(btn);
        }
        createUpdateButton() {
            if (document.getElementById('update-toggle-button')) return;
            const btn = document.createElement('button');
            btn.id = 'update-toggle-button';
            btn.innerHTML = '';
            btn.style.cssText = 'position:fixed;top:10px;right:54px;z-index:10000;background:transparent;color:#E8A84E;border:none;cursor:pointer;font-size:18px;';
            btn.addEventListener('click', checkForUpdates);
            document.body.appendChild(btn);
        }
        createEmailBar() {
            if (document.getElementById('email-bar')) return;
            const bar = document.createElement('div');
            bar.id = 'email-bar';
            bar.innerHTML = `
                <div class="email-container">
                    <div class="email-left">
                        <div class="client-indicator"><span class="client-label">Client:</span> <span id="client-badge" class="client-badge"></span></div>
                        <div class="email-list-compact" id="email-list-compact">${this.renderAliasItemsCompact()}</div>
                    </div>
                    <div class="email-center">
                        <div class="center-controls">
                            <label style="font-size:12px;color:#E8A84E;margin-right:6px;">Refresh (s):</label>
                            <input id="refresh-interval-input" type="number" min="1" step="1" style="width:56px;padding:4px;border-radius:6px;border:1px solid rgba(201,133,58,0.4);background:rgba(0,0,0,0.2);color:#F5E6D0;font-size:12px;text-align:center;" value="${config.refreshIntervalSeconds}">
                        </div>
                    </div>
                    <div class="email-right">
                        <div class="category-badges" id="category-badges">${this.renderCategoryBadges()}</div>
                        <div id="location-badge" class="location-badge"></div>
                        <div class="version-block">
                            <span style="font-size:12px;color:#E8A84E;margin-right:4px;">v</span>
                            <span id="script-version" style="font-size:12px;font-weight:bold;color:#F5E6D0;margin-right:8px;">${GM_info?.script?.version || '4.1.0'}</span>
                            <button id="check-update-btn" class="btn-mini">Update</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(bar);
            document.getElementById('check-update-btn').addEventListener('click', checkForUpdates);
            document.getElementById('category-badges').addEventListener('click', e => {
                const badge = e.target.closest('.category-badge');
                if (!badge) return;
                const idx = parseInt(badge.dataset.idx, 10);
                if (Number.isFinite(idx)) {
                    config.globalVisaSettings.categoryIndex = idx;
                    config.applicants.forEach(a => a.categoryIndex = idx);
                    saveConfig(config);
                    this.updateCategoryBadges();
                    this._updateClientBadge();
                }
            });
            bar.addEventListener('click', e => {
                const aliasEl = e.target.closest('.alias-item');
                if (!aliasEl) return;
                if (!config.multiAccount.aliasSwitchEnabled) { showNotification('Alias switching disabled', 'warning'); return; }
                const idx = parseInt(aliasEl.dataset.index, 10);
                if (!Number.isFinite(idx)) return;
                config.multiAccount.currentAccountIndex = idx;
                saveConfig(config);
                this.updateEmailBar();
                showNotification('Manual switch - Alias ' + (idx + 1), 'auto');
                setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/account/login'; }, 200);
            });
            document.getElementById('refresh-interval-input').addEventListener('change', e => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 1) val = 1;
                config.refreshIntervalSeconds = val;
                saveConfig(config);
                e.target.value = val;
            });
            this._updateClientBadge();
            this._updateLocationBadge();
            this.updateCategoryBadges();
        }
        renderCategoryBadges() {
            return ['Normal', 'Premium', 'Prime Time'].map((n, i) =>
                `<div class="category-badge ${config.globalVisaSettings.categoryIndex === i ? 'active' : ''}" data-idx="${i}">${n}</div>`
            ).join('');
        }
        updateCategoryBadges() {
            document.getElementById('category-badges')?.querySelectorAll('.category-badge').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.idx, 10) === (config.globalVisaSettings.categoryIndex || 0));
            });
        }
        renderAliasItemsCompact() {
            if (!config.applicants?.length) return '<div class="alias-item">(no accounts)</div>';
            const cur = config.multiAccount?.currentAccountIndex || 0;
            return config.applicants.map((a, i) => {
                const loc = a?.locationIndex !== undefined ? a.locationIndex : config.globalVisaSettings.locationIndex;
                const cls = loc === 1 ? 'alias-alger' : loc === 0 ? 'alias-oran' : 'alias-unknown';
                const dis = !config.multiAccount.aliasSwitchEnabled ? ' style="opacity:0.5;cursor:not-allowed;"' : '';
                return `<div class="email-item alias-item ${cls} ${i === cur ? 'active' : ''}" data-index="${i}"${dis}>Alias ${i + 1}</div>`;
            }).join('');
        }
        _getClientBadgeText() {
            const idx = config.multiAccount?.currentAccountIndex || 0;
            const a = config.applicants?.[idx] || config.applicants?.[0] || null;
            const email = a?.mail?.trim() || `(Alias ${idx + 1})`;
            const loc = a?.locationIndex !== undefined ? a.locationIndex : config.globalVisaSettings.locationIndex;
            const location = loc === 1 ? 'Algiers' : loc === 0 ? 'Oran' : '?';
            const cat = ['Normal', 'Premium', 'Prime Time'][config.globalVisaSettings.categoryIndex] || 'Normal';
            return `${email} - ${location} / ${cat}`;
        }
        _updateClientBadge() { const el = document.getElementById('client-badge'); if (el) el.textContent = this._getClientBadgeText(); }
        _updateLocationBadge() {
            const el = document.getElementById('location-badge');
            if (!el) return;
            const idx = config.multiAccount?.currentAccountIndex || 0;
            const a = config.applicants?.[idx] || config.applicants?.[0] || null;
            const loc = a?.locationIndex !== undefined ? a.locationIndex : config.globalVisaSettings.locationIndex;
            el.style.background = loc === 1 ? 'linear-gradient(90deg,#C9853A,#E8A84E)' : loc === 0 ? 'linear-gradient(90deg,#8B0000,#C0392B)' : 'transparent';
        }
        updateEmailBar() {
            const bar = document.getElementById('email-bar');
            if (!bar) return;
            config.currentStep = detectCurrentPage();
            saveConfig(config);
            this._updateClientBadge();
            this._updateLocationBadge();
            this.updateCategoryBadges();
            const aliasList = bar.querySelector('#email-list-compact');
            if (aliasList) aliasList.innerHTML = this.renderAliasItemsCompact();
            const vEl = document.getElementById('script-version');
            if (vEl) vEl.textContent = GM_info?.script?.version || '4.1.0';
            const rEl = document.getElementById('refresh-interval-input');
            if (rEl) rEl.value = config.refreshIntervalSeconds || 1;
            const creationPane = document.getElementById('creation-tab');
            if (creationPane) creationPane.innerHTML = this.renderCreationTab();
        }
        toggleSettings() {
            config.settingsVisible = !config.settingsVisible;
            saveConfig(config);
            this.container.style.display = config.settingsVisible ? 'block' : 'none';
        }
        injectStyles() {
            GM_addStyle(`
                #settings-container{position:fixed;top:50px;left:50%;transform:translateX(-50%);width:90%;max-width:820px;background:linear-gradient(180deg,#2A0701,#4A1205);padding:16px;box-shadow:0 6px 30px rgba(0,0,0,0.7);z-index:9999;border-radius:12px;max-height:80vh;overflow-y:auto;color:#F5E6D0;border:1px solid rgba(201,133,58,0.3);font-family:Arial,sans-serif;}
                .settings-content h4{color:#E8A84E;}
                .settings-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
                .settings-tab{padding:8px 12px;cursor:pointer;border-radius:8px;background:rgba(201,133,58,0.1);color:#E8A84E;font-weight:600;border:1px solid rgba(201,133,58,0.2);}
                .settings-tab.active{background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border-color:#E8A84E;}
                .settings-pane{display:none;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(201,133,58,0.15);}
                .settings-pane.active{display:block;}
                label{display:block;color:#E8A84E;margin-bottom:6px;font-weight:600;}
                #settings-container input[type="text"],#settings-container input[type="password"],#settings-container input[type="number"],#settings-container select{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(201,133,58,0.3);background:rgba(0,0,0,0.3);color:#F5E6D0;}
                #settings-container .btn{padding:8px 12px;border-radius:8px;cursor:pointer;border:none;font-weight:700;}
                #settings-container .btn-primary{background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;}
                #settings-container .btn-secondary{background:rgba(201,133,58,0.2);color:#E8A84E;border:1px solid rgba(201,133,58,0.4);}
                #settings-container .btn-danger{background:linear-gradient(135deg,#8B0000,#C0392B);color:white;}
                .applicant-item{border:1px solid rgba(201,133,58,0.2);padding:10px;margin-bottom:10px;border-radius:8px;background:rgba(0,0,0,0.2);}
                #settings-toggle-button{position:fixed;top:10px;right:10px;z-index:10000;background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border:none;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;font-weight:bold;}
                .btn-mini{background:linear-gradient(135deg,#5C1A08,#3D0C02);color:#E8A84E;border-radius:6px;padding:5px 8px;border:1px solid rgba(201,133,58,0.4);cursor:pointer;font-size:11px;font-weight:bold;}
                .btn-mini:hover{background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;}
                #email-bar{position:fixed;top:0;left:0;width:100%;background:linear-gradient(90deg,#3D0C02,#6B2010,#C9853A);padding:8px 12px;z-index:9997;box-shadow:0 2px 8px rgba(0,0,0,0.5);color:#F5E6D0;font-family:Arial,sans-serif;}
                .email-container{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:nowrap;}
                .email-left,.email-right{display:flex;align-items:center;gap:10px;flex:none;}
                .email-center{flex:1;display:flex;align-items:center;justify-content:center;}
                .center-controls{display:flex;align-items:center;gap:6px;}
                .client-indicator{background:rgba(0,0,0,0.25);border:1px solid rgba(201,133,58,0.4);padding:5px 10px;border-radius:14px;}
                .client-label{color:#E8A84E;font-size:12px;margin-right:4px;font-weight:bold;}
                .client-badge{color:#F5E6D0;font-weight:700;font-size:12px;}
                .email-list-compact{display:flex;gap:6px;align-items:center;}
                .email-item{padding:5px 10px;border-radius:14px;font-size:12px;border:1px solid transparent;cursor:pointer;font-weight:800;}
                .email-item.active{box-shadow:0 0 0 2px #E8A84E;transform:scale(1.05);}
                .alias-oran{background:linear-gradient(90deg,#8B0000,#C0392B);color:#fff;}
                .alias-alger{background:#F5E6D0;color:#3D0C02;}
                .alias-unknown{background:rgba(255,255,255,0.08);color:#F5E6D0;}
                .category-badges{display:flex;gap:6px;align-items:center;}
                .category-badge{padding:5px 10px;border-radius:14px;background:rgba(201,133,58,0.1);cursor:pointer;font-weight:700;font-size:12px;color:#E8A84E;border:1px solid rgba(201,133,58,0.2);}
                .category-badge.active{background:linear-gradient(90deg,#C9853A,#E8A84E);color:#3D0C02;border-color:#E8A84E;transform:scale(1.05);}
                #location-badge{width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);margin-left:4px;}
                .version-block{display:flex;align-items:center;gap:4px;}
                #client-buttons-container{position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#3D0C02,#5C1A08);padding:15px 20px;border-radius:25px;z-index:9997;display:flex;flex-direction:column;gap:10px;max-width:95%;max-height:80vh;overflow-y:auto;border:1px solid rgba(201,133,58,0.4);}
                .client-btn{background:linear-gradient(90deg,#5C1A08,#8B2500);color:#F5E6D0;border:1px solid rgba(201,133,58,0.3);padding:6px 12px;border-radius:15px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap;min-width:80px;}
                .client-btn:hover{background:linear-gradient(90deg,#C9853A,#E8A84E);color:#3D0C02;}
                .client-btn.selected{background:linear-gradient(90deg,#28a745,#20c997)!important;color:white;}
                #manual-otp-button{background:#000!important;border:1px solid #444!important;color:white!important;font-weight:bold!important;padding:8px 15px!important;border-radius:6px!important;cursor:pointer;margin-left:10px;}
                #manual-otp-button:hover{background:#333!important;}
            `);
        }
        createSettingsContainer() {
            if (this.container) return;
            this.container = document.createElement('div');
            this.container.id = 'settings-container';
            this.container.innerHTML = `
                <div class="settings-content">
                    <div class="settings-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h4 style="margin:0;">⚙ BLS Spain Configuration</h4>
                        <button class="btn btn-secondary" id="close-settings">Close</button>
                    </div>
                    <div class="settings-tabs">
                        <div class="settings-tab active" data-tab="captcha">Captcha</div>
                        <div class="settings-tab" data-tab="auto-submit">Auto Submit</div>
                        <div class="settings-tab" data-tab="applicants">Accounts</div>
                        <div class="settings-tab" data-tab="visa">Settings</div>
                        <div class="settings-tab" data-tab="timing">Timing</div>
                        <div class="settings-tab" data-tab="creation">Creation</div>
                        <div class="settings-tab" data-tab="otp-server">OTP Mail</div>
                    </div>
                    <div class="settings-panes">
                        <div class="settings-pane active" id="captcha-tab">${this.renderCaptchaTab()}</div>
                        <div class="settings-pane" id="auto-submit-tab">${this.renderAutoSubmitTab()}</div>
                        <div class="settings-pane" id="applicants-tab">${this.renderApplicantsTab()}</div>
                        <div class="settings-pane" id="visa-tab">${this.renderVisaTab()}</div>
                        <div class="settings-pane" id="timing-tab">${this.renderTimingTab()}</div>
                        <div class="settings-pane" id="creation-tab">${this.renderCreationTab()}</div>
                        <div class="settings-pane" id="otp-server-tab">${this.renderOTPServerTab()}</div>
                    </div>
                    <div class="settings-actions" style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end;">
                        <button class="btn btn-primary" id="save-settings">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(this.container);
            this.setupEventListeners();
            this.setupTabNavigation();
        }
        renderCaptchaTab() {
            return `<div class="form-group"><label><input type="checkbox" id="captcha-enabled" ${config.captcha.enabled === 'on' ? 'checked' : ''}> Enable Captcha solving</label></div>
                    <div class="form-group"><label>Captcha API Key</label><input type="text" id="captcha-api-key" value="${config.captcha.apiKey || ''}"></div>`;
        }
        renderAutoSubmitTab() {
            const f = config.autoSubmitForms, m = config.multiAccount;
            return `<div class="form-group"><label><input type="checkbox" id="auto-login" ${f.login === 'on' ? 'checked' : ''}> auto-login</label></div>
                    <div class="form-group"><label><input type="checkbox" id="auto-login-captcha" ${f.loginCaptcha === 'on' ? 'checked' : ''}> auto-login-captcha</label></div>
                    <div class="form-group"><label><input type="checkbox" id="auto-appointment-captcha" ${f.appointmentCaptcha === 'on' ? 'checked' : ''}> auto-appointment-captcha</label></div>
                    <div class="form-group"><label><input type="checkbox" id="auto-visa-type" ${f.visaType === 'on' ? 'checked' : ''}> auto-visa-type</label></div>
                    <div class="form-group"><label><input type="checkbox" id="auto-slot-selection" ${f.slotSelection === 'on' ? 'checked' : ''}> auto-slot-selection</label></div>
                    <div class="form-group"><label><input type="checkbox" id="auto-applicant-selection" ${f.applicantSelection === 'on' ? 'checked' : ''}> auto-applicant-selection</label></div>
                    <div class="form-group"><label><input type="checkbox" id="alias-switch-enabled" ${m.aliasSwitchEnabled ? 'checked' : ''}> Enable alias switching by click</label></div>`;
        }
        renderVisaTab() {
            const g = config.globalVisaSettings;
            return `
                <div class="form-group"><label>Category</label>
                    <select id="global-category"><option value="0" ${g.categoryIndex === 0 ? 'selected' : ''}>Normal</option><option value="1" ${g.categoryIndex === 1 ? 'selected' : ''}>Premium</option><option value="2" ${g.categoryIndex === 2 ? 'selected' : ''}>Prime Time</option></select></div>
                <div class="form-group"><label>Location</label>
                    <select id="global-location"><option value="0" ${g.locationIndex === 0 ? 'selected' : ''}>Oran</option><option value="1" ${g.locationIndex === 1 ? 'selected' : ''}>Algiers</option></select></div>
                <div class="form-group"><label>Visa Type</label>
                    <select id="global-visa-type">${this.renderVisaTypeOptionsForLocation(g.locationIndex, g.visaTypeIndex)}</select></div>
                <div class="form-group"><label>Visa Subtype</label>
                    <select id="global-visa-subtype">${this.renderGlobalVisaSubTypeOptions()}</select></div>
                <div class="form-group"><label>Number of applicants</label>
                    <input type="number" id="global-applicant-count" value="${g.applicantCount || 1}" min="1"></div>
                <div class="form-group"><label><input type="checkbox" id="global-click-submit" ${g.clickbtnsubmit ? 'checked' : ''}> Click on submit button</label></div>`;
        }
        renderVisaTypeOptionsForLocation(l, sv) {
            if (l === 0) return `<option value="0" ${sv === 0 ? 'selected' : ''}>First application / première demande</option><option value="1" ${sv === 1 ? 'selected' : ''}>National Visa</option><option value="2" ${sv === 2 ? 'selected' : ''}>Visa renewal</option>`;
            if (l === 1) return `<option value="0" ${sv === 0 ? 'selected' : ''}>First application / première demande</option><option value="1" ${sv === 1 ? 'selected' : ''}>Schengen Visa</option><option value="2" ${sv === 2 ? 'selected' : ''}>Schengen visa (Estonia)</option><option value="3" ${sv === 3 ? 'selected' : ''}>Visa renewal</option>`;
            return '';
        }
        renderGlobalVisaSubTypeOptions() {
            const v = config.globalVisaSettings.visaTypeIndex, l = config.globalVisaSettings.locationIndex, s = config.globalVisaSettings.visaSubTypeIndex;
            return this.renderGlobalVisaSubTypeOptionsForValues(l, v, s);
        }
        renderGlobalVisaSubTypeOptionsForValues(l, v, s = 0) {
            if (l === 0) {
                if (v === 0) return '<option value="0">Oran 1</option>';
                if (v === 1) return `<option value="0" ${s === 0 ? 'selected' : ''}>Family reunification visa</option><option value="1" ${s === 1 ? 'selected' : ''}>Self Employed residence visa</option><option value="2" ${s === 2 ? 'selected' : ''}>Study visa</option>`;
                if (v === 2) return `<option value="0" ${s === 0 ? 'selected' : ''}>Oran 2</option><option value="1" ${s === 1 ? 'selected' : ''}>Oran 3</option><option value="2" ${s === 2 ? 'selected' : ''}>Oran 4</option>`;
            }
            if (l === 1) {
                if (v === 0) return '<option value="0">ALG 1</option>';
                if (v === 1) return '<option value="0">FAMILY GROUP</option>';
                if (v === 2) return '<option value="0">Schengen visa (Estonia)</option>';
                if (v === 3) return `<option value="0" ${s === 0 ? 'selected' : ''}>ALG 2</option><option value="1" ${s === 1 ? 'selected' : ''}>ALG 3</option><option value="2" ${s === 2 ? 'selected' : ''}>ALG 4</option>`;
            }
            return '';
        }
        renderTimingTab() {
            const t = config.submitTiming;
            return `<div class="timing-section"><h5 style="color:#E8A84E;">Submission timing (ms)</h5>
                    <div class="form-group"><label>Login</label><input type="number" id="timing-login" value="${t.login || 0}" min="0"></div>
                    <div class="form-group"><label>Login Captcha</label><input type="number" id="timing-login-captcha" value="${t.loginCaptcha || 0}" min="0"></div>
                    <div class="form-group"><label>Appointment Captcha</label><input type="number" id="timing-appointment-captcha" value="${t.appointmentCaptcha || 0}" min="0"></div>
                    <div class="form-group"><label>Visa Type</label><input type="number" id="timing-visa-type" value="${t.visaType || 0}" min="0"></div>
                    <div class="form-group"><label>Slot Selection</label><input type="number" id="timing-slot-selection" value="${t.slotSelection || 0}" min="0"></div>
                    <div class="form-group"><label>Applicant Selection</label><input type="number" id="timing-applicant-selection" value="${t.applicantSelection || 0}" min="0"></div></div>`;
        }
        renderApplicantsTab() {
            const m = config.multiAccount;
            let html = `<div class="form-group mb-3"><label><input type="checkbox" id="multi-account-enabled" ${m.enabled ? 'checked' : ''}> Enable multiple accounts</label></div>
                        <div class="form-group mb-3"><label><input type="checkbox" id="alias-switch-enabled-tab2" ${m.aliasSwitchEnabled ? 'checked' : ''}> Enable alias switching by click</label></div>
                        <div class="form-group mb-3"><label>Load accounts file (txt)</label><input type="file" id="accounts-file" accept=".txt"><small style="color:#C4A882;">Format: email,password (one account per line)</small></div>
                        <div id="applicants-list">`;
            config.applicants.forEach((a, idx) => {
                html += `<div class="applicant-item" data-index="${idx}"><h5 style="margin:0 0 8px 0;color:#E8A84E;">Account #${idx + 1}</h5>
                            <div class="form-group"><label>Name</label><input type="text" id="applicant-name-${idx}" value="${a.name || ''}"></div>
                            <div class="form-group"><label>Email</label><input type="text" id="applicant-mail-${idx}" value="${a.mail || ''}"></div>
                            <div class="form-group"><label>Password</label><input type="password" id="applicant-password-${idx}" value="${a.password || ''}"></div>
                            <button class="btn btn-danger remove-applicant" data-index="${idx}">Delete</button></div>`;
            });
            return html + '</div><div style="margin-top:8px;"><button class="btn btn-primary add-applicant">Add account</button></div>';
        }
        renderOTPServerTab() {
            const o = config.otpServer || {};
            return `
                <div class="form-group"><label><input type="checkbox" id="otp-server-enabled" ${o.enabled ? 'checked' : ''}> Enable Mail.tm for OTP</label></div>
                <div class="form-group"><label>Mail.tm Address</label><input type="text" id="otp-server-email" value="${o.email || ''}" placeholder="ex: myaccount@mail.tm"></div>
                <div class="form-group"><label>Mail.tm Password</label><input type="password" id="otp-server-password" value="${o.password || ''}"></div>
                <div class="form-group"><label>Check interval (ms, min 1000)</label><input type="number" id="otp-check-interval" value="${o.checkInterval || 5000}" min="1000" step="1000"></div>
                <div class="form-group"><button class="btn btn-secondary" id="test-otp-connection">Test Mail.tm connection</button> <span id="test-result" style="margin-left:10px;"></span></div>
            `;
        }
        setupEventListeners() {
            this.container.querySelector('#save-settings').addEventListener('click', () => { this.saveSettings(); this.showNotification('Configuration saved!'); });
            this.container.querySelector('#close-settings').addEventListener('click', () => this.toggleSettings());
            this.container.querySelector('.add-applicant')?.addEventListener('click', () => {
                config.applicants.push({ name: '', mail: '', password: '', profilePhotoId: '', applicantCount: config.globalVisaSettings.applicantCount, categoryIndex: config.globalVisaSettings.categoryIndex, locationIndex: config.globalVisaSettings.locationIndex, visaTypeIndex: config.globalVisaSettings.visaTypeIndex, visaSubTypeIndex: config.globalVisaSettings.visaSubTypeIndex, clickbtnsubmit: config.globalVisaSettings.clickbtnsubmit, surName: '', firstName: '', lastName: '', dateOfBirth: '', passportNumber: '', passportIssueDate: '', passportExpiryDate: '', issuePlace: '', mobile: '', email: '' });
                this.refreshApplicantsTab(); saveConfig(config); this.updateEmailBar();
            });
            this.container.addEventListener('click', e => {
                if (e.target.classList.contains('remove-applicant')) { config.applicants.splice(parseInt(e.target.dataset.index, 10), 1); this.refreshApplicantsTab(); saveConfig(config); this.updateEmailBar(); }
            });
            this.container.querySelector('#accounts-file')?.addEventListener('change', e => { if (e.target.files[0]) this.parseAccountsFile(e.target.files[0]); });
            this.container.addEventListener('change', e => {
                if (e.target.id === 'alias-switch-enabled' || e.target.id === 'alias-switch-enabled-tab2') {
                    config.multiAccount.aliasSwitchEnabled = e.target.checked; saveConfig(config); this.updateEmailBar();
                } else if (e.target.id === 'global-location' || e.target.id === 'global-visa-type') {
                    const l = parseInt(this.container.querySelector('#global-location').value, 10);
                    const v = parseInt(this.container.querySelector('#global-visa-type').value, 10);
                    this.container.querySelector('#global-visa-subtype').innerHTML = this.renderGlobalVisaSubTypeOptionsForValues(l, v);
                } else if (e.target.id === 'global-category') {
                    const idx = parseInt(e.target.value, 10); config.globalVisaSettings.categoryIndex = idx; config.applicants.forEach(a => a.categoryIndex = idx); saveConfig(config); this.updateCategoryBadges(); this.updateEmailBar();
                }
            });
            this.container.querySelector('#test-otp-connection')?.addEventListener('click', async () => {
                const res = document.getElementById('test-result');
                res.textContent = 'Testing...'; res.style.color = 'yellow';
                const mgr = new OTPManager(); const r = await mgr.testConnection();
                res.textContent = r.success ? '✓ Connection successful' : '✗ Connection failed';
                res.style.color = r.success ? 'lightgreen' : 'salmon';
            });
        }
        parseAccountsFile(file) {
            const reader = new FileReader();
            reader.onload = e => {
                const accounts = e.target.result.split('\n').filter(l => l.trim()).map(line => {
                    const parts = line.trim().split(',');
                    if (parts.length < 2) return null;
                    return { name: parts[0] || '', mail: parts[0], password: parts[1], profilePhotoId: '', applicantCount: config.globalVisaSettings.applicantCount, categoryIndex: config.globalVisaSettings.categoryIndex, locationIndex: config.globalVisaSettings.locationIndex, visaTypeIndex: config.globalVisaSettings.visaTypeIndex, visaSubTypeIndex: config.globalVisaSettings.visaSubTypeIndex, clickbtnsubmit: config.globalVisaSettings.clickbtnsubmit, surName: '', firstName: '', lastName: '', dateOfBirth: '', passportNumber: '', passportIssueDate: '', passportExpiryDate: '', issuePlace: '', mobile: '', email: '' };
                }).filter(Boolean);
                if (accounts.length > 0) { config.applicants = accounts; saveConfig(config); this.refreshApplicantsTab(); this.updateEmailBar(); this.showNotification(accounts.length + ' accounts loaded'); }
            };
            reader.readAsText(file);
        }
        setupTabNavigation() {
            this.container.querySelectorAll('.settings-tab').forEach(tab => {
                tab.addEventListener('click', e => {
                    e.preventDefault();
                    this.container.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
                    this.container.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    this.container.querySelector('#' + e.target.dataset.tab + '-tab')?.classList.add('active');
                });
            });
        }
        refreshApplicantsTab() {
            const tab = this.container.querySelector('#applicants-tab');
            if (tab) { tab.innerHTML = this.renderApplicantsTab(); this.setupEventListeners(); }
        }
        showNotification(msg) {
            const n = document.createElement('div');
            Object.assign(n.style, { position: 'fixed', bottom: '20px', right: '20px', background: 'linear-gradient(135deg,#3D0C02,#5C1A08)', color: '#F5E6D0', padding: '12px 16px', borderRadius: '8px', zIndex: '999999', borderLeft: '4px solid #C9853A' });
            n.textContent = msg; document.body.appendChild(n);
            setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 150); }, 1000);
        }
        saveSettings() {
            const q = id => this.container.querySelector(id);
            config.captcha.enabled = q('#captcha-enabled').checked ? 'on' : 'off';
            config.captcha.apiKey = q('#captcha-api-key').value;
            config.autoSubmitForms.login = q('#auto-login').checked ? 'on' : 'off';
            config.autoSubmitForms.loginCaptcha = q('#auto-login-captcha').checked ? 'on' : 'off';
            config.autoSubmitForms.appointmentCaptcha = q('#auto-appointment-captcha').checked ? 'on' : 'off';
            config.autoSubmitForms.visaType = q('#auto-visa-type').checked ? 'on' : 'off';
            config.autoSubmitForms.slotSelection = q('#auto-slot-selection').checked ? 'on' : 'off';
            config.autoSubmitForms.applicantSelection = q('#auto-applicant-selection').checked ? 'on' : 'off';
            const ae1 = q('#alias-switch-enabled'), ae2 = q('#alias-switch-enabled-tab2');
            if (ae1) config.multiAccount.aliasSwitchEnabled = ae1.checked; else if (ae2) config.multiAccount.aliasSwitchEnabled = ae2.checked;
            config.multiAccount.autoSwitch = !!q('#multi-account-enabled').checked;
            config.multiAccount.enabled = !!q('#multi-account-enabled').checked;
            config.submitTiming.login = parseInt(q('#timing-login').value) || 0;
            config.submitTiming.loginCaptcha = parseInt(q('#timing-login-captcha').value) || 0;
            config.submitTiming.appointmentCaptcha = parseInt(q('#timing-appointment-captcha').value) || 0;
            config.submitTiming.visaType = parseInt(q('#timing-visa-type').value) || 0;
            config.submitTiming.slotSelection = parseInt(q('#timing-slot-selection').value) || 0;
            config.submitTiming.applicantSelection = parseInt(q('#timing-applicant-selection').value) || 0;
            config.globalVisaSettings.categoryIndex = parseInt(q('#global-category').value) || 0;
            config.globalVisaSettings.locationIndex = parseInt(q('#global-location').value) || 0;
            config.globalVisaSettings.visaTypeIndex = parseInt(q('#global-visa-type').value) || 0;
            config.globalVisaSettings.visaSubTypeIndex = parseInt(q('#global-visa-subtype').value) || 0;
            config.globalVisaSettings.applicantCount = parseInt(q('#global-applicant-count').value) || 1;
            config.globalVisaSettings.clickbtnsubmit = q('#global-click-submit').checked;
            config.otpServer.enabled = q('#otp-server-enabled').checked;
            config.otpServer.email = q('#otp-server-email').value;
            config.otpServer.password = q('#otp-server-password').value;
            config.otpServer.checkInterval = Math.max(1000, parseInt(q('#otp-check-interval').value) || 1000);
            const curIdx = config.multiAccount.currentAccountIndex || 0;
            if (config.applicants[curIdx]) {
                config.applicants[curIdx].surName = document.getElementById('creation-surName')?.value || '';
                config.applicants[curIdx].firstName = document.getElementById('creation-firstName')?.value || '';
                config.applicants[curIdx].lastName = document.getElementById('creation-lastName')?.value || '';
                config.applicants[curIdx].dateOfBirth = document.getElementById('creation-dob')?.value || '';
                config.applicants[curIdx].passportNumber = document.getElementById('creation-passportNumber')?.value || '';
                config.applicants[curIdx].passportIssueDate = document.getElementById('creation-passportIssueDate')?.value || '';
                config.applicants[curIdx].passportExpiryDate = document.getElementById('creation-passportExpiryDate')?.value || '';
                config.applicants[curIdx].issuePlace = document.getElementById('creation-issuePlace')?.value || '';
                config.applicants[curIdx].mobile = document.getElementById('creation-mobile')?.value || '';
                config.applicants[curIdx].email = document.getElementById('creation-email')?.value || '';
            }
            const newApplicants = [];
            this.container.querySelectorAll('.applicant-item').forEach(item => {
                const i = parseInt(item.dataset.index, 10);
                const old = config.applicants[i] || {};
                newApplicants.push({ name: q(`#applicant-name-${i}`)?.value || '', mail: q(`#applicant-mail-${i}`)?.value || '', password: q(`#applicant-password-${i}`)?.value || '', profilePhotoId: old.profilePhotoId || '', applicantCount: config.globalVisaSettings.applicantCount, categoryIndex: config.globalVisaSettings.categoryIndex, locationIndex: config.globalVisaSettings.locationIndex, visaTypeIndex: config.globalVisaSettings.visaTypeIndex, visaSubTypeIndex: config.globalVisaSettings.visaSubTypeIndex, clickbtnsubmit: config.globalVisaSettings.clickbtnsubmit, surName: old.surName || '', firstName: old.firstName || '', lastName: old.lastName || '', dateOfBirth: old.dateOfBirth || '', passportNumber: old.passportNumber || '', passportIssueDate: old.passportIssueDate || '', passportExpiryDate: old.passportExpiryDate || '', issuePlace: old.issuePlace || '', mobile: old.mobile || '', email: old.email || '' });
            });
            if (newApplicants.length > 0) config.applicants = newApplicants;
            saveConfig(config);
            this.updateEmailBar();
            if (window.otpManager) { window.otpManager.stopMonitoring(); }
            if (config.otpServer.enabled) { window.otpManager = new OTPManager(); try { window.otpManager.init(); } catch {} }
            config.settingsVisible = false;
            if (this.container) this.container.style.display = 'none';
            setTimeout(() => {
                if (confirm('Data saved. Do you want to open the registration page and auto-fill?')) {
                    window.location.href = 'https://algeria.blsspainglobal.com/dza/account/login';
                }
            }, 500);
        }
    }

    // ============================================================
    // LOGIN PAGE HANDLER
    // ============================================================
    class LoginPageHandler {
        start() {
            try { $('.preloader').hide(); } catch {}
            try { $('#ReturnUrl').val($('.new-app-active').attr('href')); } catch {}
            try {
                const idx = config.multiAccount.currentAccountIndex || 0;
                const a = config.applicants[idx] || {};
                if (!a.mail?.trim()) return;
                $(":text[name]:visible").val(a.mail);
                if (/on|true/.test(config.autoSubmitForms?.login)) {
                    setTimeout(() => { const b = $('#btnVerify'); if (b?.length) b.trigger('click'); }, config.submitTiming.login || 0);
                }
            } catch {}
        }
    }

    // ============================================================
    // LOGIN CAPTCHA HANDLER
    // ============================================================
   class LoginCaptchaHandler {
        start() {
            try { $('<button class="btn btn-secondary position-absolute" onclick="window.HideLoader();" style="top:50%;margin-inline-start:50%;transform:translate(-50%,calc(100% + 1rem));">Hide Loader</button>').appendTo('.global-overlay-loader'); $('.global-overlay').css('background-color','rgba(0 0 0 / 30%)'); } catch {}
            try { $('.entry-disabled:visible').off('copy paste'); } catch {}
            const applicant = this.getActiveApplicant();
            try { if (applicant?.name) document.title=applicant.name; } catch {}
            try { if (applicant?.password) $(':password:visible').val(applicant.password); } catch {}
            this.solveCaptcha();
        }

        getActiveApplicant() {
            try { const email=$(":contains(Email:) > b").text(); return config.applicants.find(({mail})=>mail===email); } catch { return null; }
        }

        solveCaptcha() {
            try {
                if (!(/on|true/.test(config.captcha.enabled)&&config.captcha.apiKey)) return;
                const target = $('.box-label').sort((a,b)=>getComputedStyle(b).zIndex-getComputedStyle(a).zIndex).first().text().replace(/\D+/,'');
                const grid   = Array.from((document.querySelector('.main-div-container')||document.body).querySelectorAll('.captcha-img')).slice(0,9).map(el=>el instanceof HTMLImageElement?el:el.querySelector('img')).filter(Boolean);
                $.post({
                    url:'https://backup1.nocaptchaai.com/solve', headers:{apiKey:config.captcha.apiKey},
                    contentType:'application/json', dataType:'json',
                    data:JSON.stringify({method:'ocr',id:'algeria',images:Object.fromEntries(grid.map(i=>i.src).entries())}),
                    timeout:30000,
                    beforeSend:function(){this._loading=$('<div class="d-flex align-items-center justify-content-center lead text-warning"><span class="spinner-grow"></span>&nbsp;Solving captcha ...</div>').prependTo('.main-div-container');},
                    complete:function(xhr,status){
    this._loading?.remove();
    if(status==='success'&&xhr.responseJSON?.status==='solved'){
        Object.entries(xhr.responseJSON.solution).forEach(([i,v])=>{if(v===target)grid[i].click();});
        if(/on|true/.test(config.autoSubmitForms?.loginCaptcha)){setTimeout(()=>$('#btnVerify').trigger('click'),config.submitTiming.loginCaptcha||0);}
   } else {
        setTimeout(() => { location.reload(); }, 1000);
    }
}
                });
            } catch {}
        }
    }
    // ============================================================
    // APPOINTMENT CAPTCHA HANDLER
    // ============================================================
   class AppointmentCaptchaHandler {
        start() {
            try { $('.preloader').hide(); } catch {}
            try { $('<button class="btn btn-secondary position-absolute top-50 start-50 translate-middle-x mt-5" onclick="window.HideLoader();">Hide Loader</button>').appendTo('.global-overlay-loader'); } catch {}
            try {
                if (!(/on|true/.test(config.captcha.enabled)&&config.captcha.apiKey)) return;
                const target = $('.box-label').first().text().replace(/\D+/,'');
                const grid   = Array.from((document.querySelector('.main-div-container')||document.body).querySelectorAll('.captcha-img')).slice(0,9).map(el=>el instanceof HTMLImageElement?el:el.querySelector('img')).filter(Boolean);
                if (!grid.length) return;
                $.post({
                    url:'https://backup1.nocaptchaai.com/solve', headers:{apiKey:config.captcha.apiKey},
                    contentType:'application/json', dataType:'json',
                    data:JSON.stringify({method:'ocr',id:'algeria',images:Object.fromEntries(grid.map(i=>i.src).entries())}),
                    timeout:30000,
                    complete:(xhr,status)=>{
                        if(status==='success'&&xhr.responseJSON?.status==='solved'){
                            Object.entries(xhr.responseJSON.solution).forEach(([i,v])=>{if(v===target)grid[i].click();});
                            if(/on|true/.test(config.autoSubmitForms?.appointmentCaptcha)){setTimeout(()=>$('#btnVerify').trigger('click'),config.submitTiming.appointmentCaptcha||0);}
                        }
                    }
                });
            } catch {}
        }
    }

    // ============================================================
    // VISA TYPE HANDLER (FIXED)
    // ============================================================
    class VisaTypeHandler {
        #applicant;
        start() {
            try { $('.preloader').hide(); } catch {}
            const emailOnPage = $('.avatar + > p.small').text();
            this.#applicant = config.applicants.find(({ mail }) => mail === emailOnPage) || config.applicants[config.multiAccount.currentAccountIndex || 0];
            if (this.#applicant) this.fillForm();
        }
        async fillForm() {
            const a = this.#applicant;
            if (!a) return;
            let { categoryIndex, locationIndex, visaTypeIndex, visaSubTypeIndex, applicantCount, clickbtnsubmit } = a;
            visaSubTypeIndex = validateVisaSubType(locationIndex, visaTypeIndex, visaSubTypeIndex);
            const targetSubTypeText = getVisaSubTypeText(locationIndex, visaTypeIndex, visaSubTypeIndex);
            let catDD, locDD, visaTypeDD, visaSubDD, membersDD;
            document.querySelectorAll('form .mb-3').forEach(section => {
                if (window.getComputedStyle(section).display === 'none') return;
                const label = section.querySelector('label'), select = section.querySelector('select');
                if (!label || !select) return;
                const t = label.textContent.trim();
                if (t.includes('Category')) catDD = { dropdown: select };
                else if (t.includes('Location')) locDD = { dropdown: select };
                else if (t.includes('Visa Type')) visaTypeDD = { dropdown: select };
                else if (t.includes('Visa Sub')) visaSubDD = { dropdown: select };
                else if (t.includes('Number Of')) membersDD = { dropdown: select };
            });
            const selectOptionByText = (el, text) => new Promise(resolve => {
                if (!el) return resolve();
                const ts = el.tomselect;
                if (ts) { const opt = Object.values(ts.options).find(o => o.text.trim() === text || o.text.includes(text)); if (opt) { ts.setValue(opt.value); ts.trigger('change'); } }
                else if (el.options) { for (let i = 0; i < el.options.length; i++) { if (el.options[i].text.trim() === text || el.options[i].text.includes(text)) { el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true })); break; } } }
                resolve();
            });
            const setByIndex = (dd, idx) => {
                if (!dd) return;
                const ts = dd.dropdown.tomselect;
                if (ts) { const keys = Object.keys(ts.options); if (keys[idx] !== undefined) ts.setValue(keys[idx]); }
                else if (dd.dropdown.options?.[idx]) { dd.dropdown.selectedIndex = idx; dd.dropdown.dispatchEvent(new Event('change', { bubbles: true })); }
            };
            setByIndex(catDD, categoryIndex);
            setByIndex(locDD, locationIndex);
            setByIndex(visaTypeDD, visaTypeIndex);
            await new Promise(r => setTimeout(r, 30));
            if (visaSubDD && targetSubTypeText) await selectOptionByText(visaSubDD.dropdown, targetSubTypeText);
            const type = applicantCount > 1 ? 'Family' : 'Individual';
            $('#AppointmentFor').val(type);
            const radio = $(`:radio:visible`).filter(`[value="${type}"]`).prop('checked', true);
            // FIXED: safe access to globalWindow.applicantsNoData
            if (type === 'Family') {
                try {
                    const id = radio.prop('id').substring(type.length);
                    const val = (globalWindow.applicantsNoData?.find(x => x.Name.startsWith(applicantCount))?.Value) || applicantCount;
                    $('#members' + id).show().children(':text').val(val);
                } catch (e) {
                    // silently fallback
                }
            }
            if (applicantCount > 1 && membersDD) setByIndex(membersDD, applicantCount - 2);
            const submitBtn = document.querySelector('#btnSubmit');
            if (/on|true/.test(config.autoSubmitForms?.visaType) && submitBtn && clickbtnsubmit) {
                setTimeout(() => {
                    try {
                        const r = OnSubmitVisaType.call(submitBtn);
                        if (r !== false) { const f = submitBtn.form || submitBtn.closest('form'); if (f) { f.action = '/dza/appointment/appointmentcaptcha'; f.submit(); } }
                    } catch {}
                }, config.submitTiming.visaType || 0);
            }
        }
    }

    // ============================================================
    // APPLICANT SELECTION HANDLER
    // ============================================================
    class ApplicantSelectionHandler {
        start() {
            try { $('.modal:not(#logoutModal)').on('show.bs.modal', e => e.preventDefault()); } catch {}
            try { $('.preloader').hide(); } catch {}
            const applicant = this._getActiveApplicant();
            try { if (applicant?.profilePhotoId) { $('#ApplicantPhotoId').val(applicant.profilePhotoId); $('#uploadfile-1-preview').attr('src', '/dza/query/getfile?fileid=' + applicant.profilePhotoId); } } catch {}
            try { $('div[id^=app-]').first().trigger('click'); } catch {}
            try {
                const d = new Date(); d.setMonth(d.getMonth() + 1);
                const travelInput = document.getElementById('TravelDate');
                if (travelInput) {
                    if (travelInput._flatpickr) travelInput._flatpickr.setDate(d, true);
                    else { travelInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; travelInput.dispatchEvent(new Event('change', { bubbles: true })); }
                }
                $('#EmailCode').prop('oncopy', null).prop('onpaste', null);
            } catch {}
            this.injectOtpButton();
            this.startOtpMonitoring();
            this.sendTelegramNotification();
        }
        injectOtpButton() {
            const deadline = Date.now() + 10000;
            const iv = setInterval(() => {
                const field = document.getElementById('EmailCode');
                if (field && !document.getElementById('manual-otp-button')) {
                    clearInterval(iv);
                    const btn = document.createElement('button');
                    btn.id = 'manual-otp-button';
                    btn.type = 'button';
                    btn.innerHTML = 'Get OTP';
                    btn.addEventListener('click', () => this.manualGetOtp());
                    field.parentNode.insertBefore(btn, field.nextSibling);
                    return;
                }
                if (Date.now() > deadline) clearInterval(iv);
            }, 500);
        }
        manualGetOtp() {
            if (!config.otpServer?.enabled || !config.otpServer?.email || !config.otpServer?.password) {
                showNotification('OTP server not configured', 'warning'); return;
            }
            const btn = document.getElementById('manual-otp-button');
            const orig = btn.innerHTML;
            btn.innerHTML = 'Searching...'; btn.disabled = true;
            (async () => {
                try {
                    const mgr = window.otpManager || new OTPManager();
                    if (!mgr.token) await mgr.loginMailTm();
                    await mgr.fetchOTP();
                    let otp = '';
                    try { otp = GM_getValue('anis_otp_value', ''); } catch { otp = localStorage.getItem('anis_otp_value') || ''; }
                    if (otp) { btn.innerHTML = 'OTP: ' + otp; showNotification('OTP found: ' + otp, 'info'); }
                    else { btn.innerHTML = orig; btn.disabled = false; showNotification('OTP not found', 'warning'); }
                } catch { btn.innerHTML = orig; btn.disabled = false; }
            })();
        }
        startOtpMonitoring() {
            if (config.otpServer?.enabled && config.otpServer?.email && config.otpServer?.password) {
                window.otpManager = window.otpManager || new OTPManager();
                try { window.otpManager.init(); } catch {}
            }
        }
        _getActiveApplicant() {
            try { const e = $('.avatar + p.small').text(); return config.applicants.find(({ mail }) => mail === e); } catch { return null; }
        }
        sendTelegramNotification() {
            try {
                const a = this._getActiveApplicant() || config.applicants[config.multiAccount.currentAccountIndex || 0];
                if (!a) return;
                const loc = ['Oran', 'Algiers'][a.locationIndex] || 'Unknown';
                const cat = ['Normal', 'Premium', 'Prime Time'][a.categoryIndex] || 'Unknown';
                let date = 'Not specified';
                for (const inp of document.querySelectorAll('.flatpickr-input, input[type="date"]')) { if (inp.value) { date = inp.value; break; } }
                TelegramSender.sendMessage(`<b>APPLICANT SELECTION DETECTED</b>\n\n<b>Center:</b> ${loc}\n<b>Category:</b> ${cat}\n<b>Applicants:</b> ${a.applicantCount || 1}\n<b>Date:</b> ${date}\n\n<i>${new Date().toLocaleString()}</i>`);
            } catch {}
        }
    }

    // ============================================================
    // DATA PROTECTION CHECK (final acceptance)
    // ============================================================
    (function checkDataProtectionAcceptance() {
        const el = document.querySelector('p.alert.alert-success');
        if (el?.textContent.includes('Successfully received your data protection information acceptance')) {
            setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/appointmentdata/myappointments'; }, 1000);
        }
    })();

    // ============================================================
    // INIT: Client button in email bar
    // ============================================================
    (function initClientButtons() {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initClientButtons, { once: true }); return; }
        setTimeout(() => {
            const bar = document.getElementById('email-bar');
            if (bar) {
                const btn = document.createElement('button');
                btn.innerHTML = ' Clients';
                btn.style.cssText = 'background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border:none;padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;font-weight:bold;margin-left:8px;';
                btn.addEventListener('click', () => createClientButtons());
                bar.querySelector('.email-right')?.appendChild(btn);
            }
        }, 5000);
    })();

    const settingsUI = new SettingsUI();

    // ============================================================
    // Page Error Handler
    // ============================================================
    (function handlePageErrors() {
        window.addEventListener('load', () => {
            const h5 = document.querySelector('h5');
            if (h5?.textContent.includes("We're sorry, something went wrong")) {
                setTimeout(() => window.history.back(), 200);
            }
        }, { once: true });
        if (location.hostname === 'algeria.blsspainglobal.com') {
            const importantPaths = ['/appointment/applicantselection', '/appointment/slotselection', '/appointment/liveness', '/appointment/payment'];
            const isImportant = importantPaths.some(p => location.pathname.toLowerCase().includes(p));
            function checkErrors() {
    try {
        if (document.body.innerHTML.trim() === '' || document.body.childElementCount === 0) {
            setTimeout(() => window.location.reload(true), 1000);
            return;
        }
        let hasError = false;
                    document.querySelectorAll('h5,li').forEach(el => {
                        if (el.textContent.trim() === 'An error occured while processing your request. Please try again after sometime') hasError = true;
                    });
                    if (document.querySelector('input#lcHo')) hasError = true;
                    if (hasError) { setTimeout(() => location.reload(), 500); return; }
                    const title = document.title;
                    const h1 = document.getElementsByTagName('h1')[0]?.innerText || '';
                    const bodyText = document.body?.innerText || '';
                    const badTitles = ['504 Bad Gateway ERROR', '502 Bad Gateway ERROR', '504 Gateway Time-out', '503 Service Temporarily Unavailable', '500 Internal Server Error', 'Application Temporarily Unavailable', 'Backend service does not exist', 'ERROR: The request could not be satisfied'];
                    const badH1s = ['502 Bad Gateway', '403 ERROR', '502 Bad Gateway ERROR'];
                    const isCloudFrontError = bodyText.includes('Generated by cloudfront') || bodyText.includes('The request could not be satisfied') || bodyText.includes("We can't connect to the server");
                    if (document.body.childElementCount <= 1 || badTitles.includes(title) || badH1s.includes(h1) || isCloudFrontError) {
                        setTimeout(() => window.location.reload(true), 1000);
                        return;
                    }
                    if (['Too Many Requests', '429 Too Many Requests', '403 Forbidden'].includes(title)) {
                        if (isImportant) setTimeout(() => window.location.reload(true), 30000);
                        else setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/Account/LogIn'; }, 100);
                    }
                    if (bodyText.includes('Max challenge attempts exceeded'))
                        setTimeout(() => location.reload(), 100);
                } catch {}
            }
            checkErrors();
            new MutationObserver(checkErrors).observe(document.body, { childList: true, subtree: true });
            if (/^\/dza\/appointment\/captcha/.test(location.pathname)) {
                (function click() {
                    const h5 = [...document.querySelectorAll('h5')].find(el => el.textContent.trim() === 'Book New Appointment -');
                    const link = document.querySelector('a.nav-link.new-app-active');
                    if (h5 && link) link.click();
                    else setTimeout(click, 1000);
                })();
            }
            window.addEventListener('load', () => {
                const alertEl = document.querySelector('.alert.alert-danger strong');
                if (alertEl?.textContent.includes('maximum number of allowed captcha') || alertEl?.textContent.includes('Captcha id already exist')) {
                    setTimeout(() => { window.location.href = 'https://algeria.blsspainglobal.com/dza/Account/LogIn'; }, 1000);
                }
            }, { once: true });
            const redirectMap = {
                'https://algeria.blsspainglobal.com/dza/home/index': 'https://algeria.blsspainglobal.com/dza/appointment/newappointment',
                'https://algeria.blsspainglobal.com/dza/account/changepassword': 'https://algeria.blsspainglobal.com/dza/appointment/newappointment'
            };
            const cur = window.location.href.toLowerCase();
            for (const [from, to] of Object.entries(redirectMap)) {
                if (cur.startsWith(from)) { window.location.href = to; break; }
            }
        }
    })();

    // ================== Auto Reset on Error Messages ==================
    (function handleInvalidCaptchaReset() {
        const msgs = ['Invalid captcha selection', 'Invalid appointment request flow', 'The captcha you submitted is invalid', 'invalid request parameter', 'Invalid appointment request'];
        let redirecting = false;
        function restart() {
            if (redirecting) return;
            redirecting = true;
            window.location.href = 'https://algeria.blsspainglobal.com/dza/appointment/newappointment';
        }
        function check() {
            if (redirecting) return;
            const body = document.body?.innerText || '';
            if (msgs.some(m => body.includes(m))) { restart(); }
        }
        check();
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        setInterval(check, 0);
    })();

    // ============================================================
    // AUTO RELOAD VISATYPE
    // ============================================================
    (function autoReloadVisaTypePage() {
        try {
            if (!location.href.toLowerCase().includes('/appointment/visatype')) return;
            const h5 = document.querySelector('h5');
            if (h5?.textContent?.trim() === 'Book New Appointment - Slot Selection') return;
            const sec = Math.max(1, parseInt(config.refreshIntervalSeconds || 1, 10));
            setTimeout(() => { try { location.reload(); } catch {} }, sec * 1000);
        } catch {}
    })();

    // ============================================================
    // COUNTDOWN TIMER (visatype page)
    // ============================================================
    (function countdownTimer() {
        const COUNTDOWN_SECONDS = 180;
        const TARGET_URL = 'https://algeria.blsspainglobal.com/dza/appointment/newappointment';
        const KEY_DEADLINE = 'bls_dz_deadline_ms';
        const BOX_ID = 'bls-dz-countdown';
        let tickTimer = null, isRedirecting = false;
        function isOnVisatype() { return location.pathname.includes('/dza/appointment/visatype'); }
        function isOnSlotSelection() { return [...document.querySelectorAll('h5')].some(h5 => h5.textContent?.trim() === 'Book New Appointment - Slot Selection'); }
        function formatMMSS(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
        function has429() { return /429|too many requests|rate limit/i.test(document.body?.innerText || '') || /429|too many requests/i.test(document.title); }
        function teardown() { sessionStorage.removeItem(KEY_DEADLINE); document.getElementById(BOX_ID)?.remove(); if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
        function createUI() {
            if (document.getElementById(BOX_ID)) return;
            const box = document.createElement('div');
            box.id = BOX_ID;
            Object.assign(box.style, { position: 'fixed', bottom: '16px', right: '16px', background: 'linear-gradient(135deg,#8B0000,#C0392B)', color: '#F5E6D0', padding: '10px 14px', borderRadius: '10px', font: '600 14px system-ui', zIndex: '999999', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(201,133,58,0.4)' });
            const label = document.createElement('div'); label.textContent = 'Redirecting in';
            const timeEl = document.createElement('div'); timeEl.id = 'bls-timer';
            Object.assign(timeEl.style, { font: '700 16px monospace', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px', minWidth: '64px', textAlign: 'center' });
            box.append(label, timeEl); document.body.appendChild(box);
        }
        function startCountdown() {
            if (!isOnVisatype() || isOnSlotSelection() || has429() || tickTimer) { teardown(); return; }
            let deadline = Number(sessionStorage.getItem(KEY_DEADLINE));
            if (!deadline || isNaN(deadline) || deadline < Date.now()) { deadline = Date.now() + COUNTDOWN_SECONDS * 1000; sessionStorage.setItem(KEY_DEADLINE, String(deadline)); }
            createUI();
            const tick = () => {
                if (has429() || !isOnVisatype() || isOnSlotSelection()) { teardown(); return; }
                const left = Number(sessionStorage.getItem(KEY_DEADLINE)) - Date.now();
                const timeEl = document.getElementById('bls-timer');
                if (left <= 0) { if (!has429() && !isRedirecting) { isRedirecting = true; teardown(); window.location.href = TARGET_URL; } else teardown(); }
                else if (timeEl) { if (left <= 10000) timeEl.style.background = 'rgba(0,0,0,0.5)'; timeEl.textContent = formatMMSS(left); }
            };
            tick();
            tickTimer = setInterval(tick, 100);
        }
        if (isOnVisatype() && !isOnSlotSelection()) startCountdown();
    })();

    // ============================================================
    // GENERIC ERROR REDIRECT
    // ============================================================
    (function handleGenericError() {
        function checkAndRedirect() {
            try {
                if (window._errorRedirectTriggered) return;
                const body = document.body?.innerText || '';
                if (body.includes('An error occured while processing your request') || body.includes('Please try again after sometime')) {
                    window._errorRedirectTriggered = true;
                    window.location.href = 'https://algeria.blsspainglobal.com/dza/appointment/newappointment';
                }
            } catch {}
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkAndRedirect, { once: true });
        else checkAndRedirect();
        registerDOMCallback('genericError', checkAndRedirect);
    })();

    // ============================================================
    // SYNC BUTTONS (Export/Import)
    // ============================================================
    (function injectSyncButtons() {
        const KEYS = ['anis_config', 'selected_client', 'anis_lastUpdateCheck'];
        function exportData() {
            const bundle = {};
            KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) bundle[k] = v; });
            if (!Object.keys(bundle).length) { alert('No data.'); return; }
            const json = JSON.stringify(bundle), b64 = btoa(unescape(encodeURIComponent(json)));
            const cfg = JSON.parse(localStorage.getItem('anis_config') || '{}'), count = (cfg.applicants || []).length;
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#2A0701,#4A1205);border:1px solid rgba(201,133,58,0.4);border-radius:12px;padding:20px;z-index:99999;width:520px;max-width:95vw;color:#F5E6D0;font-family:Arial,sans-serif;';
            modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="color:#E8A84E;">Export (${count} accounts)</b><button id="sync-close" style="background:linear-gradient(135deg,#8B0000,#C0392B);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;">✕</button></div><textarea readonly style="width:100%;height:110px;background:rgba(0,0,0,0.4);color:#E8A84E;border:1px solid rgba(201,133,58,0.3);border-radius:6px;padding:8px;font-size:11px;font-family:monospace;">${b64}</textarea><div style="display:flex;gap:10px;margin-top:12px;"><button id="sync-copy" style="flex:1;background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border:none;border-radius:6px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;">Copy</button><button id="sync-dl" style="flex:1;background:rgba(201,133,58,0.2);color:#E8A84E;border:1px solid rgba(201,133,58,0.4);border-radius:6px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;">Download</button></div>`;
            document.body.appendChild(modal);
            modal.querySelector('#sync-close').onclick = () => modal.remove();
            modal.querySelector('#sync-copy').onclick = () => { const ta = modal.querySelector('textarea'); ta.select(); document.execCommand('copy'); modal.querySelector('#sync-copy').textContent = 'Copied!'; };
            modal.querySelector('#sync-dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'bls_sync_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
        }
        function importData() {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#2A0701,#4A1205);border:1px solid rgba(201,133,58,0.4);border-radius:12px;padding:20px;z-index:99999;width:520px;max-width:95vw;color:#F5E6D0;font-family:Arial,sans-serif;';
            modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="color:#E8A84E;">Import</b><button id="imp-close" style="background:linear-gradient(135deg,#8B0000,#C0392B);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;">✕</button></div><textarea id="imp-ta" style="width:100%;height:110px;background:rgba(0,0,0,0.4);color:#F5E6D0;border:1px solid rgba(201,133,58,0.3);border-radius:6px;padding:8px;font-size:11px;font-family:monospace;" placeholder="Paste code here..."></textarea><div style="margin-top:12px;"><button id="imp-apply" style="background:linear-gradient(135deg,#C9853A,#E8A84E);color:#3D0C02;border:none;border-radius:6px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;">Apply</button></div><div id="imp-result" style="margin-top:10px;font-size:12px;"></div>`;
            document.body.appendChild(modal);
            modal.querySelector('#imp-close').onclick = () => modal.remove();
            modal.querySelector('#imp-apply').onclick = () => {
                const raw = modal.querySelector('#imp-ta').value.trim();
                const res = modal.querySelector('#imp-result');
                if (!raw) { res.innerHTML = '<span style="color:#E8A84E">Paste code first.</span>'; return; }
                try {
                    let json; try { json = decodeURIComponent(escape(atob(raw))); } catch { json = raw; }
                    const bundle = JSON.parse(json);
                    KEYS.forEach(k => { if (bundle[k] !== undefined) localStorage.setItem(k, bundle[k]); });
                    const cfg = bundle['anis_config'] ? JSON.parse(bundle['anis_config']) : {};
                    res.innerHTML = `<span style="color:#C9853A">${(cfg.applicants || []).length} accounts imported! Reload.</span>`;
                    setTimeout(() => modal.remove(), 3000);
                } catch { res.innerHTML = '<span style="color:#C0392B">Invalid code.</span>'; }
            };
        }
        function injectButtons() {
            const actionsDiv = document.querySelector('#settings-container .settings-actions');
            if (!actionsDiv || document.getElementById('sync-export-btn')) return;
            const exp = document.createElement('button'); exp.id = 'sync-export-btn'; exp.className = 'btn btn-secondary'; exp.textContent = 'Export'; exp.onclick = exportData;
            const imp = document.createElement('button'); imp.id = 'sync-import-btn'; imp.className = 'btn btn-secondary'; imp.textContent = 'Import'; imp.onclick = importData;
            const save = actionsDiv.querySelector('#save-settings');
            actionsDiv.insertBefore(imp, save); actionsDiv.insertBefore(exp, imp);
        }
        registerDOMCallback('syncButtons', () => { if (document.querySelector('#settings-container .settings-actions')) injectButtons(); });
        injectButtons();
    })();

    // ============================================================
    // PAGE HANDLER DISPATCH (silent)
    // ============================================================
    if (location.hostname === 'algeria.blsspainglobal.com') {
        try {
            const matchPath = path => new RegExp('^' + path.replace(/\/*$/, '').replace(/^\//, '/').replace(/\./, '\\.').replace(/\*/g, '.*') + '\\/*$', 'i').test(location.pathname);
            switch (true) {
                case detectCurrentPage() === 'data_protection':                new DataProtectionHandler().start(); break;
                case matchPath('/dza/account/login'):                           new LoginPageHandler().start(); break;
                case matchPath('/dza/newcaptcha/logincaptcha'):                 new LoginCaptchaHandler().start(); break;
                case matchPath('/dza/appointment/newappointment'):              new AppointmentCaptchaHandler().start(); break;
                case matchPath('/dza/appointment/appointmentcaptcha'):          new VisaTypeHandler().start(); break;
                case matchPath('/dza/appointment/visatype/'):
                case matchPath('/dza/appointment/slotselection'):
                case matchPath('/dza/appointment/applicantselection'):          new ApplicantSelectionHandler().start(); break;
                case location.pathname.includes('/dza/account/register') || location.pathname.includes('/dza/Account/RegisterUser'):
                    new RegistrationPageHandler().start(); break;
            }
        } catch (err) { /* silent */ }

        setupAutoSwitchOnError();
    }

    // ============================================================
    // EMAIL BAR HIDE/SHOW on hover
    // ============================================================
    (function handleEmailBarVisibility() {
        const bar = document.getElementById('email-bar');
        if (!bar) return;
        bar.style.top = '-50px';
        let hideTimer = null, isHovering = false;
        const showBar = () => { bar.style.top = '0'; };
        const hideBar = () => { if (!isHovering) bar.style.top = '-50px'; };
        document.addEventListener('mousemove', e => {
            if (e.clientY <= 30) { showBar(); clearTimeout(hideTimer); }
            else if (!isHovering) { clearTimeout(hideTimer); hideTimer = setTimeout(hideBar, 1000); }
        });
        bar.addEventListener('mouseenter', () => { isHovering = true; showBar(); clearTimeout(hideTimer); });
        bar.addEventListener('mouseleave', () => { isHovering = false; clearTimeout(hideTimer); hideTimer = setTimeout(hideBar, 1000); });
    })();

   // ============================================================
// SCRIPT : AUTO CANCELLATION OF APPOINTMENT AFTER 2 MINUTES
// AND REDIRECT TO newappointment
// ============================================================

(function() {
    // List of target messages to detect
    const targetTexts = [
        "You have initiated an appointment from your account or IP address which is not yet completed. Would you like to disregard that appointment and start a new one?",
        "The appointment date and time you selected are already taken by other applicants. Please choose a different date and time",
        "The appointment date and time you selected are already taken",
        "An error occured while processing your request. Please try again after sometime",
        "Due to unusual activity, we couldn't process your request right now. Please try again later"
    ];

    function checkForDialog() {
        const found = targetTexts.some(text => document.body.innerText.includes(text));

        if (found) {
            console.log("One of the target messages detected. Waiting 12 seconds before redirecting...");
            setTimeout(() => {

                const link = document.querySelector('a.btn.btn-secondary[href="/"]');
                if (link) {
                    console.log("12 seconds elapsed. Redirecting to newappointment...");
                    link.href = "/dza/appointment/newappointment";
                    link.click();
                } else{
                    window.location.href = "/dza/appointment/newappointment";
                }
            }, 12000); // 12 seconds = 12000ms
        } else {
            setTimeout(checkForDialog, 1000);
        }
    }

    checkForDialog();
})();


    // ============================================================
    // EXPOSE BLSScript safely
    // ============================================================
    window.BLSScript = {
        getConfig: () => { try { return JSON.parse(JSON.stringify(config)); } catch(e) { return null; } },
        saveConfig: (newCfg) => { try { Object.assign(config, newCfg); saveConfig(config); if (window.settingsUIInstance) window.settingsUIInstance.updateEmailBar(); return true; } catch(e) { return false; } },
        switchToAccount: (index) => { if (!config.applicants || index < 0 || index >= config.applicants.length) { return false; } config.multiAccount.currentAccountIndex = index; saveConfig(config); if (window.settingsUIInstance) window.settingsUIInstance.updateEmailBar(); return true; },
        showSettings: () => { if (window.settingsUIInstance && window.settingsUIInstance.container) { window.settingsUIInstance.container.style.display = 'block'; config.settingsVisible = true; saveConfig(config); } },
        hideSettings: () => { if (window.settingsUIInstance && window.settingsUIInstance.container) { window.settingsUIInstance.container.style.display = 'none'; config.settingsVisible = false; saveConfig(config); } },
        restartToNewAppointment: () => { window.location.href = 'https://algeria.blsspainglobal.com/dza/appointment/newappointment'; },
        getCurrentAccount: () => { const idx = config.multiAccount?.currentAccountIndex || 0; return config.applicants?.[idx] || null; },
        reloadPage: (force = false) => { if (force) window.location.reload(true); else window.location.reload(); },
        status: () => { /* silent */ }
    };

})();
