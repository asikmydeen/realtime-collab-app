// Drawing persistence layer with spatial indexing
export class DrawingPersistence {
  constructor(redis = null) {
    this.redis = redis;
    this.inMemoryDrawings = new Map(); // Fallback for when Redis is not available
    this.chunkSize = 500; // 500x500 pixel chunks
    this.maxDrawingsPerChunk = 1000; // Limit drawings per chunk for performance
  }

  // Get chunk key from world coordinates
  getChunkKey(x, y) {
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkY = Math.floor(y / this.chunkSize);
    return `chunk:${chunkX}:${chunkY}`;
  }

  // Get all chunks that a path intersects
  getPathChunks(path) {
    const chunks = new Set();
    
    // Get bounding box of the path
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    path.points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    
    // Get all chunks in bounding box
    const startChunkX = Math.floor(minX / this.chunkSize);
    const endChunkX = Math.floor(maxX / this.chunkSize);
    const startChunkY = Math.floor(minY / this.chunkSize);
    const endChunkY = Math.floor(maxY / this.chunkSize);
    
    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let y = startChunkY; y <= endChunkY; y++) {
        chunks.add(`chunk:${x}:${y}`);
      }
    }
    
    return Array.from(chunks);
  }

  // Save a drawing path
  async savePath(pathData) {
    const path = {
      id: pathData.id || Date.now().toString(),
      clientId: pathData.clientId,
      color: pathData.color,
      size: pathData.size,
      points: pathData.points,
      timestamp: Date.now()
    };
    
    console.log(`[Persist] Saving path with ${path.points.length} points to chunks:`, path.points[0], path.points[path.points.length - 1]);
    
    const chunks = this.getPathChunks(path);
    console.log(`[Persist] Path spans chunks:`, chunks);
    
    if (this.redis) {
      // Store in Redis
      try {
        // Store path data
        await this.redis.hSet('drawings', path.id, JSON.stringify(path));
        console.log(`[Persist] Saved drawing ${path.id} to Redis`);
        
        // Add to spatial index
        for (const chunkKey of chunks) {
          await this.redis.sAdd(chunkKey, path.id);
          console.log(`[Persist] Added drawing ${path.id} to chunk ${chunkKey}`);
          
          // Trim old drawings if chunk is too full
          const chunkSize = await this.redis.sCard(chunkKey);
          if (chunkSize > this.maxDrawingsPerChunk) {
            // Remove oldest drawings
            const members = await this.redis.sMembers(chunkKey);
            const drawingsWithTime = [];
            
            for (const drawingId of members) {
              const drawing = await this.redis.hGet('drawings', drawingId);
              if (drawing) {
                const parsed = JSON.parse(drawing);
                drawingsWithTime.push({ id: drawingId, timestamp: parsed.timestamp });
              }
            }
            
            // Sort by timestamp and remove oldest
            drawingsWithTime.sort((a, b) => a.timestamp - b.timestamp);
            const toRemove = drawingsWithTime.slice(0, chunkSize - this.maxDrawingsPerChunk);
            
            for (const item of toRemove) {
              await this.redis.sRem(chunkKey, item.id);
              await this.redis.hDel('drawings', item.id);
            }
          }
        }
        
        // Set expiry for chunks (7 days)
        for (const chunkKey of chunks) {
          await this.redis.expire(chunkKey, 7 * 24 * 60 * 60);
        }
      } catch (error) {
        console.error('Redis save error:', error);
        this.saveToMemory(path, chunks);
      }
    } else {
      this.saveToMemory(path, chunks);
    }
  }

  // Fallback in-memory storage
  saveToMemory(path, chunks) {
    // Store path
    this.inMemoryDrawings.set(path.id, path);
    
    // Add to spatial index
    for (const chunkKey of chunks) {
      if (!this.inMemoryDrawings.has(chunkKey)) {
        this.inMemoryDrawings.set(chunkKey, new Set());
      }
      this.inMemoryDrawings.get(chunkKey).add(path.id);
      
      // Limit chunk size
      const chunk = this.inMemoryDrawings.get(chunkKey);
      if (chunk.size > this.maxDrawingsPerChunk) {
        // Remove oldest
        const drawings = Array.from(chunk).map(id => ({
          id,
          timestamp: this.inMemoryDrawings.get(id)?.timestamp || 0
        }));
        drawings.sort((a, b) => a.timestamp - b.timestamp);
        
        const toRemove = drawings.slice(0, chunk.size - this.maxDrawingsPerChunk);
        toRemove.forEach(item => {
          chunk.delete(item.id);
          this.inMemoryDrawings.delete(item.id);
        });
      }
    }
  }

  // Load drawings for a viewport
  async loadDrawingsInViewport(x, y, width, height) {
    console.log(`[Persist] Loading drawings for viewport: ${x},${y} ${width}x${height}`);
    
    const drawings = [];
    
    // Calculate chunks in viewport
    const startChunkX = Math.floor((x - 100) / this.chunkSize);
    const endChunkX = Math.floor((x + width + 100) / this.chunkSize);
    const startChunkY = Math.floor((y - 100) / this.chunkSize);
    const endChunkY = Math.floor((y + height + 100) / this.chunkSize);
    
    const chunkKeys = [];
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      for (let cy = startChunkY; cy <= endChunkY; cy++) {
        chunkKeys.push(`chunk:${cx}:${cy}`);
      }
    }
    
    console.log(`[Persist] Checking chunks:`, chunkKeys);
    
    if (this.redis) {
      try {
        // Load from Redis
        for (const chunkKey of chunkKeys) {
          const drawingIds = await this.redis.sMembers(chunkKey);
          console.log(`[Persist] Chunk ${chunkKey} has ${drawingIds.length} drawings`);
          
          for (const drawingId of drawingIds) {
            const drawingData = await this.redis.hGet('drawings', drawingId);
            if (drawingData) {
              const drawing = JSON.parse(drawingData);
              
              // Check if drawing is actually visible in viewport
              const visible = drawing.points.some(point => 
                point.x >= x - 100 && point.x <= x + width + 100 &&
                point.y >= y - 100 && point.y <= y + height + 100
              );
              
              if (visible) {
                drawings.push(drawing);
                console.log(`[Persist] Found visible drawing with ${drawing.points.length} points`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Redis load error:', error);
        return this.loadFromMemory(chunkKeys, x, y, width, height);
      }
    } else {
      return this.loadFromMemory(chunkKeys, x, y, width, height);
    }
    
    // Sort by timestamp to maintain drawing order
    drawings.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`[Persist] Returning ${drawings.length} drawings`);
    return drawings;
  }

  // Fallback in-memory loading
  loadFromMemory(chunkKeys, x, y, width, height) {
    const drawings = [];
    const seen = new Set();
    
    for (const chunkKey of chunkKeys) {
      const chunk = this.inMemoryDrawings.get(chunkKey);
      if (chunk) {
        for (const drawingId of chunk) {
          if (!seen.has(drawingId)) {
            seen.add(drawingId);
            const drawing = this.inMemoryDrawings.get(drawingId);
            if (drawing) {
              // Check if visible
              const visible = drawing.points.some(point => 
                point.x >= x - 100 && point.x <= x + width + 100 &&
                point.y >= y - 100 && point.y <= y + height + 100
              );
              
              if (visible) {
                drawings.push(drawing);
              }
            }
          }
        }
      }
    }
    
    drawings.sort((a, b) => a.timestamp - b.timestamp);
    return drawings;
  }

  // Get statistics
  async getStats() {
    if (this.redis) {
      try {
        const drawingCount = await this.redis.hLen('drawings');
        return {
          totalDrawings: drawingCount,
          storageType: 'redis'
        };
      } catch (error) {
        return this.getMemoryStats();
      }
    } else {
      return this.getMemoryStats();
    }
  }

  getMemoryStats() {
    let drawingCount = 0;
    for (const [key, value] of this.inMemoryDrawings) {
      if (!key.startsWith('chunk:')) {
        drawingCount++;
      }
    }
    
    return {
      totalDrawings: drawingCount,
      storageType: 'memory'
    };
  }
}