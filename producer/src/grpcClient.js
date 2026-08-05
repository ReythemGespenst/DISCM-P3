const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'proto', '../../upload.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {keepCase: true, longs: String, enums: String, defaults: true, oneofs: true});

const proto = grpc.loadPackageDefinition(packageDefinition);

const host = process.env.GRPC_HOST || 'localhost';

const port = process.env.GRPC_PORT || '50051';

const client = new proto.media.MediaUploadService(`${host}:${port}`, grpc.credentials.createInsecure());

function checkUploadCapacity(request) {
    return new Promise((resolve, reject) => {
        client.checkUploadCapacity(request, (error, response) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(response);
        })
    })
};

module.exports = {
    client,
    checkUploadCapacity
};