# InstaTranscribe Project Context

## 1. Project Overview
InstaTranscribe is a **Full-Stack** React application that downloads Instagram videos (Reels, Posts, Stories), extracts the audio, and uses Google Gemini to transcribe and translate the content. 

Originally a client-side only app, it has evolved into a hybrid architecture to reliably bypass Instagram's anti-scraping measures using a dedicated backend.

## 2. Tech Stack & Environment
- **Frontend:** React 19 (Vite), TypeScript, Tailwind CSS v3.
- **Backend:** Node.js, Express.js.
- **Video Processing:** `yt-dlp` (Binary executable managed by the backend).
- **AI Model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `@google/genai` SDK.
- **Deployment:** Render (Web Service running both Frontend static files and Backend API).

## 3. Architecture & Data Flow

### A. The Hybrid Pipeline
1.  **Input:** User provides an Instagram URL.
2.  **Request:** Frontend sends URL to Backend (`/api/instagram`).
3.  **Resolution (Backend):** 
    *   Backend executes `yt-dlp` to resolve the video URL and metadata.
    *   `yt-dlp` handles cookies, signatures, and anti-bot measures.
4.  **Download (Backend):**
    *   Backend streams the video data from Instagram's CDN.
    *   Pipes the stream to the Frontend response (avoiding CORS).
5.  **Processing (Frontend):** 
    *   Frontend receives the video `Blob`.
    *   Converts `Blob` to `Base64`.
    *   Sends to Google Gemini API for transcription/translation.
6.  **Output:** JSON response containing `originalText` and `translatedText`.

### B. Gemini Integration (`services/geminiService.ts`)
-   **Model:** `gemini-2.5-flash`.
-   **Input:** Multimodal (Text Prompt + Inline Media Data).
-   **Output:** Strict JSON Schema (`application/json`).

## 4. Video Resolution Strategy (`server/server.js`)
The "Cobalt" and "Proxy" strategies have been replaced by a robust local backend.

### Local Backend Strategy
-   **Endpoint:** `/api/instagram` (Proxied to `localhost:10000` in dev).
-   **Tool:** `yt-dlp` (Industry standard video downloader).
-   **Mechanism:**
    1.  Checks if `yt-dlp` binary exists (downloads it on build if missing).
    2.  Runs `yt-dlp --get-url` to find the direct video link.
    3.  Proxies the download to the client to bypass CORS.

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
-   **Instagram Downloader:** Reliable downloading via `yt-dlp` backend.
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
- **Deployment:** 
    - **Render:** Branch `render` (or `main` configured for Render).
    - **Vercel:** Branch `vercel`.
