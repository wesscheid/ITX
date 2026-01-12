#!/usr/bin/env bash
set -e

echo "🔄 Downloading yt-dlp binary..."
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o bin/yt-dlp || \
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp
echo "✅ yt-dlp ready at ./bin/yt-dlp"
./bin/yt-dlp --version
