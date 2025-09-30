import { onMount, onCleanup, createEffect, createSignal, For, Show } from 'solid-js';
import { ChunkManager, ViewportController, InfiniteCanvasDrawing, CHUNK_SIZE } from '../lib/InfiniteCanvas';
import { getContrastColor } from '../utils/userColors';

export function InfiniteCanvas(props) {
  let canvasRef;
  let overlayRef;
  let chunkManager;
  let viewportController;
  let drawing;
  
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, width: 800, height: 600, zoom: 1 });
  const [worldCoords, setWorldCoords] = createSignal({ x: 0, y: 0 });
  const [activeRegion, setActiveRegion] = createSignal(null);
  const [remoteCursors, setRemoteCursors] = createSignal(new Map());

  onMount(() => {
    setupCanvas();
    setupEventHandlers();
    setupWebSocketHandlers();
  });

  function setupCanvas() {
    const rect = canvasRef.parentElement.getBoundingClientRect();
    canvasRef.width = rect.width;
    canvasRef.height = rect.height;
    overlayRef.width = rect.width;
    overlayRef.height = rect.height;

    // Initialize managers
    chunkManager = new ChunkManager();
    viewportController = new ViewportController(canvasRef, chunkManager);
    drawing = new InfiniteCanvasDrawing(chunkManager, viewportController);

    // Start render loop
    viewportController.startRenderLoop();
    viewportController.setupEventHandlers();

    // Update viewport signal
    const updateViewport = () => {
      setViewport({...viewportController.viewport});
      checkRegionChange();
    };
    
    const originalPan = viewportController.pan.bind(viewportController);
    viewportController.pan = function(...args) {
      originalPan(...args);
      updateViewport();
    };

    const originalZoom = viewportController.zoom.bind(viewportController);
    viewportController.zoom = function(...args) {
      originalZoom(...args);
      updateViewport();
    };
  }

  function checkRegionChange() {
    const vp = viewportController.viewport;
    const centerX = vp.x + vp.width / 2;
    const centerY = vp.y + vp.height / 2;
    
    const chunkX = Math.floor(centerX / CHUNK_SIZE);
    const chunkY = Math.floor(centerY / CHUNK_SIZE);
    const newRegion = chunkManager.getRegionId(chunkX, chunkY);

    if (newRegion !== activeRegion()) {
      setActiveRegion(newRegion);
      // Switch WebSocket room
      props.wsManager?.switchRegion(newRegion);
    }
  }

  function setupEventHandlers() {
    let isDrawing = false;

    // Drawing events
    canvasRef.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.shiftKey) {
        const worldPos = viewportController.screenToWorld(e.offsetX, e.offsetY);
        drawing.startDrawing(worldPos.x, worldPos.y);
        isDrawing = true;
        
        // Send draw start
        props.onDraw?.({
          type: 'start',
          x: worldPos.x,
          y: worldPos.y,
          color: props.color,
          size: props.brushSize
        });
      }
    });

    canvasRef.addEventListener('mousemove', (e) => {
      const worldPos = viewportController.screenToWorld(e.offsetX, e.offsetY);
      setWorldCoords(worldPos);

      if (isDrawing) {
        drawing.draw(worldPos.x, worldPos.y, props.color, props.brushSize);
        
        // Send draw update
        props.onDraw?.({
          type: 'draw',
          x: worldPos.x,
          y: worldPos.y,
          color: props.color,
          size: props.brushSize
        });
      }

      // Send cursor position
      props.onCursor?.({
        x: worldPos.x,
        y: worldPos.y,
        viewport: viewportController.viewport,
        color: props.currentUser?.color || props.color,
        name: props.currentUser?.name || 'Anonymous'
      });
    });

    canvasRef.addEventListener('mouseup', () => {
      if (isDrawing) {
        drawing.stopDrawing();
        isDrawing = false;
        
        // Send draw end
        props.onDraw?.({
          type: 'end'
        });
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      const rect = canvasRef.parentElement.getBoundingClientRect();
      canvasRef.width = rect.width;
      canvasRef.height = rect.height;
      overlayRef.width = rect.width;
      overlayRef.height = rect.height;
      viewportController.viewport.width = rect.width;
      viewportController.viewport.height = rect.height;
      viewportController.needsRedraw = true;
    });
  }

  function setupWebSocketHandlers() {
    const ws = props.wsManager;
    if (!ws) return;

    ws.on('chunkData', async (data) => {
      const { chunkId, imageData } = data;
      const [x, y] = chunkId.split(':').map(Number);
      
      // Load chunk data
      let chunk = chunkManager.chunks.get(chunkId);
      if (!chunk) {
        chunk = await chunkManager.loadChunk(x, y);
      }

      if (chunk && imageData) {
        const img = new Image();
        img.onload = () => {
          const ctx = chunk.canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          viewportController.needsRedraw = true;
        };
        img.src = imageData;
      }
    });

    ws.on('remoteDraw', (data) => {
      if (data.type === 'draw' && data.lastX !== undefined) {
        drawing.lastPos = { x: data.lastX, y: data.lastY };
        drawing.draw(data.x, data.y, data.color, data.size);
        drawing.lastPos = null;
      }
    });

    ws.on('cursor', (data) => {
      if (data.clientId && data.clientId !== props.currentUser?.id) {
        setRemoteCursors(prev => {
          const newCursors = new Map(prev);
          newCursors.set(data.clientId, {
            worldX: data.x,
            worldY: data.y,
            color: data.color,
            name: data.name
          });
          return newCursors;
        });
      }
    });
  }

  // Navigate to specific coordinates
  createEffect(() => {
    const target = props.navigateTo;
    if (target) {
      viewportController.viewport.x = target.x - viewportController.viewport.width / 2;
      viewportController.viewport.y = target.y - viewportController.viewport.height / 2;
      viewportController.needsRedraw = true;
    }
  });

  // Render cursors on overlay
  function renderCursors() {
    const ctx = overlayRef?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlayRef.width, overlayRef.height);

    // Draw remote cursors
    remoteCursors().forEach((cursor, userId) => {
      const screenPos = viewportController.worldToScreen(cursor.worldX, cursor.worldY);
      
      // Only draw if in viewport
      if (screenPos.x >= 0 && screenPos.x <= overlayRef.width &&
          screenPos.y >= 0 && screenPos.y <= overlayRef.height) {
        
        // Draw cursor dot
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw label
        ctx.fillStyle = cursor.color;
        ctx.fillRect(screenPos.x + 10, screenPos.y - 20, cursor.name.length * 8 + 10, 20);
        
        ctx.fillStyle = getContrastColor(cursor.color);
        ctx.font = '12px sans-serif';
        ctx.fillText(cursor.name, screenPos.x + 15, screenPos.y - 5);
      }
    });
  }

  createEffect(() => {
    renderCursors();
  });

  return (
    <div class="infinite-canvas-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
      
      {/* Coordinates Display */}
      <div class="canvas-info">
        <div class="coord-display">
          <div>X: {Math.round(worldCoords().x)}</div>
          <div>Y: {Math.round(worldCoords().y)}</div>
          <div>Zoom: {viewport().zoom.toFixed(1)}x</div>
          <div>Region: {activeRegion()}</div>
        </div>
      </div>

      {/* Navigation Controls */}
      <div class="nav-controls">
        <button class="nav-btn" onClick={() => viewportController.zoom(1.5, canvasRef.width/2, canvasRef.height/2)}>
          🔍+
        </button>
        <button class="nav-btn" onClick={() => viewportController.zoom(0.67, canvasRef.width/2, canvasRef.height/2)}>
          🔍-
        </button>
        <button class="nav-btn" onClick={() => {
          viewportController.viewport.x = -canvasRef.width/2;
          viewportController.viewport.y = -canvasRef.height/2;
          viewportController.viewport.zoom = 1;
          viewportController.needsRedraw = true;
        }}>
          🏠
        </button>
      </div>
    </div>
  );
}