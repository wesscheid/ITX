import React, { useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [youtubeCookies, setYoutubeCookies] = useState('');
  const [instagramCookies, setInstagramCookies] = useState('');
  const [twitterCookies, setTwitterCookies] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  if (!isOpen) return null;

  const handleSave = async (platform: 'youtube' | 'instagram' | 'twitter') => {
    let cookies = '';
    if (platform === 'youtube') cookies = youtubeCookies;
    else if (platform === 'instagram') cookies = instagramCookies;
    else if (platform === 'twitter') cookies = twitterCookies;

    if (!cookies.trim()) {
      setStatus({ type: 'error', message: 'Please paste cookies first' });
      return;
    }

    setStatus({ type: 'loading' });
    try {
      const response = await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, cookies }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to save cookies');
      }

      setStatus({ type: 'success', message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} cookies updated successfully!` });
      if (platform === 'youtube') setYoutubeCookies('');
      else if (platform === 'instagram') setInstagramCookies('');
      else if (platform === 'twitter') setTwitterCookies('');
      
      setTimeout(() => setStatus({ type: 'idle' }), 3000);
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Error saving cookies. See console.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh] border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            System Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              YouTube Cookies (Netscape/JSON)
            </label>
            <textarea
              value={youtubeCookies}
              onChange={(e) => setYoutubeCookies(e.target.value)}
              placeholder="Paste your exported YouTube cookies here..."
              className="w-full h-32 p-3 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:text-slate-300 resize-none"
            />
            <button
              onClick={() => handleSave('youtube')}
              disabled={status.type === 'loading'}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Update YouTube Cookies
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Instagram Cookies
            </label>
            <textarea
              value={instagramCookies}
              onChange={(e) => setInstagramCookies(e.target.value)}
              placeholder="Paste your exported Instagram cookies here..."
              className="w-full h-32 p-3 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:text-slate-300 resize-none"
            />
            <button
              onClick={() => handleSave('instagram')}
              disabled={status.type === 'loading'}
              className="w-full py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Update Instagram Cookies
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              X (Twitter) Cookies
            </label>
            <textarea
              value={twitterCookies}
              onChange={(e) => setTwitterCookies(e.target.value)}
              placeholder="Paste your exported X/Twitter cookies here..."
              className="w-full h-32 p-3 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:text-slate-300 resize-none"
            />
            <button
              onClick={() => handleSave('twitter')}
              disabled={status.type === 'loading'}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Update X Cookies
            </button>
          </div>

          {status.message && (
            <div className={`p-3 rounded-lg text-sm text-center animate-in slide-in-from-top-2 ${
              status.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}>
              {status.message}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest font-bold">
          Server-side Persistent Update
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;