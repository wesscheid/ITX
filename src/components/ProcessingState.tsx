import React, { useState, useRef, useEffect } from 'react';
import { AppStatus, ProcessingProgress } from '../types';

interface ProcessingStateProps {
  status: AppStatus;
  progress: ProcessingProgress;
}

const ProcessingState: React.FC<ProcessingStateProps> = ({ status, progress }) => {
  const isDownloading = status === AppStatus.DOWNLOADING;
  const [showConsole, setShowConsole] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress.logs]);

  return (
    <div className="w-full py-8 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative w-16 h-16">
          <video 
            src="/logoAnimated.webm" 
            autoPlay 
            loop 
            muted 
            playsInline
            className="w-full h-full object-contain"
          />
          
          <div
            className="absolute top-0 left-0 w-full h-full border-4 border-purple-600 dark:border-purple-500 rounded-full spinner-ring"
            style={{
              clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((progress.percentage / 100) * 2 * Math.PI)}% ${50 + 50 * Math.sin((progress.percentage / 100) * 2 * Math.PI)}%, 50% 50%)`,
              transform: 'rotate(-90deg)',
              transition: 'clip-path 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              animation: 'glow 2s ease-in-out infinite alternate'
            }}
          ></div>
        </div>
        
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            {progress.message || (isDownloading ? 'Fetching Audio' : 'Analyzing & Transcribing')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {isDownloading
              ? 'Extracting audio stream from link...'
              : 'Transcribing and translating with Gemini...'}
          </p>
          
          {progress.percentage > 0 && (
            <div className="w-64 mt-4 bg-slate-200 dark:bg-slate-700 rounded-full h-2 relative overflow-hidden">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              ></div>
              <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block font-medium">
                {progress.percentage.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Verbose Console Output */}
      {progress.logs && progress.logs.length > 0 && (
        <div className="w-full max-w-2xl mt-4">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setShowConsole(!showConsole)}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${showConsole ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showConsole ? 'Hide Console' : 'Show Console'}
            </button>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Runtime Logs</span>
          </div>
          
          {showConsole && (
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-hidden border border-slate-700 shadow-inner">
              <div className="h-48 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
                {progress.logs.map((log, i) => (
                  <div key={i} className="break-all opacity-90 hover:opacity-100 transition-opacity">
                    <span className="text-slate-500 mr-2 selection:bg-purple-500/30">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessingState;