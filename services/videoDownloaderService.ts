// Service to handle fetching video data from a URL
// Note: Client-side fetching of Instagram videos is heavily restricted by CORS.
// We use a public API (Cobalt) to bridge this.

// List of CORS proxies to try in order
const PROXIES = [
  // Primary: corsproxy.io (Standard)
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  // Secondary: AllOrigins (Raw endpoint)
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  // Tertiary: ThingProxy
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
];

export const fetchVideoFromUrl = async (url: string): Promise<File> => {
  let downloadUrl: string | null = null;

  try {
    // 1. Resolve the URL using Cobalt API
    // We try to get audio only to save bandwidth and reduce failure rates
    const response = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        isAudioOnly: true
      })
    });

    if (!response.ok) {
      throw new Error(`Cobalt API unavailable (${response.status})`);
    }

    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.text || 'Could not find media at this URL.');
    }

    downloadUrl = data.url;

    // Handle "picker" case
    if (!downloadUrl && data.picker && data.picker.length > 0) {
      downloadUrl = data.picker[0].url;
    }

    if (!downloadUrl) {
      throw new Error('No valid media URL found in the response.');
    }

  } catch (error: any) {
    console.error("Cobalt API Error:", error);
    // If the resolver fails, we can't even get the download URL.
    // We throw a specific code so the UI knows to suggest external tools.
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      throw new Error("RESOLVER_CONNECTION_ERROR");
    }
    throw error;
  }

  // 2. Try to download the content using multiple proxies
  for (const proxyGen of PROXIES) {
    try {
      const proxyUrl = proxyGen(downloadUrl);
      console.log(`Trying proxy: ${proxyUrl}`);
      
      const mediaResponse = await fetch(proxyUrl);
      
      if (!mediaResponse.ok) {
        console.warn(`Proxy failed: ${mediaResponse.status}`);
        continue;
      }

      const blob = await mediaResponse.blob();
      
      // Check if we actually got an error page masquerading as a blob
      if (blob.type.includes('text/html') || blob.size < 1000) {
         console.warn("Proxy returned invalid content type");
         continue;
      }
      
      return new File([blob], "extracted_audio.mp3", { type: 'audio/mp3' });

    } catch (e) {
      console.warn("Proxy attempt failed:", e);
    }
  }

  // 3. If all proxies fail, throw an error with the direct link for manual handling
  // We use a pipe delimiter to make it easy to parse in the UI
  throw new Error(`MANUAL_DOWNLOAD_REQUIRED|${downloadUrl}`);
};