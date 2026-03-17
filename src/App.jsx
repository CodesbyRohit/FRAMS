import React, { useEffect } from 'react';
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

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { faceService } from './services/faceService';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  // Load models in background
  useEffect(() => {
    faceService.loadModels().catch(console.error);
  }, []);

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}

export default App;
