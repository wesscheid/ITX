// Service to handle fetching video data from a URL
// Note: Client-side fetching of Instagram videos is heavily restricted by CORS.
// We use a public API (Cobalt) to bridge this.

// Helper to clean URL (remove tracking params which confuse resolvers)
const cleanInstagramUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    // Remove query parameters like ?igsh=... or ?share_id=...
    // Keep path (e.g. /reel/ID/)
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
};

// List of CORS proxies to try for downloading the actual media file
const MEDIA_PROXIES = [
  // Primary: corsproxy.io (Standard)
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  // Secondary: AllOrigins (Raw endpoint)
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  // Tertiary: ThingProxy
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
];

// --- RESOLVER 1: COBALT ---
const resolveViaCobalt = async (targetUrl: string): Promise<string> => {
  const cobaltApiUrl = 'https://api.cobalt.tools/api/json';
  const cleanUrl = cleanInstagramUrl(targetUrl);
  
  const performFetch = async (useProxy: boolean, isAudioOnly: boolean) => {
    const endpoint = useProxy 
      ? `https://corsproxy.io/?${encodeURIComponent(cobaltApiUrl)}` 
      : cobaltApiUrl;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: cleanUrl,
        isAudioOnly: isAudioOnly,
        filenamePattern: "basic",
        // disable dubbing/translation features to keep it simple
        disableMetadata: true 
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    return await response.json();
  };

  let data;
  
  // Comprehensive Retry Strategy for Cobalt
  // Sequence: Direct(Audio) -> Direct(Video) -> Proxy(Audio) -> Proxy(Video)
  try {
    // 1. Direct - Audio Only
    data = await performFetch(false, true);
  } catch (err1) {
    try {
      // 2. Direct - Video Mode (Fallback if audio conversion fails)
      data = await performFetch(false, false);
    } catch (err2) {
      try {
        // 3. Proxy - Audio Only (Fallback if direct blocked)
        data = await performFetch(true, true);
      } catch (err3) {
        try {
          // 4. Proxy - Video Mode (Fallback if everything else fails)
          data = await performFetch(true, false);
        } catch (err4) {
           throw new Error("Cobalt exhaustive attempts failed");
        }
      }
    }
  }

  if (!data || data.status === 'error') {
    throw new Error(data?.text || 'Cobalt returned error status');
  }

  // Handle various Cobalt response shapes
  let downloadUrl = data.url;
  if (!downloadUrl && data.picker && data.picker.length > 0) {
    downloadUrl = data.picker[0].url;
  }

  if (!downloadUrl) throw new Error("No URL in Cobalt response");
  
  return downloadUrl;
};

// --- RESOLVER 2: MILANCODES (Alternative) ---
// We rotate through a few known Vercel deployments of this API.
// We also try multiple path structures since deployment configs vary.
const ALT_API_INSTANCES = [
  "https://instagram-downloader-api-tau.vercel.app",
  "https://instagram-downloader-api-five.vercel.app",
  "https://instagram-downloader-api.vercel.app"
];

// Possible endpoint paths on these instances
const ALT_API_PATHS = [
  "/download",      // Common Express app root
  "/api/download",  // Common Next.js API route
  "/"               // Sometimes root handles it
];

const resolveViaAlternative = async (targetUrl: string): Promise<string> => {
  let lastError: any;
  const cleanUrl = cleanInstagramUrl(targetUrl);
  const encodedTarget = encodeURIComponent(cleanUrl);

  for (const baseUrl of ALT_API_INSTANCES) {
    for (const path of ALT_API_PATHS) {
      try {
        const apiUrl = `${baseUrl}${path}?link=${encodedTarget}`;
        
        // Always use proxy for these API calls to avoid CORS issues from the Vercel app itself
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
          // If 404, this specific path doesn't exist on this instance
          if (response.status === 404) continue; 
          throw new Error(`Status ${response.status}`);
        }

        // Check content type to ensure we got JSON (not a Vercel 404 HTML page)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
           continue; // Not a JSON API response
        }

        const data = await response.json();
        
        // Structure check based on common responses from this API family
        // Variant A: { data: [ { url: "...", type: "video" } ] }
        // Variant B: { status: true, data: { url: "..." } }
        // Variant C: { url: "..." }
        
        let videoUrl: string | undefined;

        if (Array.isArray(data?.data)) {
          const video = data.data.find((item: any) => item.type === 'video' || item.url);
          videoUrl = video?.url;
        } else if (data?.data?.url) {
          videoUrl = data.data.url;
        } else if (data?.url) {
          videoUrl = data.url;
        }
        
        if (videoUrl) {
          return videoUrl;
        }
      } catch (e) {
        lastError = e;
        // console.warn(`Failed ${baseUrl}${path}:`, e);
      }
    }
  }

  throw new Error(`All Alternative instances failed. Last error: ${lastError?.message || 'Unknown'}`);
};

// New: Retry logic with exponential backoff
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

export const fetchVideoFromUrl = async (url: string): Promise<File> => {
  let downloadUrl: string | undefined;
  
  // STEP 1: RESOLUTION with retry logic
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

  if (!downloadUrl) {
    throw new Error("RESOLVER_CONNECTION_ERROR");
  }

  // STEP 2: DOWNLOAD VIA PROXIES with retry logic
  for (const proxyGen of MEDIA_PROXIES) {
    try {
      const proxyUrl = proxyGen(downloadUrl);
      console.log(`Downloading media via: ${proxyUrl}`);
      
      const blob = await retryWithBackoff(async () => {
        const mediaResponse = await fetch(proxyUrl);
        
        if (!mediaResponse.ok) {
          throw new Error(`HTTP ${mediaResponse.status}`);
        }

        const blob = await mediaResponse.blob();
        
        // Validation: Ensure we didn't get an HTML error page
        if (blob.type.includes('text/html') || blob.size < 1000) {
           throw new Error('Received HTML response instead of media');
        }
        
        return blob;
      }, 2, 1500);

      const mimeType = blob.type || 'audio/mp3';
      let extension = mimeType.split('/')[1] || 'mp3';
      if (extension.includes(';')) extension = extension.split(';')[0];

      return new File([blob], `extracted_media.${extension}`, { type: mimeType });

    } catch (e) {
      console.warn("Proxy download attempt failed:", e);
    }
  }

  // Final Fallback: Ask user to download manually
  throw new Error(`MANUAL_DOWNLOAD_REQUIRED|${downloadUrl}`);
};