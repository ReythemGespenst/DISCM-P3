const grpc = require('@grpc/grpc-js');

const protoLoader = require('@grpc/proto-loader');
const { truncate } = require('fs');

const path = require('path');

const PROTO_PATH = path.join(__dirname, '../../proto/upload.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: truncate
});

const proto = grpc.loadPackageDefinition(packageDefinition);

function startGrpcServer(uploadQueue) {
    const server = new grpc.Server();

    server.addService(proto.media.MediaUploadService.service, {
        UploadVideo: (call, callback) => {
            const chunks = []

            let filename = "";
            let uploadId = "";

            call.on('data', (chunk) => {
                filename = chunk.filename;
                uploadId = chunk.uploadId;
                chunks.push(chunk.data);
            });

            call.on('end', () => {
                const videoBuffer = Buffer.concat(chunks);
                const videoData = uploadQueue.enqueue({ uploadId, filename, videoBuffer });

                if(!accepted){
                    callback(null, {accepted: false, message: 'Queue is full. Video Dropped.'});
                    return;
                }

                callback(null, { accepted: true, message: 'Video accepted for processing.' });
            })
        }
    });

    server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            throw err;
        }

        console.log(`gRPC server running at http://0.0.0.0:50051`);
    })
}