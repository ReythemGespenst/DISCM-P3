const path = require('path');
const fs = require('fs');
const { producerWorker } = require('./producerWorker');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');

async function main() {
    const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

    if (folders.length === 0) {
        throw new Error(`No producer folders found in ${STORAGE_DIR}`);
    }

    console.log(`Starting ${folders.length} producer(s)...`);

    const workers = folders.map((folderName, i) => {
        const folderPath = path.join(STORAGE_DIR, folderName);
        console.log(`Producer ${i + 1} assigned to ${folderPath}`);
        return producerWorker(i + 1, folderPath);
    });

    await Promise.all(workers);

    console.log("All producers have finished processing.");
}

main().catch((error) => {
    console.error("Error in main:", error);
    process.exit(1);
});