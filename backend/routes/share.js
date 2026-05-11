const express = require('express');
const path = require('path');
const { db } = require('../db/database');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../data/uploads');

// Helper: resolve token → file, enforcing expiry
function resolveToken(tokenValue) {
  const row = db.prepare(`
    SELECT st.*, f.filename, f.original_name, f.format, f.size, f.uploaded_at
    FROM share_tokens st
    JOIN files f ON f.id = st.file_id
    WHERE st.token = ?
  `).get(tokenValue);

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return 'expired';
  return row;
}

// GET /api/share/:token  — public: metadata
router.get('/:token', (req, res) => {
  const result = resolveToken(req.params.token);
  if (!result) return res.status(404).json({ error: 'Share link not found.' });
  if (result === 'expired') return res.status(410).json({ error: 'Share link has expired.' });

  res.json({
    original_name: result.original_name,
    format: result.format,
    size: result.size,
    uploaded_at: result.uploaded_at,
    expires_at: result.expires_at,
  });
});

// GET /api/share/:token/download  — public: stream file
router.get('/:token/download', (req, res) => {
  const result = resolveToken(req.params.token);
  if (!result) return res.status(404).json({ error: 'Share link not found.' });
  if (result === 'expired') return res.status(410).json({ error: 'Share link has expired.' });

  const filePath = path.join(UPLOADS_DIR, result.filename);
  res.setHeader('Content-Disposition', `inline; filename="${result.original_name}"`);
  res.sendFile(filePath);
});

module.exports = router;
