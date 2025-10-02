import { onMount, createSignal, createEffect, onCleanup } from 'solid-js';
import { mapService } from '../services/mapService';

export function GeoCanvas(props) {
  let canvasRef;
  let drawingCanvasRef;
  let mapCanvasRef;
  
  // Location and map state
  const [userLocation, setUserLocation] = createSignal(null);
  const [currentBounds, setCurrentBounds] = createSignal(null);
  const [mapZoom, setMapZoom] = createSignal(18); // Very zoomed in for local drawing
  const [isLoadingLocation, setIsLoadingLocation] = createSignal(true);
  const [locationName, setLocationName] = createSignal('');
  
  // Drawing state (reuse from SimpleWorldCanvas)
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [viewport, setViewport] = createSignal({ x: 0, y: 0 });
  
  // Drawing paths
  const [drawnPaths, setDrawnPaths] = createSignal([]);
  const remotePaths = new Map();
  
  // Tiles state
  const [loadedTiles, setLoadedTiles] = createSignal(new Map());
  const [tilesLoading, setTilesLoading] = createSignal(new Set());
  
  // Drawing throttle (reuse from SimpleWorldCanvas)
  const drawingThrottle = {
    lastSendTime: 0,
    throttleMs: 50,
    pendingPoints: [],
    timeoutId: null
  };
  
  onMount(async () => {
    setupCanvas();
    await getUserLocation();
  });
  
  // Get user's location
  async function getUserLocation() {
    setIsLoadingLocation(true);
    
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        });
        
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        setUserLocation({ lat, lng });
        console.log(`📍 User location: ${lat}, ${lng}`);
        
        // Get location name
        const location = await mapService.getLocationName(lat, lng);
        if (location) {
          const name = location.city || location.state || location.country || 'Unknown Location';
          setLocationName(name);
          console.log(`📍 Location name: ${name}`);
        }
        
        // Calculate initial viewport
        updateViewport(lat, lng, mapZoom());
        
        // Notify server of user's location
        if (props.wsManager) {
          props.wsManager.send({
            type: 'setLocation',
            location: { lat, lng, zoom: mapZoom() }
          });
        }
        
      } catch (error) {
        console.error('Failed to get location:', error);
        // Fallback to IP-based location or default
        await fallbackLocation();
      }
    } else {
      await fallbackLocation();
    }
    
    setIsLoadingLocation(false);
  }
  
  // Fallback location using IP geolocation
  async function fallbackLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        
        setUserLocation({ lat, lng });
        setLocationName(data.city || data.country_name || 'Unknown Location');
        updateViewport(lat, lng, mapZoom());
        
        if (props.wsManager) {
          props.wsManager.send({
            type: 'setLocation',
            location: { lat, lng, zoom: mapZoom() }
          });
        }
      }
    } catch (error) {
      console.error('Fallback location failed:', error);
      // Default to world center
      setUserLocation({ lat: 0, lng: 0 });
      setLocationName('World');
      updateViewport(0, 0, 2);
    }
  }
  
  // Update viewport based on location
  function updateViewport(lat, lng, zoom) {
    const bounds = mapService.getViewportBounds(
      lat, lng, 
      canvasRef.width, 
      canvasRef.height, 
      zoom
    );
    
    setCurrentBounds(bounds);
    setMapZoom(zoom);
    
    // Convert to pixel coordinates for drawing
    const worldPixel = mapService.latLngToWorldPixel(lat, lng, zoom);
    setViewport({
      x: worldPixel.x - canvasRef.width / 2,
      y: worldPixel.y - canvasRef.height / 2
    });
    
    // Load map tiles
    loadTilesForCurrentView();
    
    // Send viewport update
    sendViewportUpdate();
  }
  
  // Load map tiles for current view
  async function loadTilesForCurrentView() {
    const bounds = currentBounds();
    if (!bounds) return;
    
    const tiles = mapService.getTilesForViewport(bounds, mapZoom());
    const loading = new Set(tilesLoading());
    
    for (const tile of tiles) {
      const key = `${tile.zoom}/${tile.x}/${tile.y}`;
      if (!loadedTiles().has(key) && !loading.has(key)) {
        loading.add(key);
        
        mapService.loadTile(tile.x, tile.y, tile.zoom)
          .then(img => {
            setLoadedTiles(prev => {
              const next = new Map(prev);
              next.set(key, { img, tile });
              return next;
            });
            renderCanvas();
          })
          .catch(err => {
            console.error('Failed to load tile:', err);
          })
          .finally(() => {
            setTilesLoading(prev => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          });
      }
    }
  }
  
  // Setup canvas
  function setupCanvas() {
    const parent = canvasRef.parentElement;
    canvasRef.width = parent.clientWidth;
    canvasRef.height = parent.clientHeight;
    
    // Also setup drawing canvas
    drawingCanvasRef.width = canvasRef.width;
    drawingCanvasRef.height = canvasRef.height;
    
    mapCanvasRef.width = canvasRef.width;
    mapCanvasRef.height = canvasRef.height;
    
    renderCanvas();
  }
  
  // Render everything
  function renderCanvas() {
    const ctx = canvasRef.getContext('2d');
    const mapCtx = mapCanvasRef.getContext('2d');
    const drawCtx = drawingCanvasRef.getContext('2d');
    
    // Clear canvases
    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
    mapCtx.clearRect(0, 0, mapCanvasRef.width, mapCanvasRef.height);
    
    // Render map tiles
    renderMapTiles(mapCtx);
    
    // Composite map onto main canvas
    ctx.drawImage(mapCanvasRef, 0, 0);
    
    // When zoomed out enough, show heatmap overlay
    if (mapZoom() <= 10) {
      renderHeatmapOverlay(ctx);
    }
    
    // Render drawings on top
    renderDrawings(drawCtx);
    ctx.drawImage(drawingCanvasRef, 0, 0);
  }
  
  // Render map tiles
  function renderMapTiles(ctx) {
    const vp = viewport();
    const zoom = mapZoom();
    
    loadedTiles().forEach(({ img, tile }) => {
      if (tile.zoom !== zoom) return;
      
      // Calculate tile position in world pixels
      const tileWorldX = tile.x * mapService.tileSize;
      const tileWorldY = tile.y * mapService.tileSize;
      
      // Convert to canvas coordinates
      const canvasX = tileWorldX - vp.x;
      const canvasY = tileWorldY - vp.y;
      
      // Only render if visible
      if (canvasX + mapService.tileSize >= 0 && 
          canvasX < canvasRef.width &&
          canvasY + mapService.tileSize >= 0 && 
          canvasY < canvasRef.height) {
        ctx.drawImage(img, canvasX, canvasY);
      }
    });
  }
  
  // Render drawings
  function renderDrawings(ctx) {
    ctx.clearRect(0, 0, drawingCanvasRef.width, drawingCanvasRef.height);
    
    const vp = viewport();
    const zoom = mapZoom();
    
    // Render all paths
    const allPaths = [...drawnPaths(), ...Array.from(remotePaths.values())];
    
    allPaths.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color || '#000000';
      ctx.lineWidth = path.size || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      path.points.forEach((point, i) => {
        // Convert lat/lng to canvas coordinates
        const worldPos = mapService.latLngToWorldPixel(point.lat, point.lng, zoom);
        const x = worldPos.x - vp.x;
        const y = worldPos.y - vp.y;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    });
  }
  
  // Render heatmap overlay for world view
  function renderHeatmapOverlay(ctx) {
    // This would show artwork density when zoomed out
    // For now, just add a subtle overlay effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    
    // TODO: Add actual heatmap visualization based on artwork density
  }
  
  // Mouse handlers
  function handleMouseDown(e) {
    if (e.shiftKey || e.button === 1) {
      // Pan mode
      setIsPanning(true);
      setPanStart({ 
        x: e.clientX + viewport().x, 
        y: e.clientY + viewport().y 
      });
    } else if (e.button === 0) {
      // Draw mode - only allow when zoomed in enough
      const zoom = mapZoom();
      
      if (zoom < mapService.drawingMinZoom) {
        // Show a message that they need to zoom in more
        console.log(`Please zoom in to at least zoom level ${mapService.drawingMinZoom} to draw`);
        return;
      }
      
      const vp = viewport();
      
      // Convert mouse position to lat/lng
      const worldX = e.offsetX + vp.x;
      const worldY = e.offsetY + vp.y;
      const latLng = mapService.worldPixelToLatLng(worldX, worldY, zoom);
      
      setIsDrawing(true);
      
      // Start new path
      const newPath = {
        color: props.color || '#000000',
        size: props.brushSize || 3,
        points: [latLng]
      };
      setDrawnPaths(prev => [...prev, newPath]);
      
      // Send draw start
      sendThrottledDraw({
        drawType: 'start',
        lat: latLng.lat,
        lng: latLng.lng,
        color: props.color || '#000000',
        size: props.brushSize || 3
      });
    }
  }
  
  function handleMouseMove(e) {
    if (isPanning()) {
      const newX = panStart().x - e.clientX;
      const newY = panStart().y - e.clientY;
      
      setViewport({ x: newX, y: newY });
      
      // Reload tiles for new position
      const newCenter = mapService.worldPixelToLatLng(
        newX + canvasRef.width / 2,
        newY + canvasRef.height / 2,
        mapZoom()
      );
      
      // Update bounds without changing viewport
      const bounds = mapService.getViewportBounds(
        newCenter.lat, 
        newCenter.lng,
        canvasRef.width,
        canvasRef.height,
        mapZoom()
      );
      
      setCurrentBounds(bounds);
      loadTilesForCurrentView();
      renderCanvas();
      sendViewportUpdate();
    } else if (isDrawing()) {
      const vp = viewport();
      const zoom = mapZoom();
      
      // Convert to lat/lng
      const worldX = e.offsetX + vp.x;
      const worldY = e.offsetY + vp.y;
      const latLng = mapService.worldPixelToLatLng(worldX, worldY, zoom);
      
      // Add point to current path
      setDrawnPaths(prev => {
        const paths = [...prev];
        if (paths.length > 0) {
          const currentPath = paths[paths.length - 1];
          currentPath.points.push(latLng);
        }
        return paths;
      });
      
      // Send draw update
      sendThrottledDraw({
        drawType: 'draw',
        lat: latLng.lat,
        lng: latLng.lng,
        color: props.color || '#000000',
        size: props.brushSize || 3
      });
      
      renderCanvas();
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
    const currentZoom = mapZoom();
    const newZoom = e.deltaY > 0 
      ? Math.max(mapService.minZoom, currentZoom - 1)
      : Math.min(mapService.maxZoom, currentZoom + 1);
    
    if (newZoom !== currentZoom) {
      // Get mouse position relative to canvas
      const rect = canvasRef.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Get current center
      const vp = viewport();
      const currentCenterX = vp.x + canvasRef.width / 2;
      const currentCenterY = vp.y + canvasRef.height / 2;
      
      // Convert mouse position to world coordinates at current zoom
      const mouseWorldX = mouseX + vp.x;
      const mouseWorldY = mouseY + vp.y;
      const mouseLatLng = mapService.worldPixelToLatLng(mouseWorldX, mouseWorldY, currentZoom);
      
      // Recalculate viewport to keep mouse position fixed
      const newWorldPos = mapService.latLngToWorldPixel(mouseLatLng.lat, mouseLatLng.lng, newZoom);
      const newViewportX = newWorldPos.x - mouseX;
      const newViewportY = newWorldPos.y - mouseY;
      
      setViewport({ x: newViewportX, y: newViewportY });
      setMapZoom(newZoom);
      
      // Update bounds
      const newCenter = mapService.worldPixelToLatLng(
        newViewportX + canvasRef.width / 2,
        newViewportY + canvasRef.height / 2,
        newZoom
      );
      
      const bounds = mapService.getViewportBounds(
        newCenter.lat,
        newCenter.lng,
        canvasRef.width,
        canvasRef.height,
        newZoom
      );
      
      setCurrentBounds(bounds);
      loadTilesForCurrentView();
      renderCanvas();
      sendViewportUpdate();
    }
  }
  
  // Throttled draw send (reuse from SimpleWorldCanvas)
  function sendThrottledDraw(drawData) {
    const now = Date.now();
    
    if (drawData.drawType === 'start' || drawData.drawType === 'end') {
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
      
      if (drawingThrottle.pendingPoints.length > 0) {
        drawingThrottle.pendingPoints.forEach(point => {
          props.onDraw?.(point);
        });
        drawingThrottle.pendingPoints = [];
      }
      
      props.onDraw?.(drawData);
      drawingThrottle.lastSendTime = now;
      return;
    }
    
    drawingThrottle.pendingPoints.push(drawData);
    
    if (now - drawingThrottle.lastSendTime >= drawingThrottle.throttleMs) {
      drawingThrottle.pendingPoints.forEach(point => {
        props.onDraw?.(point);
      });
      drawingThrottle.pendingPoints = [];
      drawingThrottle.lastSendTime = now;
      
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
    } else if (!drawingThrottle.timeoutId) {
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
  
  // Send viewport update
  let viewportUpdateTimeout;
  function sendViewportUpdate() {
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
    
    viewportUpdateTimeout = setTimeout(() => {
      if (props.wsManager && currentBounds()) {
        const bounds = currentBounds();
        props.wsManager.send({
          type: 'updateGeoViewport',
          viewport: {
            bounds,
            zoom: mapZoom(),
            center: {
              lat: bounds.centerLat,
              lng: bounds.centerLng
            }
          }
        });
      }
    }, 200);
  }
  
  // WebSocket handlers
  createEffect(() => {
    if (props.wsManager) {
      // Handle remote geo-drawing
      const cleanup1 = props.wsManager.on('remoteGeoDraw', (data) => {
        handleRemoteGeoDraw(data);
      });
      
      // Handle batch messages
      const cleanup2 = props.wsManager.on('batch', (data) => {
        data.messages.forEach(msg => {
          if (msg.type === 'remoteGeoDraw') {
            handleRemoteGeoDraw(msg);
          }
        });
      });
      
      // Handle geo drawing history
      const cleanup3 = props.wsManager.on('geoDrawingHistory', (data) => {
        console.log(`[GeoHistory] Received batch ${data.batchIndex + 1}/${data.totalBatches} with ${data.drawings.length} drawings`);
        
        // Add historical drawings
        const newPaths = data.drawings.map(drawing => ({
          color: drawing.color,
          size: drawing.size,
          points: drawing.points
        }));
        
        setDrawnPaths(prev => [...prev, ...newPaths]);
        renderCanvas();
      });
      
      onCleanup(() => {
        cleanup1();
        cleanup2();
        cleanup3();
      });
    }
  });
  
  function handleRemoteGeoDraw(data) {
    switch(data.drawType) {
      case 'start':
        remotePaths.set(data.clientId, {
          color: data.color || '#000000',
          size: data.size || 3,
          points: [{ lat: data.lat, lng: data.lng }]
        });
        break;
        
      case 'draw':
        let path = remotePaths.get(data.clientId);
        if (!path) {
          path = {
            color: data.color || '#000000',
            size: data.size || 3,
            points: []
          };
          remotePaths.set(data.clientId, path);
        }
        path.points.push({ lat: data.lat, lng: data.lng });
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
  }
  
  onCleanup(() => {
    if (drawingThrottle.timeoutId) {
      clearTimeout(drawingThrottle.timeoutId);
    }
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
  });
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {isLoadingLocation() && (
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
          'z-index': 2000
        }}>
          <div style={{ color: 'white', 'text-align': 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              margin: '0 auto 20px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              'border-top': '3px solid #4ade80',
              'border-radius': '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <h3>🌍 Finding your location...</h3>
            <p style={{ opacity: 0.7, 'margin-top': '10px' }}>
              We'll position you on the world canvas
            </p>
          </div>
        </div>
      )}
      
      {/* Map canvas (bottom layer) */}
      <canvas 
        ref={mapCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'none' }}
      />
      
      {/* Drawing canvas (middle layer) */}
      <canvas 
        ref={drawingCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'none' }}
      />
      
      {/* Main canvas (composited) */}
      <canvas 
        ref={canvasRef}
        style={{ 
          width: '100%', 
          height: '100%',
          cursor: isPanning() 
            ? 'grabbing' 
            : mapZoom() < mapService.drawingMinZoom 
              ? 'not-allowed' 
              : 'crosshair'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* Location and zoom indicator */}
      {locationName() && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px 20px',
          'border-radius': '20px',
          'font-size': '14px',
          'backdrop-filter': 'blur(10px)',
          'pointer-events': 'none'
        }}>
          📍 {locationName()} • Zoom: {mapZoom()}
          {mapZoom() < mapService.drawingMinZoom && (
            <span style={{ color: '#ef4444', 'margin-left': '10px' }}>
              (Zoom in to level {mapService.drawingMinZoom}+ to draw)
            </span>
          )}
        </div>
      )}
      
      {/* Navigation help */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        'border-radius': '10px',
        'font-size': '12px',
        opacity: 0.7
      }}>
        <div>🖱️ Draw on the map</div>
        <div>⇧ + Drag to pan</div>
        <div>🔍 Scroll to zoom</div>
      </div>
    </div>
  );
}