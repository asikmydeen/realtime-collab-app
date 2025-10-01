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
  
  // Drawn content storage
  const drawnPaths = [];
  const remotePaths = new Map(); // clientId -> current path
  
  // Space allocation
  const [mySpace, setMySpace] = createSignal(null);
  const [remoteSpaces, setRemoteSpaces] = createSignal(new Map());
  
  // Debug mode - show all received messages
  const [debugMode, setDebugMode] = createSignal(true);
  const [receivedCount, setReceivedCount] = createSignal(0);
  
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
        ws.send({
          type: 'requestSpace',
          viewportWidth: canvasRef.width,
          viewportHeight: canvasRef.height
        });
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
      }, 500);
    });
    
    // Handle remote drawing
    const cleanup2 = ws.on('remoteDraw', (data) => {
      console.log('🎨 Received remoteDraw:', data);
      setReceivedCount(prev => prev + 1);
      
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
            drawnPaths.push(finishedPath);
          }
          remotePaths.delete(data.clientId);
          break;
      }
      
      renderCanvas();
      renderMinimap();
    });
    
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
    
    // Store cleanup functions
    wsCleanups = [cleanup1, cleanup2, cleanup3];
  }
  
  function setupCanvas() {
    const parent = canvasRef.parentElement;
    canvasRef.width = parent.clientWidth;
    canvasRef.height = parent.clientHeight;
    console.log('Canvas size:', canvasRef.width, 'x', canvasRef.height);
    
    // Setup minimap
    minimapRef.width = 200;
    minimapRef.height = 200;
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
    
    drawnPaths.forEach(path => {
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
    
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
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
    
    // Origin lines
    ctx.strokeStyle = '#ff000020';
    ctx.lineWidth = 2;
    
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
    const vp = viewport();
    
    // Position indicator
    ctx.fillStyle = '#000000';
    ctx.font = '14px Arial';
    ctx.fillText(`Position: (${Math.round(vp.x)}, ${Math.round(vp.y)}) Zoom: ${vp.zoom.toFixed(2)}x`, 10, 25);
    
    // Show space info if assigned
    const space = mySpace();
    if (space) {
      ctx.fillText(`Your space: (${Math.round(space.x)}, ${Math.round(space.y)})`, 10, 45);
    }
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
    const size = 200;
    const worldSize = 5000;
    const vp = viewport();
    
    // Clear
    ctx.fillStyle = '#2a2a2a';
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
    drawnPaths.forEach(path => {
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
  
  // Mouse handlers
  function handleMouseDown(e) {
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
      drawnPaths.push({
        color: props.color || '#000000',
        size: props.brushSize || 3,
        points: [{ x: worldX, y: worldY }]
      });
      
      // Don't include 'type' since sendDraw adds it
      props.onDraw?.({ 
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
    if (isPanning()) {
      const vp = viewport();
      setViewport({
        x: panStart().x - e.clientX,
        y: panStart().y - e.clientY,
        zoom: vp.zoom
      });
      renderCanvas();
      renderMinimap();
    } else if (isDrawing()) {
      const vp = viewport();
      const worldX = e.offsetX / vp.zoom + vp.x;
      const worldY = e.offsetY / vp.zoom + vp.y;
      
      // Add point to current path
      const currentPath = drawnPaths[drawnPaths.length - 1];
      currentPath.points.push({ x: worldX, y: worldY });
      
      props.onDraw?.({ 
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
      props.onDraw?.({ drawType: 'end' });
    }
    
    setIsPanning(false);
    setIsDrawing(false);
  }
  
  function handleWheel(e) {
    e.preventDefault();
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
  }
  
  // Minimap navigation
  function handleMinimapClick(e) {
    const rect = minimapRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const worldSize = 5000;
    const worldX = (x / 200) * worldSize - worldSize/2;
    const worldY = (y / 200) * worldSize - worldSize/2;
    
    // Center viewport on clicked position
    const vp = viewport();
    setViewport({
      x: worldX - canvasRef.width / vp.zoom / 2,
      y: worldY - canvasRef.height / vp.zoom / 2,
      zoom: vp.zoom
    });
    
    renderCanvas();
    renderMinimap();
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
    // Release space on cleanup
    props.wsManager?.send({ type: 'releaseSpace' });
  });
  
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
    },
    getViewport: () => viewport()
  });
  
  // Add connection status
  const isConnected = () => props.wsManager && props.wsManager.ws && props.wsManager.ws.readyState === 1;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Connection Status */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: 'rgba(0,0,0,0.9)',
        color: 'white',
        padding: '15px',
        'border-radius': '8px',
        'z-index': 1000,
        'min-width': '200px'
      }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '10px' }}>
          {isConnected() ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
        <div style={{ 'font-size': '12px' }}>
          <div>Received: {receivedCount()} messages</div>
          <div>Drawn paths: {drawnPaths.length}</div>
          <div>Active remote: {remotePaths.size}</div>
          {mySpace() && (
            <div>Space: ({Math.round(mySpace().x)}, {Math.round(mySpace().y)})</div>
          )}
        </div>
      </div>
      
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
          top: '20px', 
          right: '20px', 
          background: 'rgba(0,0,0,0.8)', 
          padding: '10px',
          'border-radius': '8px',
          'pointer-events': 'auto'
        }}>
          <h4 style={{ color: 'white', margin: '0 0 10px 0', 'font-size': '14px' }}>World Map</h4>
          <canvas
            ref={minimapRef}
            style={{ border: '2px solid #444', cursor: 'pointer', display: 'block' }}
            onClick={handleMinimapClick}
          />
        </div>
        
        {/* Controls */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '15px',
          'border-radius': '8px',
          'font-size': '14px',
          'pointer-events': 'auto'
        }}>
          <div>🖱️ Click + Drag to draw</div>
          <div>⇧ Shift + Drag to pan</div>
          <div>🔍 Scroll to zoom</div>
          <div style={{ 'margin-top': '10px' }}>
            <button 
              style={{
                padding: '5px 10px',
                'margin-right': '5px',
                background: '#4ade80',
                border: 'none',
                'border-radius': '4px',
                cursor: 'pointer'
              }}
              onClick={() => {
                // Go to origin
                setViewport({ x: -400, y: -300, zoom: 1 });
                renderCanvas();
                renderMinimap();
              }}
            >
              Go to Origin (0,0)
            </button>
            <button 
              style={{
                padding: '5px 10px',
                background: '#3b82f6',
                border: 'none',
                'border-radius': '4px',
                cursor: 'pointer'
              }}
              onClick={() => {
                // Find any drawn content
                if (drawnPaths.length > 0) {
                  const lastPath = drawnPaths[drawnPaths.length - 1];
                  const lastPoint = lastPath.points[lastPath.points.length - 1];
                  setViewport({
                    x: lastPoint.x - 400,
                    y: lastPoint.y - 300,
                    zoom: 1
                  });
                  renderCanvas();
                  renderMinimap();
                }
              }}
            >
              Find Drawings
            </button>
            <button 
              style={{
                padding: '5px 10px',
                'margin-left': '5px',
                background: '#ef4444',
                border: 'none',
                'border-radius': '4px',
                cursor: 'pointer'
              }}
              onClick={() => {
                // Debug: manually emit a test draw
                console.log('[Debug] Testing remoteDraw handler...');
                props.wsManager?.emit('remoteDraw', {
                  clientId: 'test-client',
                  drawType: 'start',
                  x: 100,
                  y: 100,
                  color: '#ff0000',
                  size: 10
                });
              }}
            >
              Test Draw Event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}