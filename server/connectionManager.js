import { EventEmitter } from 'events';

class ConnectionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrentConnections = options.maxConcurrentConnections || 50;
    this.connectionTimeout = options.connectionTimeout || 30000;
    this.queue = [];
    this.activeConnections = new Map();
    this.processingQueue = false;
  }

  async addToQueue(ws, request) {
    const connectionRequest = {
      ws,
      request,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random()}`
    };

    this.queue.push(connectionRequest);
    console.log(`[ConnectionManager] Added to queue. Queue size: ${this.queue.length}`);
    
    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processQueue();
    }

    return connectionRequest.id;
  }

  async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.queue.length > 0 && this.activeConnections.size < this.maxConcurrentConnections) {
      const request = this.queue.shift();
      
      // Check if request has expired
      if (Date.now() - request.timestamp > this.connectionTimeout) {
        console.log(`[ConnectionManager] Connection request expired: ${request.id}`);
        request.ws.close(1013, 'Connection queue timeout');
        continue;
      }

      // Process connection
      await this.processConnection(request);
    }

    this.processingQueue = false;

    // Schedule next processing if queue still has items
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async processConnection(request) {
    const { ws, id } = request;
    
    this.activeConnections.set(id, {
      ws,
      connectedAt: Date.now()
    });

    console.log(`[ConnectionManager] Processing connection: ${id}. Active: ${this.activeConnections.size}`);
    
    // Emit event for the main server to handle
    this.emit('connection', ws, request.request);

    // Handle disconnection
    ws.on('close', () => {
      this.activeConnections.delete(id);
      console.log(`[ConnectionManager] Connection closed: ${id}. Active: ${this.activeConnections.size}`);
      
      // Process queue when a slot opens up
      if (this.queue.length > 0) {
        this.processQueue();
      }
    });
  }

  getStats() {
    return {
      activeConnections: this.activeConnections.size,
      queueLength: this.queue.length,
      maxConnections: this.maxConcurrentConnections
    };
  }

  // Gracefully close all connections
  async shutdown() {
    console.log('[ConnectionManager] Shutting down...');
    
    // Clear queue
    this.queue.forEach(request => {
      request.ws.close(1001, 'Server shutting down');
    });
    this.queue = [];

    // Close active connections
    this.activeConnections.forEach(conn => {
      conn.ws.close(1001, 'Server shutting down');
    });
    this.activeConnections.clear();
  }
}

export default ConnectionManager;