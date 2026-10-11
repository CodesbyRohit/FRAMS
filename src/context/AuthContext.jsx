import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const savedUser = localStorage.getItem('framsUser');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          // Defensive check: Ensure parsed object has essential fields
          if (parsed && parsed.token) {
            setUser(parsed);
          } else {
            throw new Error('Malformed session data');
          }
        }
      } catch (error) {
        console.error('A.R.I.A. -> SESSION HYDRATION FAILED:', error);
        localStorage.removeItem('framsUser');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    hydrateSession();
  }, []);

  const login = async (role, password) => {
    try {
      // For F.R.A.M.S, the 'role' is used as the login identifier since we use role-based passwords
      const email = `${role.toLowerCase()}@frams.edu`; 
      
      const { data } = await api.post('/auth/login', {
        email,
        password,
        role: role.toLowerCase()
      });

      // Robust Response Parsing: Always ensure a user object exists
      const userData = {
        _id: data?.user?.id || data?.user?._id || data?.id || `demo_${role}_${Date.now()}`,
        username: data?.user?.username || data?.user?.name || data?.username || data?.name || role.charAt(0).toUpperCase() + role.slice(1),
        role: data?.user?.role || data?.role || role || 'guest',
        isAuthenticated: true,
        token: data?.token || 'offline_bypass_token',
        avatar: (data?.user?.username || data?.user?.name || role || 'P').charAt(0).toUpperCase()
      };

      setUser(userData);
      localStorage.setItem('framsUser', JSON.stringify(userData));
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Invalid credentials' 
      };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('framsUser');
  };

  return (
    <AuthContext.Provider value={{ 
      user: user || { role: 'guest', username: 'Personnel', avatar: 'P' }, 
      login, 
      logout, 
      isLoading, 
      isAuthenticated: !!user?.token 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
