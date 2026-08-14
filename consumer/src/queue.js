const { processVideo } = require("./videoProcessor");

class BoundedQueue {
    constructor(maxSize) {
        if(!Number.isInteger(maxSize) || maxSize < 1) {
            throw new Error(`Invalid queue size: ${maxSize}`);
        }
        this.maxSize = maxSize;
        this.items = [];
    }

    isFull() {
        return (this.items.length >= this.maxSize);
    }

    enqueue(item) {
        if (this.items.length >= this.maxSize) {
            return false; // Queue is full
        }

        this.items.push(item);

        return true;
    }

    dequeue() {
        if (this.items.length === 0) {
            return null; // Queue is empty
        }

        return this.items.shift();
    }

    get size() {
        return this.items.length;
    }
}

const queue = new BoundedQueue(Number(process.env.QUEUE_SIZE) || 10);

function sleep(ms) {
    return new Promise(resolve=> {setTimeout(resolve, ms)});
}

async function consumerWorker(workerId) {
    console.log(`[Consumer ${workerId}] ` + `Worker started`);

    while (true) {
        const item = queue.dequeue();

        if(!item) {
            await sleep(100);
            continue;
        }

        console.log(`[Consumer ${workerId}] Processing ${item.filename} (queue size: ${queue.size})`);

        try {
            await processVideo(item);
            console.log(`[Consumer ${workerId}] Finished ${item.filename}`);
        } catch (error) {
            console.error(`[Consumer ${workerId}] Failed to process ${item.filename}: `, error);
        }
    }
}

function startWorkers(count){
    if(!Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid consumer worker count: ${count}`);
    }

    console.log(`Starting ${count} consumer workers...`);
    
    for(let i = 1; i <= count; i++) {
        consumerWorker(i).catch(error => {
            console.error(`[Consumer ${i}] Worker crashed: `, error);
        });
    }
}

module.exports = {BoundedQueue, queue, startWorkers};