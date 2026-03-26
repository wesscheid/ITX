
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
}

const downloadYtdlp = async () => {
    let ytdlpUrl;
    let ytdlpPath;

    console.log("🔄 Downloading yt-dlp binary...");

    if (os.platform() === 'win32') {
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
        ytdlpPath = path.join(binDir, 'yt-dlp.exe');
        console.log(`Downloading for Windows from ${ytdlpUrl}`);
        // Use Invoke-WebRequest for Windows
        const command = 'powershell.exe';
        const args = [
            '-NoProfile',
            '-Command',
            `Invoke-WebRequest -Uri "${ytdlpUrl}" -OutFile "${ytdlpPath}"`
        ];
        await new Promise((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Invoke-WebRequest failed with code ${code}`));
                }
            });
        });
    } else {
        // Use yt-dlp_linux (PyInstaller bundle) as it is standalone and doesn't require system Python
        ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
        ytdlpPath = path.join(binDir, 'yt-dlp');
        console.log(`Downloading for Linux (Standalone) from ${ytdlpUrl}`);
        // Use curl for Linux/macOS
        const command = 'curl';
        const args = ['-L', ytdlpUrl, '-o', ytdlpPath];
        await new Promise((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    fs.chmodSync(ytdlpPath, '755'); // Make executable
                    resolve();
                } else {
                    reject(new Error(`curl failed with code ${code}`));
                }
            });
        });
    }

    console.log("✅ yt-dlp downloaded.");

    // Verify version and attempt self-update if possible
    try {
        const verifyOutput = require('child_process').execSync(`"${ytdlpPath}" --version`).toString().trim();
        console.log(`🚀 yt-dlp version installed: ${verifyOutput}`);
        
        // Try self-update as a secondary measure (might fail on some environments, but that's okay)
        console.log("🔄 Attempting yt-dlp self-update to be absolutely sure...");
        try {
            require('child_process').execSync(`"${ytdlpPath}" -U`);
            const finalVersion = require('child_process').execSync(`"${ytdlpPath}" --version`).toString().trim();
            console.log(`✅ yt-dlp is now at version: ${finalVersion}`);
        } catch (updateErr) {
            console.log("⚠️ Self-update skipped or failed (common in CI/restricted environments). Proceeding with downloaded binary.");
        }
    } catch (e) {
        console.error("❌ Failed to verify yt-dlp version:", e.message);
    }
};

const downloadFfmpeg = async () => {
    const ffmpegPath = path.join(binDir, 'ffmpeg');
    if (fs.existsSync(ffmpegPath)) {
        console.log("✅ FFmpeg already exists.");
        return;
    }

    console.log("🔄 Downloading FFmpeg (Static)...");
    const ffmpegTarUrl = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
    const ffmpegTarPath = path.join(binDir, 'ffmpeg.tar.xz');

    // Download FFmpeg tar.xz
    if (os.platform() === 'win32') {
        const command = 'powershell.exe';
        const args = [
            '-NoProfile',
            '-Command',
            `Invoke-WebRequest -Uri "${ffmpegTarUrl}" -OutFile "${ffmpegTarPath}"`
        ];
        await new Promise((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Invoke-WebRequest for FFmpeg failed with code ${code}`));
                }
            });
        });
    } else {
        const command = 'curl';
        const args = ['-L', ffmpegTarUrl, '-o', ffmpegTarPath];
        await new Promise((resolve, reject) => {
            const child = spawn(command, args, { stdio: 'inherit' });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`curl for FFmpeg failed with code ${code}`));
                }
            });
        });
    }

    console.log("📦 Extracting FFmpeg...");
    // Extraction with tar -xJf ...
    // Note: Node.js's built-in zlib and tar modules can be complex for .tar.xz
    // Using child_process to call system tar command
    const tarCommand = 'tar';
    const tarArgs = ['-xJf', ffmpegTarPath, '-C', binDir, '--strip-components=1', '--wildcards', '*/ffmpeg'];

    await new Promise((resolve, reject) => {
        const child = spawn(tarCommand, tarArgs, { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) {
                fs.chmodSync(ffmpegPath, '755'); // Make executable
                resolve();
            } else {
                reject(new Error(`tar extraction failed with code ${code}`));
            }
        });
    });

    // Cleanup
    fs.unlinkSync(ffmpegTarPath);
    console.log("✅ FFmpeg installed.");

    // Verify FFmpeg version
    const verifyCommand = ffmpegPath;
    const verifyArgs = ['-version'];
    console.log(`Verifying FFmpeg version with: ${verifyCommand} ${verifyArgs.join(' ')}`);
    await new Promise((resolve, reject) => {
        const child = spawn(verifyCommand, verifyArgs, { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg -version failed with code ${code}`));
            }
        });
    });
};

(async () => {
    try {
        await downloadYtdlp();
        // await downloadFfmpeg();
        console.log("🚀 Binaries ready!");
    } catch (error) {
        console.error("❌ Failed to download binaries:", error.message);
        process.exit(1);
    }
})();
