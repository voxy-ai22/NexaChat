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
        status_message TEXT DEFAULT 'Streaming thoughts...',
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
// '0 7 * * *' runs at minute 0, hour 7 every day
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
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  app.use('/uploads', express.static(uploadDir));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  });
  const upload = multer({ storage });

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- API Routes ---

  // Auth
  app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
        [username, email, hashedPassword]
      );
      const user = result.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
      res.json({ user, token });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
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
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // User Profiles
  app.get('/api/users/:userId', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, username, email, avatar_url, status_message, created_at, is_online, last_active FROM users WHERE id = $1',
        [req.params.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.patch('/api/users/status', authenticateToken, async (req: any, res) => {
    const { status } = req.body;
    try {
      await pool.query('UPDATE users SET status_message = $1 WHERE id = $2', [status, req.user.id]);
      io.emit('status_update', { userId: req.user.id, status });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  app.patch('/api/users/profile', authenticateToken, async (req: any, res) => {
    const { username } = req.body;
    try {
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, req.user.id]);
      res.json({ success: true, username });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Media Uploads
  app.post('/api/media/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  // Stickers
  app.get('/api/stickers', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM stickers ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stickers' });
    }
  });

  app.post('/api/stickers', authenticateToken, upload.single('file'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    try {
      const result = await pool.query(
        'INSERT INTO stickers (url, user_id) VALUES ($1, $2) RETURNING *',
        [url, req.user.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create sticker' });
    }
  });

  // --- Socket.io ---

  const users = new Map(); // userId -> socketId

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('identify', async ({ userId }) => {
      users.set(userId, socket.id);
      await pool.query('UPDATE users SET is_online = true, last_active = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
      io.emit('presence_update', { userId, isOnline: true });
    });

    socket.on('send_message', async (data) => {
      const { content, type, senderId, parentId, mediaUrl, fileName, fileSize, viewOnce, duration } = data;
      try {
        const result = await pool.query(
          `INSERT INTO messages (content, type, sender_id, parent_id, media_url, file_name, file_size, view_once, duration) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [content, type, senderId, parentId, mediaUrl, fileName, fileSize, viewOnce, duration]
        );
        const newMessage = result.rows[0];
        
        // Get sender info
        const senderResult = await pool.query('SELECT username FROM users WHERE id = $1', [senderId]);
        newMessage.senderUsername = senderResult.rows[0].username;

        io.emit('new_message', newMessage);
      } catch (err) {
        console.error('Failed to save message:', err);
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
        console.error('Failed to add reaction:', err);
      }
    });

    socket.on('typing', ({ userId, username, isTyping }) => {
      socket.broadcast.emit('user_typing', { userId, username, isTyping });
    });

    socket.on('disconnect', async () => {
      let disconnectedUserId = null;
      for (const [userId, socketId] of users.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          users.delete(userId);
          break;
        }
      }

      if (disconnectedUserId) {
        await pool.query('UPDATE users SET is_online = false, last_active = CURRENT_TIMESTAMP WHERE id = $1', [disconnectedUserId]);
        io.emit('presence_update', { userId: disconnectedUserId, isOnline: false });
      }
      console.log('User disconnected:', socket.id);
    });
  });

  // History Route
  app.get('/api/messages', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT m.*, u.username as "senderUsername"
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        ORDER BY m.created_at ASC
        LIMIT 100
      `);
      
      const messages = result.rows;
      
      // Get reactions for these messages
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

        messages.forEach(m => {
          m.reactions = reactionsMap[m.id] || {};
        });
      }

      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/users/online', async (req, res) => {
    try {
      const result = await pool.query('SELECT id, username, avatar_url, is_online FROM users WHERE is_online = true');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch online users' });
    }
  });

  // Vite Integration
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

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    initDb();
  });
}

startServer();
