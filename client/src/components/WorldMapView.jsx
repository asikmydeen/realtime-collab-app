import { onMount, createSignal, createEffect, onCleanup } from 'solid-js';
import { mapService } from '../services/mapService';

export function WorldMapView(props) {
  let canvasRef;
  let heatmapCanvasRef;
  
  const [viewport, setViewport] = createSignal({ 
    lat: 20, // Slightly north for better land visibility
    lng: 0, 
    zoom: 2 // World view
  });
  
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [worldPixelStart, setWorldPixelStart] = createSignal({ x: 0, y: 0 });
  
  // Art activity data
  const [artHotspots, setArtHotspots] = createSignal([]);
  const [activeArtists, setActiveArtists] = createSignal(new Map());
  const [loadedTiles, setLoadedTiles] = createSignal(new Map());
  
  // Stats
  const [stats, setStats] = createSignal({
    totalArtists: 0,
    totalDrawings: 0,
    activeCountries: 0
  });
  
  onMount(() => {
    setupCanvas();
    loadWorldView();
    requestArtworkData();
  });
  
  function setupCanvas() {
    const parent = canvasRef.parentElement;
    canvasRef.width = parent.clientWidth;
    canvasRef.height = parent.clientHeight;
    heatmapCanvasRef.width = canvasRef.width;
    heatmapCanvasRef.height = canvasRef.height;
  }
  
  async function loadWorldView() {
    const vp = viewport();
    const bounds = mapService.getViewportBounds(
      vp.lat, vp.lng,
      canvasRef.width,
      canvasRef.height,
      vp.zoom
    );
    
    // Load world map tiles
    const tiles = mapService.getTilesForViewport(bounds, vp.zoom);
    
    for (const tile of tiles) {
      const key = `${tile.zoom}/${tile.x}/${tile.y}`;
      if (!loadedTiles().has(key)) {
        try {
          const img = await mapService.loadTile(tile.x, tile.y, tile.zoom);
          setLoadedTiles(prev => {
            const next = new Map(prev);
            next.set(key, { img, tile });
            return next;
          });
          renderCanvas();
        } catch (err) {
          console.error('Failed to load world tile:', err);
        }
      }
    }
  }
  
  function requestArtworkData() {
    if (props.wsManager) {
      props.wsManager.send({
        type: 'requestWorldArtwork',
        bounds: {
          north: 85,
          south: -85,
          west: -180,
          east: 180
        },
        aggregation: 'heatmap'
      });
    }
  }
  
  function renderCanvas() {
    const ctx = canvasRef.getContext('2d');
    const heatmapCtx = heatmapCanvasRef.getContext('2d');
    
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    
    // Render map tiles
    renderWorldMap(ctx);
    
    // Render heatmap overlay
    renderArtworkHeatmap(heatmapCtx);
    
    // Composite with transparency
    ctx.globalAlpha = 0.7;
    ctx.drawImage(heatmapCanvasRef, 0, 0);
    ctx.globalAlpha = 1;
    
    // Render active artists
    renderActiveArtists(ctx);
    
    // Render UI elements
    renderStats(ctx);
    renderLegend(ctx);
  }
  
  function renderWorldMap(ctx) {
    const vp = viewport();
    const center = mapService.latLngToWorldPixel(vp.lat, vp.lng, vp.zoom);
    const offsetX = center.x - canvasRef.width / 2;
    const offsetY = center.y - canvasRef.height / 2;
    
    // Darken map for better artwork visibility
    ctx.filter = 'brightness(0.3) contrast(1.2)';
    
    loadedTiles().forEach(({ img, tile }) => {
      if (tile.zoom !== vp.zoom) return;
      
      const tileWorldX = tile.x * mapService.tileSize;
      const tileWorldY = tile.y * mapService.tileSize;
      
      const canvasX = tileWorldX - offsetX;
      const canvasY = tileWorldY - offsetY;
      
      if (canvasX + mapService.tileSize >= 0 && 
          canvasX < canvasRef.width &&
          canvasY + mapService.tileSize >= 0 && 
          canvasY < canvasRef.height) {
        ctx.drawImage(img, canvasX, canvasY);
      }
    });
    
    ctx.filter = 'none';
  }
  
  function renderArtworkHeatmap(ctx) {
    ctx.clearRect(0, 0, heatmapCanvasRef.width, heatmapCanvasRef.height);
    
    const vp = viewport();
    const center = mapService.latLngToWorldPixel(vp.lat, vp.lng, vp.zoom);
    const offsetX = center.x - canvasRef.width / 2;
    const offsetY = center.y - canvasRef.height / 2;
    
    // Create gradient for each hotspot
    artHotspots().forEach(spot => {
      const worldPos = mapService.latLngToWorldPixel(spot.lat, spot.lng, vp.zoom);
      const x = worldPos.x - offsetX;
      const y = worldPos.y - offsetY;
      
      // Skip if outside viewport
      if (x < -100 || x > canvasRef.width + 100 || 
          y < -100 || y > canvasRef.height + 100) return;
      
      // Create radial gradient based on activity
      const radius = Math.min(200, 20 + Math.sqrt(spot.drawingCount) * 5);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      
      // Color based on intensity
      const intensity = Math.min(1, spot.drawingCount / 1000);
      const hue = 120 - (intensity * 120); // Green to red
      
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, ${0.8 * intensity})`);
      gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, ${0.3 * intensity})`);
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
  }
  
  function renderActiveArtists(ctx) {
    const vp = viewport();
    const center = mapService.latLngToWorldPixel(vp.lat, vp.lng, vp.zoom);
    const offsetX = center.x - canvasRef.width / 2;
    const offsetY = center.y - canvasRef.height / 2;
    
    // Render pulsing dots for active artists
    const time = Date.now();
    
    activeArtists().forEach((artist, clientId) => {
      const worldPos = mapService.latLngToWorldPixel(artist.lat, artist.lng, vp.zoom);
      const x = worldPos.x - offsetX;
      const y = worldPos.y - offsetY;
      
      if (x < 0 || x > canvasRef.width || y < 0 || y > canvasRef.height) return;
      
      // Pulsing effect
      const pulse = Math.sin(time * 0.003 + clientId.charCodeAt(0)) * 0.3 + 0.7;
      
      ctx.beginPath();
      ctx.arc(x, y, 5 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff00';
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
  }
  
  function renderStats(ctx) {
    const s = stats();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(20, 20, 250, 100);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px system-ui';
    ctx.fillText('🌍 World Canvas Stats', 30, 45);
    
    ctx.font = '14px system-ui';
    ctx.fillText(`👥 ${s.totalArtists.toLocaleString()} Artists`, 30, 70);
    ctx.fillText(`🎨 ${s.totalDrawings.toLocaleString()} Drawings`, 30, 90);
    ctx.fillText(`🌎 ${s.activeCountries} Countries`, 30, 110);
  }
  
  function renderLegend(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(canvasRef.width - 170, 20, 150, 120);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText('Activity Legend', canvasRef.width - 160, 40);
    
    ctx.font = '12px system-ui';
    
    // Active artist
    ctx.beginPath();
    ctx.arc(canvasRef.width - 150, 60, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText('Active Artist', canvasRef.width - 140, 65);
    
    // Heat levels
    const heatColors = [
      { color: 'hsl(120, 100%, 50%)', label: 'Low Activity' },
      { color: 'hsl(60, 100%, 50%)', label: 'Medium Activity' },
      { color: 'hsl(0, 100%, 50%)', label: 'High Activity' }
    ];
    
    heatColors.forEach((item, i) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(canvasRef.width - 150, 80 + i * 20, 10, 10);
      ctx.fillStyle = 'white';
      ctx.fillText(item.label, canvasRef.width - 135, 89 + i * 20);
    });
  }
  
  // Mouse handlers for panning
  function handleMouseDown(e) {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      
      const vp = viewport();
      const worldPixel = mapService.latLngToWorldPixel(vp.lat, vp.lng, vp.zoom);
      setWorldPixelStart(worldPixel);
    }
  }
  
  function handleMouseMove(e) {
    if (isPanning()) {
      const deltaX = e.clientX - panStart().x;
      const deltaY = e.clientY - panStart().y;
      
      const start = worldPixelStart();
      const newWorldX = start.x - deltaX;
      const newWorldY = start.y - deltaY;
      
      const newLatLng = mapService.worldPixelToLatLng(newWorldX, newWorldY, viewport().zoom);
      
      setViewport(prev => ({
        ...prev,
        lat: newLatLng.lat,
        lng: newLatLng.lng
      }));
      
      loadWorldView();
      renderCanvas();
    }
  }
  
  function handleMouseUp() {
    setIsPanning(false);
  }
  
  function handleWheel(e) {
    e.preventDefault();
    const vp = viewport();
    
    const newZoom = e.deltaY > 0 
      ? Math.max(2, vp.zoom - 1)
      : Math.min(6, vp.zoom + 1);
    
    if (newZoom !== vp.zoom) {
      setViewport(prev => ({ ...prev, zoom: newZoom }));
      loadWorldView();
      renderCanvas();
    }
  }
  
  // WebSocket handlers
  createEffect(() => {
    if (props.wsManager) {
      // Handle world artwork data
      const cleanup1 = props.wsManager.on('worldArtworkData', (data) => {
        setArtHotspots(data.hotspots || []);
        setStats(data.stats || stats());
        renderCanvas();
      });
      
      // Handle active artist updates
      const cleanup2 = props.wsManager.on('artistLocation', (data) => {
        if (data.active) {
          setActiveArtists(prev => {
            const next = new Map(prev);
            next.set(data.clientId, { lat: data.lat, lng: data.lng });
            return next;
          });
        } else {
          setActiveArtists(prev => {
            const next = new Map(prev);
            next.delete(data.clientId);
            return next;
          });
        }
        renderCanvas();
      });
      
      onCleanup(() => {
        cleanup1();
        cleanup2();
      });
    }
  });
  
  // Auto-refresh animation
  let animationFrame;
  onMount(() => {
    const animate = () => {
      renderCanvas();
      animationFrame = requestAnimationFrame(animate);
    };
    animate();
  });
  
  onCleanup(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas 
        ref={heatmapCanvasRef}
        style={{ position: 'absolute', display: 'none' }}
      />
      
      <canvas 
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: isPanning() ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px 20px',
        'border-radius': '20px',
        'font-size': '12px'
      }}>
        🌐 Drag to explore • Scroll to zoom • Click a hotspot to visit
      </div>
    </div>
  );
}