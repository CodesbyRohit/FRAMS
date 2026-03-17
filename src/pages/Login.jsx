import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Camera, Lock, User, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [role, setRole] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(role, password);
      
      if (result.success) {
        toast.success(`Welcome back, ${role}!`);
        const from = location.state?.from?.pathname || (role === 'student' ? '/student-dashboard' : '/');
        navigate(from, { replace: true });
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container animate-fade-in">
        <div className="glass-panel login-card">
          <div className="login-header">
            <div className="app-logo">
              <ShieldCheck size={40} className="logo-icon" />
            </div>
            <h1 className="app-title">F.R.A.M.S</h1>
            <p className="app-subtitle">Secure Biometric SaaS Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>Role</label>
              <div className="input-wrapper">
                <User className="input-icon" size={20} />
                <select 
                  className="glass-input select-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="admin">Administrator</option>
                  <option value="faculty">Faculty Member</option>
                  <option value="student">Student</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-wrapper">
                <Lock className="input-icon" size={20} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Enter your security key" 
                  className="glass-input" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-primary login-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="animate-spin" size={20} /> Authenticating...</>
              ) : (
                'Secure Login'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p className="hint">Demo: password is role@123</p>
          </div>
        </div>
      </div>

      <style jsx="true">{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
          padding: 2rem;
        }
        .login-container {
          width: 100%;
          max-width: 450px;
        }
        .login-card {
          padding: 3rem;
          border-radius: 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .login-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }
        .app-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          background: rgba(59, 130, 246, 0.1);
          color: var(--accent-blue);
          border-radius: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.2);
        }
        .app-title {
          font-size: 2.25rem;
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 0.25rem;
          background: linear-gradient(to right, #60a5fa, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .app-subtitle {
          color: var(--text-muted);
          font-size: 0.875rem;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-main);
          margin-left: 0.25rem;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
        }
        .glass-input {
          width: 100%;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem 0.75rem 3rem;
          color: white;
          font-size: 1rem;
          transition: all 0.2s;
        }
        .glass-input:focus {
          border-color: var(--accent-blue);
          background: rgba(15, 23, 42, 0.8);
          outline: none;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }
        .select-input {
          cursor: pointer;
          appearance: none;
        }
        .password-toggle {
          position: absolute;
          right: 1rem;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0.25rem;
        }
        .login-btn {
          margin-top: 1rem;
          height: 3.5rem;
          font-size: 1rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }
        .login-footer {
          margin-top: 2rem;
          text-align: center;
        }
        .hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;
