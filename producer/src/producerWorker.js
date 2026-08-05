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