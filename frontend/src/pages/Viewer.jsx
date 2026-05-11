import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import ThreeViewer from '../components/ThreeViewer.jsx';
import styles from './Viewer.module.css';

export default function Viewer() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getShareMeta(token)
      .then(setMeta)
      .catch((err) => {
        if (err.status === 410) setError('This share link has expired.');
        else if (err.status === 404) setError('Share link not found.');
        else setError(err.message);
      });
  }, [token]);

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!meta) {
    return <div className={styles.center}><p>Loading…</p></div>;
  }

  const fileUrl = `/api/share/${token}/download`;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.name}>{meta.original_name}</span>
        <span className={styles.meta}>
          {meta.format.toUpperCase()} · expires {new Date(meta.expires_at).toLocaleString()}
        </span>
      </header>
      <div className={styles.viewer}>
        <ThreeViewer url={fileUrl} format={meta.format} />
      </div>
    </div>
  );
}
