// backend/server.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const { GoogleGenAI, Type } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY || process.env.API_KEY });

// Simple in-memory cache for metadata
const metadataCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

app.use(cors());
app.use(express.json({ limit: "50mb" }));

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

// ---------- Cookies Helper ----------
function getCookiesPath() {
  let rawCookies = null;
  const secretPath = "/etc/secrets/cookies.txt";

  // 1. Get Raw Content
  if (fs.existsSync(secretPath)) {
    console.log("✅ Found Vercel Secret File");
    try {
      rawCookies = fs.readFileSync(secretPath, 'utf8');
    } catch (e) {
      console.error("Error reading secret file:", e);
    }
  } 
  
  if (!rawCookies && process.env.IG_COOKIES) {
    console.log("✅ Using IG_COOKIES env var");
    rawCookies = process.env.IG_COOKIES;
  }

  if (!rawCookies) return null;

  try {
    // If the provided cookies look like a JSON export (e.g. browser export),
    // convert them to Netscape format lines so yt-dlp accepts them.
    const maybe = rawCookies.trim();
    if (maybe.startsWith('{') || maybe.startsWith('[')) {
      try {
        const parsed = JSON.parse(maybe);
        if (Array.isArray(parsed)) {
          const jsonLines = parsed.map((c) => {
            const domain = c.domain || c.host || '';
            const httpOnly = !!c.httpOnly;
            const prefix = httpOnly ? '#HttpOnly_' : '';
            const outDomain = domain.startsWith('.') ? domain : `.${domain}`;
            const flag = 'TRUE';
            const pathv = c.path || '/';
            const secure = c.secure ? 'TRUE' : 'FALSE';
            const expires = c.expirationDate ? Math.floor(Number(c.expirationDate)) : 0;
            const name = c.name || '';
            const value = c.value || '';
            return `${prefix}${outDomain}\t${flag}\t${pathv}\t${secure}\t${expires}\t${name}\t${value}`;
          });
          rawCookies = jsonLines.join('\n');
        }
      } catch (jsonErr) {
        // Ignore JSON parse errors and fall back to existing cleaning logic
      }
    }

    // 2. Process & Clean
    const lines = rawCookies.split('\n');
    const cleanedLines = [];
    
    lines.forEach(line => {
      // Remove potential copy-paste prefixes like "1 " or "│ 1 "
      let l = line.replace(/^[│|]?\s*\d+\s+/, '').replace(/[│|]\s*$/, '').trim();
      if (!l) return;

      // Check if this is a start of a new cookie line or comment
      // Valid starts: "# ", "#HttpOnly_", ".instagram.com", "instagram.com"
      const isStart = l.startsWith('#') || l.startsWith('.'); 
      
      if (isStart || cleanedLines.length === 0) {
        cleanedLines.push(l);
      } else {
        // Likely a wrapped line (continuation of previous value)
        // Append to last line
        cleanedLines[cleanedLines.length - 1] += l;
      }
    });

    // 3. Fix Separators (Spaces -> Tabs)
    const finalLines = cleanedLines.map(l => {
      // Preserve human comments that start with "# " exactly
      if (l.startsWith('# ')) return l;

      // If no tabs, try to fix space separation
      if (!l.includes('\t')) {
         const parts = l.split(/\s+/);
         // A valid line should have at least 7 parts (last part is value)
         if (parts.length >= 7) {
             // Reconstruct: first 6 with tabs, rest joined (value)
             // Use a space between value parts to avoid concatenation errors
             return parts.slice(0, 6).join('\t') + '\t' + parts.slice(6).join(' ');
         }
      }
      return l;
    });

    // Prepend the Netscape cookie file header and ensure trailing newline
    const header = '# Netscape HTTP Cookie File';
    const cleanCookies = header + '\n' + finalLines.join('\n') + '\n';
    const tempPath = path.join(os.tmpdir(), "cookies.txt");
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
app.get("/api/resolve", (req, res) => {
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

  const cookiePath = getCookiesPath();
  const cookieArg = cookiePath ? `--cookies "${cookiePath}"` : "";

  // 1. Try to get direct URL first (faster for some sites)
  const cmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ${cookieArg} --get-url -f "best[height<=720][vcodec!='none'][acodec!='none']/best" "${cleanUrl.replace(/"/g, '\\"')}"`;

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
    const metaCmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ${cookieArg} -J "${cleanUrl.replace(/"/g, '\\"')}"`;
    
    exec(metaCmd, { maxBuffer: 50 * 1024 * 1024 }, (mErr, mOut) => {
      if (mErr) {
        const errorMsg = stderr || mErr.message;
        console.error("Metadata error:", errorMsg);
        return res
          .status(500)
          .json({ error: "Failed to resolve video", details: errorMsg });
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
app.get("/api/download", (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not available" });
  }

  const filename = safeFileName("video", ".mp4");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.setHeader("Content-Type", "video/mp4");

  const cookiePath = getCookiesPath();
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

// ---------- TRANSCRIBE & TRANSLATE (Direct Byte Transfer) ----------
app.post("/api/transcribe", async (req, res) => {
  const { url, targetLanguage } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const prompt = `
      Analyze this media file (Audio or Video).
      1. Transcribe the spoken audio verbatim in its original language.
      2. Translate the transcription into ${targetLanguage || 'English'}.
      
      Return the output in JSON format with two keys: "originalText" and "translatedText".
      If there is no speech, provide a description of the sound in the "originalText" field and translate that description.
    `;

    // Fetch bytes via yt-dlp (Using audio-only for speed and reliability)
    console.log("Fetching bytes for platform:", url);
    const cookiePath = getCookiesPath();
    const args = [
      "-f", "ba[ext=m4a]/ba/bestaudio/best",
      "--no-playlist",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "-o", "-",
      url
    ];

    if (cookiePath) args.unshift("--cookies", cookiePath);

    const child = spawn(YTDLP_PATH, args);
    let chunks = [];
    let totalLength = 0;
    
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
          console.error("Buffer is empty after yt-dlp");
          return res.status(500).json({ error: `Failed to fetch media bytes (empty buffer). yt-dlp exit code: ${code}` });
        }

        console.log(`Sending ${buffer.length} bytes to Gemini...`);
        const response = await genAI.models.generateContent({
          model: "gemini-1.5-flash", // Using 1.5-flash for maximum reliability
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
              },
              required: ["originalText", "translatedText"],
            },
          }
        });
        
        if (!response.text) {
          console.error("Gemini API Full Response:", JSON.stringify(response));
          throw new Error("Gemini returned an empty response (no text content).");
        }

        res.json(JSON.parse(response.text));
      } catch (geminiErr) {
        console.error("Gemini processing error:", geminiErr);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: `Gemini processing failed: ${geminiErr.message}`,
            details: geminiErr.stack
          });
        }
      }
    });

    child.on("error", (e) => {
      console.error("Spawn error:", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed to start downloader." });
    });

  } catch (error) {
    console.error("Transcription error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Universal Downloader Backend: http://localhost:${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
