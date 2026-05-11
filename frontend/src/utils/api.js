const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('jwt');
}

export function setToken(token) {
  localStorage.setItem('jwt', token);
}

export function clearToken() {
  localStorage.removeItem('jwt');
}

async function request(method, path, body, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status });
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  listFiles: () => request('GET', '/files'),
  uploadFile: (formData) => request('POST', '/files', formData, true),
  deleteFile: (id) => request('DELETE', `/files/${id}`),
  createShareToken: (fileId, expiresInHours) =>
    request('POST', `/files/${fileId}/share`, { expiresInHours }),
  getShareMeta: (token) => request('GET', `/share/${token}`),
};
