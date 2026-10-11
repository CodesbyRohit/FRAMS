import React, { useState, useEffect } from 'react';
import audioService from '../services/audioService';
import voiceService from '../services/voiceService';
import { useAuth } from '../context/AuthContext';

const McuVfxIntro = ({ onComplete }) => {
  const { user } = useAuth();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [isMuted, setIsMuted] = useState(localStorage.getItem('frams_muted') === 'true');

  useEffect(() => {
    // Session check: play only once per browser session
    if (sessionStorage.getItem('frams_intro_played')) {
      onComplete();
      return;
    }

    if (!started) return;

    // Cinematic sequence timing
    const sequence = [
      { step: 1, time: 2000 },
      { step: 2, time: 3500 },
      { step: 3, time: 5500 },
      { step: 4, time: 7000 },
      { step: 5, time: 9500 },
      { step: 6, time: 10500 }, 
    ];

    const timeouts = sequence.map(seq => 
      setTimeout(() => {
        if (seq.step === 5) {
          audioService.fadeOut(1000);
        }
        if (seq.step === 6) {
          const name = (user?.name || user?.username || 'Personnel').split(' ')[0];
          voiceService.speak(`Welcome back, ${name}. All biometric circuits are green.`, true);
          sessionStorage.setItem('frams_intro_played', 'true');
          onComplete();
        } else {
          setStep(seq.step);
        }
      }, seq.time)
    );

    return () => {
      timeouts.forEach(clearTimeout);
      audioService.stop();
    };
  }, [started, onComplete]);

  const handleStart = () => {
    setStarted(true);
    
    // Autoplay compliance: initiate audio from user click handler
    // Updated stable audio source for Cinematic Intro
    const audioUrl = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'; 
    console.log("[F.R.A.M.S] Initiating cinematic audio:", audioUrl);
    
    audioService.init(audioUrl);
    audioService.play()
      .then(() => {
        console.log("[F.R.A.M.S] Audio playback confirmed");
        audioService.fadeIn(1500);
        setTimeout(() => {
          voiceService.speak("Systems initialized. A.R.I.A. is online. Uplink established.", true);
        }, 1500);
      })
      .catch(err => {
        console.error("[F.R.A.M.S] Audio playback blocked by browser/network:", err);
      });
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  // Skip rendering if already played this session
  if (sessionStorage.getItem('frams_intro_played')) {
    return null;
  }

  if (!started) {
    return (
      <div className="mcu-vfx-container" style={{ background: '#000', cursor: 'pointer' }} onClick={handleStart}>
        <style>
          {`
            .init-btn {
              padding: 20px 40px;
              font-family: 'Inter', sans-serif;
              font-weight: 800;
              letter-spacing: 4px;
              color: #60a5fa;
              background: transparent;
              border: 2px solid #60a5fa;
              border-radius: 4px;
              cursor: pointer;
              transition: all 0.3s;
              box-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
              position: relative;
              overflow: hidden;
            }
            .init-btn:hover {
              background: rgba(96, 165, 250, 0.1);
              box-shadow: 0 0 40px rgba(96, 165, 250, 0.6);
              transform: scale(1.05);
            }
            
            .mcu-vfx-container {
              position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
              z-index: 99999; display: flex; align-items: center; justify-content: center;
              background-color: #000;
            }

            .mute-toggle {
              position: absolute; bottom: 30px; right: 30px;
              background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
              color: #fff; width: 50px; height: 50px; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer; font-size: 1.5rem; transition: all 0.3s; z-index: 100000;
            }
          `}
        </style>
        <button className="init-btn">INITIATE BIOMETRIC SYSTEM</button>
        <button className="mute-toggle" onClick={toggleMute}>
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .mcu-vfx-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: #000; color: #fff; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden; font-family: 'Inter', sans-serif;
            transition: opacity 1s ease-out;
            opacity: ${step === 5 ? 0 : 1};
          }

          .vfx-ironman {
            position: absolute; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            opacity: ${step === 0 ? 1 : 0}; transition: opacity 0.3s;
          }
          .im-hud {
            width: 300px; height: 300px; border: 2px solid rgba(220, 38, 38, 0.8);
            border-radius: 50%; position: relative; animation: im-spin 4s linear infinite;
            box-shadow: 0 0 40px rgba(220, 38, 38, 0.5), inset 0 0 30px rgba(251, 191, 36, 0.3);
          }
          .im-hud-inner {
            position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px;
            border: 4px dashed #fbbf24; border-radius: 50%;
            animation: im-spin-rev 2s linear infinite;
          }
          .im-arc {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 100px; height: 100px;
            background: radial-gradient(circle, #fff 20%, #60a5fa 60%, transparent 100%);
            border-radius: 50%; box-shadow: 0 0 50px #60a5fa, 0 0 100px #fff;
            animation: arc-pulse 1s infinite alternate;
          }

          .vfx-thor {
            position: absolute; width: 100%; height: 100%;
            opacity: ${step === 1 ? 1 : 0}; pointer-events: none;
          }
          .thor-flash {
            position: absolute; width: 100%; height: 100%; background-color: #fff;
            opacity: 0; animation: ${step === 1 ? 'lightning-strike 1.5s infinite' : 'none'};
          }
          .thor-text {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 4rem; font-weight: 900; color: #fff;
            text-shadow: 0 0 40px #dc2626, 0 0 80px #fbbf24; letter-spacing: 12px;
            animation: ${step === 1 ? 'shake 0.1s infinite' : 'none'};
          }

          .vfx-strange {
            position: absolute; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            opacity: ${step === 2 ? 1 : 0}; transition: opacity 0.5s;
          }
          .strange-mandala {
            width: 100vh; height: 100vh; max-width: 600px; max-height: 600px;
            border: 4px dotted #f97316; border-radius: 50%; position: relative;
            animation: im-spin 10s linear infinite;
            box-shadow: 0 0 40px rgba(249, 115, 22, 0.8), inset 0 0 40px rgba(249, 115, 22, 0.8);
          }
          .strange-square {
            position: absolute; top: 10%; left: 10%; right: 10%; bottom: 10%;
            border: 3px solid #f97316; animation: im-spin-rev 5s linear infinite;
            box-shadow: 0 0 20px rgba(249, 115, 22, 0.5);
          }
          .strange-eye {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 120px; height: 60px; border: 4px solid #10b981; 
            border-radius: 50% 0 50% 0; box-shadow: 0 0 50px #10b981;
            background: radial-gradient(circle, #fff 10%, #10b981 40%, transparent);
            animation: eye-open 1.5s forwards;
          }

          .vfx-panther {
            position: absolute; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            background: radial-gradient(circle, #000 30%, #4c1d95 150%);
            opacity: ${step === 3 ? 1 : 0}; transition: opacity 0.3s;
          }
          .panther-slash {
            position: absolute; width: 200px; height: 4px;
            background-color: #a855f7; box-shadow: 0 0 30px #d8b4fe, 0 0 60px #a855f7;
            transform: rotate(-45deg);
            animation: ${step === 3 ? 'slash 0.5s ease-out forwards' : 'none'};
          }
          .panther-pulse {
            position: absolute; width: 100vw; height: 100vh;
            background: radial-gradient(circle, rgba(168, 85, 247, 0.8) 0%, transparent 60%);
            animation: ${step === 3 ? 'panther-boom 1s ease-out forwards 0.8s' : 'none'};
            opacity: 0;
          }

          .vfx-assemble {
            position: absolute; width: 100%; height: 100%;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            opacity: ${step >= 4 ? 1 : 0}; transition: opacity 1s;
          }
          .assemble-bg {
            position: absolute; width: 100%; height: 100%;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); z-index: -1;
          }
          .assemble-crest {
            font-size: 8rem; font-weight: 900; letter-spacing: -5px;
            background: linear-gradient(to bottom, #94a3b8, #fff, #94a3b8);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.4));
            animation: ${step >= 4 ? 'assemble-pop 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none'};
          }
          .assemble-text {
            font-size: 1.5rem; letter-spacing: 16px; margin-top: 1rem; color: #94a3b8;
            opacity: 0; animation: ${step >= 4 ? 'fade-up 1s forwards 1s' : 'none'};
          }

          .mute-toggle-active {
            position: absolute; bottom: 30px; right: 30px;
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
            color: #fff; width: 40px; height: 40px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 1.2rem; transition: all 0.3s; z-index: 100000;
            opacity: ${step === 5 ? 0 : 1};
          }

          @keyframes im-spin { 100% { transform: rotate(360deg); } }
          @keyframes im-spin-rev { 100% { transform: rotate(-360deg); } }
          @keyframes arc-pulse { 0% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.9); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } }
          @keyframes lightning-strike { 0% { opacity: 0; } 5% { opacity: 1; } 10% { opacity: 0; } 100% { opacity: 0; } }
          @keyframes shake { 0% { margin-left: -5px; } 50% { margin-left: 5px; } 100% { margin-left: 0; } }
          @keyframes eye-open { 0% { transform: translate(-50%, -50%) scaleY(0); } 100% { transform: translate(-50%, -50%) scaleY(1) rotate(45deg); border-radius: 50%; } }
          @keyframes slash { 0% { width: 0; opacity: 1; } 100% { width: 400px; opacity: 0; margin-left: 200px; } }
          @keyframes panther-boom { 0% { opacity: 1; transform: scale(0); } 100% { opacity: 0; transform: scale(2); } }
          @keyframes assemble-pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes fade-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        `}
      </style>

      <div className="mcu-vfx-container">
        <div className="vfx-ironman"><div className="im-hud"><div className="im-hud-inner"></div></div><div className="im-arc"></div></div>
        <div className="vfx-thor"><div className="thor-flash"></div><div className="thor-text">I AM IRON MAN</div></div>
        <div className="vfx-strange"><div className="strange-mandala"><div className="strange-square"></div></div><div className="strange-eye"></div></div>
        <div className="vfx-panther"><div className="panther-slash"></div><div className="panther-pulse"></div></div>
        <div className="vfx-assemble"><div className="assemble-bg"></div><div className="assemble-crest">F.R.A.M.S</div><div className="assemble-text">BIOMETRICS INITIATED</div></div>
        <button className="mute-toggle-active" onClick={toggleMute}>{isMuted ? '🔇' : '🔊'}</button>
      </div>
    </>
  );
};

export default McuVfxIntro;
