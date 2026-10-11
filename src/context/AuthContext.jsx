import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { readSession, SESSION_EXPIRED_EVENT, SESSION_KEY } from '../services/api';
import { AuthContext } from './auth';

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readSession());
  const [status, setStatus] = useState(() => (readSession() ? 'checking' : 'signed-out'));
  const [notice, setNotice] = useState(null);

  const clear = useCallback((message = null) => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setStatus('signed-out');
    setNotice(message);
  }, []);

  // Validate a stored session with the server instead of trusting localStorage.
  useEffect(() => {
    localStorage.removeItem('framsUser'); // pre-2.0 session format (could hold fake tokens)
    if (!readSession()) return;
    let cancelled = false;
    api.get('/auth/profile')
      .then(({ data }) => {
        if (cancelled) return;
        const next = { ...readSession(), user: data };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
        setStatus('signed-in');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) clear('Your session expired. Please sign in again.');
        else setStatus('signed-in'); // server unreachable: keep session, pages show their own errors
      });
    return () => { cancelled = true; };
  }, [clear]);

  useEffect(() => {
    const onExpired = () => clear('Your session expired. Please sign in again.');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [clear]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const next = { token: data.token, user: data.user };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    setStatus('signed-in');
    setNotice(null);
    return data.user;
  }, []);

  const logout = useCallback(() => clear(null), [clear]);

  const value = useMemo(() => ({
    user: session?.user ?? null,
    status,
    isAuthenticated: Boolean(session),
    notice,
    login,
    logout,
  }), [session, status, notice, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
