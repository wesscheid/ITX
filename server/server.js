// backend/server.js
const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

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
function isInstagramUrl(url) {
  return /(?:https?:\/\/)?(www\.)?instagram\.com\//i.test(url || "");
}
function isYouTubeUrl(url) {
  return /(?:https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(
    url || ""
  );
}
function normalizeYouTube(url) {
  let u = (url || "").trim();
  const shortsMatch = u.match(/\/shorts\/([^\/\?]+)/);
  if (shortsMatch) return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
  const shortMatch = u.match(/youtu\.be\/([^\/\?]+)/);
  if (shortMatch) return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
  return u;
}
function isValidYouTubeVideo(url) {
  const clean = normalizeYouTube(url);
  return /youtube\.com\/watch\?/.test(clean) || /youtu\.be\//.test(clean);
}
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
      if (l.startsWith('# ')) return l; // Comment
      
      // If no tabs, try to fix space separation
      if (!l.includes('\t')) {
         const parts = l.split(/\s+/);
         // A valid line should have at least 7 parts (last part is value)
         if (parts.length >= 7) {
             // Reconstruct: first 6 with tabs, rest joined (value)
             return parts.slice(0, 6).join('\t') + '\t' + parts.slice(6).join('');
         }
      }
      return l;
    });

    const cleanCookies = finalLines.join('\n');
    const tempPath = path.join("/tmp", "cookies.txt");
    fs.writeFileSync(tempPath, cleanCookies);
    console.log("✅ Wrote cleaned cookies to", tempPath);
    return tempPath;

  } catch (e) {
    console.error("Failed to process cookies:", e);
    return null;
  }
}

// ======================================================
//  INSTAGRAM
// ======================================================

// ---------- Instagram PREVIEW (single preview with audio) ----------
app.get("/api/instagram", (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }
  // Cross‑platform check
  if (!isInstagramUrl(url)) {
    return res
      .status(400)
      .json({ error: "Invalid Instagram URL. Please paste an Instagram link." });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not installed" });
  }

  const cleanUrl = url.trim();
  const cookiePath = getCookiesPath();
  const cookieArg = cookiePath ? `--cookies "${cookiePath}"` : "";

  const cmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ${cookieArg} --get-url -f "best[height<=720][vcodec!='none'][acodec!='none']/best" "${cleanUrl.replace(
    /"/g,
    '\\"'
  )}"`;

  exec(
    cmd,
    { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (!err && stdout.trim()) {
        return res.json({
          type: "video",
          can_preview: true,
          preview_url: stdout.trim(),
          download_url: `/api/instagram/download?url=${encodeURIComponent(
            cleanUrl
          )}`,
          username: "instagram",
          title: "Instagram media"
        });
      }

      // Fallback metadata
      const metaCmd = `"${YTDLP_PATH}" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ${cookieArg} -J "${cleanUrl.replace(/"/g, '\\"')}"`;
      exec(metaCmd, { maxBuffer: 20 * 1024 * 1024 }, (mErr, mOut) => {
        if (mErr) {
          const errorMsg = stderr || mErr.message;
          console.error("IG metadata error:", errorMsg);
          return res
            .status(500)
            .json({ error: "Instagram fetch failed", details: errorMsg, retry: true });
        }
        try {
          const data = JSON.parse(mOut);
          res.json({
            type: "video",
            can_preview: false,
            preview_url: data.thumbnail || null,
            download_url: `/api/instagram/download?url=${encodeURIComponent(
              cleanUrl
            )}`,
            username: data.uploader || "instagram",
            title: data.title || "Instagram media"
          });
        } catch {
          res.status(500).json({ error: "Instagram parse failed" });
        }
      });
    }
  );
});

// ---------- Instagram DOWNLOAD ----------
app.get("/api/instagram/download", (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }
  if (!isInstagramUrl(url)) {
    return res
      .status(400)
      .json({ error: "Invalid Instagram URL. Please paste an Instagram link." });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not available" });
  }

  const filename = safeFileName("instagram", ".mp4");
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
  child.stderr.on("data", (d) =>
    console.error("IG download:", d.toString())
  );
  child.on("error", (e) => {
    console.error("IG spawn error:", e);
    if (!res.headersSent) res.status(500).end();
  });
  child.on("close", (code) => {
    if (code !== 0) console.error("IG close code:", code);
    if (!res.headersSent) res.end();
  });
});

// ======================================================
//  YOUTUBE
// ======================================================

// ---------- YouTube PREVIEW ----------
app.get("/api/youtube", (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }
  // Cross‑platform check
  if (!isYouTubeUrl(url)) {
    return res
      .status(400)
      .json({ error: "Invalid YouTube URL. Please paste a YouTube link." });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not installed" });
  }

  const cleanUrl = normalizeYouTube(url);

  if (!isValidYouTubeVideo(cleanUrl)) {
    return res.status(400).json({
      error:
        "Invalid YouTube video URL. Use formats like youtube.com/watch?v=ID, youtu.be/ID, or /shorts/ID",
      example: "https://youtube.com/shorts/DpMsAo4clKk"
    });
  }

  const cmd = `"${YTDLP_PATH}" -J "${cleanUrl.replace(/"/g, '\\"')}"`;
//const cmd = `"${YTDLP_PATH}" --js-runtimes deno -J "${cleanUrl.replace(/"/g, '\\"')}"`;

  exec(cmd, { maxBuffer: 30 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const msg = stderr?.toString() || err.message;
      // JS runtime / cookies error from your logs
      if (msg.includes("No supported JavaScript runtime") ||
          msg.includes("Sign in to confirm you’re not a bot")) {
        console.error("YouTube blocked:", msg);
        return res.status(503).json({
          error:
            "YouTube is temporarily blocking automated downloads for this video. Try another video or later.",
          technical: "JS runtime / cookies required"
        });
      }

      console.error("YouTube error:", msg);
      return res.status(500).json({ error: "YouTube fetch failed" });
    }

    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      return res.status(500).json({ error: "Invalid YouTube response" });
    }

    const formats = Array.isArray(data.formats) ? data.formats : [];
    const progressive = formats.filter(
      (f) =>
        f.url &&
        f.vcodec !== "none" &&
        f.acodec !== "none" &&
        (!f.height || f.height <= 720)
    );
    const best = progressive.sort(
      (a, b) => (b.tbr || 0) - (a.tbr || 0)
    )[0];

    res.json({
      type: "video",
      can_preview: !!best?.url,
      preview_url: best?.url || data.thumbnail || null,
      download_url: `/api/youtube/download?url=${encodeURIComponent(
        cleanUrl
      )}&title=${encodeURIComponent(data.title || "youtube")}`,
      username: data.uploader || data.channel || "youtube",
      title: data.title || "YouTube video"
    });
  });
});

// ---------- YouTube DOWNLOAD ----------
app.get("/api/youtube/download", (req, res) => {
  const { url, title } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }
  if (!isYouTubeUrl(url)) {
    return res
      .status(400)
      .json({ error: "Invalid YouTube URL. Please paste a YouTube link." });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(503).json({ error: "yt-dlp not available" });
  }

  const cleanUrl = normalizeYouTube(url);

  if (!isValidYouTubeVideo(cleanUrl)) {
    return res.status(400).json({
      error:
        "Invalid YouTube video URL. Use formats like youtube.com/watch?v=ID, youtu.be/ID, or /shorts/ID"
    });
  }

  const filename = safeFileName(title || "youtube_video", ".mp4");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.setHeader("Content-Type", "video/mp4");

  const args = [
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
    cleanUrl
  ];

  /*const args = [
  "--js-runtimes", "deno",
  "-f", "best[height<=720][ext=mp4]/best[ext=mp4]/best",
  "--merge-output-format", "mp4",
  "--recode-video", "mp4",
  "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
  "-o", "-",
  cleanUrl
];
*/

  const child = spawn(YTDLP_PATH, args);
  child.stdout.pipe(res);
  child.stderr.on("data", (d) =>
    console.error("YT download:", d.toString())
  );
  child.on("error", (e) => {
    console.error("YT spawn error:", e);
    if (!res.headersSent) res.status(500).end();
  });
  child.on("close", (code) => {
    if (code !== 0) console.error("YT close code:", code);
    if (!res.headersSent) res.end();
  });
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
    console.log(`✅ InstantSaver backend: http://localhost:${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
