import React, { useState } from 'react';

interface UrlInputProps {
  onUrlSubmit: (url: string) => void;
  disabled: boolean;
}

const UrlInput: React.FC<UrlInputProps> = ({ onUrlSubmit, disabled }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUrlSubmit(url.trim());
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-8 border border-slate-300 dark:border-slate-600">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label htmlFor="insta-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Paste Instagram Link (Reel, Post, or Story)
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            id="insta-url"
            required
            placeholder="https://www.instagram.com/reel/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            className="flex-1 rounded-lg border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-3 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          />
          <button
            type="submit"
            disabled={disabled || !url}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 flex-shrink-0 self-center sm:self-auto"
          >
            <span>Process</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Works with public Instagram Reels and Posts. If this fails, use the "Upload File" tab.
        </p>
      </form>
    </div>
  );
};

export default UrlInput;