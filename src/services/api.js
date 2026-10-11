import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use(
  (config) => {
    const user = JSON.parse(localStorage.getItem('framsUser'));
    if (user && user.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401/403 (Unauthorized/Forbidden)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Demo Safe Mode: Provide local fallback if backend is unreachable or errors
    if (window.DEMO_SAFE_MODE && error.config && error.config.url) {
      const url = error.config.url;
      
      // Attendance Marking Fallback
      if (url.includes('/attendance/mark')) {
        console.warn('A.R.I.A. -> BACKEND UNREACHABLE. ENGAGING LOCAL FAILOVER.');
        const pending = JSON.parse(localStorage.getItem('frams_offline_records') || '[]');
        const record = error.config.data ? JSON.parse(error.config.data) : {};
        pending.push({ ...record, timestamp: new Date().toISOString(), offline: true });
        localStorage.setItem('frams_offline_records', JSON.stringify(pending));
        return Promise.resolve({ data: { success: true, message: 'Offline sync active' } });
      }

      // NEW: Specific Demo Login Failover
      if (url.includes('/auth/login')) {
         const body = error.config.data ? JSON.parse(error.config.data) : {};
         const role = (body.role || '').toLowerCase();
         const password = body.password || '';
         
         // Master Key Check: If matches, provide instant authorized session
         if ((role === 'admin' && password === 'admin@123') ||
             (role === 'faculty' && password === 'faculty@123') ||
             (role === 'student' && password === 'student@123')) {
           
           console.warn(`A.R.I.A. -> MASTER KEY DETECTED (${role}). AUTHORIZING EXTERNALLY.`);
           return Promise.resolve({ 
             data: { 
               token: 'demo_token_stark_industries_master',
               user: {
                 id: 'demo_id_' + role,
                 role: role,
                 username: role.charAt(0).toUpperCase() + role.slice(1)
               }
             } 
           });
         }
         
         // If credentials don't match the master keys, let the 401 error pass through
         console.error('A.R.I.A. -> AUTHENTICATION REJECTED. INVALID MASTER KEY.');
         return Promise.reject(error);
      }

      // Collection Endpoints Fallback
      if (url.includes('/attendance') || url.includes('/users')) {
        console.warn(`A.R.I.A. -> COLLECTION FETCH FAILED (${url}). PROVIDING SAFE ARRAY.`);
        return Promise.resolve({ data: [] });
      }
    }

    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.warn('Unauthorized access detected - Clearing session');
      localStorage.removeItem('framsUser');
      // Only redirect if not already on login page to avoid loops
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
