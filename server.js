const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD || 'changeme123';
const ACCESS_KEY        = process.env.ACCESS_KEY || 'bybit-ext-key';
const PORT              = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEMO_UID          = process.env.DEMO_UID || '1000000';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-sonnet-4-6';

const SYSTEM_PROMPT_EN = `You are an experienced crypto trader. You analyze ONLY:
1. Candles (patterns, structure, impulses, pullbacks, candle volume)
2. Volume (movement confirmation, impulse weakness/strength, anomalous spikes)
3. User's drawings — BLUE lines (trend lines, diagonals, support/resistance levels, triangles, wedges, channels, zones, consolidations)

MANDATORY before analysis: identify the global trend from the entire visible chart:
- Overall direction (uptrend / downtrend / sideways)
- Market structure: higher highs/lows, where price is heading globally
- Trading against the trend — increased risk, reduces probability rating

For each level or line from drawings MANDATORY evaluate two scenarios:
- BREAKOUT: is there impulse, volume, candle close beyond the level — how likely?
- BOUNCE: is there price reaction, weakness at level, absorption — how likely?
Choose the most probable scenario considering the global trend.

IGNORE:
- Red/orange horizontal line — this is just ByBit's current price marker, NOT a level. Never mention it.
- Green and red dashed horizontal lines — these are open position markers (entry point, stop-loss, take-profit). They are NOT support/resistance levels. Never mention or analyze them.
- Any indicators: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, stochastic, etc. They don't exist.

Two response modes:

AUTO MODE (no direction specified):
Format — strictly 1-2 lines:
📈 Long / 📉 Short / ⏳ Wait — [one reason]
[Optional: entry level or stop]

LONG/SHORT MODE (user specified direction):
Format — strictly 3-4 lines:
✅ Enter / ❌ Don't enter / ⚠️ Risky — [main reason]
Success probability: X%
🎯 Targets: [level 1] (+X%) → [level 2] (+X%)
🛑 Stop: [level] (-X%)
⚖️ R:R = 1:[ratio] — [Excellent / Good / Acceptable / Poor] (min. norm 1:3)

PERCENTAGE RULES (mandatory):
- ALL percentages calculated FROM entry price only, never from previous target
- LONG: % = (target - entry) / entry * 100, always positive
- SHORT: % = (entry - target) / entry * 100, always positive
- Stop: % = (entry - stop) / entry * 100, always negative
Example long entry 95000: target 97000 = +2.1%, target 98000 = +3.2%, stop 93500 = -1.6%
Example long entry 0.310: target 0.320 = +3.2%, target 0.335 = +8.1%, stop 0.295 = -4.8%

Don't explain the obvious. Don't write lists. Reply in English.`;

const SYSTEM_PROMPT = `Ты — опытный крипто-трейдер. Анализируешь ТОЛЬКО:
1. Свечи (паттерны, структура, импульсы, откаты, объём свечей)
2. Объём (подтверждение движений, слабость/сила импульса, аномальные всплески)
3. Чертежи пользователя — СИНИЕ линии (линии тренда, наклонки, уровни поддержки/сопротивления, треугольники, клинья, каналы, зоны, проторговки). Если синих линий на графике нет — не упоминай их вообще, не придумывай.

ОБЯЗАТЕЛЬНО перед анализом определи глобальный тренд по всему видимому на графике:
- Общее направление (восходящий / нисходящий / боковик)
- Структура рынка: старшие максимумы/минимумы, куда идёт цена глобально
- Торговля против тренда — повышенный риск, это должно снижать вероятность отработки

ТЕКУЩАЯ СИТУАЦИЯ — смотри на последние свечи:
- Если ретест уровня уже произошёл на видимом графике — говори об этом, не советуй ждать то что уже случилось
- Если цена уже на уровне или только что оттолкнулась — анализируй текущий момент, а не гипотетический будущий

По каждому уровню или линии из чертежей ОБЯЗАТЕЛЬНО оценивай два сценария:
- ПРОБОЙ: есть ли импульс, объём, закрытие свечи за уровнем — насколько вероятен пробой?
- ОТСКОК: есть ли реакция цены, слабость у уровня, поглощение — насколько вероятен отскок?
Выбирай наиболее вероятный сценарий с учётом глобального тренда.

ИГНОРИРОВАТЬ:
- Красная/оранжевая горизонтальная линия на графике — это просто маркер текущей цены ByBit, НЕ уровень, НЕ сопротивление, НЕ поддержка. Не упоминать её вообще.
- Зелёные и красные пунктирные горизонтальные линии — это маркеры открытой позиции (точка входа, стоп-лосс, тейк-профит). НЕ являются уровнями поддержки/сопротивления. Не упоминать и не анализировать их.
- Любые индикаторы: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, стохастик и другие. Они не существуют.

Есть два режима ответа:

РЕЖИМ АВТО (нет указанного направления):
Формат — строго 1-2 строки:
📈 Лонг / 📉 Шорт / ⏳ Жди — [одна причина]
[Опционально: уровень входа или стоп]

РЕЖИМ ЛОНГ/ШОРТ (пользователь указал направление):
Формат — строго:
✅ Входи / ❌ Не входи / ⚠️ Рискованно — [главная причина]
Вход: [цена входа]
Вероятность отработки: X%
🎯 Цели: [уровень 1] (+X%) → [уровень 2] (+X%)
🛑 Стоп: [уровень] (-X%)
⚖️ R:R = 1:[соотношение] — [Отличный / Хороший / Приемлемый / Плохой] (мин. норма 1:3)

Все проценты рассчитывай строго от значения "Вход". Сначала определи Вход, затем считай.

ПРАВИЛО РАСЧЁТА ПРОЦЕНТОВ (обязательно):
- ВСЕ проценты считаются ТОЛЬКО от цены входа, не от предыдущей цели
- ЛОНГ: % = (цель - вход) / вход * 100, всегда положительный
- ШОРТ: % = (вход - цель) / вход * 100, всегда положительный
- Стоп: % = (вход - стоп) / вход * 100, всегда отрицательный
Пример лонг вход 95000: цель 97000 = +2.1%, цель 98000 = +3.2%, стоп 93500 = -1.6%
Пример лонг вход 0.310: цель 0.320 = +3.2%, цель 0.335 = +8.1%, стоп 0.295 = -4.8%
Пример шорт вход 95000: цель 93000 = +2.1%, стоп 96500 = -1.6%

Не объясняй очевидное. Не пиши списки. Отвечай на русском.`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : (process.env.DATABASE_URL ? { rejectUnauthorized: false } : false)
});

// ─── DB init ─────────────────────────────────────────────────────────────────

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS allowed_uids (
      uid       VARCHAR(50) PRIMARY KEY,
      note      TEXT DEFAULT '',
      added_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password || req.body?.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Неверный пароль' });
  }
  next();
}

// ─── Public: check UID ───────────────────────────────────────────────────────

// GET /check?uid=12345&key=ACCESS_KEY
app.get('/check', async (req, res) => {
  const { uid, key } = req.query;

  if (key !== ACCESS_KEY) {
    return res.status(403).json({ authorized: false, error: 'Invalid key' });
  }
  if (!uid || uid.trim() === '') {
    return res.status(400).json({ authorized: false, error: 'No UID provided' });
  }

  if (uid.trim() === DEMO_UID) {
    return res.json({ authorized: true });
  }

  try {
    const { rows } = await pool.query(
      'SELECT uid FROM allowed_uids WHERE uid = $1',
      [uid.trim()]
    );
    res.json({ authorized: rows.length > 0 });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ authorized: false, error: 'Server error' });
  }
});

// ─── Admin panel ─────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Admin: list UIDs ────────────────────────────────────────────────────────

// GET /admin/uids
app.get('/admin/uids', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT uid, note, added_at FROM allowed_uids ORDER BY added_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: add UID ──────────────────────────────────────────────────────────

// POST /admin/uids  { uid, note }
app.post('/admin/uids', requireAdmin, async (req, res) => {
  const { uid, note } = req.body;
  if (!uid || uid.trim() === '') {
    return res.status(400).json({ error: 'UID обязателен' });
  }
  try {
    await pool.query(
      'INSERT INTO allowed_uids (uid, note) VALUES ($1, $2) ON CONFLICT (uid) DO UPDATE SET note = $2',
      [uid.trim(), note || '']
    );
    res.json({ success: true, uid: uid.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: remove UID ───────────────────────────────────────────────────────

// DELETE /admin/uids/:uid
app.delete('/admin/uids/:uid', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM allowed_uids WHERE uid = $1',
      [req.params.uid]
    );
    res.json({ success: true, deleted: rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analyze endpoint ────────────────────────────────────────────────────────
// POST /analyze  { uid, key, mode, context, userMessage, history, screenshotBase64 }

app.post('/analyze', async (req, res) => {
  const { uid, key, mode, context, userMessage, history, screenshotBase64, lang } = req.body;
  console.log(`[analyze] uid=${uid} lang=${lang} mode=${mode}`);
  const systemPrompt = lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT;

  if (key !== ACCESS_KEY) {
    return res.status(403).json({ error: 'Invalid key' });
  }
  if (!uid) {
    return res.status(400).json({ error: 'No UID' });
  }

  // Verify UID still has access
  if (uid.trim() !== DEMO_UID) {
    try {
      const { rows } = await pool.query('SELECT uid FROM allowed_uids WHERE uid = $1', [uid.trim()]);
      if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    } catch (err) {
      return res.status(500).json({ error: 'DB error' });
    }
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Build messages
  const messages = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const currentContent = [];
  if (screenshotBase64) {
    currentContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 }
    });
  }

  let promptText;
  if (userMessage) {
    promptText = userMessage;
  } else if (lang === 'en') {
    if (mode === 'long') {
      promptText = `I'm planning to go LONG${context ? ' on ' + context : ''}. Look at my drawings and current pattern. Should I enter right now? Give probability of success in %.`;
    } else if (mode === 'short') {
      promptText = `I'm planning to go SHORT${context ? ' on ' + context : ''}. Look at my drawings and current pattern. Should I enter right now? Give probability of success in %.`;
    } else {
      promptText = `What's on the chart${context ? ' ' + context : ''}? Long, short or wait?`;
    }
  } else {
    if (mode === 'long') {
      promptText = `Я планирую войти в ЛОНГ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
    } else if (mode === 'short') {
      promptText = `Я планирую войти в ШОРТ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
    } else {
      promptText = `Что на графике${context ? ' ' + context : ''}? Лонг, шорт или ждать?`;
    }
  }

  currentContent.push({ type: 'text', text: promptText });
  messages.push({ role: 'user', content: currentContent });

  const maxTokens = (mode === 'long' || mode === 'short') ? 400 : 300;

  try {
    const apiRes = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemPrompt, messages })
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Claude API error ${apiRes.status}` });
    }

    const data = await apiRes.json();
    res.json({ text: data.content[0].text });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Admin panel served from public/admin.html via express.static

// ─── Start ────────────────────────────────────────────────────────────────────

initDB()
  .then(() => app.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
