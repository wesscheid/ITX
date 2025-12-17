# InstaTranscribe Project Context

## 1. Project Overview
InstaTranscribe is a client-side React application that downloads Instagram videos (Reels, Posts, Stories), extracts the audio in-memory, and uses Google Gemini to transcribe and translate the content. It solves the specific challenge of "locking-in" translation capabilities for social media content without requiring server-side storage.

## 2. Tech Stack & Environment
- **Framework:** React 19 (via ESM Imports, no build step required).
- **Styling:** Tailwind CSS (via CDN) with Dark Mode support.
- **AI Model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `@google/genai` SDK.
- **Runtime:** Browser-native ES Modules (no Webpack/Vite bundler configuration in source).
- **Environment Variables:** `process.env.API_KEY` is injected by the runner.

## 3. Architecture & Data Flow

### A. The In-Memory Pipeline
To ensure privacy and speed, the app avoids saving files to the user's device unless necessary.
1.  **Input:** User provides an Instagram URL.
2.  **Sanitization:** URL query parameters (tracking ids) are stripped.
3.  **Resolution:** The app resolves the "display URL" to a "direct media URL" (CDN link) using a Dual-Resolver Strategy (see Section 4).
4.  **Fetching:** The app fetches the binary data (Blob) using CORS proxies.
5.  **AI Processing:** The Blob is converted to Base64 and sent directly to Gemini with a prompt to transcribe and translate.
6.  **Output:** JSON response containing `originalText` and `translatedText`.

### B. Gemini Integration (`services/geminiService.ts`)
-   **Model:** `gemini-2.5-flash` (Optimized for speed/multimodal).
-   **Input:** Multimodal (Text Prompt + Inline Media Data).
-   **Output:** Strict JSON Schema (`application/json`).
    -   `originalText`: Verbatim transcription.
    -   `translatedText`: Translation into target language.

## 4. Video Resolution Strategy (`services/videoDownloaderService.ts`)
This is the most complex part of the application due to Instagram's aggressive anti-scraping and CORS policies.

### Primary: Cobalt API
-   **Endpoint:** `api.cobalt.tools`
-   **Logic:**
    1.  Clean URL.
    2.  Try **Direct Connection** (Audio Mode).
    3.  Try **Direct Connection** (Video Mode fallback).
    4.  Try **Proxy Connection** (If blocked by geo/IP).
    5.  Handles `HTTP 400` errors gracefully by attempting fallbacks.

### Secondary: Alternative API (MilanCodes)
-   **Trigger:** Executed immediately if Cobalt fails.
-   **Logic:**
    -   Rotates through multiple Vercel instances (`tau`, `five`, main).
    -   Rotates through multiple paths (`/download`, `/api/download`, `/`).
    -   Validates responses to ensure they are JSON and not 404 HTML pages.

### Tertiary: CORS Proxies
Once a direct media URL is found (e.g., `cdn.instagram.com/...`), it cannot be fetched directly by the browser due to CORS. We route the download through:
1.  `corsproxy.io` (Primary)
2.  `api.allorigins.win` (Secondary)
3.  `thingproxy.freeboard.io` (Tertiary)

## 5. Error Handling & UX
The `App.tsx` handles specific error strings thrown by the service layer:
-   **`MANUAL_DOWNLOAD_REQUIRED|{url}`**: The resolvers found a link, but the browser/proxies could not download the binary data (likely due to strict CORS or AdBlockers). The UI presents a button for the user to download the file manually.
-   **`RESOLVER_CONNECTION_ERROR`**: Both Cobalt and Alternative APIs failed. The UI suggests using a third-party tool (SnapInsta, SaveIG).

## 6. Coding Standards & Rules
1.  **Imports:** Use `importmap` in `index.html`. Do not add npm packages that require bundling.
2.  **State Management:** Keep it simple with React `useState`.
3.  **Components:** Functional components with TypeScript interfaces.
4.  **Accessibility:** Use semantic HTML and ARIA labels where appropriate.
5.  **Type Safety:** Strict TypeScript interfaces for all API responses and Props.

## 7. File Structure
-   `index.html`: Entry point, importmap, Tailwind setup.
-   `App.tsx`: Main logic controller.
-   `services/`:
    -   `videoDownloaderService.ts`: Resolution and fetching logic.
    -   `geminiService.ts`: AI interaction logic.
-   `components/`:
    -   `UrlInput.tsx`: Form for URL entry.
    -   `FileUpload.tsx`: Drag-and-drop zone.
    -   `ResultCard.tsx`: Displays translation and download options.
    -   `ProcessingState.tsx`: Loading spinners and status text.
