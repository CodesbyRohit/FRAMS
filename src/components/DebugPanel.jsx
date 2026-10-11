import React, { useState, useEffect } from 'react';
import { Terminal, Activity, Zap, ShieldAlert, Cpu, HardDrive } from 'lucide-react';
import observabilityService from '../services/observabilityService';

const DebugPanel = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [targetName, setTargetName] = useState('');
  const [data, setData] = useState(observabilityService.getSnapshot());

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const unsubscribe = observabilityService.subscribe(setData);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribe();
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="debug-panel-overlay">
      <div className="debug-panel-content">
        <div className="debug-header">
          <div className="flex items-center gap-2 text-arc-blue">
            <Terminal size={18} />
            <span className="font-bold tracking-widest text-xs">A.R.I.A. CORE_TELEMETRY</span>
          </div>
          <button onClick={() => setIsVisible(false)} className="text-muted hover:text-white">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="metric-box">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-muted">FRAME_RATE</span>
              <Activity size={10} className="text-arc-blue" />
            </div>
            <div className="text-xl font-bold font-mono">{data.metrics.fps} FPS</div>
          </div>
          <div className="metric-box">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-muted">SCANNER_STATE</span>
              <Zap size={10} className="text-stark-gold" />
            </div>
            <div className="text-xs font-bold font-mono text-stark-gold">{data.metrics.scannerState}</div>
          </div>
          <div className="metric-box">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-muted">API_STATUS</span>
              <HardDrive size={10} className="text-stark-green" />
            </div>
            <div className="text-xs font-bold font-mono text-stark-green">{data.metrics.lastApiStatus}</div>
          </div>
          <div className="metric-box">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-muted">SYSTEM_MODE</span>
              <Cpu size={10} className="text-purple-400" />
            </div>
            <div className="text-xs font-bold font-mono text-purple-400">DEMO_ACTIVE</div>
          </div>
        </div>

        <div className="log-container">
          <p className="text-[10px] text-muted mb-2 font-bold tracking-widest">REALTIME_EVENT_LOG</p>
          <div className="log-list">
            {data.logs.map(log => (
              <div key={log.id} className="log-entry">
                <span className="text-arc-blue mr-2">[{log.timestamp}]</span>
                <span className={`mr-2 font-bold ${
                  log.type === 'ERROR' ? 'text-stark-red' : 
                  log.type === 'SUCCESS' ? 'text-stark-green' : 'text-muted'
                }`}>{log.type}</span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
            {data.logs.length === 0 && <p className="text-xs text-muted italic">Awaiting events...</p>}
          </div>
        </div>

        <div className="mt-4 p-3 bg-stark-red/10 border border-stark-red/20 rounded">
           <p className="text-[10px] text-stark-red font-bold tracking-widest mb-2">SYSTEM_OVERRIDE (EMERGENCY_ONLY)</p>
           <div className="flex gap-2">
             <input 
               type="text" 
               placeholder="TARGET_NAME"
               value={targetName}
               onChange={(e) => setTargetName(e.target.value)}
               className="flex-1 bg-black/50 border border-slate-700 text-[10px] px-2 py-1 text-white outline-none focus:border-stark-red"
             />
             <button 
               onClick={() => {
                 if (window.forceVerify) {
                   window.forceVerify(targetName);
                   setTargetName('');
                 }
               }}
               className="bg-stark-red text-white text-[10px] font-bold px-3 py-1 rounded hover:bg-red-700 transition-colors uppercase"
             >
               Force Verify
             </button>
           </div>
        </div>

        <div className="flex justify-between mt-4">
           <button 
             onClick={() => window.location.reload()}
             className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] hover:bg-slate-700 uppercase font-bold text-slate-300"
           >
             Hard Recovery
           </button>
           <p className="text-[10px] text-slate-500 font-mono self-center">F.R.A.M.S v2.0 // STARK_INDUSTRIES</p>
        </div>
      </div>

      <style jsx>{`
        .debug-panel-overlay {
          position: fixed;
          top: 2rem;
          right: 2rem;
          width: 400px;
          z-index: 9999;
          backdrop-filter: blur(12px);
          pointer-events: auto;
        }
        .debug-panel-content {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-right: 4px solid var(--accent-blue);
          padding: 1rem;
          border-radius: 4px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        }
        .debug-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .metric-box {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 0.5rem;
          border-radius: 2px;
        }
        .log-container {
          background: rgba(0,0,0,0.4);
          padding: 0.75rem;
          border-radius: 2px;
          height: 200px;
          display: flex;
          flex-direction: column;
        }
        .log-list {
          flex: 1;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
        }
        .log-entry {
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
};

export default DebugPanel;
