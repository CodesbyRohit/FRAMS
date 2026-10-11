import axios from 'axios';

export const SESSION_KEY = 'frams.session';
export const SESSION_EXPIRED_EVENT = 'frams:session-expired';

// In development Vite proxies /api to the Express server (vite.config.js).
// For a separate deployment set VITE_API_URL, e.g. https://api.example.edu/api
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

export const readSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.token && parsed?.user ? parsed : null;
  } catch {
    return null;
  }
};

api.interceptors.request.use((config) => {
  const session = readSession();
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

// No offline fallbacks: a failed request is reported as a failure. (The previous
// "demo safe mode" reported unsaved attendance as saved and granted fake sessions.)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLogin) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
