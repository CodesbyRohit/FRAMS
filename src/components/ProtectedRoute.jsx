import { Navigate, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/auth';

// UX only. Every route below is also enforced by the server.
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
};

export default ProtectedRoute;
