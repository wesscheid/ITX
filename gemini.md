# InstaTranscribe Project Context

## 1. Project Overview
InstaTranscribe is a **Full-Stack** React application that downloads videos from various social media platforms (Instagram, TikTok, YouTube, etc.), extracts the audio, and uses Google Gemini to transcribe and translate the content.

Originally focused on Instagram, the project is currently expanding to support multi-platform downloading (inspired by [Seal](https://github.com/JunkFood02/Seal)) using a robust `yt-dlp` integration.

## 2. Tech Stack & Environment
- **Frontend:** React 19 (Vite), TypeScript, Tailwind CSS v3.
- **Backend:** Node.js, Express.js.
- **Video Processing:** `yt-dlp` (Binary executable managed by the backend).
- **AI Model:** Google Gemini 1.5 Flash (`gemini-1.5-flash`) via `@google/genai` SDK.
- **Deployment:** Render (Web Service running both Frontend static files and Backend API), Vercel (Frontend and Backend API).

## 3. Architecture & Data Flow

### A. The Hybrid Pipeline
1.  **Input:** User provides a video URL (Instagram, TikTok, YouTube, etc.).
2.  **Routing:**
    *   **All Platforms:** URL is sent to Backend (`/api/download` or `/api/transcribe`).
3.  **Resolution (Backend):** 
    *   Backend executes `yt-dlp` to resolve the video URL and metadata.
    *   `yt-dlp` handles cookies, signatures, and anti-bot measures for supported platforms.
    *   For transcription, `yt-dlp` downloads the audio stream (m4a format).
4.  **Download (Backend - Optional):**
    *   Backend can stream the full video data from the platform's CDN to the Frontend response (avoiding CORS).
5.  **Processing (Frontend/Backend):** 
    *   Frontend converts downloaded `Blob` (from user upload or backend download) to `Base64` and sends as `inlineData` to Gemini.
    *   Backend's `/api/transcribe` endpoint fetches audio via `yt-dlp`, then sends the audio buffer to Gemini as `inlineData`.
6.  **Output:** JSON response containing `originalText` and `translatedText`.

### B. Gemini Integration (`services/geminiService.ts`)
-   **Model:** `gemini-1.5-flash`.
-   **Input:** Multimodal (Text Prompt + Inline Media Data - audio/m4a).
-   **Output:** Strict JSON Schema (`application/json`).

## 4. Video Resolution Strategy (`server/server.js`)
The backend uses a local `yt-dlp` binary to handle video resolution and downloading.

### Local Backend Strategy
-   **Endpoint:** `/api/instagram` (Legacy), `/api/download`, `/api/resolve`, `/api/transcribe`.
-   **Tool:** `yt-dlp` (Industry standard video downloader).
-   **Mechanism:**
    1.  Checks if `yt-dlp` binary exists (downloads it on build if missing via `downloadBinaries.js`).
    2.  Runs `yt-dlp --get-url` (or specific flags per platform) to find the direct video link, or downloads audio bytes for transcription.
    3.  Proxies the download to the client or processes audio bytes with Gemini.

### C. Cookie Management
-   **Requirement:** `yt-dlp` requires cookies in **Netscape** format to bypass bot detection on platforms like Instagram and YouTube.
-   **Current State:** Cookies are often provided in JSON format (e.g., from browser extensions).
-   **Solution:** The backend includes a **Node.js utility (`downloadBinaries.js`)** that converts JSON cookies into the Netscape format required by `yt-dlp` at runtime. This ensures flexibility when updating session cookies and handles platform-specific cookie loading (e.g., `YOUTUBE_COOKIES` for YouTube, `IG_COOKIES` for Instagram).

## 5. Deployment Commands

### A. Render Deployment
The application is deployed as a single "Web Service" on Render.
-   **Build Command:** `npm install && node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build && cd server && npm install && VITE_APP_VERSION=$(node -p "require('./package.json').version") node downloadBinaries.js && curl -fsSL https://deno.land/install.sh | sh`
    -   Installs Frontend Deps (`npm install`).
    -   Builds Frontend (`vite build`).
    -   Installs Backend Deps (`cd server && npm install`).
    -   Downloads `yt-dlp` and `ffmpeg` binaries via `downloadBinaries.js`.
    -   Installs Deno runtime for `yt-dlp`.
-   **Start Command:** `npm start`
    -   Runs `node server/server.js`.
    -   Server hosts API at `/api`.
    -   Server hosts Frontend static files at `/`.

### B. Vercel Deployment
The application can also be deployed to Vercel.
-   **Build Command:** `VITE_APP_VERSION=$(node -p "require('./package.json').version") node node_modules/typescript/bin/tsc -b && VITE_APP_VERSION=$(node -p "require('./package.json').version") node node_modules/vite/bin/vite.js build && curl -fsSL https://deno.land/install.sh | sh`
    -   Builds Frontend TypeScript (`tsc -b`).
    -   Builds Frontend (`vite build`).
    -   Injects `VITE_APP_VERSION` from `package.json` for frontend display.
    -   Installs Deno runtime for `yt-dlp`.
-   **Note:** Vercel automatically runs `npm install` in the `server` directory, which triggers the `postinstall` script (`node downloadBinaries.js`) to download `yt-dlp` and `ffmpeg`.

## 6. Key Features
- **Multi-Platform Downloader**: Reliable downloading via `yt-dlp` backend.
- **AI Transcription**: Fast, multimodal transcription using Gemini Flash 2.5 with **enforced readable paragraph formatting**.
- **Cookie Management UI**: Hidden "System Settings" modal (accessible via gear icon in Header) allowing real-time, no-redeploy updates to YouTube, Instagram, and X (Twitter) cookies.
- **Persistent Cookie Storage**: Supports **Firebase Firestore** for persistent cookie storage. If `FIREBASE_SERVICE_ACCOUNT` is provided as an environment variable, cookies updated via the UI are saved to Firestore and survive server restarts/redeployments. If Firebase is not configured, the system falls back to temporary local storage.
- **Share/Keep Integration**: "Share" button using `navigator.share` API.
- **Dark Mode**: System-preference aware Tailwind dark mode.
- **Version Display**: Current application version displayed in the frontend footer.

## 7. File Structure
- `App.tsx`: Main logic controller and state management.
- `server/`:
    - `server.js`: Express backend handling API, Static files, and **Cookie Management API (`POST /api/cookies`)**.
    - `downloadBinaries.js`: Node.js script for downloading `yt-dlp` and `ffmpeg`.
    - `bin/`: Contains `ffmpeg` and `yt-dlp` binaries.
- `services/`:
    - `videoDownloaderService.ts`: Fetches from local/deployed backend.
    - `geminiService.ts`: AI interaction logic with **strictly structured readable prompts**.
- `components/`:
    - `UrlInput.tsx`, `ResultCard.tsx`, `SettingsModal.tsx` (Cookie management), etc.

-   `gemini.md`: Project Context.

## 8. Development Configuration
- **Git User:** `wesscheid <34629619+wesscheid@users.noreply.github.com>`
- **Active Branch:** `feature/multi-platform` (Working on Seal-like integration).
- **Deployment Branches:** 
    - **Render:** Branch `render` (or `main` configured for Render).
    - **Vercel:** Branch `vercel`.

## 9. Deployment Protocol
- **Version Management:** For every deployment to Vercel, the `version` field in the root `package.json` **MUST** be incremented based on semantic versioning principles (e.g., `0.0.1` -> `0.0.2` for bug fixes, `0.1.0` for new features, `1.0.0` for major releases).
- **Versioning for Future Agents:** Future agents are mandated to update the `version` field in `package.json` to a new, incremented version number every time a deployment to Vercel is made for this project. This helps users identify if they are working with the latest deployed version.
- ** Vercel CLI is available for testing, configuration or deployment needs.

## 10. Environment Management & Binary Handling

### A. The "Vercel-First" Mandate
- **Deployment Platform:** The primary production environment is **Vercel** (and Render).
- **Architecture:** Vercel operates on **AWS Lambda (Linux)**.
- **Critical Constraint:** Vercel functions have a **read-only filesystem** (except `/tmp`), a **10MB response size limit**, and a **10MB request size limit**.
- **Agent Instruction:** NEVER assume changes made for local development (macOS/Windows) will work on Vercel. Always verify cross-platform compatibility.

### B. Cross-Platform Binaries
- **Development:** Often performed on macOS (Darwin).
- **Production:** Runs on Linux (ELF).
- **Strategy:** `downloadBinaries.js` MUST detect the OS and download the appropriate versions. `server.js` MUST handle binaries in a location that is executable on Vercel (e.g., copying from `server/bin` to `/tmp` and adding `/tmp` to `process.env.PATH`).

### C. Local vs. Production Env
- **Local:** Uses `.env.local` for development secrets (Gemini API keys, etc.).
- **Production:** Uses platform environment variables.
- **Agent Instruction:** Always check for both `.env` and `.env.local` when investigating local issues, but ensure the code is robust enough to use platform variables in production.