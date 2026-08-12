const path = require("path");
const fs = require("fs");

const { producerWorker } = require("src/producerWorker");


async function getProducerFolders() {
    const videosPath = path.join(__dirname, "../videos");

    const entries = await fs.promises.readdir(videosPath, { withFileTypes: true });

    return entries.filter(entry => entry.isDirectory()).map(entry => path.join(videosPath, entry.name)).sort();
}

async function main() {
    const requestedProducers = Number(process.env.PRODUCERS) || 1;

    console.log(`Starting ${requestedProducers} producer(s)...`);

    const folders = await getProducerFolders();

    if (folders.length === 0) {
        throw new Error("No producer folders found. Please create folders in the 'videos' directory.");
    }

    const producerCount = Math.min(requestedProducers, folders.length);

    if (producerCount < requestedProducers) {
        console.warn(`Only ${producerCount} producer(s) available. Requested ${requestedProducers}.`);
    }

    const workers = [];

    for (let i = 0; i < producerCount; i++) {
        workers.push(producerWorker(i + 1, folders[i]));
    }

    await Promise.all(workers);

    console.log(`All producers have finished processing.`);
}

main().catch(error => {
    console.error("Error in producer application:", error);
    process.exit(1);
});