import { AppStatus } from '../types';

const LOCAL_API_BASE = '';

/**
 * Custom Error class for downloader issues
 */
export class DownloaderError extends Error {
  constructor(message: string, public code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'DownloaderError';
  }
}

/**
 * Validates if the URL is a valid Instagram URL
 */
export const isValidInstagramUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('instagram.com') && 
           (parsed.pathname.includes('/reel/') || 
            parsed.pathname.includes('/p/') || 
            parsed.pathname.includes('/tv/') ||
            parsed.pathname.includes('/stories/'));
  } catch {
    return false;
  }
};

/**
 * Main entry point: Resolves URL and downloads the video as a Blob.
 * Now uses the local 'InstantSaver' backend running on port 3001.
 */
export const fetchVideoFromUrl = async (
  url: string, 
  onStatusUpdate: (status: string) => void
): Promise<Blob> => {
  
  // 1. Validate
  if (!isValidInstagramUrl(url)) {
    throw new DownloaderError('Invalid Instagram URL', 'INVALID_URL');
  }

  try {
    onStatusUpdate('Connecting to local downloader service...');
    
    // 2. Get Metadata / Resolution from Local Backend
    const cleanUrl = url.split('?')[0]; // Simple strip
    const apiUrl = `${LOCAL_API_BASE}/api/instagram?url=${encodeURIComponent(cleanUrl)}`;
    
    const metaResponse = await fetch(apiUrl);
    
    if (!metaResponse.ok) {
       // If local server isn't running
       if (metaResponse.status === 404 || metaResponse.status === 500) {
           throw new DownloaderError('Local downloader service error. Is the server running?', 'SERVER_ERROR');
       }
       throw new DownloaderError('Failed to resolve video.', 'RESOLVE_ERROR');
    }

    const metaData = await metaResponse.json();

    if (!metaData.download_url) {
        throw new DownloaderError('No download URL returned from service.', 'NO_MEDIA_FOUND');
    }

    // 3. Download the actual video file via the backend (Proxied Stream)
    // This avoids CORS because we are fetching from localhost to localhost
    onStatusUpdate('Downloading video data...');
    const downloadEndpoint = `${LOCAL_API_BASE}${metaData.download_url}`;
    
    const videoResponse = await fetch(downloadEndpoint);
    
    if (!videoResponse.ok) {
        throw new DownloaderError('Failed to download video data.', 'DOWNLOAD_ERROR');
    }

    const videoBlob = await videoResponse.blob();
    
    if (videoBlob.size < 1000) {
        throw new DownloaderError('Downloaded file is too small (likely invalid).', 'INVALID_FILE');
    }

    return videoBlob;

  } catch (error: any) {
    console.error('Video Download Error:', error);
    
    if (error.message.includes('Failed to fetch')) {
        throw new DownloaderError('Could not connect to backend. Please run "node server/server.js" in a separate terminal.', 'CONNECTION_REFUSED');
    }
    
    if (error instanceof DownloaderError) {
      throw error;
    }
    
    throw new DownloaderError(error.message || 'Unknown error occurred', 'UNKNOWN_ERROR');
  }
};