import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import cron from 'node-cron';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-chat';

// Database Initialization
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not found. Database functionality will be disabled.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
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
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    client.release();
  }
}

// Scheduled Task: Cleanup at 7 AM
cron.schedule('0 7 * * *', async () => {
  console.log("Running scheduled cleanup at 7 AM...");
  try {
    await pool.query('DELETE FROM messages');
    await pool.query('DELETE FROM reactions');
    console.log("Messages and reactions cleared.");
  } catch (err) {
    console.error("Cleanup task failed:", err);
  }
});

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(express.json());

  // Uploads setup
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '-' + safeName);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Invalid token' });
      req.user = user;
      next();
    });
  };

  // ─── API Routes ──────────────────────────────────────────────────

  // Auth - Register
  app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, status_message, avatar_url, created_at',
        [username.trim(), email.trim().toLowerCase(), hashedPassword]
      );
      const user = result.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ user, token });
    } catch (err: any) {
      if (err.code === '23505') {
        // Unique violation - check which field
        if (err.detail?.includes('email')) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        return res.status(400).json({ error: 'Username already taken' });
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  // Auth - Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ error: 'No account found with this email' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          status_message: user.status_message,
          created_at: user.created_at
        },
        token
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // ─── IMPORTANT: Specific routes BEFORE parameterized routes ──────

  // Users - Online list (MUST be before /api/users/:userId)
  app.get('/api/users/online', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, username, avatar_url, status_message, is_online FROM users WHERE is_online = true ORDER BY username ASC'
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Online users error:', err);
      res.status(500).json({ error: 'Failed to fetch online users' });
    }
  });

  // Users - Update profile (username + status) - MUST be before /api/users/:userId
  app.patch('/api/users/profile', authenticateToken, async (req: any, res) => {
    const { username, status } = req.body;
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (username && username.trim()) {
        updates.push(`username = $${idx++}`);
        values.push(username.trim());
      }
      if (status !== undefined) {
        updates.push(`status_message = $${idx++}`);
        values.push(status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      values.push(req.user.id);
      const result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, status_message, avatar_url`,
        values
      );
      res.json({ success: true, user: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Username already taken' });
      }
      console.error('Profile update error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Users - Update status only
  app.patch('/api/users/status', authenticateToken, async (req: any, res) => {
    const { status } = req.body;
    try {
      await pool.query('UPDATE users SET status_message = $1 WHERE id = $2', [status, req.user.id]);
      io.emit('status_update', { userId: req.user.id, status });
      res.json({ success: true });
    } catch (err) {
      console.error('Status update error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // Users - Get by ID (parameterized - AFTER specific routes)
  app.get('/api/users/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
      const result = await pool.query(
        'SELECT id, username, email, avatar_url, status_message, created_at, is_online, last_active FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Get user error:', err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Media Upload
  app.post('/api/media/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size });
  });

  // Stickers - Get all
  app.get('/api/stickers', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM stickers ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (err) {
      console.error('Stickers error:', err);
      res.status(500).json({ error: 'Failed to fetch stickers' });
    }
  });

  // Stickers - Create
  app.post('/api/stickers', authenticateToken, upload.single('file'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    const name = req.body.name || req.file.originalname.split('.')[0];
    try {
      const result = await pool.query(
        'INSERT INTO stickers (url, name, user_id) VALUES ($1, $2, $3) RETURNING *',
        [url, name, req.user.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Sticker create error:', err);
      res.status(500).json({ error: 'Failed to create sticker' });
    }
  });

  // Messages - Get history with reactions
  app.get('/api/messages', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          m.*,
          u.username as "senderUsername",
          pm.content as "parentContent",
          pu.username as "parentSenderUsername"
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages pm ON m.parent_id = pm.id
        LEFT JOIN users pu ON pm.sender_id = pu.id
        WHERE m.is_deleted = FALSE
        ORDER BY m.created_at ASC
        LIMIT 200
      `);

      const messages = result.rows;
      const messageIds = messages.map(m => m.id);

      if (messageIds.length > 0) {
        const reactionsResult = await pool.query(
          'SELECT * FROM reactions WHERE message_id = ANY($1)',
          [messageIds]
        );
        const reactionsMap = reactionsResult.rows.reduce((acc, r) => {
          if (!acc[r.message_id]) acc[r.message_id] = {};
          if (!acc[r.message_id][r.emoji]) acc[r.message_id][r.emoji] = [];
          acc[r.message_id][r.emoji].push(r.user_id);
          return acc;
        }, {} as any);

        messages.forEach(m => { m.reactions = reactionsMap[m.id] || {}; });
      }

      res.json(messages);
    } catch (err) {
      console.error('Messages error:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // ─── Socket.io ───────────────────────────────────────────────────

  const connectedUsers = new Map<number, string>(); // userId -> socketId

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('identify', async ({ userId }) => {
      connectedUsers.set(userId, socket.id);
      try {
        await pool.query(
          'UPDATE users SET is_online = true, last_active = CURRENT_TIMESTAMP WHERE id = $1',
          [userId]
        );
        // Emit updated online users list
        const onlineResult = await pool.query(
          'SELECT id, username, avatar_url, status_message, is_online FROM users WHERE is_online = true'
        );
        io.emit('online_users', onlineResult.rows);
        io.emit('presence_update', { userId, isOnline: true });
      } catch (err) {
        console.error('Identify error:', err);
      }
    });

    socket.on('send_message', async (data) => {
      const { content, type, senderId, parentId, mediaUrl, fileName, fileSize, viewOnce, duration } = data;
      try {
        const result = await pool.query(
          `INSERT INTO messages (content, type, sender_id, parent_id, media_url, file_name, file_size, view_once, duration)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [content || null, type, senderId, parentId || null, mediaUrl || null, fileName || null, fileSize || null, viewOnce || false, duration || null]
        );
        const newMessage = result.rows[0];

        // Get sender username
        const senderResult = await pool.query('SELECT username FROM users WHERE id = $1', [senderId]);
        newMessage.senderUsername = senderResult.rows[0]?.username || 'Unknown';
        newMessage.reactions = {};

        // If replying, get parent info
        if (parentId) {
          const parentResult = await pool.query(
            'SELECT m.content, u.username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1',
            [parentId]
          );
          if (parentResult.rows[0]) {
            newMessage.parentContent = parentResult.rows[0].content;
            newMessage.parentSenderUsername = parentResult.rows[0].username;
          }
        }

        io.emit('new_message', newMessage);
      } catch (err) {
        console.error('Send message error:', err);
      }
    });

    socket.on('add_reaction', async ({ messageId, userId, emoji }) => {
      try {
        await pool.query(
          'INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [messageId, userId, emoji]
        );
        io.emit('reaction_update', { messageId, userId, emoji });
      } catch (err) {
        console.error('Reaction error:', err);
      }
    });

    socket.on('typing', ({ userId, username, isTyping }) => {
      socket.broadcast.emit('user_typing', { userId, username, isTyping });
    });

    socket.on('disconnect', async () => {
      let disconnectedUserId: number | null = null;
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          connectedUsers.delete(userId);
          break;
        }
      }
      if (disconnectedUserId) {
        try {
          await pool.query(
            'UPDATE users SET is_online = false, last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [disconnectedUserId]
          );
          io.emit('presence_update', { userId: disconnectedUserId, isOnline: false });
        } catch (err) {
          console.error('Disconnect error:', err);
        }
      }
      console.log('Socket disconnected:', socket.id);
    });
  });

  // ─── Vite / Static ───────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = parseInt(process.env.PORT || '3000');
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    initDb();
  });
}

startServer();
