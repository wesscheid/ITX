import React, { useState, useRef, useEffect } from 'react';

interface LogConsoleProps {
  logs: string[];
  title?: string;
  defaultExpanded?: boolean;
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs, title = "Runtime Logs", defaultExpanded = true }) => {
  const [showConsole, setShowConsole] = useState(defaultExpanded);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logEndRef.current && showConsole) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showConsole]);

  if (!logs || logs.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-2">
        <button 
          onClick={() => setShowConsole(!showConsole)}
          className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${showConsole ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {showConsole ? `Hide ${title}` : `Show ${title}`}
        </button>
        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{title}</span>
      </div>
      
      {showConsole && (
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-hidden border border-slate-700 shadow-inner">
          <div className="h-48 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
            {logs.map((log, i) => (
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
  );
};

export default LogConsole;