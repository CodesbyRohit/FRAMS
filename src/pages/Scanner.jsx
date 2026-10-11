import React, { useRef, useState, useEffect } from 'react';
import { Camera, ShieldCheck, ShieldAlert, Activity, Users, UserX, UserCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as faceapi from 'face-api.js';
import { faceService } from '../services/faceService';
import api from '../services/api';
import voiceService from '../services/voiceService';
import NumberTicker from '../components/NumberTicker';

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
  const activeLivenessRef = useRef(new Map());
  const spokenRef = useRef(new Set());

  const calculateRiskFrontend = ({ behaviorSimilarity, scanTime, movement, adaptiveThreshold, user }) => {
    let riskScore = 0;
    let reason = "Normal behavior";

    if (behaviorSimilarity < adaptiveThreshold - 0.2) {
      riskScore += 50;
      reason = "Behavior deviation detected";
    }

    const avgScan = user?.riskProfile?.avgScanTime || 2000;
    if (scanTime > avgScan * 1.5) {
      riskScore += 20;
      reason = "Abnormal scan duration";
    }

    if (movement < 0.5) {
      riskScore += 20;
      reason = "Low motion (possible spoof)";
    }

    let riskLevel = "LOW";
    if (riskScore >= 60) riskLevel = "HIGH";
    else if (riskScore >= 30) riskLevel = "MEDIUM";

    return { riskScore, riskLevel, reason, scanTime };
  };

  // EAR calc for blink
  const getEAR = (eye) => {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
  };

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
      // observabilityService.logEvent('ERROR', 'Failed to fetch attendance count');
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    stopLoopRef.current = false;
    spokenRef.current.clear();
    voiceService.speak('A.R.I.A. online. Initializing biometric protocols.', true);

    setTimeout(async () => {
      try {
        console.log("[SCANNER] Attempting to access webcam...");
        // Check if browser supports mediaDevices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Biometric hardware interface not supported by browser.');
        }

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
            throw new Error('Optical sensor failed to initialize.');
          }
        }
      } catch (err) {
        const errorMsg = err.message || 'Webcam access denied. Please allow permissions.';
        toast.error(errorMsg, {
          style: { border: '1px solid #ef4444', backgroundColor: '#450a0a', color: '#f8fafc' },
          icon: '🚫'
        });
        console.error("[SCANNER] Webcam Error:", err);
        setIsScanning(false);
        voiceService.speak('Initialization error. Sensor link failed.', true);
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
    activeLivenessRef.current.clear();
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
          if (detections.length > 0 && !spokenRef.current.has('face_detected')) {
             voiceService.speak('Face detected. Running A.R.I.A. verification.');
             spokenRef.current.add('face_detected');
          }

          if (detections.length > 1 && !spokenRef.current.has('multi_face')) {
            voiceService.speak('Warning. Multiple heat signatures detected. Please isolate target.', true);
            toast.error('Multi-Face Warning: Please isolate a single target for verification.', {
              style: { border: '1px solid #fbbf24', backgroundColor: '#451a03', color: '#f8fafc' },
              icon: '👥'
            });
            spokenRef.current.add('multi_face');
            setTimeout(() => spokenRef.current.delete('multi_face'), 10000);
          }
          
          const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const enrichedDetections = processSecurityStats(resizedDetections);
          latestDetectionsRef.current = enrichedDetections;
        }
      } catch (err) {
        console.error("[SCANNER] AI Detection Error:", err);
      }
      isDetectingRef.current = false;
    }

    if (!stopLoopRef.current) {
      setTimeout(runDetection, 150); // Faster loop for blink detection
    }
  };

  const processSecurityStats = (detections) => {
    let recognized = 0;
    let unknownCount = 0;
    const enriched = [];

    if (!matcher) {
      console.warn("[SCANNER] Matcher not initialized. Cannot recognize faces.");
      return detections;
    }

    const currentFrameUsers = new Set();

    detections.forEach(det => {
      let isUnknown = true;
      let enrichedDet = { ...det, bestMatch: null, liveness: null, trustLevel: 'REJECT' };
      
      try {
        const bestMatch = matcher.findBestMatch(det.descriptor);
        enrichedDet.bestMatch = bestMatch;
        console.log(`[SCANNER] Analysis: ${bestMatch.label} at dist ${bestMatch.distance.toFixed(3)}`);
        
        let trustLevel = 'REJECT';
        // DEMO_SAFE_MODE Tuning: Use fixed robust thresholds for guaranteed match
        const thresholdHigh = window.DEMO_SAFE_MODE ? 0.60 : 0.50;
        const thresholdMed = window.DEMO_SAFE_MODE ? 0.70 : 0.60;

        if (bestMatch.distance < thresholdHigh) trustLevel = 'HIGH'; 
        else if (bestMatch.distance <= thresholdMed) trustLevel = 'MEDIUM';
        enrichedDet.trustLevel = trustLevel;

        if (bestMatch.label !== 'unknown' && trustLevel !== 'REJECT') {
          recognized++;
          isUnknown = false;
          
          const userId = bestMatch.label;
          currentFrameUsers.add(userId);
          
          let liveness = activeLivenessRef.current.get(userId);
          if (!liveness) {
            liveness = { 
              frames: 0, 
              blinkStage: 0, 
              movementScore: 0, 
              lastNose: null, 
              verified: false,
              startTime: Date.now(),
              blinkCount: 0,
              behaviorSimilarity: 0,
              adaptiveThreshold: 0.75
            };
            activeLivenessRef.current.set(userId, liveness);
          }

          liveness.frames += 1;

          if (det.landmarks) {
             const leftEye = det.landmarks.getLeftEye();
             const rightEye = det.landmarks.getRightEye();
             const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;
             
             if (liveness.blinkStage === 0 && ear < 0.28) { // Lifted from 0.22 to catch slight squints/blinks easier
               liveness.blinkStage = 1;
             } else if (liveness.blinkStage === 1 && ear >= 0.28) {
               liveness.blinkStage = 2; // Keep for legacy "has blinked" flag
               liveness.blinkCount += 1;
               liveness.blinkStage = 0; // Reset immediately to count sequential blinks
             }

             const nose = det.landmarks.getNose()[3];
             if (liveness.lastNose) {
               const dist = Math.hypot(nose.x - liveness.lastNose.x, nose.y - liveness.lastNose.y);
               if (dist > 0.2 && dist < 50.0) liveness.movementScore += dist; // 0.2+ captures micro-movements
             }
             liveness.lastNose = nose;
          }

          enrichedDet.liveness = { ...liveness };

          const user = registeredUsers.find(u => u._id === userId);
          if (user) {
             const stored = user.behaviorProfile || { 
               blinkRate: 0, movementPattern: 0, stabilityScore: 0, avgScanTime: 0, adaptiveThreshold: 0.75 
             };
             liveness.adaptiveThreshold = stored.adaptiveThreshold || 0.75;

             const liveTime = Date.now() - liveness.startTime;
             const liveBlinkRate = liveness.blinkCount / liveness.frames;
             const liveMovement = liveness.movementScore;

             if (stored.avgScanTime === 0) {
               liveness.behaviorSimilarity = 1.0; // Learning mode
             } else {
               const calcScore = (live, store, tol) => Math.max(0, 1 - Math.abs(live - store) / tol);
               const bScore = calcScore(liveBlinkRate, stored.blinkRate, 0.5);
               const mScore = calcScore(liveMovement, stored.movementPattern, 50.0);
               const tScore = calcScore(liveTime, stored.avgScanTime, 5000);
               
               liveness.behaviorSimilarity = (bScore * 0.4) + (mScore * 0.4) + (tScore * 0.2);
             }
          }

          const liveTime = Date.now() - liveness.startTime;
           const risk = calculateRiskFrontend({
             behaviorSimilarity: liveness.behaviorSimilarity,
             scanTime: liveTime,
             movement: liveness.movementScore,
             adaptiveThreshold: liveness.adaptiveThreshold,
             user: user
           });
           liveness.risk = risk;

           const isRealMovement = liveness.movementScore > 4; // Lowered from 10
          const isBlinked = liveness.blinkCount > 0 || liveness.blinkStage === 2;
          const isStable = liveness.frames >= 3; // Lowered from 4 frames
          const isHighTrust = trustLevel === 'HIGH' || trustLevel === 'MEDIUM'; 
          const isBehaviorValid = liveness.behaviorSimilarity >= liveness.adaptiveThreshold;

          if (isStable && isRealMovement && isBlinked && isHighTrust && isBehaviorValid && !liveness.verified) {
             liveness.verified = true;
             if (user) {
               const currentThreshold = liveness.adaptiveThreshold;
               const newThreshold = (currentThreshold * 0.9) + (liveness.behaviorSimilarity * 0.1);

               const firstName = user.name.split(' ')[0] || 'Personnel';
               voiceService.speak(`Identity confirmed. Welcome back, ${firstName}. It is good to see you again.`, true);

               api.put(`/users/${userId}/update-behavior`, {
                 blinkRate: liveness.blinkCount / liveness.frames,
                 movementPattern: liveness.movementScore,
                 stabilityScore: 1.0,
                 scanTime: liveTime,
                 adaptiveThreshold: newThreshold
               }).catch(e => console.error("Behavior update failed", e));
               
               markLiveAttendance(user, bestMatch.distance, risk);
             }
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
           toast.error('Identity Unknown: Anti-spoof rejected or not in DB.', {
             style: { border: '1px solid #ef4444', backgroundColor: '#450a0a', color: '#f8fafc' },
             icon: '🛡️', duration: 3000
           });
           setTimeout(() => unknownCooldowns.current.delete(unknownKey), 5000);
        }
      }
      
      enriched.push(enrichedDet);
    });

    setSecurityStats({ detected: detections.length, recognized, unknown: unknownCount });
    return enriched;
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
        let trustLevel = det.trustLevel || 'REJECT';
        let liveness = det.liveness || null;

        if (det.bestMatch && det.bestMatch.label !== 'unknown' && trustLevel !== 'REJECT') {
          isUnknown = false;
          matchScore = det.bestMatch.distance;
          confidence = Math.max(0, Math.round((1 - matchScore) * 100)); // Standardized to 100% scale
          const user = registeredUsers.find(u => u._id === det.bestMatch.label);
          if (user && user.name) identityLabel = user.name;
        } else if (det.bestMatch) {
          matchScore = det.bestMatch.distance;
          confidence = Math.max(0, Math.round((1 - matchScore) * 100));
        }

        let colorHex = '#dc2626'; // Red for unknown/risk
        if (confidence > 85) colorHex = '#10b981'; // Green for high trust
        else if (confidence >= 70) colorHex = '#fbbf24'; // Gold for medium trust

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
        ctx.shadowBlur = 15;
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3;
        const bl = 30; // Larger brackets for HUD
        ctx.beginPath();
        ctx.moveTo(x, y + bl); ctx.lineTo(x, y); ctx.lineTo(x + bl, y);
        ctx.moveTo(x + width - bl, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + bl);
        ctx.moveTo(x + width, y + height - bl); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width - bl, y + height);
        ctx.moveTo(x + bl, y + height); ctx.lineTo(x, y + height); ctx.lineTo(x, y + height - bl);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Motion Shake for HIGH Risk
        const riskLevel = liveness?.risk?.riskLevel;
        if (!isUnknown && riskLevel === 'HIGH') {
           const sx = Math.random() * 6 - 3;
           const sy = Math.random() * 6 - 3;
           ctx.translate(sx, sy);
        }

        // Small Panel Background
        const panelWidth = Math.max(width, 160);
        const panelHeight = (!isUnknown && liveness?.risk) ? 90 : 50;
        const panelY = Math.max(y - panelHeight - 10, 5);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(x, panelY, panelWidth, panelHeight);
        ctx.strokeStyle = `${colorHex}AA`;
        ctx.strokeRect(x, panelY, panelWidth, panelHeight);

        // Name & Identity String
        let displayLabel = (identityLabel || 'UNKNOWN').toUpperCase();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px Inter';
        ctx.fillText(`IDENTITY: ${displayLabel}`, x + 10, panelY + 20);

        // Subtext
        ctx.font = '9px Inter';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`HYBRID AI TRUST: ${trustLevel} (${(matchScore).toFixed(3)})`, x + 10, panelY + 36);

        // Risk Engine Sub-panel
        if (!isUnknown && liveness?.risk) {
          const { riskLevel, riskScore, reason } = liveness.risk;
          let rColor = '#10b981';
          if (riskLevel === 'MEDIUM') rColor = '#fbbf24';
          if (riskLevel === 'HIGH') {
             rColor = `rgba(220, 38, 38, ${0.7 + Math.sin(time / 150) * 0.3})`;
          }
          
          ctx.fillStyle = rColor;
          ctx.font = 'bold 9px Inter';
          ctx.fillText(`RISK LEVEL: ${riskLevel === 'LOW' ? '🟢' : (riskLevel === 'MEDIUM' ? '🟡' : '🔴')} ${riskLevel} (${riskScore}%)`, x + 10, panelY + 54);
          
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '8px Inter';
          ctx.fillText(`STATUS: ${riskLevel === 'HIGH' ? 'SUSPICIOUS' : 'SAFE'}`, x + 10, panelY + 68);
          if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') {
            ctx.fillStyle = rColor;
            ctx.fillText(`${reason.substring(0, 30)}`, x + 10, panelY + 80);
          }
        }

        // Final Alert below box
        const seqShift = (time / 400) % 4;
        const bScorePct = Math.round((liveness?.behaviorSimilarity || 0) * 100);
        const reqThreshold = Math.round((liveness?.adaptiveThreshold || 0.75) * 100);

        /* == SIDEBAR TELEMETRY UPDATER == */
        // We only update the global sidebars for the primary box (first one)
        if (latest.indexOf(det) === 0) {
           const el = (id) => document.getElementById(id);
           if (el('ui-match-val')) {
              el('ui-match-val').innerText = `${confidence}%`;
              el('ui-match-bar').style.width = `${confidence}%`;
              el('ui-match-bar').style.background = confidence > 85 ? 'var(--stark-green)' : (confidence > 70 ? 'var(--stark-gold)' : 'var(--stark-red)');
              el('ui-match-bar').style.boxShadow = `0 0 10px ${el('ui-match-bar').style.background}`;

              const blinkPassed = liveness?.blinkCount > 0 || liveness?.blinkStage === 2;
              const blinkPct = blinkPassed ? 100 : ((liveness?.blinkStage || 0) * 50);
              el('ui-blink-val').innerText = blinkPassed ? 'OK' : 'WAITING';
              el('ui-blink-bar').style.width = `${blinkPct}%`;
              el('ui-blink-bar').style.background = blinkPassed ? 'var(--stark-green)' : (blinkPct > 0 ? 'var(--stark-gold)' : 'var(--stark-red)');
              el('ui-blink-bar').style.boxShadow = `0 0 10px ${el('ui-blink-bar').style.background}`;

              const motionScore = liveness?.movementScore || 0;
              const motionPct = (motionScore / 4.0) * 100;
              el('ui-motion-val').innerText = `${motionScore.toFixed(1)} / 4.0`;
              el('ui-motion-bar').style.width = `${Math.min(100, motionPct)}%`;
              el('ui-motion-bar').style.background = motionPct >= 100 ? 'var(--stark-green)' : (motionPct > 30 ? 'var(--stark-gold)' : 'var(--stark-red)');
              el('ui-motion-bar').style.boxShadow = `0 0 10px ${el('ui-motion-bar').style.background}`;

              el('ui-be-val').innerText = `${bScorePct} / ${reqThreshold}%`;
              el('ui-be-bar').style.width = `${Math.min(100, bScorePct)}%`;
              el('ui-be-bar').style.background = bScorePct >= reqThreshold ? 'var(--stark-green)' : (bScorePct > reqThreshold - 25 ? 'var(--stark-gold)' : 'var(--stark-red)');
              el('ui-be-bar').style.boxShadow = `0 0 10px ${el('ui-be-bar').style.background}`;

              let finalTrustPct = (confidence + blinkPct + Math.min(100, motionPct) + bScorePct) / 4;
              if (isUnknown) finalTrustPct = 0;
              const finalColor = liveness?.verified ? '#3b82f6' : (finalTrustPct >= 80 ? '#10b981' : (finalTrustPct >= 50 ? '#f59e0b' : '#ef4444'));
              el('ui-trust-val').innerText = `${Math.round(finalTrustPct)}%`;
              el('ui-trust-bar').style.width = `${finalTrustPct}%`;
              el('ui-trust-bar').style.background = finalColor;
              if (liveness?.verified) {
                 el('ui-trust-val').innerText = 'VERIFIED 100%';
                 el('ui-trust-bar').style.width = '100%';
              }
           }
        }
        ctx.font = 'bold 11px Inter';
        if (isUnknown) {
          ctx.fillStyle = '#ef4444';
          ctx.fillText('⚠ ALERT: IDENTITY REJECTED / SPOOF', x, y + height + 20);
        } else {
          const riskLevel = liveness?.risk?.riskLevel;
          const finalColor = liveness?.verified ? '#3b82f6' : (riskLevel === 'HIGH' ? '#ef4444' : '#10b981');
          ctx.fillStyle = finalColor;
          if (seqShift > 0 && liveness?.verified) ctx.fillText('✔ BEHAVIOR + LIVENESS PASSED', x, y + height + 20);
          else if (seqShift > 0 && riskLevel === 'HIGH') ctx.fillText(`⚠ HIGH RISK: ${liveness?.risk?.reason}`, x, y + height + 20);
          else if (seqShift > 0 && bScorePct < reqThreshold) ctx.fillText(`⚠ SUSPICIOUS BEHAVIOR SCORE`, x, y + height + 20);
          else if (seqShift > 0) ctx.fillText(`⟳ VERIFYING BIOMETRICS...`, x, y + height + 20);
          
          if (seqShift > 2 && liveness?.verified) {
             ctx.fillStyle = '#3b82f6';
             ctx.fillText('✔ IDENTITY SECURED', x, y + height + 35);
          }
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

  const markLiveAttendance = async (user, distance, risk) => {
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
        status: 'present',
        riskLevel: risk?.riskLevel || 'LOW',
        riskScore: risk?.riskScore || 0,
        riskReason: risk?.reason || 'Normal behavior',
        scanTime: risk?.scanTime || 0
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>AI Biometric Scanner</h1>
            <p style={{ color: 'var(--accent-blue)', fontSize: '0.875rem', letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>SYSTEM.J.A.R.V.I.S // ACTIVE</p>
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
          {!modelsLoaded && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
              <div className="w-16 h-16 border-4 border-arc-blue border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-arc-blue font-mono text-sm animate-pulse tracking-widest">A.R.I.A. SYNCHRONIZING_BIOMETRIC_ARRAYS...</p>
            </div>
          )}
          
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
                    <img src={recentMatch?.snapshot} alt={recentMatch?.name} style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #10b981' }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#10b981', borderRadius: '50%', padding: '6px', border: '4px solid #0f172a' }}>
                      <CheckCircle2 size={24} color="#0f172a" />
                    </div>
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>
                    {(recentMatch?.name || 'Personnel').toUpperCase()}
                  </h2>
                  <p style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: 600, letterSpacing: '1px' }}>
                    {(recentMatch?.role || 'Guest').toUpperCase()}
                  </p>
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
        <div className="glow-low" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--bg-card)', borderRadius: '0.5rem', borderLeft: '4px solid var(--accent-blue)' }}>
          <h3 className="text-glow-arc" style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
            Live Security Feed
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'var(--hud-font)' }}><Users size={16} /> DETECTED</div>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent-blue)', textShadow: '0 0 10px rgba(34,211,238,0.5)' }}>{isScanning ? securityStats.detected : 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--stark-green)', fontSize: '0.875rem', fontFamily: 'var(--hud-font)' }}><UserCheck size={16} /> RECOGNIZED</div>
              <span className="text-glow-arc" style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--stark-green)' }}>{isScanning ? securityStats.recognized : 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--stark-red)', fontSize: '0.875rem', fontFamily: 'var(--hud-font)' }}><UserX size={16} /> UNKNOWN</div>
              <span className="text-glow-red" style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--stark-red)' }}>{isScanning ? securityStats.unknown : 0}</span>
            </div>
          </div>
        </div>

        <div className="glow-medium" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--hud-bg)', borderRadius: '0.5rem', borderLeft: '4px solid var(--stark-gold)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, opacity: 0.1, pointerEvents: 'none' }}>
             <Activity size={100} />
          </div>
          <h3 className="text-glow-gold" style={{ fontSize: '0.75rem', color: 'var(--stark-gold)', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '1.5rem', fontFamily: 'var(--hud-font)' }}>
            Telemetry Arrays
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: 'var(--hud-font)' }}>
             {/* Face Match */}
             <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                 <span>Identity Lock</span><span id="ui-match-val" style={{ color: 'var(--text-main)' }}>0%</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div id="ui-match-bar" style={{ width: '0%', height: '100%', background: 'var(--accent-blue)', transition: 'width 0.2s ease-out', boxShadow: '0 0 10px var(--accent-blue)' }}></div>
               </div>
             </div>
             {/* Blink Verified */}
             <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                 <span>Liveness [BLINK]</span><span id="ui-blink-val" style={{ color: 'var(--text-main)' }}>WAITING</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div id="ui-blink-bar" style={{ width: '0%', height: '100%', background: 'var(--stark-gold)', transition: 'width 0.2s ease-out', boxShadow: '0 0 10px var(--stark-gold)' }}></div>
               </div>
             </div>
             {/* Motion Verified */}
             <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                 <span>Liveness [MOTION]</span><span id="ui-motion-val" style={{ color: 'var(--text-main)' }}>0.0 / 4.0</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div id="ui-motion-bar" style={{ width: '0%', height: '100%', background: 'var(--stark-gold)', transition: 'width 0.2s ease-out', boxShadow: '0 0 10px var(--stark-gold)' }}></div>
               </div>
             </div>
             {/* Behavior Score */}
             <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                 <span>Behavioral Drift</span><span id="ui-be-val" style={{ color: 'var(--text-main)' }}>0%</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div id="ui-be-bar" style={{ width: '0%', height: '100%', background: 'var(--stark-green)', transition: 'width 0.2s ease-out', boxShadow: '0 0 10px var(--stark-green)' }}></div>
               </div>
             </div>
             {/* Final Trust */}
             <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(34, 211, 238, 0.2)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                 <span>SYSTEM.TRUST</span><span id="ui-trust-val" className="text-glow-arc">0%</span>
               </div>
               <div style={{ height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(34, 211, 238, 0.3)' }}>
                 <div id="ui-trust-bar" style={{ width: '0%', height: '100%', background: 'var(--stark-red)', transition: 'width 0.2s ease-out, background-color 0.2s', boxShadow: '0 0 15px currentColor' }}></div>
               </div>
             </div>
          </div>
        </div>

        <div className="glow-low" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(34, 211, 238, 0.05)', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginBottom: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Total Processing</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1rem', background: 'var(--hud-bg)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            <h3 className="text-glow-arc" style={{ fontSize: '3.5rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              {todayCount}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;