
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
}

const isVercel = !!process.env.VERCEL;

const downloadYtdlp = async () => {
    let ytdlpUrl;
    let ytdlpPath = path.join(binDir, 'yt-dlp');

    console.log("🔄 Downloading yt-dlp binary...");

    // On Vercel, we ONLY need Linux binaries
    if (isVercel) {
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
        console.log(`🚀 Vercel detected: Downloading Linux binary from ${ytdlpUrl}`);
    } else if (os.platform() === 'win32') {
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
        ytdlpPath = path.join(binDir, 'yt-dlp.exe');
        console.log(`Downloading for Windows from ${ytdlpUrl}`);
    } else if (os.platform() === 'darwin') {
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
        console.log(`Downloading for macOS from ${ytdlpUrl}`);
    } else {
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
        console.log(`Downloading for Linux from ${ytdlpUrl}`);
    }

    const command = os.platform() === 'win32' && !isVercel ? 'powershell.exe' : 'curl';
    const args = os.platform() === 'win32' && !isVercel 
        ? ['-NoProfile', '-Command', `Invoke-WebRequest -Uri "${ytdlpUrl}" -OutFile "${ytdlpPath}"`]
        : ['-fL', '--retry', '3', ytdlpUrl, '-o', ytdlpPath];

    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) {
                if (os.platform() !== 'win32' || isVercel) fs.chmodSync(ytdlpPath, '755');
                resolve();
            } else {
                reject(new Error(`${command} failed with code ${code}`));
            }
        });
    });

    console.log("✅ yt-dlp downloaded.");
};

const downloadFfmpeg = async () => {
    const ffmpegPath = path.join(binDir, 'ffmpeg');
    // On Vercel, always redownload to ensure correct architecture (Linux)
    if (!isVercel && fs.existsSync(ffmpegPath)) {
        console.log("✅ FFmpeg already exists.");
        return;
    }

    console.log("🔄 Downloading FFmpeg (Static)...");
    let ffmpegUrl;
    let ffmpegTempPath;

    if (isVercel) {
        ffmpegUrl = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
        ffmpegTempPath = path.join(binDir, 'ffmpeg.tar.xz');
        console.log(`🚀 Vercel detected: Downloading Linux FFmpeg from ${ffmpegUrl}`);
    } else if (os.platform() === 'darwin') {
        ffmpegUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip';
        ffmpegTempPath = path.join(binDir, 'ffmpeg.zip');
    } else {
        ffmpegUrl = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
        ffmpegTempPath = path.join(binDir, 'ffmpeg.tar.xz');
    }

    const downloadCommand = (os.platform() === 'win32' && !isVercel) ? 'powershell.exe' : 'curl';
    const downloadArgs = (os.platform() === 'win32' && !isVercel)
        ? ['-NoProfile', '-Command', `Invoke-WebRequest -Uri "${ffmpegUrl}" -OutFile "${ffmpegTempPath}"`]
        : ['-fL', '--retry', '3', ffmpegUrl, '-o', ffmpegTempPath];

    await new Promise((resolve, reject) => {
        const child = spawn(downloadCommand, downloadArgs, { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Download failed with code ${code}`));
        });
    });

    console.log(`📦 Extracting FFmpeg...`);
    
    if (ffmpegTempPath.endsWith('.zip')) {
        await new Promise((resolve, reject) => {
            const child = spawn('unzip', ['-o', ffmpegTempPath, '-d', binDir], { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    fs.chmodSync(ffmpegPath, '755');
                    resolve();
                } else {
                    reject(new Error(`unzip failed with code ${code}`));
                }
            });
        });
    } else {
        // Linux extraction (tar.xz)
        const tarArgs = ['-xJf', ffmpegTempPath, '-C', binDir, '--strip-components=1', '--wildcards', '*/ffmpeg'];
        await new Promise((resolve, reject) => {
            const child = spawn('tar', tarArgs, { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    fs.chmodSync(ffmpegPath, '755');
                    resolve();
                } else {
                    reject(new Error(`tar extraction failed with code ${code}`));
                }
            });
        });
    }

    if (fs.existsSync(ffmpegTempPath)) fs.unlinkSync(ffmpegTempPath);
    console.log("✅ FFmpeg installed.");
};

(async () => {
    try {
        // Clear bin dir on Vercel to ensure no architecture mix-up
        if (isVercel && fs.existsSync(binDir)) {
            console.log("🧹 Vercel: Clearing existing binaries...");
            fs.readdirSync(binDir).forEach(file => {
                const curPath = path.join(binDir, file);
                if (!fs.lstatSync(curPath).isDirectory()) fs.unlinkSync(curPath);
            });
        }
        await downloadYtdlp();
        await downloadFfmpeg();
        console.log("🚀 Binaries ready!");
    } catch (error) {
        console.error("❌ Failed to download binaries:", error.message);
        process.exit(1);
    }
})();
