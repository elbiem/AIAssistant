const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const ACCESS_KEY     = process.env.ACCESS_KEY || 'bybit-ext-key';
const PORT           = process.env.PORT || 3000;

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

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Admin panel served from public/admin.html via express.static

// ─── Start ────────────────────────────────────────────────────────────────────

initDB()
  .then(() => app.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
