// Infinite Canvas Implementation
export const CHUNK_SIZE = 512;
export const REGION_SIZE = 16; // 16x16 chunks per region

export class ChunkManager {
  constructor() {
    this.chunks = new Map();
    this.loadingChunks = new Set();
    this.chunkCache = new Map();
    this.maxCacheSize = 100; // Maximum cached chunks
  }

  getChunkId(x, y) {
    return `${x}:${y}`;
  }

  getChunkCoords(worldX, worldY) {
    return {
      chunkX: Math.floor(worldX / CHUNK_SIZE),
      chunkY: Math.floor(worldY / CHUNK_SIZE),
      localX: ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      localY: ((worldY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
  }

  getRegionId(chunkX, chunkY) {
    const regionX = Math.floor(chunkX / REGION_SIZE);
    const regionY = Math.floor(chunkY / REGION_SIZE);
    return `region:${regionX}:${regionY}`;
  }

  async loadChunk(chunkX, chunkY) {
    const chunkId = this.getChunkId(chunkX, chunkY);
    
    // Check cache first
    if (this.chunks.has(chunkId)) {
      return this.chunks.get(chunkId);
    }

    // Check if already loading
    if (this.loadingChunks.has(chunkId)) {
      return null;
    }

    this.loadingChunks.add(chunkId);

    try {
      // In real implementation, fetch from server
      const chunk = await this.createEmptyChunk(chunkX, chunkY);
      this.chunks.set(chunkId, chunk);
      this.loadingChunks.delete(chunkId);
      
      // Manage cache size
      if (this.chunks.size > this.maxCacheSize) {
        this.evictOldestChunk();
      }

      return chunk;
    } catch (error) {
      this.loadingChunks.delete(chunkId);
      throw error;
    }
  }

  createEmptyChunk(chunkX, chunkY) {
    // Use regular canvas if OffscreenCanvas is not available
    const canvas = typeof OffscreenCanvas !== 'undefined' 
      ? new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE)
      : document.createElement('canvas');
    
    if (!canvas.width) {
      canvas.width = CHUNK_SIZE;
      canvas.height = CHUNK_SIZE;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
    
    return {
      id: this.getChunkId(chunkX, chunkY),
      x: chunkX,
      y: chunkY,
      canvas,
      lastModified: Date.now(),
      dirty: false
    };
  }

  evictOldestChunk() {
    let oldestTime = Infinity;
    let oldestId = null;

    for (const [id, chunk] of this.chunks) {
      if (chunk.lastModified < oldestTime && !chunk.dirty) {
        oldestTime = chunk.lastModified;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.chunks.delete(oldestId);
    }
  }

  getVisibleChunks(viewport) {
    const startChunkX = Math.floor(viewport.x / CHUNK_SIZE);
    const startChunkY = Math.floor(viewport.y / CHUNK_SIZE);
    const endChunkX = Math.ceil((viewport.x + viewport.width) / CHUNK_SIZE);
    const endChunkY = Math.ceil((viewport.y + viewport.height) / CHUNK_SIZE);

    const visibleChunks = [];
    
    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let y = startChunkY; y <= endChunkY; y++) {
        visibleChunks.push({ x, y });
      }
    }

    return visibleChunks;
  }
}

export class ViewportController {
  constructor(canvas, chunkManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chunkManager = chunkManager;
    
    // Viewport state
    this.viewport = {
      x: 0,
      y: 0,
      width: canvas.width || 800,
      height: canvas.height || 600,
      zoom: 1
    };

    console.log('ViewportController initialized - canvas size:', canvas.width, 'x', canvas.height);

    // Pan state
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.lastPan = { x: 0, y: 0 };

    // Performance
    this.rafId = null;
    this.needsRedraw = true;
    
    // Force initial render
    setTimeout(() => {
      this.needsRedraw = true;
      console.log('Forcing initial render');
    }, 100);
  }

  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.viewport.x) * this.viewport.zoom,
      y: (worldY - this.viewport.y) * this.viewport.zoom
    };
  }

  screenToWorld(screenX, screenY) {
    return {
      x: screenX / this.viewport.zoom + this.viewport.x,
      y: screenY / this.viewport.zoom + this.viewport.y
    };
  }

  pan(deltaX, deltaY) {
    this.viewport.x -= deltaX / this.viewport.zoom;
    this.viewport.y -= deltaY / this.viewport.zoom;
    this.needsRedraw = true;
  }

  zoom(factor, centerX, centerY) {
    const worldPos = this.screenToWorld(centerX, centerY);
    
    this.viewport.zoom *= factor;
    this.viewport.zoom = Math.max(0.1, Math.min(10, this.viewport.zoom));
    
    // Adjust viewport to keep the zoom center in place
    const newScreenPos = this.worldToScreen(worldPos.x, worldPos.y);
    this.viewport.x += (centerX - newScreenPos.x) / this.viewport.zoom;
    this.viewport.y += (centerY - newScreenPos.y) / this.viewport.zoom;
    
    this.needsRedraw = true;
  }

  async render() {
    if (!this.needsRedraw) return;

    const ctx = this.ctx;
    const viewport = this.viewport;

    // Clear canvas with a subtle background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid pattern
    this.drawGrid();

    // Get visible chunks
    const visibleChunks = this.chunkManager.getVisibleChunks(viewport);

    // Render each visible chunk
    for (const { x, y } of visibleChunks) {
      const chunk = await this.chunkManager.loadChunk(x, y);
      if (!chunk) continue;

      const screenPos = this.worldToScreen(
        x * CHUNK_SIZE,
        y * CHUNK_SIZE
      );

      ctx.drawImage(
        chunk.canvas,
        screenPos.x,
        screenPos.y,
        CHUNK_SIZE * viewport.zoom,
        CHUNK_SIZE * viewport.zoom
      );

      // Debug: Draw chunk borders
      if (viewport.zoom > 0.5) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.strokeRect(
          screenPos.x,
          screenPos.y,
          CHUNK_SIZE * viewport.zoom,
          CHUNK_SIZE * viewport.zoom
        );
      }
    }

    this.needsRedraw = false;
  }

  drawGrid() {
    const ctx = this.ctx;
    const viewport = this.viewport;
    const gridSize = 50;
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    
    // Calculate visible grid lines
    const startX = Math.floor(viewport.x / gridSize) * gridSize;
    const endX = startX + viewport.width / viewport.zoom + gridSize;
    const startY = Math.floor(viewport.y / gridSize) * gridSize;
    const endY = startY + viewport.height / viewport.zoom + gridSize;
    
    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      const screenX = (x - viewport.x) * viewport.zoom;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, viewport.height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      const screenY = (y - viewport.y) * viewport.zoom;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(viewport.width, screenY);
      ctx.stroke();
    }
    
    // Draw origin marker
    if (Math.abs(viewport.x) < viewport.width && Math.abs(viewport.y) < viewport.height) {
      const originX = -viewport.x * viewport.zoom;
      const originY = -viewport.y * viewport.zoom;
      
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
      ctx.lineWidth = 2;
      
      // X axis
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(viewport.width, originY);
      ctx.stroke();
      
      // Y axis
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, viewport.height);
      ctx.stroke();
    }
  }

  startRenderLoop() {
    const loop = () => {
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  stopRenderLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }

  setupEventHandlers() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(factor, e.offsetX, e.offsetY);
    });

    // Pan with mouse
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const deltaX = e.clientX - this.panStart.x;
        const deltaY = e.clientY - this.panStart.y;
        this.pan(deltaX - this.lastPan.x, deltaY - this.lastPan.y);
        this.lastPan = { x: deltaX, y: deltaY };
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.lastPan = { x: 0, y: 0 };
      this.canvas.style.cursor = 'crosshair';
    });

    // Touch events for mobile
    let lastTouch = null;
    
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        lastTouch = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
      }
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && lastTouch) {
        const deltaX = e.touches[0].clientX - lastTouch.x;
        const deltaY = e.touches[0].clientY - lastTouch.y;
        this.pan(deltaX, deltaY);
        lastTouch = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
      }
    });
  }
}

export class InfiniteCanvasDrawing {
  constructor(chunkManager, viewportController) {
    this.chunkManager = chunkManager;
    this.viewportController = viewportController;
    this.isDrawing = false;
    this.lastPos = null;
  }

  startDrawing(worldX, worldY) {
    this.isDrawing = true;
    this.lastPos = { x: worldX, y: worldY };
  }

  draw(worldX, worldY, color, size) {
    // Allow drawing even if not in active drawing mode (for remote draws)
    if (!this.lastPos) {
      this.lastPos = { x: worldX, y: worldY };
      return;
    }

    // Get all chunks this line passes through
    const chunks = this.getAffectedChunks(
      this.lastPos.x, this.lastPos.y,
      worldX, worldY, size
    );

    for (const { chunkX, chunkY } of chunks) {
      const chunk = this.chunkManager.chunks.get(
        this.chunkManager.getChunkId(chunkX, chunkY)
      );

      if (!chunk) continue;

      const ctx = chunk.canvas.getContext('2d');
      
      // Convert world coordinates to chunk-local coordinates
      const localStart = {
        x: this.lastPos.x - chunkX * CHUNK_SIZE,
        y: this.lastPos.y - chunkY * CHUNK_SIZE
      };
      const localEnd = {
        x: worldX - chunkX * CHUNK_SIZE,
        y: worldY - chunkY * CHUNK_SIZE
      };

      // Draw on chunk
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(localStart.x, localStart.y);
      ctx.lineTo(localEnd.x, localEnd.y);
      ctx.stroke();

      chunk.dirty = true;
      chunk.lastModified = Date.now();
    }

    this.lastPos = { x: worldX, y: worldY };
    this.viewportController.needsRedraw = true;
  }

  stopDrawing() {
    this.isDrawing = false;
    this.lastPos = null;
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
        chunks.add({ chunkX: x, chunkY: y });
      }
    }

    return Array.from(chunks);
  }
}