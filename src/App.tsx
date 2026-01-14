import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import UrlInput from './components/UrlInput';
import ProcessingState from './components/ProcessingState';
import ResultCard from './components/ResultCard';
import { SUPPORTED_LANGUAGES, AppStatus, ProcessingResult, ProcessingProgress } from './types';
import { fileToBase64, validateFile, processFileInChunks, chunksToBlob } from './utils/fileHelpers';
import { translateVideo, translateVideoStream, transcribeUrl } from './services/geminiService';
import { fetchVideoFromUrl } from './services/videoDownloaderService';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('url');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    stage: 'downloading',
    percentage: 0,
    message: 'Preparing...'
  });

  // Initialize theme based on system preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  // Update HTML class when theme changes
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const processFile = async (file: File) => {
    // Validate file before processing
    const validation = validateFile(file);
    if (!validation.isValid) {
      setErrorMsg(validation.error || "Invalid file");
      setStatus(AppStatus.ERROR);
      return;
    }

    setProgress({ stage: 'processing', percentage: 0, message: 'Processing video...' });
    setStatus(AppStatus.PROCESSING);
    
    try {
      // Use optimized processing with progress tracking
      const chunks = await processFileInChunks(file, 5 * 1024 * 1024, (progress) => {
        setProgress(prev => ({
          ...prev,
          percentage: progress,
          message: `Processing: ${progress}%`
        }));
      });

      const blob = chunksToBlob(chunks, file.type);
      const data = await translateVideoStream(blob, file.type, selectedLanguage);
      
      setResult({
        ...data,
        sourceUrl: `File: ${file.name}`
      });
      setProgress({ stage: 'complete', percentage: 100, message: 'Processing complete' });
      setStatus(AppStatus.SUCCESS);
    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      setErrorMsg((error as Error).message || "An error occurred while processing the video with Gemini.");
    }
  };

  const handleFileSelect = async (file: File) => {
    setErrorMsg(null);
    await processFile(file);
  };

  const handleUrlSubmit = async (url: string) => {
    setErrorMsg(null);
    setProgress({ stage: 'processing', percentage: 0, message: 'Processing with Gemini (Byte-Transfer)...' });
    setStatus(AppStatus.PROCESSING);

    try {
      // Direct Byte Transfer: No browser download needed!
      const data = await transcribeUrl(url, selectedLanguage);
      
      setResult({
        ...data,
        sourceUrl: url
      });
      setProgress({ stage: 'complete', percentage: 100, message: 'Processing complete' });
      setStatus(AppStatus.SUCCESS);
    } catch (error: any) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      setErrorMsg(error.message || "Failed to process video via byte-transfer.");
    }
  };

  const handleReset = () => {
    setStatus(AppStatus.IDLE);
    setResult(null);
    setErrorMsg(null);
    setProgress({ stage: 'downloading', percentage: 0, message: 'Preparing...' });
  };

  // Error Parsing Logic
  const isManualDownloadNeeded = errorMsg?.includes('MANUAL_DOWNLOAD_REQUIRED|');
  const manualDownloadUrl = isManualDownloadNeeded ? errorMsg?.split('|')[1] : null;
  
  const isResolverError = errorMsg?.includes('RESOLVER_CONNECTION_ERROR') || errorMsg?.includes('Failed to fetch');

  // Friendly error message display
  let displayErrorTitle = "Error";
  let displayErrorText = errorMsg;

  if (isManualDownloadNeeded) {
    displayErrorTitle = "Automatic Download Blocked";
    displayErrorText = "The browser blocked the automated download. This is common with Instagram links.";
  } else if (isResolverError) {
    displayErrorTitle = "Connection Failed";
    displayErrorText = "Could not connect to the video resolver service. This is usually caused by AdBlockers, Privacy Extensions, or Network Firewalls.";
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="w-full max-w-4xl space-y-8">
        <Header isDark={isDark} toggleTheme={toggleTheme} />

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
          
          {/* Configuration Section (Only visible when IDLE or ERROR) */}
          {(status === AppStatus.IDLE || status === AppStatus.ERROR) && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-auto">
                  <label htmlFor="language" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target Language
                  </label>
                  <select
                    id="language"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white border transition-shadow"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.name}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
                <button
                  onClick={() => setActiveTab('url')}
                  className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-purple-400 focus:outline-none focus:ring-2 ${
                    activeTab === 'url'
                      ? 'bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-300 shadow'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-white/[0.12] hover:text-purple-600'
                  }`}
                >
                  Paste Link
                </button>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-purple-400 focus:outline-none focus:ring-2 ${
                    activeTab === 'upload'
                      ? 'bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-300 shadow'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-white/[0.12] hover:text-purple-600'
                  }`}
                >
                  Upload File
                </button>
              </div>

              {activeTab === 'url' ? (
                <UrlInput onUrlSubmit={handleUrlSubmit} disabled={false} />
              ) : (
                 <FileUpload onFileSelect={handleFileSelect} disabled={false} />
              )}
             
            </div>
          )}

          {/* Error Message Area */}
          {status === AppStatus.ERROR && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              <div className="text-sm text-red-700 dark:text-red-300 w-full">
                <p className="font-bold text-base mb-1">{displayErrorTitle}</p>
                <p>{displayErrorText}</p>
                
                {/* Scenario 1: We have a URL, but proxies failed */}
                {manualDownloadUrl && (
                  <div className="mt-3 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="mb-3 text-slate-600 dark:text-slate-400 font-medium">
                      Solution: Download the audio manually
                    </p>
                    <a 
                      href={manualDownloadUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Click to Download Audio
                    </a>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                      Step 2: After downloading, switch to the <strong>"Upload File"</strong> tab above and select the file "extracted_audio.mp3".
                    </p>
                  </div>
                )}

                {/* Scenario 2: Resolver failed completely */}
                {isResolverError && (
                  <div className="mt-3 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="mb-2 text-slate-600 dark:text-slate-400 font-medium">
                      Solution: Use an external downloader
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      Since your network is blocking our resolver, please use a third-party website to download the file first.
                    </p>
                    <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 space-y-1 mb-3">
                      <li>Go to a site like <strong>SnapInsta</strong> or <strong>SaveIG</strong>.</li>
                      <li>Paste your Instagram link there and download the video/audio.</li>
                      <li>Come back here and use the <strong>"Upload File"</strong> tab.</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing State */}
          {(status === AppStatus.PROCESSING || status === AppStatus.DOWNLOADING) && <ProcessingState status={status} progress={progress} />}

          {/* Result State */}
          {status === AppStatus.SUCCESS && result && (
            <ResultCard result={result} onReset={handleReset} />
          )}

        </div>
        
        <footer className="text-center text-slate-400 dark:text-slate-500 text-sm">
          <p>Powered by Gemini</p>
          <p className="text-xs mt-1 opacity-75">v{process.env.APP_VERSION}</p>
        </footer>
      </div>
    </div>
  );
};

export default App;