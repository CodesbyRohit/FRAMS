import { useEffect, useState } from 'react';
import api from '../services/api';

// Real reachability check against GET /api/health. Polls every 60 s.
export default function useHealth() {
  const [health, setHealth] = useState({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    const check = () =>
      api.get('/health', { timeout: 5000 })
        .then(({ data }) => alive && setHealth({ state: data.database === 'connected' ? 'ok' : 'degraded', ...data, checkedAt: new Date() }))
        .catch(() => alive && setHealth({ state: 'down', checkedAt: new Date() }));
    check();
    const t = setInterval(check, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return health;
}
