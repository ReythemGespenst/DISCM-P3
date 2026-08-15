const { processVideo } = require("./videoProcessor");

class BoundedQueue {
    constructor(maxSize) {
        if (!Number.isInteger(maxSize) || maxSize < 1) {
            throw new Error(`Invalid queue size: ${maxSize}`);
        }
        this.maxSize = maxSize;
        this.items = [];
    }

    isFull() {
        return this.items.length >= this.maxSize;
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

class RoundRobinDispatcher {
    constructor(workerCount, totalCapacity) {
        if (!Number.isInteger(workerCount) || workerCount < 1) {
            throw new Error(`Invalid worker count: ${workerCount}`);
        }
        if (!Number.isInteger(totalCapacity) || totalCapacity < workerCount) {
            throw new Error(`Invalid total capacity: ${totalCapacity}`);
        }

        this.workerCount = workerCount;

        // Split total capacity as evenly as possible across per-worker queues.
        const base = Math.floor(totalCapacity / workerCount);
        const remainder = totalCapacity % workerCount;

        this.workerQueues = [];
        for (let i = 0; i < workerCount; i++) {
            const capacity = base + (i < remainder ? 1 : 0);
            this.workerQueues.push(new BoundedQueue(capacity));
        }

        this.nextWorkerIndex = 0;
    }

    enqueue(item) {
        for (let attempts = 0; attempts < this.workerCount; attempts++) {
            const index = this.nextWorkerIndex;
            this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workerCount;

            if (this.workerQueues[index].enqueue(item)) {
                return true;
            }
        }
        return false; // every worker's queue is full
    }

    isFull() {
        return this.workerQueues.every(q => q.isFull());
    }

    get size() {
        return this.workerQueues.reduce((total, q) => total + q.size, 0);
    }

    getWorkerQueue(workerId) {
        return this.workerQueues[workerId - 1];
    }
}

let queue; 

function sleep(ms) {
    return new Promise(resolve => { setTimeout(resolve, ms); });
}

async function consumerWorker(workerId) {
    console.log(`[Consumer ${workerId}] Worker started`);

    const myQueue = queue.getWorkerQueue(workerId);

    while (true) {
        const item = myQueue.dequeue();

        if (!item) {
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

function startWorkers(count) {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid consumer worker count: ${count}`);
    }

    const totalCapacity = Number(process.env.QUEUE_SIZE) || 10;

    queue = new RoundRobinDispatcher(count, Math.max(totalCapacity, count));

    console.log(`Starting ${count} consumer workers...`);

    for (let i = 1; i <= count; i++) {
        consumerWorker(i).catch(error => {
            console.error(`[Consumer ${i}] Worker crashed: `, error);
        });
    }
}

module.exports = { BoundedQueue, RoundRobinDispatcher, getQueue() { return queue; }, startWorkers };