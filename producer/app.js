const path = require("path");
const fs = require("fs");

const { producerWorker } = require("./src/producerWorker");


async function getProducerFolders() {
    const storagePath = path.join(__dirname, "storage");

    const entries = await fs.promises.readdir(storagePath, { withFileTypes: true });

    return entries.filter(entry => entry.isDirectory()).map(entry => path.join(storagePath, entry.name)).sort();
}

async function main() {
    const requestedProducers = Number(process.env.PRODUCER_THREADS || 1);

    if(!Number.isInteger(requestedProducers) || requestedProducers < 1) {
        throw new Error(`Invalid PRODUCER_THREADS: ${requestedProducers}`);
    }

    console.log(`Starting ${requestedProducers} producer(s)...`);

    const folders = await getProducerFolders();

    if (folders.length === 0) {
        throw new Error("No producer folders found. Please create folders in the 'storage' directory.");
    }

    const producerCount = Math.min(requestedProducers, folders.length);

    if (producerCount < requestedProducers) {
        console.warn(`Only ${producerCount} producer(s) available. Requested ${requestedProducers}.`);
    }

    const workers = [];

    for (let i = 0; i < producerCount; i++) {
        const producerId = i + 1;
        const folder = folders[i];

        console.log(`Producer ${producerId} assigned to ${folder}`);
        workers.push(producerWorker(producerId, folder));
    }

    await Promise.all(workers);

    console.log(`All producers have finished processing.`);
}

main().catch(error => {
    console.error("Error in producer application:", error);
    process.exit(1);
});