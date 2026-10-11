import React, { useRef, useState, useEffect } from 'react';
import { Camera, Save, User as UserIcon, Mail, Lock, ShieldCheck, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { faceService } from '../services/faceService';
import api from '../services/api';

const Register = () => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    department: '',
    researchPapers: ''
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    startVideo();
    faceService.loadModels().then(() => setModelsLoaded(true));
    return () => stopVideo();
  }, []);

  const startVideo = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      toast.error('Failed to access webcam. Please allow permissions.');
    }
  };

  const stopVideo = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleCapture = async (e) => {
    e.preventDefault();
    if (!modelsLoaded) {
      toast.error('Face recognition models are still loading. Please wait.');
      return;
    }
    if (!formData.name || !formData.department) {
      toast.error('Please fill in Name and Department');
      return;
    }

    setIsCapturing(true);
    const id = toast.loading('Detecting face...');

    try {
      const detection = await faceService.detectSingleFace(videoRef.current);
      
      if (!detection) {
        toast.error('No face detected. Please face the camera clearly.', { id });
        setIsCapturing(false);
        return;
      }

      // Capture snapshot
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const snapshot = canvas.toDataURL('image/jpeg');

      // Prepare user data for backend
      const userData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role.toLowerCase(),
        department: formData.department,
        researchPapers: formData.researchPapers,
        faceDescriptor: Array.from(detection.descriptor),
        faceImage: snapshot
      };

      await api.post('/users', userData);
      toast.success('User registered successfully!', { id });
      
      setFormData({ 
        name: '', 
        email: '', 
        password: '', 
        role: 'student', 
        department: '', 
        researchPapers: '' 
      });
      
    } catch (err) {
      console.error('Registration error:', err);
      toast.error(err.response?.data?.message || 'Error during registration', { id });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 1fr', gap: '3rem' }}>
      <div>
        <h1 className="text-glow-arc" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
           Personnel Onboarding
        </h1>
        <p style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '2px', fontFamily: 'var(--hud-font)', marginBottom: '2rem' }}>
           SYSTEM.REGISTRY // NEW_ENTRY_PROTOCOLS
        </p>
        
        <form onSubmit={handleCapture} className="glow-low" style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, opacity: 0.05, pointerEvents: 'none' }}>
             <FileText size={120} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--hud-font)' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>IDENT_NAME</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <UserIcon style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)' }} size={16} />
                <input 
                  type="text" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', color: 'white', outline: 'none' }}
                  required
                  placeholder="NAME_REQUIRED"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>

            <div style={{ fontFamily: 'var(--hud-font)' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>DEPT_CODE</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <ShieldCheck style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)' }} size={16} />
                <input 
                  type="text" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', color: 'white', outline: 'none' }}
                  required
                  placeholder="DEPT_ID"
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Email and Password Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--hud-font)' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>EMAIL_UPLINK</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <Mail style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)' }} size={16} />
                <input 
                  type="email" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', color: 'white', outline: 'none' }}
                  required
                  placeholder="EMAIL_REQUIRED"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div style={{ fontFamily: 'var(--hud-font)' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>SECURE_PASS</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <Lock style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)' }} size={16} />
                <input 
                  type="password" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', color: 'white', outline: 'none' }}
                  required
                  placeholder="PASSWORD_REQUIRED"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--hud-font)' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>ACCESS_LEVEL</label>
              <select 
                className="glass-input" 
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                style={{ width: '100%', appearance: 'none', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '0.75rem', color: 'white', outline: 'none' }}
              >
                <option value="student">STUDENT_CADET</option>
                <option value="faculty">FACULTY_OFFICER</option>
                <option value="admin">ADMIN_COMMAND</option>
              </select>
            </div>
            
            <div style={{ fontFamily: 'var(--hud-font)' }}>
               <label style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', letterSpacing: '1px', textTransform: 'uppercase' }}>RESEARCH_VAL</label>
               <input 
                  type="number"
                  className="glass-input" 
                  style={{ width: '100%', borderRadius: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '0.75rem', color: 'white', outline: 'none' }}
                  placeholder="0"
                  min="0"
                  disabled={formData.role === 'student'}
                  value={formData.researchPapers}
                  onChange={e => setFormData({...formData, researchPapers: e.target.value})}
                />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={isCapturing || !modelsLoaded} style={{ marginTop: '1rem', borderRadius: '0.25rem', background: 'var(--accent-blue)', color: 'var(--bg-primary)', fontWeight: 800, letterSpacing: '2px', height: '3.5rem' }}>
            <Camera size={20} />
            {isCapturing ? 'ACQUIRING...' : 'ACQUIRE BIOMETRICS'}
          </button>
        </form>
      </div>

      <div style={{ minWidth: 0 }}>
        <h2 className="text-glow-arc" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>Biometric Acquisition</h2>
        <div className="glow-medium" style={{ borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: '#000', position: 'relative', aspectRatio: '4/3', border: '2px solid var(--accent-blue)' }}>
          <video 
            ref={videoRef}
            autoPlay 
            muted 
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
          />
          {/* HUD Overlay Elements */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTop: '4px solid var(--accent-blue)', borderLeft: '4px solid var(--accent-blue)', margin: '15px' }}></div>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTop: '4px solid var(--accent-blue)', borderRight: '4px solid var(--accent-blue)', margin: '15px' }}></div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottom: '4px solid var(--accent-blue)', borderLeft: '4px solid var(--accent-blue)', margin: '15px' }}></div>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottom: '4px solid var(--accent-blue)', borderRight: '4px solid var(--accent-blue)', margin: '15px' }}></div>
          
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(34, 211, 238, 0.2)', boxShadow: '0 0 10px var(--accent-blue)' }} className="animate-pulse"></div>
          
          {!modelsLoaded && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(4px)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '50px', height: '50px', border: '4px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem', boxShadow: '0 0 15px var(--accent-blue)' }}></div>
                <p style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>CALIBRATING_MODELS...</p>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '0.75rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            <strong style={{ color: '#3b82f6' }}>Note:</strong> Please ensure good lighting and look directly into the camera. The system will extract your unique facial biometric hash for secure authentication.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
