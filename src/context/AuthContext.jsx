import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('framsUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = async (role, password) => {
    try {
      // For F.R.A.M.S, the 'role' is used as the login identifier since we use role-based passwords
      const email = `${role.toLowerCase()}@frams.edu`; 
      
      const { data } = await api.post('/auth/login', {
        email,
        password,
        role: role.toLowerCase()
      });

      const userData = {
        _id: data._id,
        username: data.name,
        role: data.role,
        isAuthenticated: true,
        email: data.email,
        token: data.token,
        avatar: data.name.charAt(0)
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
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
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
