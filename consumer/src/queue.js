class BoundedQueue {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.items = [];
        this.activeUploads = new Map();
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

module.exports = {BoundedQueue, queue};