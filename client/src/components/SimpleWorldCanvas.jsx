import { onMount, createSignal, createEffect, onCleanup } from 'solid-js';

export function SimpleWorldCanvas(props) {
  let canvasRef;
  let minimapRef;
  
  const [viewport, setViewport] = createSignal({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  
  // Drawing state
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [lastPos, setLastPos] = createSignal(null);
  
  // Drawn content storage - use signals for reactivity
  const [drawnPaths, setDrawnPaths] = createSignal([]);
  const remotePaths = new Map(); // clientId -> current path
  
  // Drawing throttle state
  const drawingThrottle = {
    lastSendTime: 0,
    throttleMs: 50, // Send at most 20 updates per second
    pendingPoints: [],
    timeoutId: null
  };
  
  // Space allocation
  const [mySpace, setMySpace] = createSignal(null);
  const [remoteSpaces, setRemoteSpaces] = createSignal(new Map());
  
  // Debug mode - show all received messages
  const [debugMode, setDebugMode] = createSignal(true);
  const [receivedCount, setReceivedCount] = createSignal(0);
  
  // Loading state
  const [isLoading, setIsLoading] = createSignal(true);
  const [loadingMessage, setLoadingMessage] = createSignal('Connecting to canvas...');
  
  onMount(() => {
    console.log('SimpleWorldCanvas mounted');
    setupCanvas();
    renderCanvas();
    renderMinimap();
  });
  
  // Store cleanup functions
  let wsCleanups = [];
  
  // Set up WebSocket handlers when wsManager is available
  createEffect(() => {
    const ws = props.wsManager;
    if (ws) {
      console.log('[Canvas] wsManager available, setting up handlers');
      
      // Clean up previous handlers
      wsCleanups.forEach(cleanup => cleanup());
      wsCleanups = [];
      
      setupWebSocketHandlers();
      
      // Request space allocation after small delay to ensure canvas is ready
      setTimeout(() => {
        console.log('Requesting space allocation...');
        setLoadingMessage('Allocating your drawing space...');
        ws.send({
          type: 'requestSpace',
          viewportWidth: canvasRef.width,
          viewportHeight: canvasRef.height
        });
        
        // Also load any existing drawings in the default viewport
        setTimeout(() => {
          console.log('[Canvas] Loading initial drawings after space allocation...');
          setLoadingMessage('Loading existing artwork...');
          loadDrawingsForCurrentView();
        }, 500);
      }, 100);
    }
  });
  
  function setupWebSocketHandlers() {
    if (!props.wsManager) {
      console.error('[Canvas] No wsManager available in setupWebSocketHandlers');
      return;
    }
    const ws = props.wsManager;
    
    console.log('[Canvas] Setting up WebSocket handlers');
    
    // Handle space allocation
    const cleanup1 = ws.on('spaceAssigned', (data) => {
      console.log('Space assigned:', data.space);
      setMySpace(data.space);
      
      // Auto-navigate to assigned space
      setTimeout(() => {
        const space = data.space;
        const centerX = space.x + space.width / 2;
        const centerY = space.y + space.height / 2;
        
        setViewport({
          x: centerX - canvasRef.width / 2,
          y: centerY - canvasRef.height / 2,
          zoom: 1
        });
        
        renderCanvas();
        renderMinimap();
        sendViewportUpdate();
        
        // Request drawing history for the area
        loadDrawingsForCurrentView();
      }, 500);
    });
    
    // Handle batch messages
    const cleanupBatch = ws.on('batch', (data) => {
      console.log('📦 Received batch with', data.messages.length, 'messages');
      // Process each message in the batch
      data.messages.forEach(msg => {
        if (msg.type === 'remoteDraw') {
          handleRemoteDraw(msg);
        } else if (msg.type === 'cursor') {
          // Handle cursor update if needed
        }
      });
    });
    
    // Handle remote drawing
    const cleanup2 = ws.on('remoteDraw', (data) => {
      console.log('🎨 Received remoteDraw:', data);
      setReceivedCount(prev => prev + 1);
      handleRemoteDraw(data);
    });
    
    // Extract remote draw handling to separate function
    function handleRemoteDraw(data) {
      
      // Use drawType instead of type
      switch(data.drawType) {
        case 'start':
          remotePaths.set(data.clientId, {
            color: data.color || '#000000',
            size: data.size || 3,
            points: [{ x: data.x, y: data.y }]
          });
          break;
          
        case 'draw':
          let path = remotePaths.get(data.clientId);
          if (!path) {
            // Create path if it doesn't exist (in case we missed the start)
            path = {
              color: data.color || '#000000',
              size: data.size || 3,
              points: []
            };
            remotePaths.set(data.clientId, path);
            
            // Add last position if provided
            if (data.lastX !== undefined && data.lastY !== undefined) {
              path.points.push({ x: data.lastX, y: data.lastY });
            }
          }
          path.points.push({ x: data.x, y: data.y });
          break;
          
        case 'end':
          const finishedPath = remotePaths.get(data.clientId);
          if (finishedPath && finishedPath.points.length > 1) {
            setDrawnPaths(prev => [...prev, finishedPath]);
          }
          remotePaths.delete(data.clientId);
          break;
      }
      
      renderCanvas();
      renderMinimap();
    }
    
    // Handle space updates
    const cleanup3 = ws.on('spaceUpdate', (data) => {
      const spaces = new Map();
      data.spaces.forEach(space => {
        spaces.set(space.userId, space);
      });
      setRemoteSpaces(spaces);
      renderCanvas();
      renderMinimap();
    });
    
    // Handle drawing history
    const cleanup4 = ws.on('drawingHistory', (data) => {
      console.log(`[History] Received batch ${data.batchIndex + 1}/${data.totalBatches} with ${data.drawings.length} drawings`);
      
      // Add historical drawings to our paths
      const newPaths = data.drawings.map(drawing => ({
        color: drawing.color,
        size: drawing.size,
        points: drawing.points
      }));
      
      setDrawnPaths(prev => {
        const updated = [...prev, ...newPaths];
        console.log(`[History] Added ${newPaths.length} paths, total now: ${updated.length}`);
        return updated;
      });
      
      // Update loading message
      if (data.totalBatches > 1) {
        setLoadingMessage(`Loading artwork... (${data.batchIndex + 1}/${data.totalBatches})`);
      }
      
      // Check if this is the last batch
      if (data.batchIndex + 1 === data.totalBatches || data.totalBatches === 0) {
        console.log('[History] All batches loaded, canvas ready!');
        setTimeout(() => {
          setIsLoading(false);
        }, 200);
      }
      
      renderCanvas();
      renderMinimap();
    });
    
    // Store cleanup functions
    wsCleanups = [cleanup1, cleanupBatch, cleanup2, cleanup3, cleanup4];
  }
  
  function setupCanvas() {
    const parent = canvasRef.parentElement;
    // Only set canvas size if it hasn't been set yet or if size changed
    if (canvasRef.width !== parent.clientWidth || canvasRef.height !== parent.clientHeight) {
      canvasRef.width = parent.clientWidth;
      canvasRef.height = parent.clientHeight;
      console.log('Canvas size set to:', canvasRef.width, 'x', canvasRef.height);
    }
    
    // Setup minimap
    if (minimapRef.width !== 150) {
      minimapRef.width = 150;
      minimapRef.height = 150;
    }
  }
  
  function renderCanvas() {
    const ctx = canvasRef.getContext('2d');
    const vp = viewport();
    
    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    
    // Save state
    ctx.save();
    
    // Apply viewport transformation
    ctx.translate(-vp.x, -vp.y);
    ctx.scale(vp.zoom, vp.zoom);
    
    // Draw grid
    drawGrid(ctx);
    
    // Draw space boundaries
    drawSpaces(ctx);
    
    // Draw all paths
    ctx.strokeStyle = props.color || '#000000';
    ctx.lineWidth = props.brushSize || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    drawnPaths().forEach(path => {
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.size;
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      path.points.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
    
    // Draw active remote paths
    remotePaths.forEach((path, clientId) => {
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.size;
      ctx.beginPath();
      if (path.points.length > 0) {
        ctx.moveTo(path.points[0].x, path.points[0].y);
        path.points.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      }
    });
    
    // Restore state
    ctx.restore();
    
    // Draw UI overlay
    drawOverlay(ctx);
  }
  
  function drawGrid(ctx) {
    const gridSize = 50;
    const vp = viewport();
    
    // Calculate visible range
    const startX = Math.floor(vp.x / gridSize) * gridSize - gridSize;
    const endX = vp.x + canvasRef.width / vp.zoom + gridSize;
    const startY = Math.floor(vp.y / gridSize) * gridSize - gridSize;
    const endY = vp.y + canvasRef.height / vp.zoom + gridSize;
    
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 0.5;
    
    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
    
    // Origin lines (more subtle)
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(0, endY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(endX, 0);
    ctx.stroke();
  }
  
  function drawOverlay(ctx) {
    // Keep overlay function empty for now - we have a clean canvas
  }
  
  function drawSpaces(ctx) {
    // Draw my space
    const space = mySpace();
    if (space) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.strokeRect(space.x, space.y, space.width, space.height);
      
      ctx.fillStyle = 'rgba(74, 222, 128, 0.05)';
      ctx.fillRect(space.x, space.y, space.width, space.height);
    }
    
    // Draw remote spaces
    remoteSpaces().forEach((remoteSpace, userId) => {
      if (remoteSpace.userId !== props.currentUser?.id) {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(remoteSpace.x, remoteSpace.y, remoteSpace.width, remoteSpace.height);
        ctx.setLineDash([]);
      }
    });
  }
  
  function renderMinimap() {
    const ctx = minimapRef.getContext('2d');
    const size = 150;
    const worldSize = 5000;
    const vp = viewport();
    
    // Clear with gradient
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Grid
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const pos = (i / 10) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
    
    // Draw content
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    drawnPaths().forEach(path => {
      ctx.beginPath();
      path.points.forEach((point, i) => {
        const x = ((point.x + worldSize/2) / worldSize) * size;
        const y = ((point.y + worldSize/2) / worldSize) * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    
    // Viewport rect
    const vpX = ((vp.x + worldSize/2) / worldSize) * size;
    const vpY = ((vp.y + worldSize/2) / worldSize) * size;
    const vpW = (canvasRef.width / vp.zoom / worldSize) * size;
    const vpH = (canvasRef.height / vp.zoom / worldSize) * size;
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }
  
  // Throttled drawing send function
  function sendThrottledDraw(drawData) {
    const now = Date.now();
    
    // If this is a start or end event, send immediately
    if (drawData.drawType === 'start' || drawData.drawType === 'end') {
      // Clear any pending points
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
      
      // Send any pending points first
      if (drawingThrottle.pendingPoints.length > 0) {
        drawingThrottle.pendingPoints.forEach(point => {
          props.onDraw?.(point);
        });
        drawingThrottle.pendingPoints = [];
      }
      
      // Send the start/end event
      props.onDraw?.(drawData);
      drawingThrottle.lastSendTime = now;
      return;
    }
    
    // For draw events, add to pending points
    drawingThrottle.pendingPoints.push(drawData);
    
    // Check if we can send immediately
    if (now - drawingThrottle.lastSendTime >= drawingThrottle.throttleMs) {
      // Send all pending points
      drawingThrottle.pendingPoints.forEach(point => {
        props.onDraw?.(point);
      });
      drawingThrottle.pendingPoints = [];
      drawingThrottle.lastSendTime = now;
      
      // Clear any pending timeout
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
    } else if (!drawingThrottle.timeoutId) {
      // Schedule a send for the remaining time
      const remainingTime = drawingThrottle.throttleMs - (now - drawingThrottle.lastSendTime);
      drawingThrottle.timeoutId = setTimeout(() => {
        drawingThrottle.pendingPoints.forEach(point => {
          props.onDraw?.(point);
        });
        drawingThrottle.pendingPoints = [];
        drawingThrottle.lastSendTime = Date.now();
        drawingThrottle.timeoutId = null;
      }, remainingTime);
    }
  }
  
  // Mouse handlers
  function handleMouseDown(e) {
    // Prevent interaction while loading
    if (isLoading()) return;
    
    if (e.shiftKey || e.button === 1) {
      // Pan mode
      setIsPanning(true);
      setPanStart({ x: e.clientX + viewport().x, y: e.clientY + viewport().y });
    } else if (e.button === 0) {
      // Draw mode
      const vp = viewport();
      const worldX = e.offsetX / vp.zoom + vp.x;
      const worldY = e.offsetY / vp.zoom + vp.y;
      
      setIsDrawing(true);
      setLastPos({ x: worldX, y: worldY });
      
      // Start new path
      const newPath = {
        color: props.color || '#000000',
        size: props.brushSize || 3,
        points: [{ x: worldX, y: worldY }]
      };
      setDrawnPaths(prev => [...prev, newPath]);
      
      // Use throttled send for drawing
      sendThrottledDraw({ 
        drawType: 'start', 
        x: worldX, 
        y: worldY,
        color: props.color || '#000000',
        size: props.brushSize || 3
      });
      
      // Send activity update
      props.wsManager?.send({ type: 'activity', isDrawing: true });
    }
  }
  
  function handleMouseMove(e) {
    if (isLoading()) return;
    
    if (isPanning()) {
      const vp = viewport();
      setViewport({
        x: panStart().x - e.clientX,
        y: panStart().y - e.clientY,
        zoom: vp.zoom
      });
      renderCanvas();
      renderMinimap();
      checkAndLoadNewArea();
      scheduleViewportUpdate();
    } else if (isDrawing()) {
      const vp = viewport();
      const worldX = e.offsetX / vp.zoom + vp.x;
      const worldY = e.offsetY / vp.zoom + vp.y;
      
      // Add point to current path
      setDrawnPaths(prev => {
        const paths = [...prev];
        if (paths.length > 0) {
          const currentPath = paths[paths.length - 1];
          currentPath.points.push({ x: worldX, y: worldY });
        }
        return paths;
      });
      
      sendThrottledDraw({ 
        drawType: 'draw', 
        x: worldX, 
        y: worldY,
        color: props.color || '#000000',
        size: props.brushSize || 3
      });
      
      renderCanvas();
      renderMinimap();
    }
  }
  
  function handleMouseUp(e) {
    if (isDrawing()) {
      sendThrottledDraw({ drawType: 'end' });
    }
    
    setIsPanning(false);
    setIsDrawing(false);
  }
  
  function handleWheel(e) {
    e.preventDefault();
    if (isLoading()) return;
    const vp = viewport();
    
    // Calculate zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, vp.zoom * zoomFactor));
    
    // Zoom towards mouse position
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;
    
    // Convert mouse position to world coordinates
    const worldX = mouseX / vp.zoom + vp.x;
    const worldY = mouseY / vp.zoom + vp.y;
    
    // Calculate new viewport position to keep mouse position fixed
    const newX = worldX - mouseX / newZoom;
    const newY = worldY - mouseY / newZoom;
    
    setViewport({ x: newX, y: newY, zoom: newZoom });
    renderCanvas();
    renderMinimap();
    checkAndLoadNewArea();
    scheduleViewportUpdate();
  }
  
  // Minimap navigation
  function handleMinimapClick(e) {
    const rect = minimapRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const worldSize = 5000;
    const worldX = (x / 150) * worldSize - worldSize/2;
    const worldY = (y / 150) * worldSize - worldSize/2;
    
    // Center viewport on clicked position
    const vp = viewport();
    setViewport({
      x: worldX - canvasRef.width / vp.zoom / 2,
      y: worldY - canvasRef.height / vp.zoom / 2,
      zoom: vp.zoom
    });
    
    renderCanvas();
    renderMinimap();
    checkAndLoadNewArea();
    scheduleViewportUpdate();
  }
  
  // Send viewport update to server
  function sendViewportUpdate() {
    if (!props.wsManager || !canvasRef) return;
    
    const vp = viewport();
    props.wsManager.send({
      type: 'updateViewport',
      viewport: {
        x: vp.x,
        y: vp.y,
        width: canvasRef.width / vp.zoom,
        height: canvasRef.height / vp.zoom,
        zoom: vp.zoom
      }
    });
  }
  
  // Debounced viewport update
  let viewportUpdateTimeout;
  function scheduleViewportUpdate() {
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
    viewportUpdateTimeout = setTimeout(() => {
      sendViewportUpdate();
    }, 200); // Send update 200ms after movement stops
  }
  
  // Activity monitoring
  let activityInterval;
  onMount(() => {
    activityInterval = setInterval(() => {
      props.wsManager?.send({ type: 'activity', isDrawing: false });
    }, 30000); // Every 30 seconds
  });
  
  onCleanup(() => {
    if (activityInterval) clearInterval(activityInterval);
    // Clear drawing throttle timeout
    if (drawingThrottle.timeoutId) {
      clearTimeout(drawingThrottle.timeoutId);
    }
    // Clear viewport update timeout
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
    // Release space on cleanup
    props.wsManager?.send({ type: 'releaseSpace' });
  });
  
  // Load drawings for current viewport
  function loadDrawingsForCurrentView() {
    if (!props.wsManager || !props.wsManager.ws || props.wsManager.ws.readyState !== 1) {
      console.warn('[Load] WebSocket not connected, skipping drawing load');
      return;
    }
    
    const vp = viewport();
    const padding = 500; // Load extra area around viewport
    
    const loadRequest = {
      type: 'loadDrawings',
      viewport: {
        x: vp.x - padding,
        y: vp.y - padding,
        width: canvasRef.width / vp.zoom + padding * 2,
        height: canvasRef.height / vp.zoom + padding * 2
      }
    };
    
    console.log('[Canvas] Requesting drawings for viewport:', loadRequest.viewport);
    props.wsManager.send(loadRequest);
  }
  
  // Track last loaded area to avoid redundant loads
  let lastLoadedArea = null;
  
  function checkAndLoadNewArea() {
    const vp = viewport();
    const currentArea = {
      x: Math.floor(vp.x / 500),
      y: Math.floor(vp.y / 500),
      zoom: Math.floor(vp.zoom * 10)
    };
    
    // Check if we've moved to a new area
    if (!lastLoadedArea || 
        lastLoadedArea.x !== currentArea.x || 
        lastLoadedArea.y !== currentArea.y ||
        lastLoadedArea.zoom !== currentArea.zoom) {
      lastLoadedArea = currentArea;
      loadDrawingsForCurrentView();
    }
  }
  
  // Navigation functions for external use
  props.onReady?.({
    navigate: (x, y) => {
      const vp = viewport();
      setViewport({
        x: x - canvasRef.width / vp.zoom / 2,
        y: y - canvasRef.height / vp.zoom / 2,
        zoom: vp.zoom
      });
      renderCanvas();
      renderMinimap();
      checkAndLoadNewArea();
    },
    getViewport: () => viewport()
  });
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Loading Overlay */}
      {isLoading() && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 2000,
          'backdrop-filter': 'blur(5px)'
        }}>
          <div style={{
            'text-align': 'center',
            color: 'white'
          }}>
            {/* Animated loader */}
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 20px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              'border-top': '3px solid #4ade80',
              'border-radius': '50%',
              animation: 'spin 1s linear infinite'
            }} />
            
            <h2 style={{
              margin: '0 0 10px',
              'font-size': '24px',
              'font-weight': '600'
            }}>Loading Canvas</h2>
            
            <p style={{
              margin: 0,
              'font-size': '16px',
              opacity: 0.8
            }}>{loadingMessage()}</p>
          </div>
        </div>
      )}
      
      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, cursor: isDrawing() ? 'crosshair' : (isPanning() ? 'grabbing' : 'grab') }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* UI Overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 'pointer-events': 'none' }}>
        {/* Minimap */}
        <div style={{ 
          position: 'absolute', 
          bottom: '20px', 
          right: '20px', 
          background: 'rgba(0,0,0,0.7)', 
          padding: '2px',
          'border-radius': '10px',
          'pointer-events': 'auto',
          'box-shadow': '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}>
          <canvas
            ref={minimapRef}
            style={{ 
              'border-radius': '8px',
              cursor: 'pointer', 
              display: 'block',
              opacity: 0.8
            }}
            onClick={handleMinimapClick}
          />
        </div>
        
      </div>
    </div>
  );
}