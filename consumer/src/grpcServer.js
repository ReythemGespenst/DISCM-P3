const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const fs = require('fs');
const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');

const { queue } = require("./queue");

const PROTO_PATH = path.join(__dirname, '../../proto/upload.proto');

const TEMP_DIR = path.join(__dirname, "../temp");

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

function checkUploadCapacity(call, callback){
    try {
        const request = call.request;
        
        const filename = request.filename;
        const fileSize = Number(request.file_size);
        const fileHash = request.fileHash;
        const uploadId = request.uploadId || crypto.randomUUID();

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

        if(knownHashes.has(fileHash)) {
            console.log(`[gRPC] Duplicate detected: ${filename}`);

            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_DUPLICATE",
                message: "Video already exists."
            });

            return;
        }

        if(queue.isFull()) {
            console.log(`[gRPC] Queue full. Rejecting ${filename}`);

            callback(null, {
                allowed: false,
                status: "UPLOAD_STATUS_QUEUE_FULL",
                message: "Queue is full. Video rejected."
            });

            return;
        }

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
            message: uploadId
        });
    } catch (error) {
        console.error("[gRPC] Capacity check failed: ", error);

        callback(null, {
            allowed: false,
            status: "UPLOAD_STATUS_UPLOAD_ERROR",
            message: "Failed to check upload capacity"
        });
    }
}

function uploadVideo(call, callback){
    let uploadId, filename, fileHash, filePath, writeStream = null;
    let fileSize = 0;
    let expectedChunk = 0;
    let receivedAnyChunk = false;

    function createTempPath(id) {
        return path.join(TEMP_DIR, `${id}.tmp`);
    }

    call.on("data", chunk => {
        try {
            if (!uploadId) {
                uploadId = chunk.uploadId || crypto.randomUUID();
                filename = path.basename(chunk.filename);
                filePath = createTempPath(uploadId);
                writeStream = fs.createWriteStream(filePath);
                fileHash = chunk.fileHash || null;
            }
            if(chunk.chunk_number !== expectedChunk) {
                call.destroy(new Error(`Unexpected chunk number. Expected ${expectedChunk}, received ${chunk.chunk_number}`));
                return;
            }
            expectedChunk++;
            receivedAnyChunk = true;

            if (chunk.data && chunk.data.length > 0) {
                fileSize += chunk.data.length;
                writeStream.write(chunk.data);
            }

        } catch (error) {
            console.error("Error receiving chunk: ", error);
            call.destroy(error);
        }
    });

    call.on("end", async() => {
        try {
            if( !receivedAnyChunk || !writeStream || !filePath ) {
                callback(null, {status: "INVALID_FILE", message: "No video data received."});
                return;
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

            const accepted = queue.enqueue({uploadId, filename, filePath, fileHash, fileSize});

            if(!accepted){
                await fsp.unlink(filePath).catch(() => {});
                callback(null, {status: "QUEUE_FULL", message: "Queue is full. Video dropped."});
                return;
            }

            console.log(`[gRPC] Upload received: ${filename}`);

            callback(null, {status: "ACCEPTED", message: "Video accepted for processing."});

        } catch (error) {
            console.error("[gRPC] Upload failed: ", error);
            if (filePath) {
                await fsp.unlink(filePath).catch(() => {});
            }
            callback(null, {status: "UPLOAD_ERROR", message: "Failed to process upload."});
        }
    });

    call.on("error", error => {
        console.error("[gRPC] Stream error: ", error);
        if (writeStream) { writeStream.destroy(); }
    });
}

function startGrpcServer() {
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