import { onMount, onCleanup, createSignal, createEffect } from 'solid-js';
import { ChunkManager, ViewportController, InfiniteCanvasDrawing } from '../lib/InfiniteCanvas';
import { SpaceManager } from '../lib/SpaceManager';

export function WorldCanvas(props) {
  let canvasRef;
  let chunkManager;
  let viewportController;
  let drawing;
  let spaceManager;
  
  const [mySpace, setMySpace] = createSignal(null);
  const [isActive, setIsActive] = createSignal(true);
  const [hasDrawn, setHasDrawn] = createSignal(false);
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, width: 800, height: 600, zoom: 1 });
  
  let lastActivityTime = Date.now();
  let activityCheckInterval;
  let isFirstLoad = true;

  // Expose methods for parent component
  createEffect(() => {
    props.onCanvasReady?.({
      navigate: navigateToPosition,
      getViewport: () => viewport(),
      getChunkManager: () => chunkManager
    });
  });

  onMount(() => {
    setupCanvas();
    setupEventHandlers();
    setupActivityMonitoring();
    setupWebSocketHandlers();
    
    // Auto-navigate to assigned space
    setTimeout(() => {
      navigateToMySpace();
    }, 100);
  });

  function setupCanvas() {
    const rect = canvasRef.parentElement.getBoundingClientRect();
    canvasRef.width = rect.width;
    canvasRef.height = rect.height;

    // Initialize managers
    chunkManager = new ChunkManager();
    viewportController = new ViewportController(canvasRef, chunkManager);
    drawing = new InfiniteCanvasDrawing(chunkManager, viewportController);
    spaceManager = new SpaceManager();
    
    // Set viewport size for space allocation
    spaceManager.setViewportSize(rect.width, rect.height);

    // Start render loop
    viewportController.startRenderLoop();
    
    // Request space from server
    props.wsManager?.send({
      type: 'requestSpace',
      viewportWidth: rect.width,
      viewportHeight: rect.height
    });
  }

  function navigateToMySpace() {
    const space = mySpace();
    if (space) {
      // Navigate to center of assigned space
      const centerX = space.x + space.width / 2;
      const centerY = space.y + space.height / 2;
      
      navigateToPosition(centerX, centerY, true);
      
      // Flash border to show assigned area
      setTimeout(() => flashSpaceBorder(), 500);
    }
  }

  function navigateToPosition(worldX, worldY, animate = true) {
    const targetX = worldX - canvasRef.width / 2;
    const targetY = worldY - canvasRef.height / 2;
    
    if (animate) {
      // Smooth animation
      const startX = viewportController.viewport.x;
      const startY = viewportController.viewport.y;
      const duration = 1000;
      const startTime = performance.now();
      
      function animateStep() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function
        const eased = 1 - Math.pow(1 - progress, 3);
        
        viewportController.viewport.x = startX + (targetX - startX) * eased;
        viewportController.viewport.y = startY + (targetY - startY) * eased;
        viewportController.needsRedraw = true;
        
        updateViewport();
        
        if (progress < 1) {
          requestAnimationFrame(animateStep);
        }
      }
      
      animateStep();
    } else {
      viewportController.viewport.x = targetX;
      viewportController.viewport.y = targetY;
      viewportController.needsRedraw = true;
      updateViewport();
    }
  }

  function updateViewport() {
    setViewport({
      x: viewportController.viewport.x,
      y: viewportController.viewport.y,
      width: viewportController.viewport.width,
      height: viewportController.viewport.height,
      zoom: viewportController.viewport.zoom
    });
  }

  function flashSpaceBorder() {
    const space = mySpace();
    if (!space) return;
    
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      const ctx = canvasRef.getContext('2d');
      const screenSpace = viewportController.worldToScreen(space.x, space.y);
      
      ctx.strokeStyle = flashCount % 2 === 0 ? '#4ade80' : 'transparent';
      ctx.lineWidth = 4;
      ctx.strokeRect(
        screenSpace.x,
        screenSpace.y,
        space.width * viewportController.viewport.zoom,
        space.height * viewportController.viewport.zoom
      );
      
      flashCount++;
      if (flashCount >= 6) {
        clearInterval(flashInterval);
        viewportController.needsRedraw = true;
      }
    }, 300);
  }

  function setupEventHandlers() {
    let isDrawing = false;
    let hasMoved = false;

    // Drawing events
    canvasRef.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.shiftKey) {
        const worldPos = viewportController.screenToWorld(e.offsetX, e.offsetY);
        
        // Check if drawing in assigned space
        const space = mySpace();
        if (space && !isInSpace(worldPos.x, worldPos.y, space) && !hasDrawn()) {
          showSpaceWarning();
          return;
        }
        
        drawing.startDrawing(worldPos.x, worldPos.y);
        isDrawing = true;
        updateActivity(true);
        
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

      if (isDrawing) {
        drawing.draw(worldPos.x, worldPos.y, props.color, props.brushSize);
        
        props.onDraw?.({
          type: 'draw',
          x: worldPos.x,
          y: worldPos.y,
          color: props.color,
          size: props.brushSize
        });
        
        if (!hasDrawn()) {
          setHasDrawn(true);
          props.wsManager?.send({ type: 'markDrawn' });
        }
      }

      // Track any mouse movement as activity
      hasMoved = true;
    });

    canvasRef.addEventListener('mouseup', () => {
      if (isDrawing) {
        drawing.stopDrawing();
        isDrawing = false;
        
        props.onDraw?.({
          type: 'end'
        });
      }
    });

    // Pan with middle mouse or shift+drag
    viewportController.setupEventHandlers();
    
    // Override viewport controller's pan handler to update our state
    const originalPan = viewportController.pan.bind(viewportController);
    viewportController.pan = function(deltaX, deltaY) {
      originalPan(deltaX, deltaY);
      updateViewport();
    };

    // Track activity and viewport changes
    canvasRef.addEventListener('wheel', (e) => {
      updateActivity();
      setTimeout(updateViewport, 10);
    });
    setInterval(() => {
      if (hasMoved) {
        updateActivity();
        hasMoved = false;
      }
    }, 5000);

    // Window resize
    window.addEventListener('resize', () => {
      const rect = canvasRef.parentElement.getBoundingClientRect();
      canvasRef.width = rect.width;
      canvasRef.height = rect.height;
      viewportController.viewport.width = rect.width;
      viewportController.viewport.height = rect.height;
      viewportController.needsRedraw = true;
    });
  }

  function setupActivityMonitoring() {
    // Check for inactivity every 10 seconds
    activityCheckInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityTime;
      
      if (idleTime > 60000 && !hasDrawn()) {
        // Inactive for 1 minute without drawing - reload to get new space
        setIsActive(false);
        props.onInactive?.();
      }
    }, 10000);
  }

  function updateActivity(isDrawing = false) {
    lastActivityTime = Date.now();
    setIsActive(true);
    
    // Notify server of activity
    props.wsManager?.send({ 
      type: 'activity',
      isDrawing 
    });
  }

  function isInSpace(x, y, space) {
    return x >= space.x && 
           x <= space.x + space.width &&
           y >= space.y && 
           y <= space.y + space.height;
  }

  function showSpaceWarning() {
    // Flash a warning that user should draw in their space first
    const ctx = canvasRef.getContext('2d');
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Please draw in your assigned space first!',
      canvasRef.width / 2,
      canvasRef.height / 2
    );
    
    setTimeout(() => {
      viewportController.needsRedraw = true;
    }, 2000);
  }

  function setupWebSocketHandlers() {
    const ws = props.wsManager;
    if (!ws) return;

    ws.on('spaceAssigned', (data) => {
      setMySpace(data.space);
      spaceManager.claimSpace(props.currentUser?.id, data.space);
      
      if (isFirstLoad) {
        navigateToMySpace();
        isFirstLoad = false;
      }
    });

    ws.on('spaceUpdate', (data) => {
      // Update space manager with other users' spaces
      data.spaces.forEach(space => {
        if (space.userId !== props.currentUser?.id) {
          spaceManager.occupiedSpaces.set(space.id, space);
        }
      });
    });

    ws.on('remoteDraw', (data) => {
      // Handle different draw types
      switch(data.type) {
        case 'start':
          // Show drawing indicator
          showDrawingIndicator(data.clientId, data.x, data.y, data.color);
          break;
          
        case 'draw':
          // Update drawing position
          if (data.lastX !== undefined) {
            drawing.lastPos = { x: data.lastX, y: data.lastY };
          } else {
            drawing.lastPos = { x: data.x, y: data.y };
          }
          drawing.draw(data.x, data.y, data.color, data.size);
          drawing.lastPos = null;
          
          // Update indicator position
          updateDrawingIndicator(data.clientId, data.x, data.y);
          break;
          
        case 'end':
          // Hide drawing indicator
          hideDrawingIndicator(data.clientId);
          break;
      }
    });

    ws.on('chunkData', async (data) => {
      const { chunkId, imageData } = data;
      const [x, y] = chunkId.split(':').map(Number);
      
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

    ws.on('forceReload', () => {
      window.location.reload();
    });
  }

  // Drawing indicators for remote users
  const drawingIndicators = new Map();
  
  function showDrawingIndicator(userId, x, y, color) {
    if (!drawingIndicators.has(userId)) {
      const indicator = document.createElement('div');
      indicator.className = 'drawing-indicator';
      indicator.style.position = 'absolute';
      indicator.style.pointerEvents = 'none';
      indicator.style.zIndex = '1000';
      canvasRef.parentElement.appendChild(indicator);
      drawingIndicators.set(userId, indicator);
    }
    
    const indicator = drawingIndicators.get(userId);
    const screenPos = viewportController.worldToScreen(x, y);
    
    indicator.style.left = `${screenPos.x}px`;
    indicator.style.top = `${screenPos.y}px`;
    indicator.style.color = color;
    indicator.innerHTML = `
      <div class="drawing-ripple" style="border-color: ${color}"></div>
      <div class="drawing-dot" style="background: ${color}"></div>
    `;
  }
  
  function updateDrawingIndicator(userId, x, y) {
    const indicator = drawingIndicators.get(userId);
    if (indicator) {
      const screenPos = viewportController.worldToScreen(x, y);
      indicator.style.left = `${screenPos.x}px`;
      indicator.style.top = `${screenPos.y}px`;
    }
  }
  
  function hideDrawingIndicator(userId) {
    const indicator = drawingIndicators.get(userId);
    if (indicator) {
      indicator.remove();
      drawingIndicators.delete(userId);
    }
  }

  onCleanup(() => {
    clearInterval(activityCheckInterval);
    viewportController.stopRenderLoop();
    props.wsManager?.send({ type: 'releaseSpace' });
    
    // Clean up indicators
    drawingIndicators.forEach(indicator => indicator.remove());
  });

  return (
    <div class="world-canvas-container">
      <canvas
        ref={canvasRef}
        class="world-canvas"
      />
      
      {/* Status overlay */}
      <div class="canvas-status">
        {!isActive() && (
          <div class="inactive-overlay">
            <div class="inactive-message">
              <h2>Session Inactive</h2>
              <p>You were inactive for too long without drawing.</p>
              <button onClick={() => window.location.reload()}>
                Get New Space
              </button>
            </div>
          </div>
        )}
        
        {mySpace() && (
          <div class="space-info">
            <div>Your space: ({Math.round(mySpace().x)}, {Math.round(mySpace().y)})</div>
            <div>Size: {mySpace().width}x{mySpace().height}px</div>
            {!hasDrawn() && <div class="blink">Draw in your space to claim it!</div>}
          </div>
        )}
      </div>
    </div>
  );
}