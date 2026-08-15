const path = require('path');

const { producerWorker } = require('./producerWorker');

async function main() {
    const producerCount = Number(process.env.PRODUCER_COUNT) || 3;

    console.log(`Starting ${producerCount} producer workers...`);

    const workers = [];

    for (let i = 0; i < producerCount; i++) {
        const folderPath = path.join(__dirname, 'videos', `producer${i + 1}`);

        workers.push(producerWorker(i + 1, folderPath));
    }

    await Promise.all(workers);

    console.log("All producers finished");
}

main().catch((error) => {
    console.error("Error in main:", error);
    process.exit(1);
})