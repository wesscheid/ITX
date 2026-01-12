import React, { useState } from 'react';
import { ProcessingResult } from '../types';
import { downloadTextFile } from '../utils/fileHelpers';

interface ResultCardProps {
  result: ProcessingResult;
  onReset: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ result, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const isSameText = result.originalText.trim() === result.translatedText.trim();

  React.useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      setCanShare(true);
    }
  }, []);

  const handleDownload = () => {
    const content = isSameText 
      ? `Transcription:\n\n${result.originalText}`
      : `Original Transcription:\n\n${result.originalText}\n\n-------------------\n\nTranslation (${result.language}):\n\n${result.translatedText}`;
    downloadTextFile(content, `${result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`);
  };

  const handleShare = async () => {
    const content = isSameText 
      ? result.originalText 
      : `${result.translatedText}\n\n---\nOriginal:\n${result.originalText}`;
    try {
      await navigator.share({
        title: result.title || 'Transcription',
        text: content,
      });
    } catch (err) {
      console.log('Share canceled or failed', err);
    }
  };

  const handleCopyToNotes = async () => {
    const content = isSameText
      ? result.originalText
      : result.translatedText;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500 border border-slate-100 dark:border-slate-700 transition-colors">
      <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ready to Share
          </h2>
          {result.title && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium italic">
              "{result.title}"
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={onReset}
            className="text-sm px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
          >
            New Upload
          </button>
          
          {canShare && (
            <button
              onClick={handleShare}
              className="text-sm px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition-colors flex items-center gap-2 shadow-sm"
              title="Share to Google Keep, Notes, etc."
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share / Keep
            </button>
          )}

          <button
            onClick={handleCopyToNotes}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 border ${
              copied 
                ? 'bg-green-100 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300' 
                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
            }`}
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m2 4h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Copy for Notes
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors flex items-center gap-2 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .txt
          </button>
        </div>
      </div>

      <div className={`grid ${isSameText ? 'grid-cols-1' : 'md:grid-cols-2 divide-y md:divide-y-0 md:divide-x'} divide-slate-100 dark:divide-slate-700`}>
        {(!isSameText || true) && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {isSameText ? 'Transcription' : 'Original Audio'}
              </h3>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 h-64 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {result.originalText}
            </div>
          </div>
        )}

        {!isSameText && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                 Translation ({result.language})
              </h3>
            </div>
            <div className="bg-purple-50 dark:bg-slate-900 rounded-lg p-4 h-64 overflow-y-auto custom-scrollbar border border-purple-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {result.translatedText}
            </div>
          </div>
        )}
      </div>
    </div>
  );

      {/* Footer Action */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 p-4 flex justify-center">
        <button
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-purple-600 dark:hover:text-purple-400 transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Transcribe Another Video
        </button>
      </div>
    </div>
  );
};

export default ResultCard;