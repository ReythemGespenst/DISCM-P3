const path = require('path');
const fs = require('fs');
const { producerWorker } = require('./producerWorker');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');

async function main() {
    const expectedCount = Number(process.env.PRODUCER_THREADS) || 3;

    const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

    if (folders.length === 0) {
        throw new Error(`No producer folders found in ${STORAGE_DIR}`);
    }

    const producerCount = Math.min(expectedCount, folders.length);

    if (folders.length < expectedCount) {
        console.warn(
            `Requested ${expectedCount} producer(s) but only found ${folders.length} folder(s) in ${STORAGE_DIR}. ` +
            `Starting ${producerCount} producer(s) instead.`
        );
    }

    console.log(`Starting ${producerCount} producer(s)...`);

    const workers = folders.slice(0, producerCount).map((folderName, i) => {
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