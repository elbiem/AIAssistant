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

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Ты — опытный крипто-трейдер. Анализируешь ТОЛЬКО:
1. Свечи (паттерны, структура, импульсы, откаты, объём свечей)
2. Объём (подтверждение движений, слабость/сила импульса, аномальные всплески)
3. Чертежи пользователя — СИНИЕ линии (линии тренда, наклонки, уровни поддержки/сопротивления, треугольники, клинья, каналы, зоны, проторговки)

ОБЯЗАТЕЛЬНО перед анализом определи глобальный тренд по всему видимому на графике:
- Общее направление (восходящий / нисходящий / боковик)
- Структура рынка: старшие максимумы/минимумы, куда идёт цена глобально
- Торговля против тренда — повышенный риск, это должно снижать вероятность отработки

По каждому уровню или линии из чертежей ОБЯЗАТЕЛЬНО оценивай два сценария:
- ПРОБОЙ: есть ли импульс, объём, закрытие свечи за уровнем — насколько вероятен пробой?
- ОТСКОК: есть ли реакция цены, слабость у уровня, поглощение — насколько вероятен отскок?
Выбирай наиболее вероятный сценарий с учётом глобального тренда.

ИГНОРИРОВАТЬ:
- Красная/оранжевая горизонтальная линия на графике — это просто маркер текущей цены ByBit, НЕ уровень, НЕ сопротивление, НЕ поддержка. Не упоминать её вообще.
- Любые индикаторы: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, стохастик и другие. Они не существуют.

Есть два режима ответа:

РЕЖИМ АВТО (нет указанного направления):
Формат — строго 1-2 строки:
📈 Лонг / 📉 Шорт / ⏳ Жди — [одна причина]
[Опционально: уровень входа или стоп]

РЕЖИМ ЛОНГ/ШОРТ (пользователь указал направление):
Формат — строго 3-4 строки:
✅ Входи / ❌ Не входи / ⚠️ Рискованно — [главная причина]
Вероятность отработки: X%
🎯 Цели: [уровень 1] (+X%) → [уровень 2] (+X%)
🛑 Стоп: [уровень] (-X%)
⚖️ R:R = 1:[соотношение] — [Отличный / Хороший / Приемлемый / Плохой] (мин. норма 1:3)

ПРАВИЛО РАСЧЁТА ПРОЦЕНТОВ (обязательно):
- ЛОНГ: цель выше цены входа → % = (цель - вход) / вход * 100, всегда положительный
- ШОРТ: цель ниже цены входа → % = (вход - цель) / вход * 100, всегда положительный
- Стоп: % потери от входа, всегда отрицательный
Пример лонг вход 95000: цель 97000 = +2.1%, стоп 93500 = -1.6%
Пример шорт вход 95000: цель 93000 = +2.1%, стоп 96500 = -1.6%

Не объясняй очевидное. Не пиши списки. Отвечай на русском.`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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
  const { uid, key, mode, context, userMessage, history, screenshotBase64 } = req.body;

  if (key !== ACCESS_KEY) {
    return res.status(403).json({ error: 'Invalid key' });
  }
  if (!uid) {
    return res.status(400).json({ error: 'No UID' });
  }

  // Verify UID still has access
  try {
    const { rows } = await pool.query('SELECT uid FROM allowed_uids WHERE uid = $1', [uid.trim()]);
    if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
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
  } else if (mode === 'long') {
    promptText = `Я планирую войти в ЛОНГ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
  } else if (mode === 'short') {
    promptText = `Я планирую войти в ШОРТ${context ? ' по ' + context : ''}. Смотри на мои чертежи и текущий паттерн. Стоит входить прямо сейчас? Дай вероятность успешной отработки в %.`;
  } else {
    promptText = `Что на графике${context ? ' ' + context : ''}? Лонг, шорт или ждать?`;
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
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages })
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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

initDB()
  .then(() => app.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
