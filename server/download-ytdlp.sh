#!/usr/bin/env bash
set -e

# Create bin directory
mkdir -p bin

# 1. Download yt-dlp
echo "🔄 Downloading yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o bin/yt-dlp || \
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp
echo "✅ yt-dlp installed."

# 2. Download FFmpeg (Static Build)
if [ ! -f "bin/ffmpeg" ]; then
    echo "🔄 Downloading FFmpeg (Static)..."
    # Use a reliable source for static builds (johnvansickle is standard for this)
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o bin/ffmpeg.tar.xz
    
    echo "📦 Extracting FFmpeg..."
    # Extract only the ffmpeg binary to the bin folder, strip the directory structure
    tar -xJf bin/ffmpeg.tar.xz -C bin --strip-components=1 --wildcards "*/ffmpeg"
    
    # Cleanup
    rm bin/ffmpeg.tar.xz
    chmod +x bin/ffmpeg
    echo "✅ FFmpeg installed."
else
    echo "✅ FFmpeg already exists."
fi

echo "🚀 Binaries ready at ./bin/"
./bin/yt-dlp --version
./bin/ffmpeg -version | head -n 1
