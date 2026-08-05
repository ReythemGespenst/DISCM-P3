class BoundedQueue {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.items = [];
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

module.exports = BoundedQueue;