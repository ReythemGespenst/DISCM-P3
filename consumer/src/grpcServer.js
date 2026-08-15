const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const fs = require('fs');
const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');

const { getQueue } = require("./queue");

const PROTO_PATH = path.join(__dirname, '../../proto/upload.proto');

const TEMP_DIR = path.join(__dirname, "../storage/temp");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const proto = grpc.loadPackageDefinition(packageDefinition);

const uploadService = proto.uploadservice.UploadService;

const uploadRegistry = new Map();

const knownHashes = new Set();

const pendingHashes = new Set();

function checkUploadCapacity(call, callback){
    try {
        const request = call.request;

        const filename = request.filename;
        const fileSize = Number(request.file_size);
        const fileHash = request.file_hash;
        const uploadId = crypto.randomUUID();

        if(!filename) {
            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_INVALID_FILE",
                message: "Filename is required."
            });

            return;
        }

        if(!fileHash) {
            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_INVALID_FILE",
                message: "File hash is required."
            });

            return;
        }

        if(!Number.isFinite(fileSize) || fileSize <= 0) {
            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_INVALID_FILE",
                message: "Invalid file size."
            });

            return;
        }

        if(knownHashes.has(fileHash) || pendingHashes.has(fileHash)) {
            console.log(`[gRPC] Duplicate detected: ${filename}`);

            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_DUPLICATE",
                message: "Video already exists."
            });

            return;
        }

        if(getQueue().isFull()) {
            console.log(`[gRPC] Queue full. Rejecting ${filename}`);

            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_QUEUE_FULL",
                message: "Queue is full. Video rejected."
            });

            return;
        }

        pendingHashes.add(fileHash);

        uploadRegistry.set(uploadId, {
            filename,
            fileSize,
            fileHash,
            createdAt: Date.now()
        });

        console.log(`[gRPC] Upload authorized: ${filename} (uploadId=${uploadId})`);

        callback(null, {
            allowed: true,
            status: "UPLOAD_STATUS_ACCEPTED",
            message: "Upload accepted.",
            upload_id: uploadId
        });

    } catch (error) {
        console.error("[gRPC] Capacity check failed: ", error);

        callback(null, {
            allowed: false,
            status: "UPLOAD_STATUS_UPLOAD_ERROR",
            message: "Failed to check upload capacity."
        });
    }
}

function uploadVideo(call, callback){
    let uploadId, filename, fileHash, filePath, writeStream = null;
    let expectedFileSize = 0;
    let fileSize = 0;
    let expectedChunk = 0;

    let receivedAnyChunk = false;
    let receivedLastChunk = false;

    let uploadFailed = false;

    function createTempPath(id) {
        return path.join(TEMP_DIR, `${id}.tmp`);
    }

    call.on("data", chunk => {
        if(uploadFailed) {
            return;
        }

        try {
            if (!uploadId) {
                uploadId = chunk.upload_id;

                if(!uploadId) {
                    throw new Error("Upload ID is required");
                }

                filename = path.basename(chunk.filename || "");

                if(!filename){
                    throw new Error("Filename is required.");
                }

                const registration = uploadRegistry.get(uploadId);

                if(!registration) {
                    throw new Error("Upload was not authorized.");
                }

                fileHash = registration.fileHash;
                expectedFileSize = registration.fileSize;

                if(filename !== registration.filename){
                    throw new Error("Filename does not match upload authorization.");
                }

                filePath = createTempPath(uploadId);
                writeStream = fs.createWriteStream(filePath);

            }

            if(chunk.upload_id !== uploadId) {
                throw new Error("Upload ID changed during upload.");
            }

            if (path.basename(chunk.filename) !== filename) {
                throw new Error("Filename changed during upload.");
            }

            if(chunk.chunk_number !== expectedChunk) {
                throw new Error(`Unexpected chunk number. Expected ${expectedChunk}, received ${chunk.chunk_number}`);
            }

            expectedChunk++;
            receivedAnyChunk = true;

            if (receivedLastChunk) {
                throw new Error("Received chunk after final chunk.");
            }

            if (chunk.data && chunk.data.length > 0) {
                fileSize += chunk.data.length;
                writeStream.write(chunk.data);
            }

            if (chunk.is_last) {
                receivedLastChunk = true;
            }

        } catch (error) {
            uploadFailed = true;
            console.error("[gRPC] Error receiving chunk: ", error);

            if (writeStream) {
                writeStream.destroy();
            }

            call.destroy(error);
        }
    });

    call.on("end", async() => {
        try {
            if(!receivedAnyChunk || !writeStream || !filePath ) {
                callback(null, {status: "UPLOAD_STATUS_INVALID_FILE", message: "No video data received."});
                return;
            }

            if(!receivedLastChunk) {
                throw new Error("Upload ended without a final chunk.");
            }

            if(expectedFileSize > 0 && fileSize !== expectedFileSize) {
                throw new Error(`File size mismatch. Expected ${expectedFileSize}, received ${fileSize}`);
            }

            await new Promise((resolve, reject) => {
                writeStream.end(error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            if (knownHashes.has(fileHash)) {
                console.log(`[gRPC] Duplicate detected after upload: ${filename}`);

                await fsp.unlink(filePath).catch(() => {});

                uploadRegistry.delete(uploadId);
                pendingHashes.delete(fileHash);

                callback(null, {
                    status: "UPLOAD_STATUS_DUPLICATE",
                    message: "Video already exists."
                });

                return;
            }

            const accepted = getQueue().enqueue({uploadId, filename, filePath, fileHash, fileSize});

            if(!accepted){
                console.log(`[gRPC] Queue became full while uploading ${filename}`);
                await fsp.unlink(filePath).catch(() => {});
                uploadRegistry.delete(uploadId);
                pendingHashes.delete(fileHash);
                callback(null, {status: "UPLOAD_STATUS_QUEUE_FULL", message: "Queue is full. Video dropped."});
                return;
            }

            pendingHashes.delete(fileHash);
            knownHashes.add(fileHash);

            uploadRegistry.delete(uploadId);

            console.log(`[gRPC] Upload received: ${filename}`);
            console.log(`[gRPC] Queue size: ${getQueue().size}`);

            callback(null, {status: "UPLOAD_STATUS_ACCEPTED", message: "Video accepted for processing."});

        } catch (error) {
            console.error("[gRPC] Upload failed: ", error);

            if (filePath) {
                await fsp.unlink(filePath).catch(() => {});
            }

            if (uploadId) {
                uploadRegistry.delete(uploadId);
            }

            if (fileHash) {
                pendingHashes.delete(fileHash);
            }

            callback(null, {status: "UPLOAD_STATUS_UPLOAD_ERROR", message: "Failed to process upload."});
        }
    });

    call.on("error", error => {
        uploadFailed = true;
        console.error("[gRPC] Stream error: ", error);
        if (writeStream) {
            writeStream.destroy();
        }

        if (filePath) {
            fsp.unlink(filePath).catch(() => {});
        }

        if (uploadId) {
            uploadRegistry.delete(uploadId);
        }

        if (fileHash) {
            pendingHashes.delete(fileHash);
        }
    });
}

async function startGrpcServer() {
    await fsp.mkdir(TEMP_DIR, {recursive: true});

    const server = new grpc.Server();

    server.addService(uploadService.service, {CheckUploadCapacity: checkUploadCapacity, UploadVideo: uploadVideo});

    return new Promise((resolve, reject) => {
        server.bindAsync(
            "0.0.0.0:50051",
            grpc.ServerCredentials.createInsecure(),

            (error, port) => {
                if (error) {
                    reject(error);
                    return;
                }
                console.log(`gRPC server running on port 0.0.0.0:${port}`);

                resolve(server);
            }
        );
    });
}

module.exports = {
    startGrpcServer,
    checkUploadCapacity,
    uploadVideo
}