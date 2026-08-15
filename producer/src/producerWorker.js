const fs = require("fs");
const path = require("path");
const grpc = require("@grpc/grpc-js");

const { client, checkUploadCapacity } = require("./grpcClient");
const { calculateFileHash } = require("./hash");

const CHUNK_SIZE = 256 * 1024; // 256 KB

async function writeChunk(call, chunk){
    const canContinue = call.write(chunk);
    if(canContinue) {
        return;
    }

    await new Promise((resolve, reject) => {
        const onDrain = () => {
            cleanup();
            resolve();
        };

        const onError = (error) => {
            cleanup();
            reject(error);
        };

        function cleanup() {
            call.removeListener("drain", onDrain);
            call.removeListener("error", onError);
        }

        call.once("drain", onDrain);
        call.once("error", onError);
    });
}

async function uploadVideo(filePath, filename, uploadId) {
    return new Promise((resolve, reject) => {
        let finished = false;

        const metadata = new grpc.Metadata();

        const call = client.UploadVideo(
            metadata,
            {},
            (error, response) => {
                if (finished) {
                    return;
                }

                finished = true;

                if (error) {
                    reject(error);
                    return;
                }

                resolve(response);
            }
        );

        const fileStream = fs.createReadStream(filePath, {
            highWaterMark: CHUNK_SIZE
        });

        const fail = (error) => {
            if (finished) {
                return;
            }

            finished = true;

            fileStream.destroy();

            if (!call.destroyed) {
                call.destroy(error);
            }

            reject(error);
        };

        call.on("error", fail);
        fileStream.on("error", fail);

        (async () => {
            try {
                let chunkIndex = 0;

                for await (const chunk of fileStream) {
                    await writeChunk(call, {
                        upload_id: uploadId,
                        filename: filename,
                        chunk_number: chunkIndex,
                        data: chunk,
                        is_last: false
                    });

                    chunkIndex++;
                }

                await writeChunk(call, {
                    upload_id: uploadId,
                    filename: filename,
                    chunk_number: chunkIndex,
                    data: Buffer.alloc(0),
                    is_last: true
                });

                call.end();

            } catch (error) {
                fail(error);
            }
        })();
    });
}


async function processVideo(producerId, filePath) {
    const filename = path.basename(filePath);

    const stats = await fs.promises.stat(filePath);

    console.log(`Producer ${producerId}: Hashing ${filename}...`);

    const fileHash = await calculateFileHash(filePath);

    console.log(`Producer ${producerId}: Hash for ${filename}: ${fileHash}`);

    const permission = await checkUploadCapacity({filename, file_size: String(stats.size), file_hash: fileHash });

    if((!permission || !permission.allowed)) {
        console.log(`Producer ${producerId}: Upload rejected for ${filename}. Status: ${permission?.status || "UNKNOWN"}. Reason: ${permission?.message || "No response from server"}.`);

        return;
    }

    const uploadId = permission.upload_id;

    if (!uploadId) {
        throw new Error(`Consumer accepted ${filename} but did not provide an upload ID.`);
    }

    console.log(`Produer ${producerId}: Upload authorized for ${filename}. Upload ID: ${uploadId}.`);

    const response = await uploadVideo(filePath, filename, uploadId);

    console.log(`Producer ${producerId}: Upload response for ${filename}: ${response.message}.`);

    console.log(`Producer ${producerId}: Upload status: ${response.status}.`);
}

async function producerWorker(producerId, folderPath) {
    console.log(`Producer ${producerId}: Watching folder ${folderPath} for new video files...`);

    const files = await fs.promises.readdir(folderPath);

    const videoFiles = files.filter(file => {
        const extension = path.extname(file).toLowerCase();

        return [".mp4", ".avi", ".mov", ".mkv", ".webm"].includes(extension);
    });

    console.log(
        `Producer ${producerId}: ` +
        `Found ${videoFiles.length} ` +
        `video files.`
    );

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