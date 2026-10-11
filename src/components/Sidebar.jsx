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

  const userRole = (user?.role || 'guest').toLowerCase();
  const filteredLinks = allLinks.filter(link => link.roles.includes(userRole));

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
            className="sidebar-link"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.25rem',
              color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'rgba(34, 211, 238, 0.05)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--accent-blue)' : '3px solid transparent',
              textDecoration: 'none',
              fontWeight: isActive ? 600 : 500,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: isActive ? 'inset 10px 0 20px -10px rgba(34, 211, 238, 0.2)' : 'none'
            })}
          >
            {({ isActive }) => (
              <>
                <link.icon size={20} className={isActive ? 'animate-pulse' : ''} style={{ filter: isActive ? 'drop-shadow(0 0 5px rgba(34,211,238,0.5))' : 'none' }} />
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.875rem' }}>{link.label}</span>
                {isActive && (
                  <div style={{ position: 'absolute', right: '1rem', width: '4px', height: '4px', backgroundColor: 'var(--accent-blue)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-blue)' }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
        <div className="glow-low" style={{ 
          padding: '1rem', 
          borderRadius: '0.25rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          backgroundColor: 'rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ color: 'var(--accent-blue)' }}>{getRoleIcon()}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {user?.role || 'GUEST'} <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>[MODE]</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
