import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  UserPlus, 
  Camera, 
  FileText, 
  Download,
  GraduationCap,
  ShieldCheck,
  Briefcase
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user } = useAuth();

  const allLinks = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'faculty'] },
    { to: '/student-dashboard', icon: LayoutDashboard, label: 'My Progress', roles: ['student'] },
    { to: '/register', icon: UserPlus, label: 'Register User', roles: ['admin'] },
    { to: '/scanner', icon: Camera, label: 'Scanner', roles: ['admin', 'faculty'] },
    { to: '/records', icon: FileText, label: 'Records', roles: ['admin', 'faculty'] },
    { to: '/export', icon: Download, label: 'Export Data', roles: ['admin'] },
  ];

  const filteredLinks = allLinks.filter(link => link.roles.includes(user?.role));

  const getRoleIcon = () => {
    switch(user?.role) {
      case 'admin': return <ShieldCheck size={16} />;
      case 'faculty': return <Briefcase size={16} />;
      case 'student': return <GraduationCap size={16} />;
      default: return null;
    }
  };

  return (
    <aside className="sidebar">
      <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '-0.5px' }}>
          F.R.A.M.S
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Secure Attendance System
        </p>
      </div>
      
      <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'var(--accent-blue)' : 'transparent',
              textDecoration: 'none',
              fontWeight: 500,
              transition: 'all 0.2s'
            })}
          >
            <link.icon size={20} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
        <div className="glass-panel" style={{ 
          padding: '1rem', 
          borderRadius: '0.75rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.1)'
        }}>
          <div style={{ color: 'var(--accent-blue)' }}>{getRoleIcon()}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 600 }}>
            {(user?.role || 'Guest')?.toUpperCase()} MODE
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
