import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Singleton pool
let _pool: pg.Pool | null = null;
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
  }
  return _pool;
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-chat';

async function initDb(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar_url TEXT,
      status_message TEXT DEFAULT 'Hey there! I am using Nexa.',
      is_online BOOLEAN DEFAULT FALSE,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      content TEXT,
      type VARCHAR(20) NOT NULL,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      media_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      duration INTEGER,
      view_once BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(10) NOT NULL,
      UNIQUE(message_id, user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS stickers (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      name VARCHAR(100),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function getToken(req: VercelRequest): { id: number; username: string } | null {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const token = auth.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pool = getPool();
  
  // Init DB on every cold start (idempotent — IF NOT EXISTS)
  try {
    await initDb(pool);
  } catch (err: any) {
    console.error('DB init failed:', err.message);
    return res.status(500).json({ error: 'Database connection failed. Check DATABASE_URL.' });
  }

  const url = req.url || '';
  // Strip query string for routing
  const pathname = url.split('?')[0];

  // ── POST /api/auth/register ──────────────────────────────────────
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields required' });
    if (username.trim().length < 3)
      return res.status(400).json({ error: 'Username min 3 characters' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password min 6 characters' });
    try {
      const hashed = await bcrypt.hash(password, 10);
      const r = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, status_message, avatar_url, created_at`,
        [username.trim(), email.trim().toLowerCase(), hashed]
      );
      const user = r.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({ user, token });
    } catch (err: any) {
      if (err.code === '23505') {
        if (err.detail?.includes('email')) return res.status(400).json({ error: 'Email already registered' });
        return res.status(400).json({ error: 'Username already taken' });
      }
      console.error('Register:', err.message);
      return res.status(500).json({ error: 'Registration failed' });
    }
  }

  // ── POST /api/auth/login ─────────────────────────────────────────
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });
    try {
      const r = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
      const user = r.rows[0];
      if (!user) return res.status(401).json({ error: 'No account with this email' });
      if (!(await bcrypt.compare(password, user.password)))
        return res.status(401).json({ error: 'Wrong password' });
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({
        user: { id: user.id, username: user.username, email: user.email,
                avatar_url: user.avatar_url, status_message: user.status_message, created_at: user.created_at },
        token
      });
    } catch (err: any) {
      console.error('Login:', err.message);
      return res.status(500).json({ error: 'Login failed' });
    }
  }

  // ── GET /api/users/online ────────────────────────────────────────
  if (pathname === '/api/users/online' && req.method === 'GET') {
    try {
      const r = await pool.query(
        'SELECT id, username, avatar_url, status_message, is_online FROM users ORDER BY username'
      );
      return res.json(r.rows);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed' });
    }
  }

  // ── PATCH /api/users/profile ─────────────────────────────────────
  if (pathname === '/api/users/profile' && req.method === 'PATCH') {
    const user = getToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { username, status } = req.body;
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (username?.trim()) { sets.push(`username=$${i++}`); vals.push(username.trim()); }
    if (status !== undefined) { sets.push(`status_message=$${i++}`); vals.push(status); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    try {
      vals.push(user.id);
      const r = await pool.query(
        `UPDATE users SET ${sets.join(',')} WHERE id=$${i} RETURNING id,username,email,status_message,avatar_url`,
        vals
      );
      return res.json({ success: true, user: r.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Username taken' });
      return res.status(500).json({ error: 'Update failed' });
    }
  }

  // ── PATCH /api/users/status ──────────────────────────────────────
  if (pathname === '/api/users/status' && req.method === 'PATCH') {
    const user = getToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
      await pool.query('UPDATE users SET status_message=$1 WHERE id=$2', [req.body.status, user.id]);
      return res.json({ success: true });
    } catch { return res.status(500).json({ error: 'Failed' }); }
  }

  // ── GET /api/users/:id ───────────────────────────────────────────
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && req.method === 'GET') {
    const id = parseInt(userMatch[1]);
    try {
      const r = await pool.query(
        'SELECT id,username,email,avatar_url,status_message,created_at,is_online,last_active FROM users WHERE id=$1',
        [id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.json(r.rows[0]);
    } catch { return res.status(500).json({ error: 'Failed' }); }
  }

  // ── GET /api/messages ────────────────────────────────────────────
  if (pathname === '/api/messages' && req.method === 'GET') {
    try {
      const r = await pool.query(`
        SELECT m.*, u.username as "senderUsername",
               pm.content as "parentContent", pu.username as "parentSenderUsername"
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages pm ON m.parent_id = pm.id
        LEFT JOIN users pu ON pm.sender_id = pu.id
        WHERE m.is_deleted = FALSE
        ORDER BY m.created_at ASC LIMIT 200
      `);
      const msgs = r.rows;
      const ids = msgs.map(m => m.id);
      if (ids.length) {
        const rr = await pool.query('SELECT * FROM reactions WHERE message_id = ANY($1)', [ids]);
        const map: any = {};
        rr.rows.forEach(rx => {
          if (!map[rx.message_id]) map[rx.message_id] = {};
          if (!map[rx.message_id][rx.emoji]) map[rx.message_id][rx.emoji] = [];
          map[rx.message_id][rx.emoji].push(rx.user_id);
        });
        msgs.forEach(m => { m.reactions = map[m.id] || {}; });
      }
      return res.json(msgs);
    } catch (err: any) {
      console.error('Messages:', err.message);
      return res.status(500).json({ error: 'Failed' });
    }
  }

  // ── POST /api/messages ───────────────────────────────────────────
  if (pathname === '/api/messages' && req.method === 'POST') {
    const user = getToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { content, type, parentId, mediaUrl, fileName, fileSize, viewOnce, duration } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO messages (content,type,sender_id,parent_id,media_url,file_name,file_size,view_once,duration)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [content||null, type||'text', user.id, parentId||null, mediaUrl||null,
         fileName||null, fileSize||null, viewOnce||false, duration||null]
      );
      const msg = r.rows[0];
      msg.senderUsername = user.username;
      msg.reactions = {};
      return res.json(msg);
    } catch (err: any) {
      console.error('Post message:', err.message);
      return res.status(500).json({ error: 'Failed' });
    }
  }

  // ── POST /api/reactions ──────────────────────────────────────────
  if (pathname === '/api/reactions' && req.method === 'POST') {
    const u = getToken(req);
    if (!u) return res.status(401).json({ error: 'Unauthorized' });
    const { messageId, emoji } = req.body;
    try {
      await pool.query(
        'INSERT INTO reactions (message_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [messageId, u.id, emoji]
      );
      return res.json({ success: true });
    } catch { return res.status(500).json({ error: 'Failed' }); }
  }

  // ── GET /api/stickers ────────────────────────────────────────────
  if (pathname === '/api/stickers' && req.method === 'GET') {
    try {
      const r = await pool.query('SELECT * FROM stickers ORDER BY created_at DESC');
      return res.json(r.rows);
    } catch { return res.status(500).json({ error: 'Failed' }); }
  }

  // ── GET /api/health ──────────────────────────────────────────────
  if (pathname === '/api/health') {
    try {
      await pool.query('SELECT 1');
      return res.json({ ok: true, db: 'connected', ts: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(404).json({ error: `Route not found: ${req.method} ${pathname}` });
}
