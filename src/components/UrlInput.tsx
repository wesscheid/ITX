import React, { useState, useEffect, useCallback } from 'react';
import { isValidVideoUrl } from '../services/videoDownloaderService';

interface UrlInputProps {
  onUrlSubmit: (url: string) => void;
  disabled: boolean;
}

const UrlInput: React.FC<UrlInputProps> = ({ onUrlSubmit, disabled }) => {
  const [url, setUrl] = useState('');

  const checkClipboard = useCallback(async () => {
    try {
      // Browsers usually require a user gesture or permission for this
      const text = await navigator.clipboard.readText();
      if (text && isValidVideoUrl(text.trim()) && !url) {
        setUrl(text.trim());
      }
    } catch (err) {
      // Silently fail if clipboard access is denied or not supported
      console.log('Clipboard auto-paste not available');
    }
  }, [url]);

  // Try to auto-paste on mount and on window focus
  useEffect(() => {
    if (!url) {
      checkClipboard();
    }

    const handleFocus = () => {
      if (!url) {
        checkClipboard();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkClipboard, url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUrlSubmit(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch (err) {
      alert('Please allow clipboard access or paste manually (Ctrl+V).');
    }
  };

  const handleClear = () => {
    setUrl('');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-stretch gap-2 bg-slate-800 dark:bg-slate-900 p-2 rounded-2xl border border-slate-700 shadow-2xl">
          <div className="relative flex-1">
            <input
              type="url"
              id="video-url"
              required
              placeholder="Insert video link here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={disabled}
              className="w-full bg-transparent text-white pl-4 pr-10 py-4 focus:outline-none placeholder-slate-500 text-lg"
            />
            {url && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                title="Clear input"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePaste}
              disabled={disabled}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-bold border border-slate-600 transition-all active:scale-95 disabled:opacity-50 group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Paste</span>
            </button>

            <button
              type="submit"
              disabled={disabled || !url}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-8 py-3 rounded-xl font-black transition-all active:scale-95 shadow-lg shadow-blue-900/20"
            >
              <span>Process</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
           <span className="hover:text-slate-400 transition-colors cursor-default">Instagram</span>
           <span className="text-slate-700">•</span>
           <span className="hover:text-slate-400 transition-colors cursor-default">TikTok</span>
           <span className="text-slate-700">•</span>
           <span className="hover:text-slate-400 transition-colors cursor-default">YouTube</span>
           <span className="text-slate-700">•</span>
           <span className="hover:text-slate-400 transition-colors cursor-default">Twitter/X</span>
           <span className="text-slate-700">•</span>
           <span className="hover:text-slate-400 transition-colors cursor-default">Facebook</span>
        </div>
      </form>
    </div>
  );
};

export default UrlInput;
