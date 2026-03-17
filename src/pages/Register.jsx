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
    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Register New User</h1>
        
        <form onSubmit={handleCapture} className="glass-panel" style={{ padding: '2rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Full Name</label>
            <div className="input-wrapper" style={{ position: 'relative' }}>
              <UserIcon style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input 
                type="text" 
                className="glass-input" 
                style={{ paddingLeft: '3rem' }}
                required
                placeholder="John Doe"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Department</label>
            <div className="input-wrapper" style={{ position: 'relative' }}>
              <ShieldCheck style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input 
                type="text" 
                className="glass-input" 
                style={{ paddingLeft: '3rem' }}
                required
                placeholder="e.g. Computer Science"
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
              />
            </div>
          </div>

          {(formData.role === 'faculty' || formData.role === 'admin') && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Papers Published</label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <FileText style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input 
                  type="number"
                  className="glass-input" 
                  style={{ paddingLeft: '3rem' }}
                  placeholder="0"
                  min="0"
                  value={formData.researchPapers}
                  onChange={e => setFormData({...formData, researchPapers: e.target.value})}
                />
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Role</label>
              <select 
                className="glass-input" 
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                style={{ appearance: 'none' }}
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={isCapturing || !modelsLoaded} style={{ marginTop: '1rem' }}>
            <Camera size={18} />
            {isCapturing ? 'Processing...' : 'Capture Face & Register'}
          </button>
        </form>
      </div>

      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Biometric Capture</h2>
        <div className="glass-panel" style={{ borderRadius: '1rem', overflow: 'hidden', backgroundColor: '#000', position: 'relative', aspectRatio: '4/3', border: '2px solid rgba(59, 130, 246, 0.2)' }}>
          <video 
            ref={videoRef}
            autoPlay 
            muted 
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', border: '2px solid rgba(59, 130, 246, 0.4)', margin: '20px', borderRadius: '1rem' }}></div>
          {!modelsLoaded && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'white', fontSize: '0.875rem' }}>Calibrating AI Models...</p>
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
