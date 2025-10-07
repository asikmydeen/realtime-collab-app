// Sharp removed - image compression not needed for current implementation
// import sharp from 'sharp';

const CHUNK_SIZE = 512;
const REGION_SIZE = 16;

export class ChunkManager {
  constructor() {
    this.chunks = new Map(); // chunkId -> chunk data
    this.dirtyChunks = new Set(); // chunks that need saving
    this.chunkCache = new Map(); // LRU cache
  }

  getChunkId(x, y) {
    return `${x}:${y}`;
  }

  getRegionId(chunkX, chunkY) {
    const regionX = Math.floor(chunkX / REGION_SIZE);
    const regionY = Math.floor(chunkY / REGION_SIZE);
    return `region:${regionX}:${regionY}`;
  }

  async getChunk(chunkId) {
    // Check memory cache
    if (this.chunks.has(chunkId)) {
      return this.chunks.get(chunkId);
    }

    // Load from storage (stub - would load from DB/S3)
    const chunk = await this.loadChunkFromStorage(chunkId);
    if (chunk) {
      this.chunks.set(chunkId, chunk);
      return chunk;
    }

    // Create new empty chunk
    return this.createEmptyChunk(chunkId);
  }

  createEmptyChunk(chunkId) {
    const [x, y] = chunkId.split(':').map(Number);

    // Create white canvas buffer
    const buffer = Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE * 4);
    buffer.fill(255); // White

    const chunk = {
      id: chunkId,
      x,
      y,
      buffer,
      lastModified: Date.now(),
      operations: []
    };

    this.chunks.set(chunkId, chunk);
    return chunk;
  }

  async applyOperation(chunkId, operation) {
    const chunk = await this.getChunk(chunkId);

    // Add operation to buffer
    chunk.operations.push(operation);
    chunk.lastModified = Date.now();
    this.dirtyChunks.add(chunkId);

    // Apply operation immediately (simplified)
    // In production, batch operations and render periodically
    if (chunk.operations.length > 100) {
      await this.renderChunk(chunk);
    }

    return chunk;
  }

  async renderChunk(chunk) {
    // Render all operations to chunk buffer
    // This is a stub - would use actual canvas rendering
    console.log(`Rendering chunk ${chunk.id} with ${chunk.operations.length} operations`);

    // Clear operations after rendering
    chunk.operations = [];
  }

  async saveChunk(chunkId) {
    const chunk = this.chunks.get(chunkId);
    if (!chunk || !this.dirtyChunks.has(chunkId)) return;

    // Image compression removed - save raw buffer
    // In production, you might want to add compression here
    const compressed = chunk.buffer;

    // Save to storage (stub)
    await this.saveChunkToStorage(chunkId, compressed);

    this.dirtyChunks.delete(chunkId);
  }

  async loadChunkFromStorage(chunkId) {
    // Stub - would load from DB/S3
    return null;
  }

  async saveChunkToStorage(chunkId, buffer) {
    // Stub - would save to DB/S3
    console.log(`Saving chunk ${chunkId} (${buffer.length} bytes)`);
  }

  // Periodically save dirty chunks
  startAutoSave() {
    setInterval(async () => {
      const chunks = Array.from(this.dirtyChunks);
      for (const chunkId of chunks) {
        await this.saveChunk(chunkId);
      }
    }, 10000); // Every 10 seconds
  }
}

export class RegionManager {
  constructor() {
    this.regions = new Map(); // regionId -> Set of client IDs
    this.clientRegions = new Map(); // clientId -> Set of region IDs
  }

  joinRegion(clientId, regionId) {
    // Add client to region
    if (!this.regions.has(regionId)) {
      this.regions.set(regionId, new Set());
    }
    this.regions.get(regionId).add(clientId);

    // Track client's regions
    if (!this.clientRegions.has(clientId)) {
      this.clientRegions.set(clientId, new Set());
    }
    this.clientRegions.get(clientId).add(regionId);

    console.log(`Client ${clientId} joined ${regionId}`);
  }

  leaveRegion(clientId, regionId) {
    // Remove client from region
    if (this.regions.has(regionId)) {
      this.regions.get(regionId).delete(clientId);

      // Clean up empty regions
      if (this.regions.get(regionId).size === 0) {
        this.regions.delete(regionId);
      }
    }

    // Update client's regions
    if (this.clientRegions.has(clientId)) {
      this.clientRegions.get(clientId).delete(regionId);
    }

    console.log(`Client ${clientId} left ${regionId}`);
  }

  switchRegion(clientId, newRegionId) {
    // Leave all current regions
    const currentRegions = this.clientRegions.get(clientId) || new Set();
    for (const regionId of currentRegions) {
      this.leaveRegion(clientId, regionId);
    }

    // Join new region
    this.joinRegion(clientId, newRegionId);
  }

  getClientsInRegion(regionId) {
    return Array.from(this.regions.get(regionId) || []);
  }

  removeClient(clientId) {
    const regions = this.clientRegions.get(clientId) || new Set();
    for (const regionId of regions) {
      this.leaveRegion(clientId, regionId);
    }
    this.clientRegions.delete(clientId);
  }
}

export class InfiniteCanvasServer {
  constructor() {
    this.chunkManager = new ChunkManager();
    this.regionManager = new RegionManager();
    this.chunkManager.startAutoSave();
  }

  async handleDrawOperation(clientId, operation) {
    const { x, y, lastX, lastY, color, size } = operation;

    // Get affected chunks
    const chunks = this.getAffectedChunks(lastX || x, lastY || y, x, y, size);

    // Apply operation to each chunk
    for (const chunkId of chunks) {
      await this.chunkManager.applyOperation(chunkId, operation);
    }

    // Get region for broadcasting
    const chunkCoords = this.getChunkCoords(x, y);
    const regionId = this.chunkManager.getRegionId(chunkCoords.chunkX, chunkCoords.chunkY);

    // Return clients to broadcast to
    return this.regionManager.getClientsInRegion(regionId);
  }

  getChunkCoords(worldX, worldY) {
    return {
      chunkX: Math.floor(worldX / CHUNK_SIZE),
      chunkY: Math.floor(worldY / CHUNK_SIZE)
    };
  }

  getAffectedChunks(x1, y1, x2, y2, size) {
    const chunks = new Set();
    const padding = size / 2;

    // Get bounding box
    const minX = Math.min(x1, x2) - padding;
    const maxX = Math.max(x1, x2) + padding;
    const minY = Math.min(y1, y2) - padding;
    const maxY = Math.max(y1, y2) + padding;

    // Get chunk range
    const startChunkX = Math.floor(minX / CHUNK_SIZE);
    const endChunkX = Math.floor(maxX / CHUNK_SIZE);
    const startChunkY = Math.floor(minY / CHUNK_SIZE);
    const endChunkY = Math.floor(maxY / CHUNK_SIZE);

    // Add all chunks in range
    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let y = startChunkY; y <= endChunkY; y++) {
        chunks.add(this.chunkManager.getChunkId(x, y));
      }
    }

    return Array.from(chunks);
  }

  async getChunkData(chunkId) {
    const chunk = await this.chunkManager.getChunk(chunkId);

    // Convert to base64 PNG for transmission
    // Image conversion removed - return raw buffer as base64
    // In production, you might want to convert to PNG here
    const base64Data = chunk.buffer.toString('base64');

    return {
      chunkId,
      imageData: `data:image/png;base64,${base64Data}`,
      lastModified: chunk.lastModified
    };
  }
}