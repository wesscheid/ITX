import React from 'react';
import { AppStatus, ProcessingProgress } from '../types';
import LogConsole from './LogConsole';

interface ProcessingStateProps {
  status: AppStatus;
  progress: ProcessingProgress;
}

const ProcessingState: React.FC<ProcessingStateProps> = ({ status, progress }) => {
  const isDownloading = status === AppStatus.DOWNLOADING;

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

      <LogConsole logs={progress.logs || []} />
    </div>
  );
};

export default ProcessingState;