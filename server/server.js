// backend/server.js
const path = require("path");
const os = require("os");
const fs = require("fs");

// Add Deno to PATH if it exists (CRITICAL for YouTube on Vercel/Render)
const localDenoPath = path.join(__dirname, "bin", "deno", "bin");
const homeDenoPath = path.join(os.homedir(), ".deno", "bin");

if (fs.existsSync(localDenoPath)) {
  process.env.PATH = `${localDenoPath}${path.delimiter}${process.env.PATH}`;
  console.log("🦕 Local Deno added to PATH");
} else if (fs.existsSync(homeDenoPath)) {
  process.env.PATH = `${homeDenoPath}${path.delimiter}${process.env.PATH}`;
  console.log("🦕 Home Deno added to PATH");
}

require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const { GoogleGenAI, Type } = require("@google/genai");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin initialized");
  } catch (e) {
    console.error("❌ Failed to initialize Firebase:", e.message);
  }
} else {
  console.log("⚠️ FIREBASE_SERVICE_ACCOUNT not found, skipping persistence");
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY || process.env.API_KEY });

// Simple in-memory cache for metadata
const metadataCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ---------- Firestore Helpers ----------
async function getCookiesFromFirestore(platform) {
  if (!db) return null;
  try {
    const doc = await db.collection("settings").doc("cookies").get();
    if (doc.exists) {
      const data = doc.data();
      return data[platform] || null;
    }
  } catch (e) {
    console.error(`Error fetching ${platform} cookies from Firestore:`, e.message);
  }
  return null;
}

async function saveCookiesToFirestore(platform, cookies) {
  if (!db) return false;
  try {
    await db.collection("settings").doc("cookies").set({
      [platform]: cookies,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  } catch (e) {
    console.error(`Error saving ${platform} cookies to Firestore:`, e.message);
    return false;
  }
}

// ---------- yt-dlp PATH ----------
const isWin = process.platform === "win32";
const YTDLP_PATH = path.join(__dirname, "bin", isWin ? "yt-dlp.exe" : "yt-dlp");

// ---------- Health ----------
app.get("/health", (req, res) => {
  const exists = fs.existsSync(YTDLP_PATH);
  let version = "missing";
  if (exists) {
    try {
      version = require("child_process")
        .execSync(`${YTDLP_PATH} --version`)
        .toString()
        .trim();
    } catch {}
  }
  res.json({
    status: "ok",
    ts: Date.now(),
    ytDlpAvailable: exists,
    ytDlpVersion: version,
    ytDlpPath: YTDLP_PATH
  });
});

// ---------- Helpers ----------
function safeFileName(base, ext) {
  const s = String(base || "download")
    .replace(/[^a-z0-9_\-]/gi, "_")
    .slice(0, 40);
  return `${s}_${Date.now()}${ext}`;
}

/**
 * Get PO Token for YouTube clients.
 * Prioritizes environment variables.
 */
function getPoToken(client = "ios") {
  if (client === "ios" && process.env.YOUTUBE_PO_TOKEN_IOS) {
    return process.env.YOUTUBE_PO_TOKEN_IOS;
  }
  if (client === "web" && process.env.YOUTUBE_PO_TOKEN_WEB) {
    return process.env.YOUTUBE_PO_TOKEN_WEB;
  }
  // Generic fallback if user just provided one
  return process.env.YOUTUBE_PO_TOKEN || null;
}

// ---------- Cookies Helper ----------
async function getCookiesPath(targetUrl) {
  let rawCookies = null;
  const secretPath = "/etc/secrets/cookies.txt"; // Generic render secret
  
  // 1. Try Firestore First (Persistent)
  if (targetUrl && db) {
    const lowerUrl = targetUrl.toLowerCase();
    let platform = null;
    if (lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) platform = "twitter";
    else if (lowerUrl.includes("instagram.com")) platform = "instagram";
    else if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) platform = "youtube";

    if (platform) {
      console.log(`🔍 Checking Firestore for ${platform} cookies...`);
      rawCookies = await getCookiesFromFirestore(platform);
      if (rawCookies) console.log(`✅ Found ${platform} cookies in Firestore`);
    }
  }

  // 2. Fallback to Local/Env if not in Firestore
  if (!rawCookies && targetUrl) {
    const lowerUrl = targetUrl.toLowerCase();
    
    // X / Twitter
    if (lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) {
      const xPath = path.join(__dirname, "../cookies_twitter.txt");
      const xTmpPath = path.join(os.tmpdir(), "cookies_twitter.txt");

      if (fs.existsSync(xTmpPath)) {
        console.log("✅ Found updated cookie file: /tmp/cookies_twitter.txt");
        rawCookies = fs.readFileSync(xTmpPath, "utf8");
      } else if (fs.existsSync(xPath)) {
        console.log("✅ Found bundled cookie file: cookies_twitter.txt");
        rawCookies = fs.readFileSync(xPath, "utf8");
      } else if (process.env.TWITTER_COOKIES) {
        console.log("✅ Using TWITTER_COOKIES env var");
        rawCookies = process.env.TWITTER_COOKIES;
      }
    }
    
    // Instagram
    else if (lowerUrl.includes("instagram.com")) {
      const igPath = path.join(__dirname, "../cookies_instagram.txt");
      const igTmpPath = path.join(os.tmpdir(), "cookies_instagram.txt");
      
      // Prioritize /tmp (user updates) over bundled files
      if (fs.existsSync(igTmpPath)) {
        console.log("✅ Found updated cookie file: /tmp/cookies_instagram.txt");
        rawCookies = fs.readFileSync(igTmpPath, "utf8");
      } else if (fs.existsSync(igPath)) {
        console.log("✅ Found bundled cookie file: cookies_instagram.txt");
        rawCookies = fs.readFileSync(igPath, "utf8");
      } else if (process.env.IG_COOKIES) {
        console.log("✅ Using IG_COOKIES env var");
        rawCookies = process.env.IG_COOKIES;
      }
    }
    
    // YouTube
    else if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
      const ytPath = path.join(__dirname, "../cookies_youtube.txt");
      const ytTmpPath = path.join(os.tmpdir(), "cookies_youtube.txt");
      
      // Prioritize /tmp (user updates) over bundled files
      if (fs.existsSync(ytTmpPath)) {
        console.log("✅ Found updated cookie file: /tmp/cookies_youtube.txt");
        rawCookies = fs.readFileSync(ytTmpPath, "utf8");
      } else if (fs.existsSync(ytPath)) {
        console.log("✅ Found bundled cookie file: cookies_youtube.txt");
        rawCookies = fs.readFileSync(ytPath, "utf8");
      } else if (process.env.YOUTUBE_COOKIES) {
        console.log("✅ Using YOUTUBE_COOKIES env var");
        rawCookies = process.env.YOUTUBE_COOKIES;
      }
    }
  }

  // Fallbacks if no specific cookie found yet
  if (!rawCookies) {
    // 1. Check Generic Render Secret
    if (fs.existsSync(secretPath)) {
      console.log("✅ Found Render Secret File (Generic)");
      try {
        rawCookies = fs.readFileSync(secretPath, "utf8");
      } catch (e) {
        console.error("Error reading secret file:", e);
      }
    }

    // 2. Generic cookies.txt/.env in root
    if (!rawCookies) {
      const rootCookiesTxt = path.join(__dirname, "../cookies.txt");
      const rootCookiesEnv = path.join(__dirname, "../cookies.env");
      if (fs.existsSync(rootCookiesTxt)) {
        console.log("✅ Using root cookies.txt");
        rawCookies = fs.readFileSync(rootCookiesTxt, "utf8");
      } else if (fs.existsSync(rootCookiesEnv)) {
        console.log("✅ Using root cookies.env");
        rawCookies = fs.readFileSync(rootCookiesEnv, "utf8");
      }
    }
  }

  if (!rawCookies) return null;

  try {
    const trimmed = rawCookies.trim();

    // A. Check if already in Netscape format
    if (trimmed.startsWith("# Netscape") || trimmed.includes("\tTRUE\t")) {
      const tempPath = path.join(os.tmpdir(), `cookies_${Date.now()}.txt`);
      // Ensure header exists
      const content = trimmed.startsWith("# Netscape") 
        ? trimmed 
        : "# Netscape HTTP Cookie File\n" + trimmed;
      fs.writeFileSync(tempPath, content + "\n");
      return tempPath;
    }

    // B. Handle JSON format
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      console.log("🔄 Detecting JSON cookies, converting...");
      try {
        // Handle files with multiple JSON arrays/objects (e.g. concatenated exports)
        // We find all top-level arrays [] or objects {}
        const jsonBlocks = [];
        let depth = 0;
        let start = -1;
        let inString = false;

        for (let i = 0; i < trimmed.length; i++) {
          const char = trimmed[i];
          if (char === '"' && trimmed[i - 1] !== "\\") inString = !inString;
          if (inString) continue;

          if (char === "[" || char === "{") {
            if (depth === 0) start = i;
            depth++;
          } else if (char === "]" || char === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
              jsonBlocks.push(trimmed.slice(start, i + 1));
              start = -1;
            }
          }
        }

        const allCookies = [];
        for (const block of jsonBlocks) {
          try {
            let parsed = JSON.parse(block);
            if (!Array.isArray(parsed) && parsed.cookies) parsed = parsed.cookies;
            if (Array.isArray(parsed)) {
              allCookies.push(...parsed);
            } else if (typeof parsed === "object" && parsed !== null) {
              allCookies.push(parsed);
            }
          } catch (e) {
            console.warn("Failed to parse a JSON block, skipping...");
          }
        }

        if (allCookies.length > 0) {
          const netscapeLines = allCookies.map((c) => {
            const domain = c.domain || c.host || "";
            const httpOnly = c.httpOnly === true;
            const prefix = httpOnly ? "#HttpOnly_" : "";
            
            // yt-dlp/curl prefer leading dots for domains that aren't specific to one host
            let outDomain = domain;
            if (outDomain && !outDomain.startsWith(".") && outDomain.includes(".") && !httpOnly) {
              outDomain = "." + outDomain;
            }

            const flag = "TRUE";
            const pathv = c.path || "/";
            const secure = c.secure ? "TRUE" : "FALSE";
            const expires = c.expirationDate ? Math.floor(Number(c.expirationDate)) : 0;
            const name = c.name || "";
            const value = c.value || "";
            return `${prefix}${outDomain}\t${flag}\t${pathv}\t${secure}\t${expires}\t${name}\t${value}`;
          });

          const finalCookies = "# Netscape HTTP Cookie File\n" + netscapeLines.join("\n") + "\n";
          const tempPath = path.join(os.tmpdir(), `cookies_${Date.now()}.txt`);
          fs.writeFileSync(tempPath, finalCookies);
          console.log(`✅ Successfully converted ${allCookies.length} JSON cookies to Netscape format`);
          return tempPath;
        }
      } catch (jsonErr) {
        console.warn("Failed to parse JSON blocks, falling back to cleaning logic:", jsonErr.message);
      }
    }

    // C. Fallback: Process & Clean messy/pasted Netscape format
    const lines = trimmed.split("\n");
    const cleanedLines = [];

    lines.forEach((line) => {
      // Remove common copy-paste artifacts
      let l = line.replace(/^[│|]?\s*\d+\s+/, "").replace(/[│|]\s*$/, "").trim();
      if (!l) return;

      // In a real Netscape file, lines start with #, a dot, or a domain name
      // If it looks like a continuation (no tabs and doesn't look like a domain), we might append, 
      // but it's safer to just treat every line as a new line if it has enough parts.
      if (l.split(/\s+/).length >= 7 || l.startsWith("#") || l.startsWith(".")) {
        cleanedLines.push(l);
      } else if (cleanedLines.length > 0) {
        cleanedLines[cleanedLines.length - 1] += l;
      }
    });

    const finalLines = cleanedLines.map((l) => {
      if (l.startsWith("# ")) return l;
      if (!l.includes("\t")) {
        const parts = l.split(/\s+/);
        if (parts.length >= 7) {
          return parts.slice(0, 6).join("\t") + "\t" + parts.slice(6).join(" ");
        }
      }
      return l;
    });

    const header = "# Netscape HTTP Cookie File";
    const cleanCookies = header + "\n" + finalLines.join("\n") + "\n";
    const tempPath = path.join(os.tmpdir(), `cookies_${Date.now()}.txt`);
    fs.writeFileSync(tempPath, cleanCookies);

    return tempPath;
  } catch (e) {
    console.error("Failed to process cookies:", e);
    return null;
  }
}

// ======================================================
//  GENERIC DOWNLOADER
// ======================================================

// ---------- RESOLVE METADATA (Preview) ----------
app.get("/api/resolve", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not installed" });
  }

  const cleanUrl = url.trim();

  // Check cache
  const cached = metadataCache.get(cleanUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Serving from cache for', cleanUrl);
    return res.json(cached.data);
  }

  const cookiePath = await getCookiesPath(cleanUrl); // Pass cleanUrl to getCookiesPath
  const cookieArg = cookiePath ? `--cookies "${cookiePath}"` : "";

  let extractorArgs = "";
  if (cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be")) {
    extractorArgs = '--extractor-args "youtube:player_client=ios,web"';
    const poToken = getPoToken("ios");
    if (poToken) {
      extractorArgs = `--extractor-args "youtube:player_client=ios,web;po_token=ios+${poToken}"`;
    }
  }

  // 1. Try to get direct URL first (faster for some sites)
  const cmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" ${cookieArg} ${extractorArgs} --get-url -f "best[height<=720][vcodec!='none'][acodec!='none']/best" "${cleanUrl.replace(/"/g, '\"')}"`;

  exec(cmd, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (!err && stdout.trim()) {
      // Success - we have a direct link
      const data = {
        type: "video",
        can_preview: true,
        preview_url: stdout.trim(), // Might be a direct video stream
        download_url: `/api/download?url=${encodeURIComponent(cleanUrl)}`,
        title: "Video Media" 
      };
      
      // Try to get title/uploader separately if possible, but don't block
      // Ideally we run -J for everything, but --get-url is faster for a quick preview check
      
      metadataCache.set(cleanUrl, { data, timestamp: Date.now() });
      return res.json(data);
    }

    // 2. Fallback to full JSON metadata extraction (-J)
    // This is robust but slower.
    const metaCmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ${cookieArg} -J "${cleanUrl.replace(/"/g, '\"')}"`;
    
    exec(metaCmd, { maxBuffer: 50 * 1024 * 1024 }, (mErr, mOut) => {
      if (mErr) {
        const errorMsg = stderr || mErr.message;
        console.error("Metadata error:", errorMsg);

        let frontendError = "Failed to resolve video";
        // Check for common connection/blocking indicators in yt-dlp's stderr
        if (errorMsg.includes("HTTP Error") || 
            errorMsg.includes("Connection refused") ||
            errorMsg.includes("blocked by") ||
            errorMsg.includes("login required") ||
            errorMsg.includes("Please provide --cookies") ||
            errorMsg.includes("Unable to download webpage") ||
            errorMsg.includes("No video formats found")) 
        {
          frontendError = "RESOLVER_CONNECTION_ERROR: Failed to resolve video, likely due to network or platform restrictions.";
        }
        return res
          .status(500)
          .json({ error: frontendError, details: errorMsg });
      }

      try {
        const data = JSON.parse(mOut);
        
        // Find best format if not already in root
        let previewUrl = data.url;
        if (!previewUrl && data.formats) {
           const best = data.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none').pop();
           if (best) previewUrl = best.url;
        }

        const responseData = {
          type: "video",
          can_preview: !!previewUrl,
          preview_url: previewUrl || data.thumbnail || null,
          download_url: `/api/download?url=${encodeURIComponent(cleanUrl)}`,
          username: data.uploader || data.channel || "unknown",
          title: data.title || "Video Media",
          is_youtube: data.extractor_key === 'Youtube',
          duration: data.duration
        };

        metadataCache.set(cleanUrl, { data: responseData, timestamp: Date.now() });
        res.json(responseData);
      } catch (e) {
        console.error("JSON parse error:", e);
        res.status(500).json({ error: "Failed to parse video metadata" });
      }
    });
  });
});

// ---------- DOWNLOAD CONTENT ----------
app.get("/api/download", async (req, res) => {
  const { url, title } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not available" });
  }

  const baseName = title ? title.toString() : "video";
  const filename = safeFileName(baseName, ".mp4");
  
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.setHeader("Content-Type", "video/mp4");

  const cookiePath = await getCookiesPath(url); // Pass url to getCookiesPath
  const args = [
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "-f",
    "best[height<=720][ext=mp4]/best[ext=mp4]/best",
    "--merge-output-format",
    "mp4",
    "--recode-video",
    "mp4",
    "--postprocessor-args",
    "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
    "-o",
    "-",
    url
  ];

  if (cookiePath) {
    args.unshift("--cookies", cookiePath);
  }

  const child = spawn(YTDLP_PATH, args);
  child.stdout.pipe(res);
  
  child.stderr.on("data", (d) => {
    // Only log significant errors/warnings to avoid clutter
    const msg = d.toString();
    if (msg.toLowerCase().includes('error')) {
      console.error("DL Error:", msg);
    }
  });

  child.on("error", (e) => {
    console.error("Spawn error:", e);
    if (!res.headersSent) res.status(500).end();
  });
  
  child.on("close", (code) => {
    if (code !== 0) console.error("Download process exited with code:", code);
    if (!res.headersSent) res.end();
  });
});

// ---------- TRANSCRIBE & TRANSLATE (Streaming Progress) ----------
app.post("/api/transcribe", async (req, res) => {
  const { url, targetLanguage } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  // Set headers for streaming response (NDJSON)
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const prompt = `
      You are an expert transcriptionist and translator.
      Analyze the provided media file and follow these instructions strictly:
      1. **Transcription**: Transcribe the spoken audio accurately in its original language. 
      2. **Translation**: Translate the transcription into ${targetLanguage || 'English'}. Ensure the translation is natural and maintains the original tone.
      3. **Title**: Create a concise, descriptive title (max 5-7 words).
      
      **Formatting Requirements (MANDATORY)**:
      - You MUST format the "originalText" and "translatedText" for maximum readability.
      - Break the text into paragraphs using double line breaks (\\n\\n).
      - Each paragraph should contain 1-3 sentences or represent a single logical thought or speaker change.
      - NEVER return a single block of text.
      
      **Structural Example**:
      "This is the first paragraph.\\n\\nThis is the second paragraph after a logical break.\\n\\nThis is the third paragraph."
      
      Output MUST be a valid JSON object with these keys:
      - "originalText": The formatted transcription.
      - "translatedText": The formatted translation.
      - "title": The descriptive title.

      If there is no speech, describe the audio/visual content in the "originalText" field and translate that description.
    `;




    // Fetch bytes via yt-dlp (Using audio-only for speed and reliability)
    console.log("Fetching bytes for platform:", url);
    const cookiePath = await getCookiesPath(url); // Pass url to getCookiesPath
    
    // Construct extractor args with PO Token if available
    let extractorArgs = "youtube:player_client=web,ios";
    const poToken = getPoToken("ios");
    if (poToken) {
      extractorArgs += `;po_token=ios+${poToken}`;
    }

    // Get yt-dlp version for system info
    let ytDlpVersion = "unknown";
    try {
      ytDlpVersion = require("child_process").execSync(`"${YTDLP_PATH}" --version`).toString().trim();
    } catch (e) {}

    // Send initial system info
    res.write(JSON.stringify({ type: 'log', message: `System Online | Core: yt-dlp ${ytDlpVersion}` }) + '\n');

    const ytDlpArgs = [
      "-f", "ba[ext=m4a]/ba[ext=aac]/ba/bestaudio/best",
      "--no-playlist",
      "--js-runtimes", "deno",
      "--js-runtimes", "node",
      "--extractor-args", extractorArgs,
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-o", "-",
      url
    ];

    if (cookiePath) {
      ytDlpArgs.unshift("--cookies", cookiePath);
    }

    const fullCommand = `yt-dlp ${ytDlpArgs.join(" ")}`;
    res.write(JSON.stringify({ type: 'log', message: `Running command: '${fullCommand}'` }) + '\n');

    const child = spawn(YTDLP_PATH, ytDlpArgs, {
      env: { ...process.env }
    });
    let chunks = [];
    let stderrData = "";
    let totalLength = 0;
    
    // Parse progress and logs from stderr
    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderrData += text;
      
      // Send raw log to frontend
      text.split('\n').forEach(line => {
        if (line.trim()) {
          res.write(JSON.stringify({ type: 'log', message: line.trim() }) + '\n');
        }
      });

      // Extract percentage: [download]  23.5% of ...
      const match = text.match(/\[download\]\s+(\d+\.\d+)%/);
      if (match && match[1]) {
        const percent = parseFloat(match[1]);
        res.write(JSON.stringify({ type: 'progress', value: percent, stage: 'downloading' }) + '\n');
      }
    });

    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
      totalLength += chunk.length;
      // Safety: limit to 20MB for inlineData to avoid payload limits
      if (totalLength > 20 * 1024 * 1024) {
        console.warn("File too large, truncating at 20MB");
        child.kill();
      }
    });

    child.on("close", async (code) => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          console.error("Buffer is empty after yt-dlp. Exit code:", code);
          console.error("yt-dlp stderr output:", stderrData);
          const details = stderrData;
          let frontendErrorMsg = "Failed to fetch media bytes.";
          
          if (details.includes("Sign in to confirm you’re not a bot") || details.includes("cookies are no longer valid")) {
            frontendErrorMsg = "YOUTUBE_COOKIE_EXPIRED: Your YouTube session cookies have expired or been rotated. Please update cookies_youtube.txt with a fresh export from your browser.";
          } else if (details.includes("HTTP Error") || 
              details.includes("Connection refused") ||
              details.includes("blocked by") ||
              details.includes("login required") ||
              details.includes("Please provide --cookies") ||
              details.includes("Unable to download webpage") ||
              details.includes("No video formats found")) 
          {
            frontendErrorMsg = "RESOLVER_CONNECTION_ERROR: Failed to fetch media bytes, likely due to network or platform restrictions.";
          }
          const errorMsg = { error: frontendErrorMsg, details: details };
          res.write(JSON.stringify({ type: 'error', data: errorMsg }) + '\n');
          return res.end();
        }
        if (code !== 0) {
          console.error(`yt-dlp exited with non-zero code ${code}`);
          console.error("yt-dlp stderr:", stderrData);
          return res.status(500).json({
            error: `yt-dlp failed with exit code ${code}.`,
            details: stderrData
          });
        }

        // Notify frontend: Download complete, starting AI
        res.write(JSON.stringify({ type: 'status', message: 'Processing audio with Gemini...' }) + '\n');

        console.log(`Sending ${buffer.length} bytes to Gemini...`);
        let response;
        try {
          response = await genAI.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: {
              parts: [
                {
                  inlineData: {
                    data: buffer.toString("base64"),
                    mimeType: "audio/mp4"
                  }
                },
                {
                  text: prompt
                }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  originalText: { type: Type.STRING },
                  translatedText: { type: Type.STRING },
                  title: { type: Type.STRING },
                },
                required: ["originalText", "translatedText", "title"],
              },
            }
          });
        } catch (initialErr) {
            console.error("Gemini API Error:", initialErr);
            throw initialErr;
        }
        
        if (!response.text) {
          throw new Error("Gemini returned empty response");
        }

        // Send Final Result
        const resultData = JSON.parse(response.text);
        res.write(JSON.stringify({ type: 'result', data: resultData }) + '\n');
        res.end();

      } catch (geminiErr) {
        console.error("Gemini processing error:", geminiErr);
        res.write(JSON.stringify({ type: 'error', data: { message: geminiErr.message } }) + '\n');
        res.end();
      }
    });

    child.on("error", (e) => {
      console.error("Spawn error:", e);
      res.write(JSON.stringify({ type: 'error', data: { message: "Failed to start downloader process" } }) + '\n');
      res.end();
    });

  } catch (error) {
    console.error("Transcription error:", error);
    res.write(JSON.stringify({ type: 'error', data: { message: error.message } }) + '\n');
    res.end();
  }
});

// ---------- COOKIE UPDATE ENDPOINT ----------
app.post("/api/cookies", async (req, res) => {
  const { platform, cookies } = req.body;

  if (!platform || !cookies) {
    return res.status(400).json({ error: "Missing platform or cookies" });
  }

  // 1. Save to Firestore (Primary Persistent Store)
  const firestoreSaved = await saveCookiesToFirestore(platform, cookies);
  if (firestoreSaved) {
    console.log(`✅ ${platform} cookies persisted to Firestore`);
  }

  // 2. Fallback: Save to Local File (for immediate use or if no Firestore)
  let filePath;
  if (platform === "youtube") {
    filePath = path.join(__dirname, "../cookies_youtube.txt");
  } else if (platform === "instagram") {
    filePath = path.join(__dirname, "../cookies_instagram.txt");
  } else if (platform === "twitter") {
    filePath = path.join(__dirname, "../cookies_twitter.txt");
  } else {
    return res.status(400).json({ error: "Unsupported platform" });
  }

  try {
    console.log(`💾 Attempting to save ${platform} cookies to: ${filePath}`);
    fs.writeFileSync(filePath, cookies.trim() + "\n");
    console.log(`✅ ${platform} cookies updated via web interface`);
    res.json({ 
      status: "success", 
      message: `${platform} cookies updated ${firestoreSaved ? "persistently (Firestore)" : "locally"}` 
    });
  } catch (error) {
    console.warn(`⚠️ Failed to write to project root (${error.message}), trying /tmp...`);
    try {
      const tmpPath = path.join(os.tmpdir(), path.basename(filePath));
      fs.writeFileSync(tmpPath, cookies.trim() + "\n");
      console.log(`✅ ${platform} cookies updated in temporary storage: ${tmpPath}`);
      res.json({ 
        status: "success", 
        message: `${platform} cookies updated ${firestoreSaved ? "persistently (Firestore)" : "(Temporary Session Only)"}` 
      });
    } catch (tmpError) {
      console.error("❌ Error saving cookies even to /tmp:", tmpError);
      res.status(500).json({ 
        error: "Failed to save cookies on server",
        details: tmpError.message,
        path: tmpError.path,
        firestoreSuccess: firestoreSaved
      });
    }
  }
});

// ---------- Start server ----------
// Serve Frontend (Must be last)
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

if (require.main === module) {
  // Add Deno to PATH if it exists (for Render)
  const denoPath = path.join(os.homedir(), ".deno", "bin");
  if (fs.existsSync(denoPath)) {
    process.env.PATH = `${denoPath}${path.delimiter}${process.env.PATH}`;
    console.log("🦕 Deno added to PATH for yt-dlp");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Universal Downloader Backend: http://localhost:${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;