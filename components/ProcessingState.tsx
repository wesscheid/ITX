import React, { memo } from 'react';
import { AppStatus } from '../types';

interface ProcessingStateProps {
  status: AppStatus;
}

const ProcessingState: React.FC<ProcessingStateProps> = ({ status }) => {
  const isDownloading = status === AppStatus.DOWNLOADING;

  return (
    <div className="w-full py-12 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-500">
      <div style={{ width: '48px', height: '48px' }} className="relative">
        <video 
          src="/logoAnimated.webm" 
          autoPlay 
          loop 
          muted 
          playsInline
          className="w-full h-full object-contain"
        />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {isDownloading ? 'Fetching Audio' : 'Analyzing & Transcribing'}
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          {isDownloading 
            ? 'Extracting audio stream from link...' 
            : 'Transcribing and translating with Gemini...'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {isDownloading ? 'This is faster than downloading video.' : 'Almost done.'}
        </p>
      </div>
    </div>
  );
};

export default memo(ProcessingState);