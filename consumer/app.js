const { startGrpcServer } = require("./src/grpcServer");
const { startWorkers } = require("./src/queue");
const { startWebServer } = require("./src/server");

async function main() {
    const consumerCount = Number(process.env.CONSUMER_THREADS || 1);
    console.log("Starting consumers...");
    console.log(`Consumer workers: ${consumerCount}`);

    await startGrpcServer();

    await startWebServer();

    startWorkers(consumerCount);
    
    console.log("Consumer is ready.");
}

main().catch(error => {
    console.error("Consumer startup failed: ", error);
    process.exit(1);
});