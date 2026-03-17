import React, { useRef, useState, useEffect } from 'react';
import { Camera, ShieldCheck, ShieldAlert, Activity, Users, UserX, UserCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as faceapi from 'face-api.js';
import { faceService } from '../services/faceService';
import api from '../services/api';

const Scanner = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [matcher, setMatcher] = useState(null);
  const [registeredUsers, setRegisteredUsers] = useState([]);

  const [recentMatch, setRecentMatch] = useState(null);
  const [todayCount, setTodayCount] = useState(0);

  // Security Panel Stats
  const [securityStats, setSecurityStats] = useState({ detected: 0, recognized: 0, unknown: 0 });

  const isDetectingRef = useRef(false);
  const latestDetectionsRef = useRef([]);
  const drawnBoxesRef = useRef([]);
  const animationFrameId = useRef(null);
  const stopLoopRef = useRef(false);

  const unknownCooldowns = useRef(new Set());
  const matchTimeoutRef = useRef(null);
  const attendanceLockRef = useRef(new Set()); // Prevent duplicate marking within same session

  useEffect(() => {
    initScanner();
    updateLiveCount();
    return () => {
      stopScanner();
    };
  }, []);

  const initScanner = async () => {
    try {
      console.log("[SCANNER] Initializing AI Core...");
      await faceService.loadModels();
      setModelsLoaded(true);
      console.log("[SCANNER] AI Models Loaded Successfully.");

      await refreshMatcher();
    } catch (err) {
      toast.error('Failed to initialize AI Core');
      console.error("[SCANNER] AI Core Init Error:", err);
    }
  };

  const refreshMatcher = async () => {
    try {
      const { data: users } = await api.get('/users');
      setRegisteredUsers(users);
      console.log(`[SCANNER] Refreshing matcher with ${users.length} registered profiles from backend.`);
      
      if (users.length > 0) {
        const labeledDescriptors = users.map(user => {
          if (user.faceDescriptor && user.faceDescriptor.length > 0) {
            try {
              const f32Array = new Float32Array(user.faceDescriptor);
              return new faceapi.LabeledFaceDescriptors(user._id, [f32Array]);
            } catch (e) {
              console.error(`[SCANNER] Error parsing descriptor for user ${user.name}:`, e);
              return null;
            }
          }
          return null;
        }).filter(ld => ld !== null);

        if (labeledDescriptors.length > 0) {
          console.log(`[SCANNER] Successfully created matcher with ${labeledDescriptors.length} descriptors.`);
          const faceMatcher = faceService.createMatcher(labeledDescriptors);
          setMatcher(faceMatcher);
        } else {
          console.warn("[SCANNER] No valid descriptors found for registered users.");
        }
      }
    } catch (error) {
      console.error('[SCANNER] Failed to fetch users for matcher:', error);
      toast.error('Failed to sync biometric data');
    }
  };

  const updateLiveCount = async () => {
    try {
      const { data: attendance } = await api.get('/attendance');
      const today = new Date().toISOString().split('T')[0];
      const count = attendance.filter(a => a.date === today && a.status === 'present').length;
      setTodayCount(count);
    } catch (error) {
      console.error('[SCANNER] Failed to fetch attendance count:', error);
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    stopLoopRef.current = false;

    setTimeout(async () => {
      try {
        console.log("[SCANNER] Attempting to access webcam...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            console.log("[SCANNER] Webcam stream active.");
          } catch (playErr) {
            console.error("[SCANNER] Video play error:", playErr);
          }
        }
      } catch (err) {
        toast.error('Webcam access denied. Please allow permissions.');
        console.error("[SCANNER] Webcam Error:", err);
        setIsScanning(false);
      }
    }, 100);
  };

  const stopScanner = () => {
    console.log("[SCANNER] Deactivating system.");
    setIsScanning(false);
    stopLoopRef.current = true;
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    latestDetectionsRef.current = [];
    setSecurityStats({ detected: 0, recognized: 0, unknown: 0 });
    attendanceLockRef.current.clear();
  };

  const runDetection = async () => {
    if (stopLoopRef.current || !videoRef.current) return;

    if (videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < 2) {
      if (!stopLoopRef.current) setTimeout(runDetection, 500);
      return;
    }

    if (!isDetectingRef.current) {
      isDetectingRef.current = true;
      try {
        // Lower confidence to ensure we catch faces even in bad light
        const detections = await faceService.detectAllFaces(videoRef.current);
        
        if (detections) {
          if (detections.length > 0) {
            console.log(`[SCANNER] Detected ${detections.length} face(s).`);
          }
          
          const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          latestDetectionsRef.current = resizedDetections;
          processSecurityStats(resizedDetections);
        }
      } catch (err) {
        console.error("[SCANNER] AI Detection Error:", err);
      }
      isDetectingRef.current = false;
    }

    if (!stopLoopRef.current) {
      setTimeout(runDetection, 400); // Slightly faster loop
    }
  };

  const processSecurityStats = (detections) => {
    let recognized = 0;
    let unknownCount = 0;

    if (!matcher) {
      console.warn("[SCANNER] Matcher not initialized. Cannot recognize faces.");
      return;
    }

    detections.forEach(det => {
      let isUnknown = true;
      try {
        const bestMatch = matcher.findBestMatch(det.descriptor);
        console.log(`[SCANNER] Analysis: ${bestMatch.label} at dist ${bestMatch.distance.toFixed(3)}`);
        
        if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.7) {
          recognized++;
          isUnknown = false;

          const user = registeredUsers.find(u => u._id === bestMatch.label);
          if (user) {
            markLiveAttendance(user, bestMatch.distance);
          }
        }
      } catch (e) {
        console.error("[SCANNER] Error processing individual detection:", e);
      }

      if (isUnknown) {
        unknownCount++;
        const unknownKey = Math.round(det.detection.box.x / 50);
        if (!unknownCooldowns.current.has(unknownKey)) {
          unknownCooldowns.current.add(unknownKey);
          toast.error('Identity Unknown: Face not in biometric database.', {
            style: { border: '1px solid #ef4444', backgroundColor: '#450a0a', color: '#f8fafc' },
            icon: '🛡️',
            duration: 3000
          });
          setTimeout(() => unknownCooldowns.current.delete(unknownKey), 5000);
        }
      }
    });

    setSecurityStats({
      detected: detections.length,
      recognized,
      unknown: unknownCount
    });
  };

  const renderLoop = (time) => {
    try {
      if (stopLoopRef.current || !canvasRef.current || !videoRef.current) {
        if (!stopLoopRef.current) animationFrameId.current = requestAnimationFrame(renderLoop);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (canvas.width === 0 || canvas.height === 0) {
        animationFrameId.current = requestAnimationFrame(renderLoop);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const latest = latestDetectionsRef.current;
      if (!latest || latest.length === 0) {
        animationFrameId.current = requestAnimationFrame(renderLoop);
        return;
      }

      const LERP_FACTOR = 0.25;
      const newDrawnBoxes = [];

      latest.forEach(det => {
        const targetBox = det.detection.box;
        let identityLabel = 'UNKNOWN TARGET';
        let confidence = 0;
        let isUnknown = true;
        let matchScore = 1.0;

        if (matcher) {
          const bestMatch = matcher.findBestMatch(det.descriptor);
          matchScore = bestMatch.distance;

          if (bestMatch.label !== 'unknown' && matchScore < 0.7) {
            isUnknown = false;
            // More generous confidence mapping for visualization
            confidence = Math.max(0, Math.round((1 - (matchScore / 0.8)) * 100));
            const user = registeredUsers.find(u => u._id === bestMatch.label);
            if (user && user.name) identityLabel = user.name;
          } else {
            confidence = Math.max(0, Math.round((0.8 - matchScore) * 100));
          }
        }

        let colorHex = '#ef4444'; // Red for unknown
        if (confidence > 85) colorHex = '#10b981'; // Green
        else if (confidence >= 70) colorHex = '#f59e0b'; // Amber

        let matchedPrevBox = drawnBoxesRef.current.find(b =>
          Math.abs(b.x - targetBox.x) < 80 && Math.abs(b.y - targetBox.y) < 80
        );

        let currentBox;
        if (matchedPrevBox) {
          currentBox = {
            x: matchedPrevBox.x + (targetBox.x - matchedPrevBox.x) * LERP_FACTOR,
            y: matchedPrevBox.y + (targetBox.y - matchedPrevBox.y) * LERP_FACTOR,
            width: matchedPrevBox.width + (targetBox.width - matchedPrevBox.width) * LERP_FACTOR,
            height: matchedPrevBox.height + (targetBox.height - matchedPrevBox.height) * LERP_FACTOR
          };
        } else {
          currentBox = { ...targetBox };
        }
        newDrawnBoxes.push(currentBox);

        const { x, y, width, height } = currentBox;
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rotation = time / 1000;

        // Draw HUD Elements
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.strokeStyle = `${colorHex}44`;
        ctx.lineWidth = 1;
        ctx.setLineDash([10, 20]);
        ctx.beginPath();
        ctx.arc(0, 0, width * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const pulse = 0.5 + Math.sin(time / 200) * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = colorHex;
        ctx.fill();

        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3;
        const bl = 20;
        ctx.beginPath();
        ctx.moveTo(x, y + bl); ctx.lineTo(x, y); ctx.lineTo(x + bl, y);
        ctx.moveTo(x + width - bl, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + bl);
        ctx.moveTo(x + width, y + height - bl); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width - bl, y + height);
        ctx.moveTo(x + bl, y + height); ctx.lineTo(x, y + height); ctx.lineTo(x, y + height - bl);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Panel Background
        const panelWidth = Math.max(width, 200);
        const panelY = Math.max(y - 80, 5); // Don't draw off top
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(x, panelY, panelWidth, 70);
        ctx.strokeStyle = `${colorHex}AA`;
        ctx.strokeRect(x, panelY, panelWidth, 70);

        // Name & Identity String
        const displayLabel = (identityLabel || 'UNKNOWN').toUpperCase();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px Inter';
        ctx.fillText(`IDENTITY: ${displayLabel}`, x + 10, panelY + 20);

        ctx.font = '10px Inter';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`BIOMETRIC DISTANCE: ${matchScore.toFixed(4)}`, x + 10, panelY + 38);

        ctx.fillStyle = colorHex;
        ctx.font = 'bold 11px Inter';
        ctx.fillText(`CONFIDENCE: ${confidence}%`, x + 10, panelY + 52);

        // Progress bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x + 10, panelY + 58, panelWidth - 20, 4);
        ctx.fillStyle = colorHex;
        ctx.fillRect(x + 10, panelY + 58, (panelWidth - 20) * (confidence / 100), 4);

        const seqShift = (time / 400) % 4;
        if (isUnknown) {
          ctx.fillStyle = '#ef4444';
          ctx.fillText('⚠ ALERT: UNREGISTERED TARGET', x, y + height + 20);
        } else {
          ctx.fillStyle = '#10b981';
          if (seqShift > 0) ctx.fillText('✔ FACE DETECTED', x, y + height + 20);
          if (seqShift > 2) ctx.fillStyle = '#3b82f6';
          if (seqShift > 2) ctx.fillText('✔ MATCH SYNCED', x, y + height + 35);
        }
      });

      drawnBoxesRef.current = newDrawnBoxes;
    } catch (e) {
      console.error("[SCANNER] Render Loop Critical Error:", e);
    }
    animationFrameId.current = requestAnimationFrame(renderLoop);
  };

  const handleVideoPlay = () => {
    if (!isScanning) return;
    const video = videoRef.current;
    if (video) {
      const waitReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            faceapi.matchDimensions(canvas, { width: video.videoWidth, height: video.videoHeight });
            console.log(`[SCANNER] UI Core Sync: ${video.videoWidth}x${video.videoHeight}`);
          }
          runDetection();
          if (!animationFrameId.current) {
            animationFrameId.current = requestAnimationFrame(renderLoop);
          }
        } else {
          setTimeout(waitReady, 100);
        }
      };
      waitReady();
    }
  };

  const markLiveAttendance = async (user, distance) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString();

    // Prevent spamming the database
    const lockKey = `${user._id}-${todayStr}`;
    if (attendanceLockRef.current.has(lockKey)) return;

    try {
      // Improved confidence mapping: distance 0.2 -> 80%, distance 0.4 -> 60%, distance 0.6 -> 40%
      const confidence = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
      
      const record = {
        userId: user._id,
        name: user.name,
        role: user.role,
        date: todayStr,
        time: timeStr,
        confidenceScore: confidence,
        status: 'present'
      };

      console.log(`[SCANNER] SYNCING ATTENDANCE: ${user.name} (Conf: ${confidence}%)`);
      
      // Hit the endpoint (using both roots for reliability)
      await api.post('/attendance/mark', record).catch(async (e) => {
        console.warn("[SCANNER] /mark failed, trying fallback root...");
        return await api.post('/attendance', record);
      });

      attendanceLockRef.current.add(lockKey);
      setRecentMatch({ ...user, snapshot: user.faceImage, timestamp: timeStr });
      updateLiveCount();

      if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
      matchTimeoutRef.current = setTimeout(() => {
        setRecentMatch(null);
      }, 4000);
    } catch (error) {
      console.error('[SCANNER] Internal Attedance Fault:', error);
      toast.error('System Fault: Failed to sync record.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>AI Biometric Security</h1>
            <p style={{ color: 'var(--text-muted)' }}>Full-Stack Precision Recognition System</p>
          </div>
          <div>
            {isScanning ? (
              <button onClick={stopScanner} className="btn-primary" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}>
                Offline Monitoring
              </button>
            ) : (
              <button
                onClick={startScanner}
                className="btn-primary"
                disabled={!modelsLoaded}
              >
                <Camera size={18} />
                {modelsLoaded ? 'Activate AI Vision' : 'Initializing AI...'}
              </button>
            )}
          </div>
        </div>

        <div className={`scanner-container ${isScanning ? 'active' : ''} ${recentMatch ? 'face-detected' : ''}`}>
          {isScanning ? (
            <>
              <div className="grid-overlay"></div>
              <div className="scan-line"></div>
              <div className="hud-corner hud-tl"></div>
              <div className="hud-corner hud-tr"></div>
              <div className="hud-corner hud-bl"></div>
              <div className="hud-corner hud-br"></div>

              <video
                ref={videoRef}
                onPlay={handleVideoPlay}
                autoPlay
                muted
                playsInline
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: 1
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 20,
                  pointerEvents: "none"
                }}
              />

              {recentMatch && (
                <div className="flash-card flash-card-success" style={{ padding: '2rem', borderRadius: '1rem', width: '340px', textAlign: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-block', marginBottom: '1.5rem' }}>
                    <img src={recentMatch.snapshot} alt={recentMatch.name} style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #10b981' }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#10b981', borderRadius: '50%', padding: '6px', border: '4px solid #0f172a' }}>
                      <CheckCircle2 size={24} color="#0f172a" />
                    </div>
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>{recentMatch.name.toUpperCase()}</h2>
                  <p style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: 600, letterSpacing: '1px' }}>{recentMatch.role.toUpperCase()}</p>
                </div>
              )}
            </>
          ) : (
            <div style={{ position: 'absolute', top: '0', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Camera size={56} style={{ marginBottom: '1.5rem', opacity: 0.3 }} />
              <p style={{ letterSpacing: '2px', fontWeight: 600 }}>SYSTEM STANDBY</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="saas-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-blue)' }}>
          <h3 style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
            Live Security Feed
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#cbd5e1', fontSize: '0.875rem' }}><Users size={16} /> FACES DETECTED</div>
              <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>{isScanning ? securityStats.detected : 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981', fontSize: '0.875rem' }}><UserCheck size={16} /> RECOGNIZED</div>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#10b981' }}>{isScanning ? securityStats.recognized : 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444', fontSize: '0.875rem' }}><UserX size={16} /> UNKNOWN</div>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ef4444' }}>{isScanning ? securityStats.unknown : 0}</span>
            </div>
          </div>
        </div>

        <div className="saas-card" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(59, 130, 246, 0.03)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: 700, textTransform: 'uppercase' }}>Today Scans</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem' }}>
            <h3 style={{ fontSize: '3.5rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              {todayCount}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;