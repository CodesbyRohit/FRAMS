import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Scanner from './pages/Scanner';
import Records from './pages/Records';
import Export from './pages/Export';
import StudentDashboard from './pages/StudentDashboard';

import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { faceService } from './services/faceService';
import ErrorBoundary from './components/ErrorBoundary';
import McuVfxIntro from './components/McuVfxIntro';
// Production Hardening: Global Demo Safe Mode
// Set to false for full production data sync; true for zero-failure demo mode.
window.DEMO_SAFE_MODE = true;
window.DEMO_MODE = true; 

function App() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [showIntro, setShowIntro] = useState(() => {
    if (sessionStorage.getItem('frams_intro_played')) {
      return false;
    }
    return true;
  });

  // Load models in background
  useEffect(() => {
    faceService.loadModels().catch(console.error);
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('frams_intro_played', 'true');
    setShowIntro(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-arc-blue border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-arc-blue font-mono text-sm animate-pulse tracking-widest">A.R.I.A. HYDRATING...</p>
        </div>
      </div>
    );
  }

  if (showIntro) {
    return <McuVfxIntro onComplete={handleIntroComplete} />;
  }

  return (
    <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
        }} />
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute allowedRoles={['admin', 'faculty']}>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="register" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Register />
                </ProtectedRoute>
              } />
              <Route path="scanner" element={<Scanner />} />
              <Route path="records" element={<Records />} />
              <Route path="export" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Export />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="/student-dashboard" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<StudentDashboard />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
