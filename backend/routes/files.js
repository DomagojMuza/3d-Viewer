const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const ALLOWED_EXTENSIONS = new Set(['.stl', '.3mf', '.glb', '.gltf', '.obj', '.ply']);
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../data/uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`File type "${ext}" is not allowed.`), { status: 400 }));
    }
  },
});

// GET /api/files
router.get('/', requireAuth, (req, res) => {
  const files = db.prepare(`
    SELECT f.id, f.filename, f.original_name, f.format, f.size, f.uploaded_at,
           u.username AS uploaded_by
    FROM files f
    JOIN users u ON u.id = f.uploaded_by
    ORDER BY f.uploaded_at DESC
  `).all();
  res.json(files);
});

// POST /api/files
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().slice(1);

  const result = db.prepare(`
    INSERT INTO files (filename, original_name, format, size, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.file.filename, req.file.originalname, ext, req.file.size, req.user.sub);

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(file);
});

// DELETE /api/files/:id
router.delete('/:id', requireAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  // Delete from disk
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from DB (share_tokens cascade deleted automatically)
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);

  res.status(204).end();
});

// POST /api/files/:id/share
router.post('/:id/share', requireAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  const expiresInHours = parseInt(req.body.expiresInHours, 10);
  if (!expiresInHours || expiresInHours < 1 || expiresInHours > 8760) {
    return res.status(400).json({ error: 'expiresInHours must be between 1 and 8760.' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO share_tokens (file_id, token, expires_at) VALUES (?, ?, ?)').run(
    file.id, token, expiresAt
  );

  res.status(201).json({ token, expires_at: expiresAt });
});

// Error handler for multer
router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

module.exports = router;
