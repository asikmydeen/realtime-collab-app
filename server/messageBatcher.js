class MessageBatcher {
  constructor(options = {}) {
    this.batchInterval = options.batchInterval || 50; // 50ms = 20Hz
    this.maxBatchSize = options.maxBatchSize || 100;
    this.batches = new Map(); // clientId -> pending messages
    this.timers = new Map(); // clientId -> timeout
  }

  addMessage(clientId, message, sendFunction) {
    if (!this.batches.has(clientId)) {
      this.batches.set(clientId, []);
    }

    const batch = this.batches.get(clientId);
    batch.push(message);

    // If batch is full, send immediately
    if (batch.length >= this.maxBatchSize) {
      this.sendBatch(clientId, sendFunction);
      return;
    }

    // Schedule batch send if not already scheduled
    if (!this.timers.has(clientId)) {
      const timer = setTimeout(() => {
        this.sendBatch(clientId, sendFunction);
      }, this.batchInterval);
      
      this.timers.set(clientId, timer);
    }
  }

  sendBatch(clientId, sendFunction) {
    const batch = this.batches.get(clientId);
    if (!batch || batch.length === 0) return;

    // Clear timer
    const timer = this.timers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(clientId);
    }

    // Send batched message
    const batchedMessage = {
      type: 'batch',
      messages: batch,
      timestamp: Date.now()
    };

    sendFunction(JSON.stringify(batchedMessage));

    // Clear batch
    this.batches.delete(clientId);
  }

  // Force send all pending batches for a client
  flush(clientId, sendFunction) {
    this.sendBatch(clientId, sendFunction);
  }

  // Clean up client data
  removeClient(clientId) {
    const timer = this.timers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(clientId);
    }
    this.batches.delete(clientId);
  }

  getStats() {
    let totalPending = 0;
    this.batches.forEach(batch => {
      totalPending += batch.length;
    });

    return {
      activeClients: this.batches.size,
      totalPendingMessages: totalPending,
      batchInterval: this.batchInterval
    };
  }
}

export default MessageBatcher;