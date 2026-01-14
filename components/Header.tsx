import React, { memo } from 'react';

interface HeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ isDark, toggleTheme }) => {
  return (
    <header className="mb-8 text-center relative">
      <button 
        onClick={toggleTheme}
        className="absolute top-0 right-0 p-2 rounded-full text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Toggle Dark Mode"
      >
        {isDark ? (
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <div className="inline-flex items-center justify-center mb-4">
        <img src="/itx_logo.png" alt="InstaTranscribe Logo" className="h-24 w-auto" />
      </div>
      <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-2">
        InstaTranscribe
      </h1>
      <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
        Paste an Instagram link or upload a video file. We’ll transcribe the audio and translate it to your language in seconds.
      </p>
    </header>
  );
};

export default memo(Header);