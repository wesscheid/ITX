# InstaTranscribe Project Context

## 1. Project Overview
InstaTranscribe is a **Full-Stack** React application that downloads videos from various social media platforms (Instagram, TikTok, YouTube, etc.), extracts the audio, and uses Google Gemini to transcribe and translate the content.

Originally focused on Instagram, the project is currently expanding to support multi-platform downloading (inspired by [Seal](https://github.com/JunkFood02/Seal)) using a robust `yt-dlp` integration.

## 2. Tech Stack & Environment
- **Frontend:** React 19 (Vite), TypeScript, Tailwind CSS v3.
- **Backend:** Node.js, Express.js.
- **Video Processing:** `yt-dlp` (Binary executable managed by the backend).
- **AI Model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `@google/genai` SDK.
- **Deployment:** Render (Web Service running both Frontend static files and Backend API).

## 3. Architecture & Data Flow

### A. The Hybrid Pipeline
1.  **Input:** User provides a video URL (Instagram, TikTok, YouTube, etc.).
2.  **Routing:**
    *   **YouTube:** URL is sent *directly* to Gemini API (supported feature) to save bandwidth/time.
    *   **Others (IG/TikTok):** URL is sent to Backend (`/api/download`).
3.  **Resolution (Backend - Non-YouTube):** 
    *   Backend executes `yt-dlp` to resolve the video URL and metadata.
    *   `yt-dlp` handles cookies, signatures, and anti-bot measures for supported platforms.
4.  **Download (Backend - Non-YouTube):**
    *   Backend streams the video data from the platform's CDN.
    *   Pipes the stream to the Frontend response (avoiding CORS).
5.  **Processing (Frontend):** 
    *   **YouTube:** Sends URL directly in prompt.
    *   **Others:** Converts downloaded `Blob` to `Base64` and sends as `inlineData`.
6.  **Output:** JSON response containing `originalText` and `translatedText`.

### B. Gemini Integration (`services/geminiService.ts`)
-   **Model:** `gemini-2.5-flash`.
-   **Input:** Multimodal (Text Prompt + Inline Media Data).
-   **Output:** Strict JSON Schema (`application/json`).

## 4. Video Resolution Strategy (`server/server.js`)
The backend uses a local `yt-dlp` binary to handle video resolution and downloading.

### Local Backend Strategy
-   **Endpoint:** `/api/instagram` (Legacy), migrating to `/api/download`.
-   **Tool:** `yt-dlp` (Industry standard video downloader).
-   **Mechanism:**
    1.  Checks if `yt-dlp` binary exists (downloads it on build if missing).
    2.  Runs `yt-dlp --get-url` (or specific flags per platform) to find the direct video link.
    3.  Proxies the download to the client.

### C. Cookie Management
-   **Requirement:** `yt-dlp` requires cookies in **Netscape** format to bypass bot detection on platforms like Instagram and YouTube.
-   **Current State:** Cookies are often provided in JSON format (e.g., from browser extensions).
-   **Solution:** The backend includes a conversion utility to automatically transform JSON cookies into the Netscape format required by `yt-dlp` at runtime. This ensures flexibility when updating session cookies.

## 5. Deployment (Render)
The application is deployed as a single "Web Service" on Render.
-   **Build Command:** `npm run render-build`
    -   Installs Frontend Deps (`npm install`).
    -   Builds Frontend (`vite build`).
    -   Installs Backend Deps (`cd server && npm install`).
    -   Downloads `yt-dlp` binary (`./download-ytdlp.sh`).
-   **Start Command:** `npm start`
    -   Runs `node server/server.js`.
    -   Server hosts API at `/api`.
    -   Server hosts Frontend static files at `/`.

## 6. Key Features
-   **Multi-Platform Downloader:** Reliable downloading via `yt-dlp` backend (expanding beyond Instagram).
-   **AI Transcription:** Fast, multimodal transcription using Gemini Flash 2.5.
-   **Share/Keep Integration:** "Share" button using `navigator.share` API for mobile integration with Google Keep/Notes.
-   **Dark Mode:** System-preference aware Tailwind dark mode.

## 7. File Structure
-   `App.tsx`: Main logic controller.
-   `server/`:
    -   `server.js`: Express backend handling API and Static files.
    -   `bin/`: Contains `yt-dlp` binary.
-   `services/`:
    -   `videoDownloaderService.ts`: Fetches from local/deployed backend.
    -   `geminiService.ts`: AI interaction logic.
-   `components/`:
    -   `UrlInput.tsx`, `ResultCard.tsx`, etc.
-   `gemini.md`: Project Context.

## 8. Development Configuration
- **Git User:** `wesscheid <34629619+wesscheid@users.noreply.github.com>`
- **Active Branch:** `feature/multi-platform` (Working on Seal-like integration).
- **Deployment:** 
    - **Render:** Branch `render` (or `main` configured for Render).
    - **Vercel:** Branch `vercel`.