// Pixel-based infinite canvas (r/place style)
export const PIXEL_SIZE = 10; // Each pixel is 10x10 screen pixels
export const CHUNK_PIXELS = 64; // 64x64 pixels per chunk
export const CHUNK_SIZE = CHUNK_PIXELS * PIXEL_SIZE; // 640px chunks
export const COOLDOWN_TIME = 5000; // 5 seconds between pixel placements

export class PixelChunkManager {
  constructor() {
    this.chunks = new Map();
    this.pixelOwners = new Map(); // pixelId -> { owner, timestamp }
    this.availableSpaces = new Set();
    this.lastPlacedTime = 0;
  }

  getPixelId(x, y) {
    return `${x},${y}`;
  }

  getChunkForPixel(pixelX, pixelY) {
    const chunkX = Math.floor(pixelX / CHUNK_PIXELS);
    const chunkY = Math.floor(pixelY / CHUNK_PIXELS);
    return { chunkX, chunkY };
  }

  canPlacePixel() {
    return Date.now() - this.lastPlacedTime >= COOLDOWN_TIME;
  }

  getTimeUntilNextPixel() {
    const elapsed = Date.now() - this.lastPlacedTime;
    const remaining = Math.max(0, COOLDOWN_TIME - elapsed);
    return Math.ceil(remaining / 1000);
  }

  claimPixel(pixelX, pixelY, userId, color) {
    const pixelId = this.getPixelId(pixelX, pixelY);
    
    // Check if pixel is already owned by someone else
    const owner = this.pixelOwners.get(pixelId);
    if (owner && owner.owner !== userId) {
      return { success: false, reason: 'owned' };
    }

    // Check cooldown
    if (!this.canPlacePixel()) {
      return { success: false, reason: 'cooldown', timeLeft: this.getTimeUntilNextPixel() };
    }

    // Claim the pixel
    this.pixelOwners.set(pixelId, {
      owner: userId,
      timestamp: Date.now(),
      color
    });

    this.lastPlacedTime = Date.now();
    this.availableSpaces.delete(pixelId);

    // Mark adjacent pixels as available if not owned
    const adjacent = [
      { x: pixelX - 1, y: pixelY },
      { x: pixelX + 1, y: pixelY },
      { x: pixelX, y: pixelY - 1 },
      { x: pixelX, y: pixelY + 1 }
    ];

    adjacent.forEach(({ x, y }) => {
      const adjId = this.getPixelId(x, y);
      if (!this.pixelOwners.has(adjId)) {
        this.availableSpaces.add(adjId);
      }
    });

    return { success: true };
  }

  findNearestAvailableSpace(centerX = 0, centerY = 0, maxRadius = 1000) {
    // Spiral search for available space
    let x = centerX;
    let y = centerY;
    let dx = 0;
    let dy = -1;
    
    for (let i = 0; i < maxRadius * maxRadius; i++) {
      const pixelId = this.getPixelId(x, y);
      
      // Check if this pixel is available
      if (!this.pixelOwners.has(pixelId)) {
        // Check if it's adjacent to an owned pixel
        const adjacent = [
          this.getPixelId(x - 1, y),
          this.getPixelId(x + 1, y),
          this.getPixelId(x, y - 1),
          this.getPixelId(x, y + 1)
        ];
        
        if (adjacent.some(id => this.pixelOwners.has(id))) {
          return { x, y, found: true };
        }
      }
      
      // Spiral pattern
      if ((x === y) || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
        const temp = dx;
        dx = -dy;
        dy = temp;
      }
      x += dx;
      y += dy;
    }
    
    return { x: centerX, y: centerY, found: false };
  }

  getPixelInfo(pixelX, pixelY) {
    const pixelId = this.getPixelId(pixelX, pixelY);
    return this.pixelOwners.get(pixelId);
  }
}

export class PixelCanvasRenderer {
  constructor(canvas, pixelManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pixelManager = pixelManager;
    
    this.viewport = {
      x: 0,
      y: 0,
      zoom: 1
    };

    this.gridVisible = true;
    this.highlightAvailable = true;
  }

  pixelToScreen(pixelX, pixelY) {
    return {
      x: (pixelX * PIXEL_SIZE - this.viewport.x) * this.viewport.zoom,
      y: (pixelY * PIXEL_SIZE - this.viewport.y) * this.viewport.zoom
    };
  }

  screenToPixel(screenX, screenY) {
    const worldX = screenX / this.viewport.zoom + this.viewport.x;
    const worldY = screenY / this.viewport.zoom + this.viewport.y;
    return {
      x: Math.floor(worldX / PIXEL_SIZE),
      y: Math.floor(worldY / PIXEL_SIZE)
    };
  }

  navigateToPixel(pixelX, pixelY, animate = true) {
    const targetX = pixelX * PIXEL_SIZE - this.canvas.width / 2 / this.viewport.zoom;
    const targetY = pixelY * PIXEL_SIZE - this.canvas.height / 2 / this.viewport.zoom;

    if (animate) {
      // Smooth animation
      const startX = this.viewport.x;
      const startY = this.viewport.y;
      const startTime = Date.now();
      const duration = 500;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic

        this.viewport.x = startX + (targetX - startX) * eased;
        this.viewport.y = startY + (targetY - startY) * eased;

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      animate();
    } else {
      this.viewport.x = targetX;
      this.viewport.y = targetY;
    }
  }

  render() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    // Clear
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // Get visible pixel range
    const topLeft = this.screenToPixel(0, 0);
    const bottomRight = this.screenToPixel(width, height);

    // Render pixels
    for (let y = topLeft.y - 1; y <= bottomRight.y + 1; y++) {
      for (let x = topLeft.x - 1; x <= bottomRight.x + 1; x++) {
        const pixelInfo = this.pixelManager.getPixelInfo(x, y);
        const screenPos = this.pixelToScreen(x, y);
        const size = PIXEL_SIZE * this.viewport.zoom;

        if (pixelInfo) {
          // Owned pixel
          ctx.fillStyle = pixelInfo.color;
          ctx.fillRect(screenPos.x, screenPos.y, size, size);
        } else if (this.highlightAvailable) {
          // Check if available (adjacent to owned)
          const adjacent = [
            this.pixelManager.getPixelInfo(x - 1, y),
            this.pixelManager.getPixelInfo(x + 1, y),
            this.pixelManager.getPixelInfo(x, y - 1),
            this.pixelManager.getPixelInfo(x, y + 1)
          ];

          if (adjacent.some(p => p)) {
            // Available space - highlight
            ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
            ctx.fillRect(screenPos.x, screenPos.y, size, size);
            
            // Pulsing border
            const pulse = (Math.sin(Date.now() / 500) + 1) / 2;
            ctx.strokeStyle = `rgba(74, 222, 128, ${0.5 + pulse * 0.5})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(screenPos.x, screenPos.y, size, size);
          }
        }
      }
    }

    // Grid
    if (this.gridVisible && this.viewport.zoom > 0.5) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;

      for (let y = topLeft.y; y <= bottomRight.y + 1; y++) {
        const screenY = this.pixelToScreen(0, y).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
        ctx.stroke();
      }

      for (let x = topLeft.x; x <= bottomRight.x + 1; x++) {
        const screenX = this.pixelToScreen(x, 0).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
        ctx.stroke();
      }
    }
  }

  drawCursor(pixelX, pixelY, color) {
    const screenPos = this.pixelToScreen(pixelX, pixelY);
    const size = PIXEL_SIZE * this.viewport.zoom;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(screenPos.x - 1, screenPos.y - 1, size + 2, size + 2);
  }
}

export class PixelCanvasController {
  constructor(canvas) {
    this.canvas = canvas;
    this.pixelManager = new PixelChunkManager();
    this.renderer = new PixelCanvasRenderer(canvas, this.pixelManager);
    
    this.hoveredPixel = null;
    this.selectedColor = '#000000';
    this.userId = null;
    
    this.setupEventHandlers();
    this.startRenderLoop();
  }

  setupEventHandlers() {
    // Mouse events
    this.canvas.addEventListener('mousemove', (e) => {
      const pixel = this.renderer.screenToPixel(e.offsetX, e.offsetY);
      this.hoveredPixel = pixel;
    });

    this.canvas.addEventListener('click', (e) => {
      if (!this.userId) return;
      
      const pixel = this.renderer.screenToPixel(e.offsetX, e.offsetY);
      const result = this.pixelManager.claimPixel(pixel.x, pixel.y, this.userId, this.selectedColor);
      
      if (result.success) {
        this.onPixelPlaced?.(pixel.x, pixel.y, this.selectedColor);
      } else {
        this.onPlaceFailed?.(result);
      }
    });

    // Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldZoom = this.renderer.viewport.zoom;
      this.renderer.viewport.zoom = Math.max(0.1, Math.min(5, oldZoom * factor));
      
      // Zoom towards mouse
      const mouseWorld = this.renderer.screenToPixel(e.offsetX, e.offsetY);
      const scale = this.renderer.viewport.zoom / oldZoom;
      this.renderer.viewport.x = mouseWorld.x * PIXEL_SIZE - (mouseWorld.x * PIXEL_SIZE - this.renderer.viewport.x) * scale;
      this.renderer.viewport.y = mouseWorld.y * PIXEL_SIZE - (mouseWorld.y * PIXEL_SIZE - this.renderer.viewport.y) * scale;
    });

    // Pan
    let isPanning = false;
    let lastMouse = { x: 0, y: 0 };

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning = true;
        lastMouse = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isPanning) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        this.renderer.viewport.x -= dx / this.renderer.viewport.zoom;
        this.renderer.viewport.y -= dy / this.renderer.viewport.zoom;
        lastMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    });
  }

  startRenderLoop() {
    const loop = () => {
      this.renderer.render();
      
      // Draw hover cursor
      if (this.hoveredPixel) {
        this.renderer.drawCursor(this.hoveredPixel.x, this.hoveredPixel.y, this.selectedColor);
      }
      
      requestAnimationFrame(loop);
    };
    loop();
  }

  navigateToAvailableSpace() {
    const available = this.pixelManager.findNearestAvailableSpace(0, 0);
    if (available.found) {
      this.renderer.navigateToPixel(available.x, available.y, true);
      return available;
    }
    return null;
  }

  setUserId(userId) {
    this.userId = userId;
  }

  setColor(color) {
    this.selectedColor = color;
  }
}