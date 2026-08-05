const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { client, checkUploadCapacity } = require("./grpcClient");
const { calculateFileHash } = require("./hash");

const CHUNK_SIZE = 256 * 1024; // 256 KB

async function uploadVideo(filePath, uploadId) {
    const uploadId = crypto.randomUUID();

    return new Promise(async (resolve, reject) => {
        const call = client.UploadVideo((error, response) => {
            if(error) {
                reject(error);
                return;
            }

            resolve(response);
        });

        const fileStream = fs.createReadStream(filePath, {highWaterMark: CHUNK_SIZE});

        let chunkIndex = 0;s

        fileStream.on("data", (chunk) => {
            call.write({
                upload_id: uploadId,
                filename: filename,
                chunk_number: chunkIndex,
                data: chunk,
                is_last: false
            });

            chunkIndex++;
        });

        fileStream.on("end", () => {
            call.write({
                upload_id: uploadId,
                filename: filename,
                chunk_number: chunkIndex,
                data: Buffer.alloc(0),
                is_last: true
            });

            call.end();
        });

        fileStream.on("error", (error) => {
            call.destroy(error);
            reject(error);
        })
    });
}

async function writeChunk(call, chunk){
    const canContinue = call.write(chunk);
    if(canContinue) {
        return;
    }

    await new Promise((resolve) => {
        call.once("drain", resolve);
    })
}

async function processVideo(producerId, filePath) {
    const filename = path.basename(filePath);

    const stats = await fs.promises.stat(filePath);

    console.log(`Producer ${producerId}: Hashing ${filename}...`);

    const fileHash = await calculateFileHash(filePath);

    console.log(`Producer ${producerId}: Hash for ${filename}: ${fileHash}`);

    const permission = await checkUploadCapacity({filename, file_size: stats.size, file_hash: fileHash });

    if((!permission || !permission.accepted)) {
        console.log(`Producer ${producerId}: Upload rejected for ${filename}. Reason: ${permission ? permission.message : "No response from server"}`);

        return;
    }

    const response = await uploadVideo(filePath, filename);

    console.log(`Producer ${producerId}: Upload response for ${filename}: ${response.message}`);
}

async function producerWorker(producerId, folderPath) {
    console.log(`Producer ${producerId}: Watching folder ${folderPath} for new video files...`);

    const files = await fs.promises.readdir(folderPath);

    const videoFiles = files.filter(file => {
        const extension = path.extname(file).toLowerCase();

        return [".mp4", ".avi", ".mov", ".mkv"].includes(extension);
    });

    for (const file of videoFiles) {
        const filePath = path.join(folderPath, file);
        try {
            await processVideo(producerId, filePath);
        } catch (error) {
            console.error(`Producer ${producerId}: Error processing ${file}:`, error);
        }
    }

    console.log(`Producer ${producerId}: Finished processing all video files in ${folderPath}.`);
} 

module.exports = { producerWorker };