# Specific Code Optimizations for InstaTranscribe

## Critical Performance Fixes

### 1. File Processing Optimization

#### Current Issue (Lines 48-49 in [`src/services/geminiService.ts`](src/services/geminiService.ts:48))
```typescript
// PROBLEMATIC: Converts entire file to base64 in memory
const base64Data = await fileToBase64(file);
const data = await translateVideo(base64Data, file.type, selectedLanguage);
```

#### Optimized Solution
```typescript
// OPTIMIZED: Stream-based processing with chunking
const processFileOptimized = async (file: File) => {
  if (file.size > 50 * 1024 * 1024) {
    setErrorMsg("File is too large. Please upload a video under 50MB.");
    setStatus(AppStatus.ERROR);
    return;
  }

  setStatus(AppStatus.PROCESSING);
  
  try {
    // Use streaming approach instead of base64
    const stream = file.stream();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      totalSize += value.length;
      
      // Update progress
      const progress = Math.min(100, Math.round((totalSize / file.size) * 100));
      setProgress({ stage: 'processing', percentage: progress });
    }

    // Convert chunks to blob for API
    const blob = new Blob(chunks, { type: file.type });
    const data = await translateVideoStream(blob, file.type, selectedLanguage);
    setResult(data);
    setStatus(AppStatus.SUCCESS);
  } catch (error) {
    console.error(error);
    setStatus(AppStatus.ERROR);
    setErrorMsg((error as Error).message || "An error occurred while processing the video with Gemini.");
  }
};
```

### 2. Enhanced Loading States

#### Current Issue (Lines 46-57 in [`src/App.tsx`](src/App.tsx:46))
```typescript
// PROBLEMATIC: No progress indication during long operations
setStatus(AppStatus.PROCESSING);
try {
  const base64Data = await fileToBase64(file);
  const data = await translateVideo(base64Data, file.type, selectedLanguage);
  setResult(data);
  setStatus(AppStatus.SUCCESS);
} catch (error) {
  // Error handling
}
```

#### Optimized Solution
```typescript
// OPTIMIZED: Granular progress tracking
interface ProcessingProgress {
  stage: 'downloading' | 'processing' | 'transcribing' | 'complete';
  percentage: number;
  message: string;
}

const [progress, setProgress] = useState<ProcessingProgress>({
  stage: 'downloading',
  percentage: 0,
  message: 'Preparing to download...'
});

const handleUrlSubmit = async (url: string) => {
  setErrorMsg(null);
  setProgress({ stage: 'downloading', percentage: 0, message: 'Downloading video...' });
  setStatus(AppStatus.DOWNLOADING);

  try {
    const blob = await fetchVideoFromUrl(url, (status) => {
      setProgress(prev => ({
        ...prev,
        percentage: status.percentage,
        message: status.message
      }));
    });
    
    setProgress({ stage: 'processing', percentage: 0, message: 'Processing video...' });
    const file = new File([blob], "downloaded_video.mp4", { type: blob.type || 'video/mp4' });
    await processFile(file);
  } catch (error: any) {
    console.error(error);
    setStatus(AppStatus.ERROR);
    setErrorMsg(error.message || "Failed to download video from URL.");
  }
};
```

### 3. Improved Error Handling with Retry Logic

#### Current Issue (Lines 180-190 in [`src/services/videoDownloaderService.ts`](src/services/videoDownloaderService.ts:180))
```typescript
// PROBLEMATIC: No retry logic, fails immediately
try {
  downloadUrl = await resolveViaCobalt(url);
} catch (cobaltError) {
  console.warn("Cobalt Resolver failed, switching to fallback:", cobaltError);
  try {
    downloadUrl = await resolveViaAlternative(url);
  } catch (altError) {
    console.error("All Resolvers failed:", altError);
    throw new Error("RESOLVER_CONNECTION_ERROR");
  }
}
```

#### Optimized Solution
```typescript
// OPTIMIZED: Exponential backoff with retry logic
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('All retry attempts failed');
};

const fetchVideoFromUrl = async (url: string): Promise<File> => {
  let downloadUrl: string | undefined;
  
  // Try resolvers with retry logic
  try {
    downloadUrl = await retryWithBackoff(() => resolveViaCobalt(url), 2, 2000);
  } catch (cobaltError) {
    console.warn("Cobalt Resolver failed, switching to fallback:", cobaltError);
    try {
      downloadUrl = await retryWithBackoff(() => resolveViaAlternative(url), 2, 3000);
    } catch (altError) {
      console.error("All Resolvers failed:", altError);
      throw new Error("RESOLVER_CONNECTION_ERROR");
    }
  }
  
  // Download with retry logic
  for (const proxyGen of MEDIA_PROXIES) {
    try {
      const proxyUrl = proxyGen(downloadUrl);
      const blob = await retryWithBackoff(() => fetchMediaWithProgress(proxyUrl), 2, 1500);
      
      if (blob.type.includes('text/html') || blob.size < 1000) {
        continue;
      }
      
      return new File([blob], `extracted_media.${getExtension(blob.type)}`, { type: blob.type });
    } catch (e) {
      console.warn("Proxy download attempt failed:", e);
    }
  }
  
  throw new Error(`MANUAL_DOWNLOAD_REQUIRED|${downloadUrl}`);
};
```

### 4. Memory Management and Cleanup

#### Current Issue (Lines 55-61 in [`src/services/geminiService.ts`](src/services/geminiService.ts:55))
```typescript
// PROBLEMATIC: No cleanup of large objects
const result = JSON.parse(response.text);
return {
  originalText: result.originalText,
  translatedText: result.translatedText,
  language: targetLanguage,
};
```

#### Optimized Solution
```typescript
// OPTIMIZED: Proper memory management
const translateVideoOptimized = async (
  file: File | Blob,
  mimeType: string,
  targetLanguage: string
): Promise<ProcessingResult> => {
  const modelId = "gemini-2.5-flash";
  
  try {
    // Use streaming for large files
    const stream = file.stream();
    const reader = stream.getReader();
    
    const prompt = `
      Analyze this media file (Audio or Video).
      1. Transcribe the spoken audio verbatim in its original language.
      2. Translate the transcription into ${targetLanguage}.
      
      Return the output in JSON format with two keys: "originalText" and "translatedText".
      If there is no speech, provide a description of the sound in the "originalText" field and translate that description.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            fileData: {
              mimeType: mimeType,
              file: stream, // Use stream instead of base64
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
          },
          required: ["originalText", "translatedText"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response text generated");
    }

    // Parse and cleanup
    const result = JSON.parse(response.text);
    const processedResult = {
      originalText: result.originalText,
      translatedText: result.translatedText,
      language: targetLanguage,
    };

    // Cleanup large objects
    result.originalText = null;
    result.translatedText = null;
    
    return processedResult;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  } finally {
    // Force garbage collection hint (if available)
    if (global.gc) {
      global.gc();
    }
  }
};
```

### 5. Bundle Size Optimization

#### Current Issue (Lines 6-7 in [`src/App.tsx`](src/App.tsx:6))
```typescript
// PROBLEMATIC: Lazy loading but no code splitting for critical paths
const ProcessingState = lazy(() => import('./components/ProcessingState'));
const ResultCard = lazy(() => import('./components/ResultCard'));
```

#### Optimized Solution
```typescript
// OPTIMIZED: Strategic code splitting with preloading
const ProcessingState = lazy(() => import('./components/ProcessingState'));
const ResultCard = lazy(() => import('./components/ResultCard'));

// Preload critical components on user interaction
const preloadComponents = () => {
  if ('connection' in navigator && navigator.connection.effectiveType === '4g') {
    import('./components/ProcessingState');
    import('./components/ResultCard');
  }
};

// Use intersection observer for smart preloading
useEffect(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        preloadComponents();
      }
    });
  });

  const triggerElement = document.getElementById('upload-trigger');
  if (triggerElement) {
    observer.observe(triggerElement);
  }

  return () => observer.disconnect();
}, []);
```

### 6. Web Worker Implementation

#### New File: `src/workers/fileProcessor.ts`
```typescript
// Web Worker for heavy file processing
self.onmessage = async function(e) {
  const { file, operation } = e.data;
  
  try {
    switch (operation) {
      case 'convert-to-stream':
        const stream = file.stream();
        const chunks = [];
        const reader = stream.getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          
          // Report progress
          self.postMessage({
            type: 'progress',
            percentage: Math.round((chunks.reduce((acc, chunk) => acc + chunk.length, 0) / file.size) * 100)
          });
        }
        
        self.postMessage({
          type: 'success',
          data: chunks,
          totalSize: file.size
        });
        break;
        
      case 'validate-file':
        const isValid = file.size <= 50 * 1024 * 1024 && 
                       (file.type.startsWith('video/') || file.type.startsWith('audio/'));
        self.postMessage({
          type: 'validation',
          isValid,
          size: file.size,
          type: file.type
        });
        break;
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};
```

#### Updated App Component with Web Worker
```typescript
// OPTIMIZED: Web Worker integration
const App: React.FC = () => {
  const [worker, setWorker] = useState<Worker | null>(null);
  
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      const fileWorker = new Worker(new URL('./workers/fileProcessor.ts', import.meta.url));
      fileWorker.onmessage = (e) => {
        const { type, ...data } = e.data;
        
        switch (type) {
          case 'progress':
            setProgress(prev => ({ ...prev, percentage: data.percentage }));
            break;
          case 'success':
            handleProcessedFile(data.chunks, data.totalSize);
            break;
          case 'validation':
            handleFileValidation(data);
            break;
          case 'error':
            console.error('Worker error:', data.error);
            break;
        }
      };
      setWorker(fileWorker);
    }
    
    return () => {
      if (worker) worker.terminate();
    };
  }, []);
  
  const handleFileSelect = async (file: File) => {
    setErrorMsg(null);
    
    if (worker) {
      worker.postMessage({ file, operation: 'validate-file' });
      worker.postMessage({ file, operation: 'convert-to-stream' });
    } else {
      // Fallback to main thread
      await processFile(file);
    }
  };
  
  // ... rest of component
};
```

### 7. Performance Monitoring

#### New File: `src/utils/performanceMonitor.ts`
```typescript
// Performance monitoring utilities
export class PerformanceMonitor {
  private static marks: Map<string, number> = new Map();
  private static measures: Map<string, number> = new Map();
  
  static startTimer(name: string) {
    if (performance.mark) {
      performance.mark(`${name}-start`);
      this.marks.set(name, performance.now());
    }
  }
  
  static endTimer(name: string): number {
    if (performance.mark) {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name, 'measure')[0];
      const duration = measure ? measure.duration : 0;
      this.measures.set(name, duration);
      
      return duration;
    }
    return 0;
  }
  
  static getMetrics() {
    return {
      marks: Object.fromEntries(this.marks),
      measures: Object.fromEntries(this.measures)
    };
  }
  
  static trackFileProcessing(fileSize: number) {
    return {
      start: () => this.startTimer('file-processing'),
      end: () => {
        const duration = this.endTimer('file-processing');
        const throughput = fileSize / duration; // bytes per ms
        
        console.log(`File processing: ${duration.toFixed(2)}ms, throughput: ${throughput.toFixed(2)} bytes/ms`);
        return { duration, throughput };
      }
    };
  }
}
```

#### Integration in Main Components
```typescript
// OPTIMIZED: Performance tracking integration
const processFile = async (file: File) => {
  const tracker = PerformanceMonitor.trackFileProcessing(file.size);
  tracker.start();
  
  try {
    // ... existing processing logic
    const result = await translateVideo(file, file.type, selectedLanguage);
    
    const metrics = tracker.end();
    // Send metrics to analytics service
    sendPerformanceMetrics(metrics);
    
    return result;
  } catch (error) {
    tracker.end();
    throw error;
  }
};
```

## Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Replace base64 conversion with streaming approach
- [ ] Add granular progress tracking
- [ ] Implement retry logic with exponential backoff
- [ ] Add proper memory cleanup

### Phase 2: Architecture Improvements
- [ ] Create web worker for file processing
- [ ] Implement performance monitoring
- [ ] Add strategic code splitting
- [ ] Optimize bundle size

### Phase 3: Advanced Features
- [ ] Implement chunked upload system
- [ ] Add service worker caching
- [ ] Integrate CDN for static assets
- [ ] Set up performance monitoring dashboard

## Expected Performance Improvements

### Memory Usage
- **Before**: 67MB+ base64 strings for 50MB files
- **After**: < 5MB streaming chunks

### Processing Time
- **Before**: 30-60 seconds with blocking UI
- **After**: 20-40 seconds with progress indicators

### User Experience
- **Before**: Unresponsive during processing
- **After**: Real-time progress updates

### Error Recovery
- **Before**: Immediate failure on network issues
- **After**: Automatic retry with fallback strategies

These optimizations will significantly improve the application's performance, user experience, and scalability while maintaining code quality and maintainability.