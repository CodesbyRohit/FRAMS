import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ScanFace, ShieldQuestion, MessageSquareWarning, Table2, Users, Download, ScrollText, CalendarCheck, LogOut, Menu,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import useHealth from '../lib/useHealth';
import { BrandMark } from '../ui';
import { initials } from '../lib/format';

const NAV = [
  { section: 'Operate', roles: ['admin', 'faculty'], items: [
    { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/verify', label: 'Verify', icon: ScanFace },
    { to: '/review', label: 'Review queue', icon: ShieldQuestion },
    { to: '/corrections', label: 'Corrections', icon: MessageSquareWarning },
  ] },
  { section: 'Records', roles: ['admin', 'faculty'], items: [
    { to: '/records', label: 'Attendance', icon: Table2 },
    { to: '/people', label: 'People', icon: Users },
    { to: '/export', label: 'Export', icon: Download, roles: ['admin'] },
  ] },
  { section: 'System', roles: ['admin'], items: [
    { to: '/audit', label: 'Audit log', icon: ScrollText },
  ] },
  { section: 'Me', roles: ['student'], items: [
    { to: '/me', label: 'My attendance', icon: CalendarCheck, end: true },
    { to: '/corrections', label: 'Corrections', icon: MessageSquareWarning },
  ] },
];

const HEALTH_LABEL = {
  checking: { text: 'Checking server', color: 'var(--text-faint)' },
  ok: { text: 'Server and database online', color: 'var(--success)' },
  degraded: { text: 'Server online, database unreachable', color: 'var(--warning)' },
  down: { text: 'Server unreachable', color: 'var(--danger)' },
};

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const health = useHealth();
  const [open, setOpen] = useState(false);

  const role = user?.role;
  const h = HEALTH_LABEL[health.state];

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className="sidebar" data-open={open} aria-label="Primary">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">FRAMS</div>
            <div className="brand-sub">Attendance verification</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.filter((g) => g.roles.includes(role)).map((group) => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.filter((i) => !i.roles || i.roles.includes(role)).map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className="nav-link" onClick={() => setOpen(false)}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="account">
          <div className="avatar" aria-hidden="true">{initials(user?.name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="account-name">{user?.name}</div>
            <div className="account-role">{role}</div>
          </div>
          <button className="btn btn-ghost icon-btn" onClick={() => { logout(); navigate('/login'); }} aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        {health.demoMode && (
          <div className="demo-banner" role="note">
            Demo environment — accounts use publicly known passwords. Do not enroll real people.
          </div>
        )}
        <div className="topbar">
          <button className="btn btn-ghost icon-btn menu-button" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <div className="row" style={{ marginLeft: 'auto', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} role="status" aria-live="polite">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.color }} aria-hidden="true" />
            {h.text}
          </div>
        </div>
        <main id="main" className="page" tabIndex={-1}>
          <Outlet context={{ health }} />
        </main>
      </div>
    </div>
  );
};

export default Layout;
