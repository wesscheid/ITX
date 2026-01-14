import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Generate version based on git commit count + timestamp for unique build ID
    let appVersion = process.env.npm_package_version;
    const now = new Date();
    // Format: Jan 13, 10:30 PM
    const buildTime = now.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    let commitIdentifier = 'Dev';
    try {
      // Try git count first
      commitIdentifier = execSync('git rev-list --count HEAD').toString().trim();
    } catch (e) {
      // Fallback: Check for Vercel SHA or just use 'Dev'
      if (process.env.VERCEL_GIT_COMMIT_SHA) {
        commitIdentifier = process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7);
      } else {
        console.warn('Could not get git info, using default identifier');
      }
    }
    
    // Construct final version: v1.{count/sha} ({Time})
    appVersion = `v1.${commitIdentifier} (${buildTime})`;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:10000',
            changeOrigin: true,
            secure: false,
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_API_KEY),
        'process.env.APP_VERSION': JSON.stringify(appVersion)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
