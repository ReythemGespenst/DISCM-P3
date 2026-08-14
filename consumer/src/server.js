const express = require("express");
const path = require("path");
const fs = require("fs/promises");

const app = express();

const PORT = Number(process.env.HTTP_PORT || 3000);

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const PREVIEW_DIR = path.join(__dirname, "../previews");

const VIDEO_EXTENSIONS = [".mp4", ".avi", ".mov", ".mkv", ".webm"];

app.use(express.json());

app.use("/videos", express.static(UPLOAD_DIR));

app.use("/previews", express.static(PREVIEW_DIR));

app.get("/api/videos", async (req, res) => {
    try {
        const files = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
        const videos = files
            .filter(file => file.isFile())
            .filter(file => {
                const extension = path.extname(file.name).toLowerCase();
                return VIDEO_EXTENSIONS.includes(extension);
            })
            .map(file => {
                const parsed = path.parse(file.name);

                const previewFilename = `${parsed.name}_preview.mp4`;

                return {
                    filename: file.name,
                    videoUrl: `/videos/${encodeURIComponent(file.name)}`,
                    previewUrl: `/previews/${encodeURIComponent(previewFilename)}`
                };
            });

        res.json(videos);
    } catch (error) {
        console.error("Failed to get videos: ", error);
        res.status(500).json({ error: "Failed to get videos" });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ status: "OK" });
});

async function startWebServer() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(PREVIEW_DIR, { recursive: true });

    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Web server running on PORT ${PORT}`);
            resolve(server);
        });

        server.on("error", reject);
    });
}

module.exports = {
    startWebServer
};