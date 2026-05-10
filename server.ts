import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-chat';

// ─── DB Init ──────────────────────────────────────────────────────
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set.');
    return;
  }
  try {
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
    console.log('DB initialized');
  } catch (err) {
    console.error('DB init error:', err);
  }
}

// ─── App setup ────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// Socket.io — NOTE: on Vercel serverless this won't persist between requests
// For production use Vercel + Pusher/Ably/Railway instead
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
  path: '/socket.io',
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Uploads
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Auth middleware
const auth = (req: any, res: any, next: any) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ─── Auth Routes ──────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (username.trim().length < 3)
    return res.status(400).json({ error: 'Username min 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password min 6 characters' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, status_message, avatar_url, created_at`,
      [username.trim(), email.trim().toLowerCase(), hashed]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ user, token });
  } catch (err: any) {
    if (err.code === '23505') {
      if (err.constraint?.includes('email') || err.detail?.includes('email'))
        return res.status(400).json({ error: 'Email already registered' });
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.error('Register:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = result.rows[0];
    if (!user)
      return res.status(401).json({ error: 'No account with this email' });
    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Wrong password' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({
      user: {
        id: user.id, username: user.username, email: user.email,
        avatar_url: user.avatar_url, status_message: user.status_message,
        created_at: user.created_at
      },
      token
    });
  } catch (err: any) {
    console.error('Login:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── User Routes — SPECIFIC before PARAMETERIZED ─────────────────

app.get('/api/users/online', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, avatar_url, status_message, is_online FROM users WHERE is_online = true ORDER BY username'
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('Online users:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

app.patch('/api/users/profile', auth, async (req: any, res) => {
  const { username, status } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (username?.trim()) { sets.push(`username=$${i++}`); vals.push(username.trim()); }
  if (status !== undefined) { sets.push(`status_message=$${i++}`); vals.push(status); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    vals.push(req.user.id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(',')} WHERE id=$${i} RETURNING id,username,email,status_message,avatar_url`,
      vals
    );
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username taken' });
    console.error('Profile update:', err.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

app.patch('/api/users/status', auth, async (req: any, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE users SET status_message=$1 WHERE id=$2', [status, req.user.id]);
    io.emit('status_update', { userId: req.user.id, status });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Status:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const id = parseInt(req.params.userId);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const r = await pool.query(
      'SELECT id,username,email,avatar_url,status_message,created_at,is_online,last_active FROM users WHERE id=$1',
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json(r.rows[0]);
  } catch (err: any) {
    console.error('Get user:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

// ─── Media ────────────────────────────────────────────────────────

app.post('/api/media/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url, size: req.file.size });
});

// ─── Stickers ─────────────────────────────────────────────────────

app.get('/api/stickers', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM stickers ORDER BY created_at DESC');
    return res.json(r.rows);
  } catch (err: any) {
    console.error('Stickers:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/stickers', auth, upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  const name = req.body.name || req.file.originalname.replace(/\.[^/.]+$/, '');
  try {
    const r = await pool.query(
      'INSERT INTO stickers (url,name,user_id) VALUES ($1,$2,$3) RETURNING *',
      [url, name, req.user.id]
    );
    return res.json(r.rows[0]);
  } catch (err: any) {
    console.error('Add sticker:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

// ─── Messages ─────────────────────────────────────────────────────

app.get('/api/messages', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT m.*, u.username as "senderUsername",
             pm.content as "parentContent",
             pu.username as "parentSenderUsername"
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
});

// ─── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Socket.io ────────────────────────────────────────────────────

const connectedUsers = new Map<number, string>();

io.on('connection', (socket) => {
  socket.on('identify', async ({ userId }) => {
    connectedUsers.set(userId, socket.id);
    try {
      await pool.query(
        'UPDATE users SET is_online=true, last_active=CURRENT_TIMESTAMP WHERE id=$1', [userId]
      );
      const online = await pool.query(
        'SELECT id,username,avatar_url,status_message FROM users WHERE is_online=true'
      );
      io.emit('online_users', online.rows);
    } catch (e) { /* noop */ }
  });

  socket.on('send_message', async (data) => {
    const { content, type, senderId, parentId, mediaUrl, fileName, fileSize, viewOnce, duration } = data;
    try {
      const r = await pool.query(
        `INSERT INTO messages (content,type,sender_id,parent_id,media_url,file_name,file_size,view_once,duration)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [content || null, type, senderId, parentId || null, mediaUrl || null,
          fileName || null, fileSize || null, viewOnce || false, duration || null]
      );
      const msg = r.rows[0];
      const sender = await pool.query('SELECT username FROM users WHERE id=$1', [senderId]);
      msg.senderUsername = sender.rows[0]?.username || 'Unknown';
      msg.reactions = {};
      if (parentId) {
        const parent = await pool.query(
          'SELECT m.content, u.username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=$1',
          [parentId]
        );
        if (parent.rows[0]) {
          msg.parentContent = parent.rows[0].content;
          msg.parentSenderUsername = parent.rows[0].username;
        }
      }
      io.emit('new_message', msg);
    } catch (e) { console.error('send_message', e); }
  });

  socket.on('add_reaction', async ({ messageId, userId, emoji }) => {
    try {
      await pool.query(
        'INSERT INTO reactions (message_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [messageId, userId, emoji]
      );
      io.emit('reaction_update', { messageId, userId, emoji });
    } catch (e) { /* noop */ }
  });

  socket.on('typing', ({ userId, username, isTyping }) => {
    socket.broadcast.emit('user_typing', { userId, username, isTyping });
  });

  socket.on('disconnect', async () => {
    for (const [uid, sid] of connectedUsers.entries()) {
      if (sid === socket.id) {
        connectedUsers.delete(uid);
        try {
          await pool.query(
            'UPDATE users SET is_online=false, last_active=CURRENT_TIMESTAMP WHERE id=$1', [uid]
          );
          io.emit('presence_update', { userId: uid, isOnline: false });
        } catch (e) { /* noop */ }
        break;
      }
    }
  });
});

// ─── Serve frontend ───────────────────────────────────────────────

const isVercel = process.env.VERCEL === '1';
const isProd = process.env.NODE_ENV === 'production';

if (!isVercel && !isProd) {
  // Local dev — use Vite dev server
  import('vite').then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  });
} else {
  // Production / Vercel — serve built files
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// ─── Start ────────────────────────────────────────────────────────

// For Vercel serverless export
export default app;

// For local dev / Railway / Render (not Vercel)
if (!isVercel) {
  const PORT = parseInt(process.env.PORT || '3000');
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Running on http://0.0.0.0:${PORT}`);
    initDb();
  });
} else {
  // On Vercel, init DB on first request
  initDb().catch(console.error);
}
