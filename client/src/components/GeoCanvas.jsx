import { onMount, createSignal, createEffect, onCleanup } from 'solid-js';
import { mapService } from '../services/mapService';

export function GeoCanvas(props) {
  let canvasRef;
  let drawingCanvasRef;
  let mapCanvasRef;
  
  // Location and map state
  const [userLocation, setUserLocation] = createSignal(null);
  const [currentBounds, setCurrentBounds] = createSignal(null);
  const [mapZoom, setMapZoom] = createSignal(21); // Room-level zoom for ultra-local drawing
  const [isLoadingLocation, setIsLoadingLocation] = createSignal(true);
  const [locationName, setLocationName] = createSignal('');
  
  // Search state
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal([]);
  const [isSearching, setIsSearching] = createSignal(false);
  
  // Drawing state (reuse from SimpleWorldCanvas)
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [viewport, setViewport] = createSignal({ x: 0, y: 0 });
  
  // Drawing paths
  const [drawnPaths, setDrawnPaths] = createSignal([]);
  const [remotePaths, setRemotePaths] = createSignal(new Map());
  
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
    
    // Add keyboard controls for zooming
    const handleKeyDown = (e) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const currentTarget = targetZoom();
        setTargetZoom(Math.min(mapService.maxZoom, currentTarget + 0.5));
        
        // Zoom to center of viewport
        const centerX = canvasRef.width / 2;
        const centerY = canvasRef.height / 2;
        const vp = viewport();
        const centerWorldX = centerX + vp.x;
        const centerWorldY = centerY + vp.y;
        const centerLatLng = mapService.worldPixelToLatLng(centerWorldX, centerWorldY, mapZoom());
        
        if (!zoomAnimationFrame) {
          animateZoom(centerX, centerY, centerLatLng);
        }
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const currentTarget = targetZoom();
        setTargetZoom(Math.max(mapService.minZoom, currentTarget - 0.5));
        
        // Zoom to center of viewport
        const centerX = canvasRef.width / 2;
        const centerY = canvasRef.height / 2;
        const vp = viewport();
        const centerWorldX = centerX + vp.x;
        const centerWorldY = centerY + vp.y;
        const centerLatLng = mapService.worldPixelToLatLng(centerWorldX, centerWorldY, mapZoom());
        
        if (!zoomAnimationFrame) {
          animateZoom(centerX, centerY, centerLatLng);
        }
      } else if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
        // Open search with / or Ctrl+K
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'Escape') {
        // Close search
        if (showSearch()) {
          setShowSearch(false);
          setSearchQuery('');
          setSearchResults([]);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
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
    
    const zoom = mapZoom();
    
    // Calculate fade factor for smooth transition
    const fadeStart = mapService.drawingMinZoom - 1;
    const fadeEnd = mapService.drawingMinZoom;
    const mapOpacity = zoom >= fadeEnd ? 0 : zoom <= fadeStart ? 1 : (fadeEnd - zoom) / (fadeEnd - fadeStart);
    
    // Always render background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    
    // Render map tiles with opacity
    if (mapOpacity > 0) {
      renderMapTiles(mapCtx);
      ctx.globalAlpha = mapOpacity;
      ctx.drawImage(mapCanvasRef, 0, 0);
      ctx.globalAlpha = 1;
      
      // When very zoomed out, show heatmap overlay
      if (zoom <= 10) {
        renderHeatmapOverlay(ctx);
      }
    }
    
    // Add grid in drawing mode
    if (zoom >= mapService.drawingMinZoom) {
      // Fade in grid as map fades out
      const gridOpacity = 1 - mapOpacity;
      ctx.globalAlpha = gridOpacity;
      renderDrawingGrid(ctx);
      ctx.globalAlpha = 1;
    }
    
    // Always render drawings on top
    renderDrawings(drawCtx);
    ctx.drawImage(drawingCanvasRef, 0, 0);
  }
  
  // Render map tiles
  function renderMapTiles(ctx) {
    const vp = viewport();
    const zoom = mapZoom();
    const integerZoom = Math.floor(zoom);
    const fractionalZoom = zoom - integerZoom;
    
    // Calculate scale for fractional zoom
    const fractionalScale = Math.pow(2, fractionalZoom);
    
    // Handle overzooming - scale tiles if beyond max tile zoom
    const isOverzoomed = integerZoom > mapService.tileMaxZoom;
    const zoomDiff = integerZoom - mapService.tileMaxZoom;
    const overzoomScale = isOverzoomed ? Math.pow(2, zoomDiff) : 1;
    const totalScale = overzoomScale * fractionalScale;
    const scaledTileSize = mapService.tileSize * totalScale;
    
    // Apply image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    loadedTiles().forEach(({ img, tile }) => {
      // For overzoomed tiles, we need to render the lower zoom tiles scaled up
      const tileShouldRender = isOverzoomed 
        ? tile.zoom === mapService.tileMaxZoom
        : tile.zoom === integerZoom;
        
      if (!tileShouldRender) return;
      
      // Calculate tile position in world pixels with fractional zoom adjustment
      const baseTileSize = mapService.tileSize * overzoomScale;
      const tileWorldX = tile.x * baseTileSize * fractionalScale;
      const tileWorldY = tile.y * baseTileSize * fractionalScale;
      
      // Convert to canvas coordinates
      const canvasX = tileWorldX - vp.x;
      const canvasY = tileWorldY - vp.y;
      
      // Only render if visible
      if (canvasX + scaledTileSize >= 0 && 
          canvasX < canvasRef.width &&
          canvasY + scaledTileSize >= 0 && 
          canvasY < canvasRef.height) {
        ctx.drawImage(img, canvasX, canvasY, scaledTileSize, scaledTileSize);
      }
    });
    
    ctx.imageSmoothingEnabled = true;
  }
  
  // Render drawings
  function renderDrawings(ctx) {
    ctx.clearRect(0, 0, drawingCanvasRef.width, drawingCanvasRef.height);
    
    const vp = viewport();
    const zoom = mapZoom();
    
    // Render all paths
    const allPaths = [...drawnPaths(), ...Array.from(remotePaths().values())];
    
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
  
  // Render subtle grid for drawing mode
  function renderDrawingGrid(ctx) {
    const zoom = mapZoom();
    const vp = viewport();
    
    // Grid spacing based on zoom (roughly 1 meter grid)
    const location = userLocation();
    const lat = location ? location.lat : 0;
    const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    const gridSpacing = Math.max(20, 1 / metersPerPixel); // 1 meter grid, min 20px
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.lineWidth = 1;
    
    // Vertical lines
    const startX = Math.floor(vp.x / gridSpacing) * gridSpacing - vp.x;
    for (let x = startX; x < canvasRef.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasRef.height);
      ctx.stroke();
    }
    
    // Horizontal lines
    const startY = Math.floor(vp.y / gridSpacing) * gridSpacing - vp.y;
    for (let y = startY; y < canvasRef.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasRef.width, y);
      ctx.stroke();
    }
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
      
      // Adjust brush size based on zoom for consistent physical size
      const zoomAdjustedSize = (props.brushSize || 3) * Math.pow(2, 21 - zoom) * 0.5;
      
      // Start new path
      const newPath = {
        color: props.color || '#000000',
        size: zoomAdjustedSize,
        points: [latLng]
      };
      setDrawnPaths(prev => [...prev, newPath]);
      
      // Send draw start
      sendThrottledDraw({
        drawType: 'start',
        lat: latLng.lat,
        lng: latLng.lng,
        color: props.color || '#000000',
        size: zoomAdjustedSize
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
      
      // Send draw update with zoom-adjusted size
      const zoomAdjustedSize = (props.brushSize || 3) * Math.pow(2, 21 - zoom) * 0.5;
      sendThrottledDraw({
        drawType: 'draw',
        lat: latLng.lat,
        lng: latLng.lng,
        color: props.color || '#000000',
        size: zoomAdjustedSize
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
  
  // Smooth zoom animation state
  const [targetZoom, setTargetZoom] = createSignal(21);
  const [zoomVelocity, setZoomVelocity] = createSignal(0);
  let zoomAnimationFrame = null;
  
  function handleWheel(e) {
    e.preventDefault();
    
    // Calculate zoom delta with sensitivity adjustment
    const zoomSensitivity = 0.001; // Reduced for slower zoom
    const delta = e.deltaY * zoomSensitivity;
    
    // Update target zoom with fractional values
    const currentTarget = targetZoom();
    const newTarget = Math.max(mapService.minZoom, Math.min(mapService.maxZoom, currentTarget - delta));
    setTargetZoom(newTarget);
    
    // Get mouse position for zoom centering
    const rect = canvasRef.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Store mouse position for smooth zoom
    if (!zoomAnimationFrame) {
      const vp = viewport();
      const mouseWorldX = mouseX + vp.x;
      const mouseWorldY = mouseY + vp.y;
      const currentZoom = mapZoom();
      const mouseLatLng = mapService.worldPixelToLatLng(mouseWorldX, mouseWorldY, currentZoom);
      
      animateZoom(mouseX, mouseY, mouseLatLng);
    }
  }
  
  function animateZoom(mouseX, mouseY, mouseLatLng) {
    const animate = () => {
      const current = mapZoom();
      const target = targetZoom();
      const diff = target - current;
      
      // Stop animation if close enough
      if (Math.abs(diff) < 0.01) {
        if (zoomAnimationFrame) {
          cancelAnimationFrame(zoomAnimationFrame);
          zoomAnimationFrame = null;
        }
        return;
      }
      
      // Smooth interpolation
      const smoothing = 0.08; // Reduced for smoother zoom animation
      const newZoom = current + diff * smoothing;
      
      // Update zoom and viewport
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
      
      // Send viewport update only occasionally during zoom
      if (Math.abs(diff) < 0.5 || Math.floor(current) !== Math.floor(newZoom)) {
        sendViewportUpdate();
      }
      
      // Continue animation
      zoomAnimationFrame = requestAnimationFrame(animate);
    };
    
    zoomAnimationFrame = requestAnimationFrame(animate);
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
      
      // Send initial viewport update if connected
      if (props.connected && currentBounds()) {
        sendViewportUpdate();
      }
      
      onCleanup(() => {
        cleanup1();
        cleanup2();
        cleanup3();
      });
    }
  });
  
  function handleRemoteGeoDraw(data) {
    console.log('[RemoteGeoDraw] Received:', data.drawType, 'from', data.clientId);
    
    switch(data.drawType) {
      case 'start':
        setRemotePaths(prev => {
          const next = new Map(prev);
          next.set(data.clientId, {
            color: data.color || '#000000',
            size: data.size || 3,
            points: [{ lat: data.lat, lng: data.lng }]
          });
          return next;
        });
        break;
        
      case 'draw':
        setRemotePaths(prev => {
          const next = new Map(prev);
          let path = next.get(data.clientId);
          if (!path) {
            path = {
              color: data.color || '#000000',
              size: data.size || 3,
              points: []
            };
            next.set(data.clientId, path);
          }
          path.points.push({ lat: data.lat, lng: data.lng });
          return next;
        });
        break;
        
      case 'end':
        setRemotePaths(prev => {
          const next = new Map(prev);
          const finishedPath = next.get(data.clientId);
          if (finishedPath && finishedPath.points.length > 1) {
            setDrawnPaths(paths => [...paths, { ...finishedPath }]);
          }
          next.delete(data.clientId);
          return next;
        });
        break;
    }
    
    renderCanvas();
  }
  
  // Request geo drawings when connected and viewport is ready
  createEffect(() => {
    if (props.connected && currentBounds()) {
      console.log('[GeoCanvas] Connected with bounds, requesting geo drawings');
      sendViewportUpdate();
    }
  });
  
  // Re-render when remote paths change
  createEffect(() => {
    // Trigger on remotePaths change
    remotePaths();
    renderCanvas();
  });
  
  onCleanup(() => {
    if (drawingThrottle.timeoutId) {
      clearTimeout(drawingThrottle.timeoutId);
    }
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
    if (zoomAnimationFrame) {
      cancelAnimationFrame(zoomAnimationFrame);
    }
  });
  
  // Search for places
  async function handleSearch() {
    const query = searchQuery().trim();
    if (!query || isSearching()) return;
    
    setIsSearching(true);
    try {
      const results = await mapService.searchPlaces(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    }
    setIsSearching(false);
  }
  
  // Navigate to a search result
  function navigateToPlace(place) {
    console.log(`📍 Navigating to ${place.name}`);
    
    const targetLat = place.lat;
    const targetLng = place.lng;
    const targetZoomLevel = 18; // Street level to see drawings
    
    // Update location name immediately
    setLocationName(place.city || place.name.split(',')[0]);
    
    // Close search
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    
    // Animate to the new location
    animateToLocation(targetLat, targetLng, targetZoomLevel);
    
    // Notify server of new location
    if (props.wsManager) {
      props.wsManager.send({
        type: 'setLocation',
        location: { lat: targetLat, lng: targetLng, zoom: targetZoomLevel }
      });
    }
  }
  
  // Animate smoothly to a new location
  function animateToLocation(targetLat, targetLng, targetZoomLevel) {
    // Set target zoom
    setTargetZoom(targetZoomLevel);
    
    // Get current and target positions
    const currentZoom = mapZoom();
    const vp = viewport();
    const currentCenter = mapService.worldPixelToLatLng(
      vp.x + canvasRef.width / 2,
      vp.y + canvasRef.height / 2,
      currentZoom
    );
    
    // Animation parameters
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    const startLat = currentCenter.lat;
    const startLng = currentCenter.lng;
    const startZoom = currentZoom;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate position and zoom
      const currentLat = startLat + (targetLat - startLat) * eased;
      const currentLng = startLng + (targetLng - startLng) * eased;
      const currentZoom = startZoom + (targetZoomLevel - startZoom) * eased;
      
      // Update viewport
      setMapZoom(currentZoom);
      updateViewport(currentLat, currentLng, currentZoom);
      
      // Continue animation
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }

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
              ? 'grab' 
              : 'crosshair'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* Location and zoom indicator with search button */}
      {locationName() && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          'align-items': 'center',
          gap: '15px'
        }}>
          <button
            onClick={() => setShowSearch(!showSearch())}
            style={{
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '10px 15px',
              'border-radius': '20px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              'align-items': 'center',
              gap: '8px',
              'font-size': '14px',
              'backdrop-filter': 'blur(10px)',
              transition: 'all 0.2s',
              '&:hover': {
                background: 'rgba(0, 0, 0, 0.9)'
              }
            }}
          >
            🔍 Search Places
          </button>
          
          <div style={{
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px 20px',
            'border-radius': '20px',
            'font-size': '14px',
            'backdrop-filter': 'blur(10px)',
            'pointer-events': 'none'
          }}>
            {mapZoom() >= mapService.drawingMinZoom ? (
              <>
                ✏️ Drawing at {locationName()} • Zoom: {mapZoom().toFixed(1)}
                <span style={{ color: '#4ade80', 'margin-left': '10px' }}>
                  (~{Math.pow(2, 22 - mapZoom()).toFixed(1)}m precision)
                </span>
              </>
            ) : (
              <>
                🗺️ Exploring {locationName()} • Zoom: {mapZoom().toFixed(1)}
                <span style={{ color: '#60a5fa', 'margin-left': '10px' }}>
                  (Zoom to {mapService.drawingMinZoom}+ to draw)
                </span>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Search UI */}
      {showSearch() && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '400px',
          background: 'rgba(0, 0, 0, 0.9)',
          'border-radius': '15px',
          padding: '20px',
          'backdrop-filter': 'blur(10px)',
          'box-shadow': '0 4px 30px rgba(0, 0, 0, 0.5)',
          'z-index': 1000
        }}>
          <div style={{ display: 'flex', gap: '10px', 'margin-bottom': '15px' }}>
            <input
              type="text"
              placeholder="Search for a place..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              style={{
                flex: 1,
                padding: '10px 15px',
                'border-radius': '10px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                'font-size': '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSearch}
              disabled={isSearching()}
              style={{
                padding: '10px 20px',
                'border-radius': '10px',
                border: 'none',
                background: '#4ade80',
                color: 'black',
                'font-weight': 'bold',
                cursor: isSearching() ? 'not-allowed' : 'pointer',
                opacity: isSearching() ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              {isSearching() ? '...' : 'Search'}
            </button>
          </div>
          
          {searchResults().length > 0 && (
            <div style={{ 'max-height': '300px', 'overflow-y': 'auto' }}>
              {searchResults().map(place => (
                <button
                  onClick={() => navigateToPlace(place)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    'margin-bottom': '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    'border-radius': '8px',
                    color: 'white',
                    'text-align': 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      background: 'rgba(255, 255, 255, 0.1)'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  <div style={{ 'font-size': '14px', 'font-weight': '500' }}>
                    📍 {place.city || place.type || 'Location'}
                  </div>
                  <div style={{ 'font-size': '12px', opacity: 0.7, 'margin-top': '4px' }}>
                    {place.name}
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {searchResults().length === 0 && searchQuery() && !isSearching() && (
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.5)', 
              'text-align': 'center',
              padding: '20px'
            }}>
              No results found
            </div>
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
        {mapZoom() >= mapService.drawingMinZoom ? (
          <>
            <div>✏️ Drawing Mode</div>
            <div>🖱️ Click & drag to draw</div>
            <div>⇧ + Drag to move</div>
            <div>🔍 Scroll to zoom</div>
            <div>⌨️ +/- keys to zoom</div>
            <div>/ Search places</div>
          </>
        ) : (
          <>
            <div>🗺️ Exploration Mode</div>
            <div>🖱️ Drag to explore</div>
            <div>🔍 Zoom in to draw</div>
            <div>⌨️ +/- keys to zoom</div>
            <div>/ Search places</div>
          </>
        )}
      </div>
    </div>
  );
}