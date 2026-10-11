import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { homePathFor, useAuth } from './context/auth';
import { Loading } from './ui';

const Overview = lazy(() => import('./pages/Dashboard'));
const Verify = lazy(() => import('./pages/Scanner'));
const Review = lazy(() => import('./pages/Review'));
const Corrections = lazy(() => import('./pages/Corrections'));
const Records = lazy(() => import('./pages/Records'));
const People = lazy(() => import('./pages/People'));
const Enroll = lazy(() => import('./pages/Register'));
const Export = lazy(() => import('./pages/Export'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const MyAttendance = lazy(() => import('./pages/StudentDashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

const STAFF = ['admin', 'faculty'];

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user?.role)} replace />;
}

function App() {
  const { status } = useAuth();

  if (status === 'checking') {
    return <div className="center-screen"><Loading label="Restoring your session" /></div>;
  }

  const guard = (el, roles) => <ProtectedRoute allowedRoles={roles}>{el}</ProtectedRoute>;

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ className: 'toast', duration: 4000 }} />
      <ErrorBoundary>
        <Suspense fallback={<div className="center-screen"><Loading /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={guard(<Overview />, STAFF)} />
              <Route path="verify" element={guard(<Verify />, STAFF)} />
              <Route path="review" element={guard(<Review />, STAFF)} />
              <Route path="records" element={guard(<Records />, STAFF)} />
              <Route path="people" element={guard(<People />, STAFF)} />
              <Route path="people/enroll" element={guard(<Enroll />, ['admin'])} />
              <Route path="export" element={guard(<Export />, ['admin'])} />
              <Route path="audit" element={guard(<AuditLog />, ['admin'])} />
              <Route path="corrections" element={<Corrections />} />
              <Route path="me" element={guard(<MyAttendance />, ['student'])} />
              <Route path="home" element={<HomeRedirect />} />
              {/* FRAMS 1.x paths */}
              <Route path="scanner" element={<Navigate to="/verify" replace />} />
              <Route path="register" element={<Navigate to="/people/enroll" replace />} />
              <Route path="student-dashboard" element={<Navigate to="/me" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
