import React, { useState, useEffect } from 'react';
import { LogOut, Bell, User as UserIcon, Activity, Mic, MicOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import voiceService from '../services/voiceService';

const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [voiceEnabled, setVoiceEnabled] = useState(voiceService.isEnabled());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleVoice = () => {
    const newVal = !voiceEnabled;
    voiceService.setEnabled(newVal);
    setVoiceEnabled(newVal);
    if (newVal) {
      voiceService.speak("A.R.I.A. voice assistant protocols active.", true);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header" style={{ position: 'relative', zIndex: 10, background: 'rgba(10, 15, 28, 0.8)', backdropFilter: 'blur(10px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '2px' }}>
          {user?.role === 'student' ? 'Student Workspace' : 'Management Console'}
        </h2>
        
        {/* System Status & Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--stark-green)', boxShadow: '0 0 10px var(--stark-green)' }} className="animate-pulse" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--stark-green)', letterSpacing: '1px' }}>SYSTEM.ONLINE</span>
          </div>
          <div style={{ fontFamily: 'var(--hud-font)', fontSize: '0.85rem', color: 'var(--accent-blue)', textShadow: '0 0 5px rgba(34,211,238,0.5)' }}>
            {currentTime.toLocaleTimeString('en-US', { hour12: false })} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>LOC</span>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button 
          onClick={toggleVoice}
          style={{ background: 'none', border: 'none', color: voiceEnabled ? 'var(--accent-blue)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '0.5rem' }} 
          title={voiceEnabled ? "Mute Assistant" : "Unmute Assistant"}
        >
          {voiceEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1px' }}>{voiceEnabled ? 'V.O.X ON' : 'V.O.X OFF'}</span>
        </button>
        <button style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', transition: 'color 0.2s' }}>
          <Bell size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
          <div className="glow-low" style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '4px', 
            backgroundColor: 'rgba(0,0,0,0.5)',
            border: `1px solid ${user?.role === 'admin' ? 'var(--stark-red)' : (user?.role === 'faculty' ? 'var(--stark-gold)' : 'var(--accent-blue)')}`,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontWeight: 'bold',
            color: user?.role === 'admin' ? 'var(--stark-red)' : (user?.role === 'faculty' ? 'var(--stark-gold)' : 'var(--accent-blue)')
          }}>
            {user?.avatar || 'U'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {user?.username || 'GUEST_USER'}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {user?.role || 'Guest Mode'}
            </span>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem' }} title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
