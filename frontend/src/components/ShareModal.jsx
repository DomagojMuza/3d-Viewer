import { useState } from 'react';
import { api } from '../utils/api.js';
import styles from './ShareModal.module.css';

const EXPIRY_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
];

export default function ShareModal({ file, onClose }) {
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const { token } = await api.createShareToken(file.id, expiresInHours);
      const url = `${window.location.origin}/view/${token}`;
      setLink(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Share "{file.original_name}"</h2>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>
          Link expires after
          <select value={expiresInHours} onChange={(e) => setExpiresInHours(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button className={styles.btn} onClick={generate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate link'}
        </button>
        {link && (
          <div className={styles.linkRow}>
            <input readOnly value={link} onClick={(e) => e.target.select()} />
            <button className={styles.copyBtn} onClick={copy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        <button className={styles.closeBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
