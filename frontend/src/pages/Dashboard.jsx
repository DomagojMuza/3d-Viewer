import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearToken, getToken } from '../utils/api.js';
import ShareModal from '../components/ShareModal.jsx';
import ThreeViewer from '../components/ThreeViewer.jsx';
import styles from './Dashboard.module.css';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [shareFile, setShareFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef();

  // Fetch file as blob with JWT so Three.js loader never hits a 401
  useEffect(() => {
    if (!previewFile) { setPreviewUrl(null); return; }
    let objectUrl;
    fetch(`/api/share-direct/${previewFile.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setPreviewUrl(objectUrl); })
      .catch((e) => setError(`Preview failed: ${e.message}`));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [previewFile]);

  async function loadFiles() {
    try {
      setFiles(await api.listFiles());
    } catch (err) {
      if (err.status === 401) { clearToken(); navigate('/login'); }
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFiles(); }, []);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    setError('');
    try {
      await api.uploadFile(fd);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      fileInputRef.current.value = '';
    }
  }

  async function handleDelete(file) {
    if (!confirm(`Delete "${file.original_name}"? This cannot be undone.`)) return;
    try {
      await api.deleteFile(file.id);
      if (previewFile?.id === file.id) setPreviewFile(null);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.title}>3D Viewer</span>
          <button className={styles.logoutBtn} onClick={logout}>Logout</button>
        </div>

        <div className={styles.uploadArea}>
          <button
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '+ Upload file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl,.3mf,.glb,.gltf,.obj,.ply"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          <p className={styles.hint}>STL · 3MF · GLB · GLTF · OBJ · PLY</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.hint}>Loading…</p>
        ) : (
          <ul className={styles.fileList}>
            {files.map((f) => (
              <li
                key={f.id}
                className={`${styles.fileItem} ${previewFile?.id === f.id ? styles.active : ''}`}
                onClick={() => setPreviewFile(f)}
              >
                <div className={styles.fileName}>{f.original_name}</div>
                <div className={styles.fileMeta}>
                  {f.format.toUpperCase()} · {formatBytes(f.size)}
                </div>
                <div className={styles.fileActions}>
                  <button
                    className={styles.shareBtn}
                    onClick={(e) => { e.stopPropagation(); setShareFile(f); }}
                  >
                    Share
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(f); }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {files.length === 0 && <p className={styles.hint}>No files yet.</p>}
          </ul>
        )}
      </aside>

      <main className={styles.viewer}>
        {previewUrl ? (
          <ThreeViewer
            key={previewFile.id}
            url={previewUrl}
            format={previewFile.format}
          />
        ) : (
          <div className={styles.empty}>Select a file to preview</div>
        )}
      </main>

      {shareFile && <ShareModal file={shareFile} onClose={() => setShareFile(null)} />}
    </div>
  );
}
