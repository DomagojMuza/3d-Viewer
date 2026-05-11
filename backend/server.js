'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');

const app = express();

// --- Security headers (basic) ---
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// --- CORS ---
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: false }));

// --- Body parsing ---
app.use(express.json());

// --- API routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/share', require('./routes/share'));

// Admin direct preview: serve file by DB id (requires JWT)
const requireAuth = require('./middleware/auth');
const { init, db } = require('./db/database');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../data/uploads');
app.get('/api/share-direct/:id', requireAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`);
  res.sendFile(path.join(UPLOADS_DIR, file.filename));
});

// --- Serve React frontend in production ---
const DIST = path.join(__dirname, '../frontend/dist');
if (require('fs').existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// --- Start ---
const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`3D Viewer API running on port ${PORT}`)))
  .catch((err) => { console.error('Failed to initialize DB:', err); process.exit(1); });
