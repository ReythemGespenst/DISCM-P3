const crypto = require('crypto');

const fs = require("fs");

function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on("data", chunk => hash.update(chunk));
        stream.on("end", () => { resolve(hash.digest("hex")) });
        stream.on("error", error => { reject(error)});
    });
}

module.exports = {
    calculateFileHash
};