(function () {
  'use strict';

  if (window.__bybitAIAssistant) return;
  window.__bybitAIAssistant = true;

  let conversationHistory = [];
  let autoAnalyzeInterval = null;
  let isAnalyzing = false;
  let panelMinimized = false;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let panelEl = null;
  let currentUID = null;
  let REFERRAL_LINK = '';
  let currentLang = 'ru';

  // ─── i18n ─────────────────────────────────────────────────────────────────────

  const i18n = {
    ru: {
      title: 'AI Трейдер',
      btnAuto: '⏱ Авто', btnClear: '🗑', btnMin: '_',
      btnLong: '📈 Лонг?', btnShort: '📉 Шорт?', btnAnalyze: '🔍 Анализ',
      placeholder: 'Задай вопрос...',
      ready: 'Готов к анализу',
      analyzingLong: 'Анализирую лонг...', analyzingShort: 'Анализирую шорт...',
      analyzingChart: 'Анализирую график...', answering: 'Отвечаю...',
      analyzing: 'Анализирую...',
      autoOn: 'Авто-анализ: каждые 30 сек', autoOff: 'Авто-анализ отключён',
      cleared: 'Чат очищен.',
      labelLong: '📈 ЛОНГ', labelShort: '📉 ШОРТ',
      hint: 'Нажми 📈 **Лонг?** или 📉 **Шорт?** — скажу стоит ли входить и вероятность.\n🔍 **Анализ** — общая картина на графике.',
    },
    en: {
      title: 'AI Trader',
      btnAuto: '⏱ Auto', btnClear: '🗑', btnMin: '_',
      btnLong: '📈 Long?', btnShort: '📉 Short?', btnAnalyze: '🔍 Analyze',
      placeholder: 'Ask a question...',
      ready: 'Ready to analyze',
      analyzingLong: 'Analyzing long...', analyzingShort: 'Analyzing short...',
      analyzingChart: 'Analyzing chart...', answering: 'Answering...',
      analyzing: 'Analyzing...',
      autoOn: 'Auto-analysis: every 30s', autoOff: 'Auto-analysis off',
      cleared: 'Chat cleared.',
      labelLong: '📈 LONG', labelShort: '📉 SHORT',
      hint: 'Press 📈 **Long?** or 📉 **Short?** — I\'ll say if it\'s worth entering and the probability.\n🔍 **Analyze** — overall chart picture.',
    }
  };

  function t(key) { return i18n[currentLang][key] || i18n.ru[key] || key; }

  // ─── Styles ───────────────────────────────────────────────────────────────────

  const CSS = `
    #bai-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 370px;
      background: #111827;
      border: 1px solid #1f2d50;
      border-radius: 14px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: box-shadow 0.2s;
    }
    #bai-panel:hover {
      box-shadow: 0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.3);
    }

    /* ── Header ── */
    #bai-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 13px;
      background: linear-gradient(135deg, #1e2a50 0%, #131d3a 100%);
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid #1f2d50;
      flex-shrink: 0;
    }
    #bai-header:active { cursor: grabbing; }

    #bai-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-weight: 700;
      font-size: 13px;
      color: #818cf8;
      letter-spacing: 0.02em;
    }
    #bai-title-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      flex-shrink: 0;
    }
    #bai-title-dot.inactive { background: #4b5563; box-shadow: none; }

    #bai-header-right { display: flex; gap: 5px; align-items: center; }

    .bai-btn {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px 9px;
      font-size: 12px;
      transition: all 0.15s;
      white-space: nowrap;
      line-height: 1.4;
    }
    .bai-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
    .bai-btn.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    .bai-btn:disabled { opacity: 0.35; cursor: default; }

    /* ── Action bar (Long / Short / Analyse / Auto) ── */
    #bai-actions {
      display: flex;
      gap: 6px;
      padding: 9px 12px;
      border-bottom: 1px solid #1f2d50;
      flex-shrink: 0;
    }
    #bai-long-btn {
      flex: 1;
      background: rgba(16,185,129,0.12);
      border: 1px solid rgba(16,185,129,0.35);
      border-radius: 8px;
      color: #10b981;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 7px 0;
      transition: all 0.15s;
    }
    #bai-long-btn:hover { background: rgba(16,185,129,0.22); border-color: #10b981; }
    #bai-long-btn:disabled { opacity: 0.35; cursor: default; }

    #bai-short-btn {
      flex: 1;
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.35);
      border-radius: 8px;
      color: #ef4444;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 7px 0;
      transition: all 0.15s;
    }
    #bai-short-btn:hover { background: rgba(239,68,68,0.22); border-color: #ef4444; }
    #bai-short-btn:disabled { opacity: 0.35; cursor: default; }

    #bai-analyze-btn {
      flex: 0 0 auto;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #94a3b8;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      padding: 7px 10px;
      transition: all 0.15s;
    }
    #bai-analyze-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
    #bai-analyze-btn:disabled { opacity: 0.35; cursor: default; }

    /* ── Body ── */
    #bai-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    #bai-panel.minimized #bai-body,
    #bai-panel.minimized #bai-actions { display: none; }

    /* ── Messages ── */
    #bai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 320px;
      min-height: 160px;
    }
    #bai-messages::-webkit-scrollbar { width: 4px; }
    #bai-messages::-webkit-scrollbar-track { background: transparent; }
    #bai-messages::-webkit-scrollbar-thumb { background: #2d3561; border-radius: 2px; }

    .bai-msg {
      padding: 10px 12px;
      border-radius: 10px;
      line-height: 1.55;
      word-break: break-word;
      animation: bai-fadein 0.2s ease;
    }
    @keyframes bai-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

    .bai-msg.assistant { background: #1e2640; border-left: 3px solid #6366f1; }
    .bai-msg.long-result { background: #0d2118; border-left: 3px solid #10b981; }
    .bai-msg.short-result { background: #1f0e0e; border-left: 3px solid #ef4444; }
    .bai-msg.user {
      background: #162c1e; border-right: 3px solid #10b981;
      align-self: flex-end; text-align: right;
    }
    .bai-msg.system { background: #1f1515; border-left: 3px solid #ef4444; font-size: 11.5px; color: #94a3b8; }
    .bai-msg.hint { background: #1a1f35; border-left: 3px solid #f59e0b; font-size: 11.5px; color: #94a3b8; }

    .bai-msg-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 5px;
      opacity: 0.6;
    }
    .long-result .bai-msg-label { color: #10b981; }
    .short-result .bai-msg-label { color: #ef4444; }

    .bai-timestamp { font-size: 10px; color: #4b5563; margin-top: 5px; }
    .bai-msg.user .bai-timestamp { text-align: right; }

    /* ── Loading ── */
    .bai-loading {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; color: #64748b; font-size: 12px;
    }
    .bai-spinner {
      width: 14px; height: 14px;
      border: 2px solid #2d3561; border-top-color: #6366f1;
      border-radius: 50%; animation: bai-spin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes bai-spin { to { transform: rotate(360deg); } }

    /* ── Input area ── */
    #bai-input-area {
      display: flex; gap: 7px;
      padding: 10px 12px; border-top: 1px solid #1f2d50; flex-shrink: 0;
    }
    #bai-input {
      flex: 1; background: #0d1117; border: 1px solid #2d3561; border-radius: 8px;
      color: #e2e8f0; font-family: inherit; font-size: 12.5px;
      padding: 8px 10px; resize: none; outline: none; transition: border-color 0.15s; line-height: 1.4;
    }
    #bai-input:focus { border-color: #6366f1; }
    #bai-input::placeholder { color: #374151; }
    #bai-send-btn {
      background: #4f46e5; border: none; border-radius: 8px;
      color: white; cursor: pointer; font-size: 16px; padding: 0 12px;
      transition: background 0.15s; flex-shrink: 0;
    }
    #bai-send-btn:hover { background: #4338ca; }
    #bai-send-btn:disabled { background: #1f2937; cursor: default; }

    /* ── Status ── */
    #bai-status { padding: 5px 12px 9px; font-size: 10.5px; color: #374151; text-align: center; flex-shrink: 0; }
  `;

  // ─── HTML ─────────────────────────────────────────────────────────────────────

  function buildPanel() {
    const div = document.createElement('div');
    div.id = 'bai-panel';
    div.innerHTML = `
      <div id="bai-header">
        <div id="bai-title">
          <span id="bai-title-dot" class="inactive"></span>
          🤖 <span id="bai-title-text">AI Трейдер</span>
        </div>
        <div id="bai-header-right">
          <button class="bai-btn" id="bai-lang-btn" title="Switch language">RU</button>
          <button class="bai-btn" id="bai-auto-btn">⏱ Авто</button>
          <button class="bai-btn" id="bai-clear-btn">🗑</button>
          <button class="bai-btn" id="bai-minimize-btn">_</button>
        </div>
      </div>
      <div id="bai-actions">
        <button id="bai-long-btn">📈 Лонг?</button>
        <button id="bai-short-btn">📉 Шорт?</button>
        <button id="bai-analyze-btn">🔍 Анализ</button>
      </div>
      <div id="bai-body">
        <div id="bai-messages"></div>
        <div id="bai-input-area">
          <textarea id="bai-input" rows="2" placeholder="Задай вопрос..."></textarea>
          <button id="bai-send-btn" title="Send">➤</button>
        </div>
        <div id="bai-status">Готов к анализу</div>
      </div>
    `;
    return div;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  function applyLang() {
    if (!panelEl) return;
    panelEl.querySelector('#bai-title-text').textContent = t('title');
    panelEl.querySelector('#bai-lang-btn').textContent = currentLang === 'ru' ? 'RU' : 'EN';
    panelEl.querySelector('#bai-auto-btn').textContent = t('btnAuto');
    panelEl.querySelector('#bai-long-btn').textContent = t('btnLong');
    panelEl.querySelector('#bai-short-btn').textContent = t('btnShort');
    panelEl.querySelector('#bai-analyze-btn').textContent = t('btnAnalyze');
    panelEl.querySelector('#bai-input').placeholder = t('placeholder');
    if (!autoAnalyzeInterval && !isAnalyzing) setStatus(t('ready'));
  }

  async function initPanel() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    panelEl = buildPanel();
    document.body.appendChild(panelEl);

    setupDragging();

    panelEl.querySelector('#bai-long-btn').addEventListener('click', () => runAnalysis('long'));
    panelEl.querySelector('#bai-short-btn').addEventListener('click', () => runAnalysis('short'));
    panelEl.querySelector('#bai-analyze-btn').addEventListener('click', () => runAnalysis('auto'));
    panelEl.querySelector('#bai-auto-btn').addEventListener('click', toggleAutoAnalyze);
    panelEl.querySelector('#bai-clear-btn').addEventListener('click', clearChat);
    panelEl.querySelector('#bai-minimize-btn').addEventListener('click', toggleMinimize);
    panelEl.querySelector('#bai-send-btn').addEventListener('click', sendMessage);
    panelEl.querySelector('#bai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    panelEl.querySelector('#bai-lang-btn').addEventListener('click', async () => {
      currentLang = currentLang === 'ru' ? 'en' : 'ru';
      try { await chrome.storage.local.set({ bai_lang: currentLang }); } catch (_) {}
      applyLang();
    });

    applyLang();
    addMessage('hint', t('hint'));
  }

  // ─── Dragging ─────────────────────────────────────────────────────────────────

  function setupDragging() {
    const header = panelEl.querySelector('#bai-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      const rect = panelEl.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - panelEl.offsetWidth, e.clientX - dragOffset.x));
      const y = Math.max(0, Math.min(window.innerHeight - panelEl.offsetHeight, e.clientY - dragOffset.y));
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      panelEl.style.left = x + 'px';
      panelEl.style.top = y + 'px';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });
  }

  function toggleMinimize() {
    panelMinimized = !panelMinimized;
    panelEl.classList.toggle('minimized', panelMinimized);
    panelEl.querySelector('#bai-minimize-btn').textContent = panelMinimized ? '□' : '_';
  }

  function toggleAutoAnalyze() {
    const btn = panelEl.querySelector('#bai-auto-btn');
    const dot = panelEl.querySelector('#bai-title-dot');
    if (autoAnalyzeInterval) {
      clearInterval(autoAnalyzeInterval);
      autoAnalyzeInterval = null;
      btn.classList.remove('active');
      dot.classList.add('inactive');
      setStatus(t('autoOff'));
    } else {
      runAnalysis('auto');
      autoAnalyzeInterval = setInterval(() => { if (!isAnalyzing) runAnalysis('auto'); }, 30000);
      btn.classList.add('active');
      dot.classList.remove('inactive');
      setStatus(t('autoOn'));
    }
  }

  function clearChat() {
    panelEl.querySelector('#bai-messages').innerHTML = '';
    conversationHistory = [];
    addMessage('hint', t('cleared'));
  }

  // ─── Chart detection ──────────────────────────────────────────────────────────

  function getChartRect() {
    const selectors = [
      '[class*="chartContainer"]', '[class*="ChartContainer"]',
      '[class*="chart-container"]', '[class*="tradingChart"]',
      '[class*="trading-chart"]', '[class*="chartWrap"]',
      '[class*="chart-wrap"]', '[class*="klineChart"]',
      '[id*="chart"]', '.chart-gui-wrapper',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 400 && r.height > 250) return r;
      } catch (_) {}
    }
    // Fallback: largest canvas
    let best = null, bestArea = 0;
    document.querySelectorAll('canvas').forEach(c => {
      const r = c.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 400 && r.height > 250) { bestArea = area; best = r; }
    });
    return best;
  }

  function extractContext() {
    const parts = [];
    const m = window.location.pathname.match(/\/(?:trade|spot|derivatives|usdc-contract|linear|inverse)\/(?:\w+\/)?(\w+)/i);
    if (m) parts.push(m[1]);
    for (const sel of ['[class*="timeframe"][class*="active"]', '[class*="interval"][class*="active"]', '[class*="resolution"][class*="active"]', '[class*="periodActive"]']) {
      try { const t = document.querySelector(sel)?.textContent.trim(); if (t && t.length < 10) { parts.push(t); break; } } catch (_) {}
    }
    return parts.join(' ') || null;
  }

  // ─── Core analysis ────────────────────────────────────────────────────────────

  async function runAnalysis(mode) {
    if (isAnalyzing) return;
    isAnalyzing = true;
    setAllBtnsDisabled(true);

    const label = mode === 'long' ? t('analyzingLong') : mode === 'short' ? t('analyzingShort') : t('analyzingChart');
    const loadingEl = makeLoading(label);
    appendRaw(loadingEl);
    setStatus(t('analyzing'));

    try {
      const context = extractContext();
      const chartRect = getChartRect();
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_SCREEN',
        uid: currentUID,
        lang: currentLang,
        context,
        userMessage: null,
        history: getTextHistory(),
        chartRect: chartRect ? { x: chartRect.x, y: chartRect.y, width: chartRect.width, height: chartRect.height } : null,
        dpr: window.devicePixelRatio || 1,
        mode
      });

      loadingEl.remove();

      if (response.error) {
        addMessage('system', '❌ ' + response.error);
      } else {
        const msgType = mode === 'long' ? 'long-result' : mode === 'short' ? 'short-result' : 'assistant';
        const msgLabel = mode === 'long' ? t('labelLong') : mode === 'short' ? t('labelShort') : null;
        addMessage(msgType, response.text, msgLabel);
        pushHistory('user', mode === 'long' ? '[long analysis]' : mode === 'short' ? '[short analysis]' : '[chart analysis]');
        pushHistory('assistant', response.text);
      }
    } catch (err) {
      loadingEl.remove();
      addMessage('system', '❌ ' + err.message);
    }

    isAnalyzing = false;
    setAllBtnsDisabled(false);
    setStatus(autoAnalyzeInterval ? t('autoOn') : t('ready'));
  }

  async function sendMessage() {
    const input = panelEl.querySelector('#bai-input');
    const text = input.value.trim();
    if (!text || isAnalyzing) return;

    input.value = '';
    addMessage('user', text);
    isAnalyzing = true;
    setAllBtnsDisabled(true);

    const loadingEl = makeLoading(t('answering'));
    appendRaw(loadingEl);
    setStatus(t('answering'));

    try {
      const context = extractContext();
      const chartRect = getChartRect();
      pushHistory('user', text);

      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_SCREEN',
        uid: currentUID,
        lang: currentLang,
        context,
        userMessage: text,
        history: getTextHistory().slice(0, -1),
        chartRect: chartRect ? { x: chartRect.x, y: chartRect.y, width: chartRect.width, height: chartRect.height } : null,
        dpr: window.devicePixelRatio || 1,
        mode: 'chat'
      });

      loadingEl.remove();

      if (response.error) {
        addMessage('system', '❌ ' + response.error);
        conversationHistory.pop();
      } else {
        addMessage('assistant', response.text);
        pushHistory('assistant', response.text);
      }
    } catch (err) {
      loadingEl.remove();
      addMessage('system', '❌ ' + err.message);
      conversationHistory.pop();
    }

    isAnalyzing = false;
    setAllBtnsDisabled(false);
    setStatus(autoAnalyzeInterval ? t('autoOn') : t('ready'));
  }

  // ─── History ──────────────────────────────────────────────────────────────────

  function pushHistory(role, content) {
    conversationHistory.push({ role, content });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
  }
  function getTextHistory() {
    return conversationHistory.map(m => ({ role: m.role, content: m.content }));
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────

  function addMessage(type, text, label) {
    const el = document.createElement('div');
    el.className = 'bai-msg ' + type;
    const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const formatted = escapeHtml(text).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    el.innerHTML = (label ? `<div class="bai-msg-label">${label}</div>` : '') +
      `<div>${formatted}</div><div class="bai-timestamp">${time}</div>`;
    appendRaw(el);
  }

  function makeLoading(text) {
    const el = document.createElement('div');
    el.className = 'bai-loading';
    el.innerHTML = `<div class="bai-spinner"></div><span>${text}</span>`;
    return el;
  }

  function appendRaw(el) {
    const msgs = panelEl.querySelector('#bai-messages');
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setStatus(text) {
    const el = panelEl.querySelector('#bai-status');
    if (el) el.textContent = text;
  }

  function setAllBtnsDisabled(disabled) {
    ['#bai-long-btn', '#bai-short-btn', '#bai-analyze-btn', '#bai-send-btn'].forEach(id => {
      const el = panelEl.querySelector(id);
      if (el) el.disabled = disabled;
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── ByBit UID detection ─────────────────────────────────────────────────────

  // ByBit UIDs are 7–12 digits — avoids picking up timestamps (13+ digits)
  const UID_RE = /^\d{7,12}$/;

  function getSavedUID() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get('bai_uid', r => resolve(r.bai_uid || null));
      } catch (_) { resolve(null); }
    });
  }

  function saveUID(uid) {
    try { chrome.storage.local.set({ bai_uid: uid }); } catch (_) {}
  }

  function clearSavedUID() {
    try { chrome.storage.local.remove('bai_uid'); } catch (_) {}
  }

  function detectUIDFromPage() {
    // 1. All text nodes including hidden elements
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const m = node.textContent.match(/UID[:\s]+(\d{7,12})/i);
        if (m) return m[1];
      }
    } catch (_) {}

    // 2. Inline <script> tags — ByBit embeds user data as JSON
    try {
      for (const script of document.querySelectorAll('script:not([src])')) {
        const m = script.textContent.match(/"(?:userId|uid|memberId)"[:\s]+"?(\d{7,12})"?/);
        if (m) return m[1];
      }
    } catch (_) {}

    // 3. window globals ByBit might expose
    try {
      for (const key of ['__USER_INFO__', '__BYBIT_USER__', '__user__', 'userInfo', 'USER_INFO']) {
        const obj = window[key];
        if (obj) { const uid = extractUID(obj); if (uid) return uid; }
      }
    } catch (_) {}

    // 4. __NEXT_DATA__ / Redux store snapshot
    try {
      const nd = window.__NEXT_DATA__;
      if (nd) { const uid = extractUID(nd); if (uid) return uid; }
    } catch (_) {}

    // 5. Scan localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const val = localStorage.getItem(localStorage.key(i));
        if (!val || !val.includes('{')) continue;
        try { const uid = extractUID(JSON.parse(val)); if (uid) return uid; } catch (_) {}
      }
    } catch (_) {}

    // 6. Cookies
    try {
      const m = document.cookie.match(/(?:bybit_)?(?:uid|user_id|userId)=(\d{7,12})/);
      if (m) return m[1];
    } catch (_) {}

    return null;
  }

  // Watch DOM for UID appearing (e.g. when user opens avatar dropdown)
  function watchForUID(onFound) {
    const observer = new MutationObserver(() => {
      const uid = detectUIDFromPage();
      if (uid) {
        observer.disconnect();
        onFound(uid);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Stop watching after 60s to avoid memory leak
    setTimeout(() => observer.disconnect(), 60000);
    return observer;
  }

  function extractUID(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const key of ['userId', 'uid', 'user_id', 'memberId', 'member_id', 'accountId']) {
      const v = obj[key];
      if (v && UID_RE.test(String(v))) return String(v);
    }
    for (const key of Object.keys(obj)) {
      const child = extractUID(obj[key], depth + 1);
      if (child) return child;
    }
    return null;
  }

  // ─── Access gate ─────────────────────────────────────────────────────────────

  function showAccessDenied(uid, error) {
    const style = document.createElement('style');
    style.textContent = `
      #bai-gate {
        position: fixed; bottom: 24px; right: 24px; width: 320px;
        background: #111827; border: 1px solid #1f2d50; border-radius: 14px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6);
        z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        overflow: hidden;
      }
      #bai-gate-header {
        padding: 12px 16px; background: linear-gradient(135deg, #1e2a50, #131d3a);
        border-bottom: 1px solid #1f2d50; font-size: 13px; font-weight: 700; color: #818cf8;
      }
      #bai-gate-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
      #bai-gate-body p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0; }
      #bai-gate-body a {
        display: block; text-align: center; background: #4f46e5; color: white;
        border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 600;
        text-decoration: none;
      }
      #bai-gate-body a:hover { background: #4338ca; }
      #bai-gate-uid-row {
        display: flex; gap: 6px; margin-top: 4px;
      }
      #bai-gate-uid-input {
        flex: 1; background: #0d1117; border: 1px solid #2d3561; border-radius: 8px;
        color: #e2e8f0; font-size: 13px; padding: 8px 10px; outline: none;
        font-family: inherit;
      }
      #bai-gate-uid-input:focus { border-color: #6366f1; }
      #bai-gate-uid-input::placeholder { color: #374151; }
      #bai-gate-uid-btn {
        background: #4f46e5; border: none; border-radius: 8px; color: white;
        cursor: pointer; font-size: 13px; font-weight: 600; padding: 8px 14px;
        white-space: nowrap;
      }
      #bai-gate-uid-btn:hover { background: #4338ca; }
      #bai-gate-hint { font-size: 11px; color: #374151; }
      #bai-gate-detected { font-size: 11px; color: #4b5563; }
    `;
    document.head.appendChild(style);

    const gate = document.createElement('div');
    gate.id = 'bai-gate';

    let bodyContent;
    if (error === 'server_unavailable') {
      bodyContent = `<p>⚠️ Сервер недоступен. Проверь подключение или попробуй позже.</p>`;
    } else {
      const detectedNote = uid
        ? `<div id="bai-gate-detected">Определён UID: ${uid} — нет доступа</div>`
        : `<div id="bai-gate-detected">UID не определён автоматически</div>`;

      bodyContent = `
        <p>🔐 Введи свой ByBit UID для проверки доступа:</p>
        <div id="bai-gate-uid-row">
          <input id="bai-gate-uid-input" type="text" placeholder="Напр.: 364783977" maxlength="12" inputmode="numeric">
          <button id="bai-gate-uid-btn">Войти</button>
        </div>
        ${detectedNote}
        <div id="bai-gate-hint">UID можно найти в профиле ByBit → Аккаунт и безопасность</div>
        ${error !== 'no_uid' ? `
          <p style="margin-top:4px;">Нет реферального аккаунта? Зарегистрируйся:</p>
          <a href="${REFERRAL_LINK}" target="_blank">Зарегистрироваться на ByBit</a>
        ` : ''}
      `;
    }

    gate.innerHTML = `
      <div id="bai-gate-header">🤖 AI Трейдер</div>
      <div id="bai-gate-body">${bodyContent}</div>
    `;
    document.body.appendChild(gate);

    // Wire up manual UID entry
    const input = gate.querySelector('#bai-gate-uid-input');
    const btn = gate.querySelector('#bai-gate-uid-btn');
    if (input && btn) {
      // Pre-fill with detected UID if plausible
      if (uid && UID_RE.test(uid)) input.value = uid;

      const tryManualUID = async () => {
        const manualUID = input.value.replace(/\D/g, '');
        if (!UID_RE.test(manualUID)) {
          input.style.borderColor = '#ef4444';
          return;
        }
        input.style.borderColor = '#2d3561';
        btn.disabled = true;
        btn.textContent = '...';
        const result = await chrome.runtime.sendMessage({ type: 'CHECK_ACCESS', uid: manualUID });
        if (result.authorized) {
          saveUID(manualUID);
          gate.remove();
          currentUID = manualUID;
          initPanel();
        } else {
          btn.disabled = false;
          btn.textContent = 'Войти';
          input.style.borderColor = '#ef4444';
          gate.querySelector('#bai-gate-detected').textContent = `UID ${manualUID} — нет доступа`;
          clearSavedUID();
        }
      };

      btn.addEventListener('click', tryManualUID);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryManualUID(); });
    }
  }

  // ─── Start ────────────────────────────────────────────────────────────────────

  async function start() {
    // Load saved language or detect from browser/OS
    await new Promise(resolve => {
      try {
        chrome.storage.local.get('bai_lang', r => {
          if (r.bai_lang) {
            currentLang = r.bai_lang;
          } else {
            const lang = navigator.language || navigator.userLanguage || 'en';
            currentLang = lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
          }
          resolve();
        });
      } catch (_) { resolve(); }
    });

    // 1. Try saved UID from extension storage (persists across reloads)
    currentUID = await getSavedUID();

    // 2. Try to detect from page if not saved
    if (!currentUID) {
      currentUID = detectUIDFromPage();
    }

    const result = await chrome.runtime.sendMessage({
      type: 'CHECK_ACCESS',
      uid: currentUID
    });

    if (!result.authorized) {
      const { referralLink } = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      REFERRAL_LINK = referralLink;
      if (currentUID) clearSavedUID();

      showAccessDenied(currentUID, result.error);

      // Watch for UID appearing in DOM (user opens avatar dropdown)
      watchForUID(async (detectedUID) => {
        const gate = document.getElementById('bai-gate');
        const detected = gate?.querySelector('#bai-gate-detected');
        if (detected) detected.textContent = `Найден UID: ${detectedUID} — проверяю...`;

        const r = await chrome.runtime.sendMessage({ type: 'CHECK_ACCESS', uid: detectedUID });
        if (r.authorized) {
          saveUID(detectedUID);
          currentUID = detectedUID;
          gate?.remove();
          initPanel();
        } else {
          if (detected) detected.textContent = `UID ${detectedUID} — нет доступа`;
        }
      });

      return;
    }

    saveUID(currentUID);
    initPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
