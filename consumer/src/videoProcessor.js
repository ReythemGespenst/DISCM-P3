const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const PREVIEW_DIR = path.join(__dirname, "../previews");

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm"];

function isVideoFile(filename) {
    const extension = path.extname(filename).toLowerCase();

    return VIDEO_EXTENSIONS.includes(extension);
}

function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        console.log(`[FFmpeg] Starting: ffmpeg ${args.join(" ")}`);

        const ffmpeg = spawn("ffmpeg", args);

        let stderr = "";

        ffmpeg.stderr.on("data", data => {
            stderr += data.toString();
        });

        ffmpeg.on("error", error => {
            reject(error);
        });

        ffmpeg.on("close", code => {
            if (code === 0) {
                resolve();
            } else {
                reject (new Error(`FFmpeg exited with code ${code}\n` + stderr));
            }
        });
    });
}

async function compressVideo(inputPath, outputPath) {
    console.log(`[Video Processor] Compressing` + `${inputPath}`);
    await runFFmpeg(["-y", "-i", inputPath, "-c:v", "libx264", "-crf", "28", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", outputPath]);
    console.log(`[Video Processor] Compression complete: ${outputPath}`);
}

async function generatePreview(inputPath, previewPath){
    console.log(`[Video Processor] Generating 10 second preview`);
    await runFFmpeg(["-y", "-i", inputPath, "-t", "10", "-vf", "scale=640:-2", "-c:v", "libx264", "-crf", "30", "-an", "-movflags", "+faststart", previewPath]);
    console.log(`[Video Processor] Preview created: ${previewPath}`);
}

async function processVideo(item){
    const { uploadId, filename, filePath, fileHash} = item;

    console.log(`[Video Processor] Processing ${filename}`);

    if(!isVideoFile(filename)){
        throw new Error(`Unsupported video format ${filename}`);
    }

    const safeFilename = path.basename(filename);
    const parsed = path.parse(safeFilename);

    const finalFilename = `${parsed.name}.mp4`;
    const finalPath = path.join(UPLOAD_DIR, finalFilename);

    const previewFilename = `${parsed.name}_preview.mp4`;  
    const previewPath = path.join(PREVIEW_DIR, previewFilename);

    try {
        await compressVideo(filePath, finalPath);
        await generatePreview(finalPath, previewPath);
    } catch (error) {
        await fs.unlink(finalPath).catch(() => {});
        await fs.unlink(previewPath).catch(() => {});

        throw error;
    }

    const stats = await fs.stat(finalPath);

    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error(`[Video Processor] Could not remove temporary file ${filePath}`, error);
        }
    }

    console.log(`[Video Processor] Finished ${filename}`);

    return { uploadId, filename: finalFilename, filePath: finalPath, previewPath, fileHash, fileSize: stats.size};
}

module.exports = { processVideo, compressVideo, generatePreview};