import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { mapService } from '../services/mapService';
import { ActivityCanvas } from './ActivityCanvas';

export function ActivityView(props) {
  let mapCanvasRef;
  let tilesCanvasRef;
  
  // Map state
  const [userLocation, setUserLocation] = createSignal(null);
  const [viewport, setViewport] = createSignal({ x: 0, y: 0 });
  const [mapZoom, setMapZoom] = createSignal(18); // Start at street level to see activities
  const [currentBounds, setCurrentBounds] = createSignal(null);
  const [locationName, setLocationName] = createSignal('');
  
  // Activity state
  const [activities, setActivities] = createSignal([]);
  const [streetActivities, setStreetActivities] = createSignal({});
  const [selectedActivity, setSelectedActivity] = createSignal(null);
  const [showActivityPanel, setShowActivityPanel] = createSignal(false);
  const [showCreateActivity, setShowCreateActivity] = createSignal(false);
  const [viewType, setViewType] = createSignal('aggregated'); // 'aggregated' or 'detailed'
  
  // Map interaction
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [targetZoom, setTargetZoom] = createSignal(18);
  const [loadedTiles, setLoadedTiles] = createSignal(new Map());
  const [tilesLoading, setTilesLoading] = createSignal(new Set());
  
  // Search
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal([]);
  const [isSearching, setIsSearching] = createSignal(false);
  
  let zoomAnimationFrame = null;
  let viewportUpdateTimeout = null;
  
  onMount(async () => {
    setupCanvas();
    await getUserLocation();
    
    // Keyboard controls
    const handleKeyDown = (e) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setTargetZoom(prev => Math.min(mapService.maxZoom, prev + 0.5));
        animateZoomToCenter();
      } else if (e.key === '-') {
        e.preventDefault();
        setTargetZoom(prev => Math.max(mapService.minZoom, prev - 0.5));
        animateZoomToCenter();
      } else if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'Escape') {
        if (showSearch()) {
          setShowSearch(false);
          setSearchQuery('');
          setSearchResults([]);
        } else if (selectedActivity()) {
          setSelectedActivity(null);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });
  
  async function getUserLocation() {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });
        
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        
        // Get location name
        const location = await mapService.getLocationName(lat, lng);
        if (location) {
          setLocationName(location.city || location.country || 'Unknown');
        }
        
        updateViewport(lat, lng, mapZoom());
        
        // Request default activity for this location
        requestDefaultActivity(lat, lng, location);
      } catch (error) {
        console.error('Failed to get location:', error);
        // Fallback to default location
        const defaultLat = 40.7128;
        const defaultLng = -74.0060;
        setUserLocation({ lat: defaultLat, lng: defaultLng }); // NYC
        setLocationName('New York');
        updateViewport(defaultLat, defaultLng, mapZoom());
        
        // Request default activity for fallback location
        requestDefaultActivity(defaultLat, defaultLng, { city: 'New York' });
      }
    }
  }
  
  function setupCanvas() {
    const parent = mapCanvasRef.parentElement;
    mapCanvasRef.width = parent.clientWidth;
    mapCanvasRef.height = parent.clientHeight;
    tilesCanvasRef.width = parent.clientWidth;
    tilesCanvasRef.height = parent.clientHeight;
    renderMap();
  }
  
  function updateViewport(lat, lng, zoom) {
    const bounds = mapService.getViewportBounds(
      lat, lng,
      mapCanvasRef.width,
      mapCanvasRef.height,
      zoom
    );
    
    setCurrentBounds(bounds);
    setMapZoom(zoom);
    
    const worldPixel = mapService.latLngToWorldPixel(lat, lng, zoom);
    setViewport({
      x: worldPixel.x - mapCanvasRef.width / 2,
      y: worldPixel.y - mapCanvasRef.height / 2
    });
    
    loadTilesForCurrentView();
    
    // Request activities immediately when zoomed in to street level
    if (zoom >= 17) {
      if (props.wsManager && bounds) {
        props.wsManager.send({
          type: 'getActivities',
          bounds: bounds,
          zoom: zoom
        });
      }
    }
    requestActivities(); // Also queue a delayed request for stability
  }
  
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
            renderMap();
          })
          .catch(err => console.error('Failed to load tile:', err))
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
  
  function renderMap() {
    const ctx = mapCanvasRef.getContext('2d');
    const tilesCtx = tilesCanvasRef.getContext('2d');
    
    // Clear canvases
    ctx.clearRect(0, 0, mapCanvasRef.width, mapCanvasRef.height);
    tilesCtx.clearRect(0, 0, tilesCanvasRef.width, tilesCanvasRef.height);
    
    // Render map tiles
    renderMapTiles(tilesCtx);
    ctx.drawImage(tilesCanvasRef, 0, 0);
    
    // Render activity markers/indicators
    const zoom = mapZoom();
    if (zoom >= 17) { // Street level - show individual activities
      renderActivityMarkers(ctx);
    } else { // Zoomed out - show street indicators
      renderStreetIndicators(ctx);
    }
  }
  
  function renderMapTiles(ctx) {
    const vp = viewport();
    const zoom = mapZoom();
    const integerZoom = Math.floor(zoom);
    const fractionalZoom = zoom - integerZoom;
    const fractionalScale = Math.pow(2, fractionalZoom);
    
    loadedTiles().forEach(({ img, tile }) => {
      if (tile.zoom !== integerZoom) return;
      
      const tileSize = mapService.tileSize * fractionalScale;
      const tileWorldX = tile.x * tileSize;
      const tileWorldY = tile.y * tileSize;
      
      const canvasX = tileWorldX - vp.x;
      const canvasY = tileWorldY - vp.y;
      
      if (canvasX + tileSize >= 0 && canvasX < mapCanvasRef.width &&
          canvasY + tileSize >= 0 && canvasY < mapCanvasRef.height) {
        ctx.drawImage(img, canvasX, canvasY, tileSize, tileSize);
      }
    });
  }
  
  function renderActivityMarkers(ctx) {
    const vp = viewport();
    const zoom = mapZoom();
    
    activities().forEach(activity => {
      const worldPos = mapService.latLngToWorldPixel(activity.lat, activity.lng, zoom);
      const x = worldPos.x - vp.x;
      const y = worldPos.y - vp.y;
      
      // Skip if outside viewport
      if (x < -50 || x > mapCanvasRef.width + 50 || 
          y < -50 || y > mapCanvasRef.height + 50) return;
      
      // Draw marker
      ctx.save();
      ctx.translate(x, y);
      
      // Outer circle
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = selectedActivity()?.id === activity.id ? '#3b82f6' : '#ef4444';
      ctx.fill();
      
      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      
      // Activity icon
      ctx.font = '16px sans-serif';
      ctx.fillStyle = selectedActivity()?.id === activity.id ? '#3b82f6' : '#ef4444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨', 0, 0);
      
      // Participant count
      if (activity.participantCount > 1) {
        ctx.beginPath();
        ctx.arc(12, -12, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(activity.participantCount, 12, -12);
      }
      
      ctx.restore();
    });
  }
  
  function renderStreetIndicators(ctx) {
    const vp = viewport();
    const zoom = mapZoom();
    
    Object.values(streetActivities()).forEach(group => {
      const worldPos = mapService.latLngToWorldPixel(group.center.lat, group.center.lng, zoom);
      const x = worldPos.x - vp.x;
      const y = worldPos.y - vp.y;
      
      // Skip if outside viewport
      if (x < -50 || x > mapCanvasRef.width + 50 || 
          y < -50 || y > mapCanvasRef.height + 50) return;
      
      // Draw street indicator
      ctx.save();
      ctx.translate(x, y);
      
      // Background circle
      const radius = Math.min(30, 15 + group.count * 2);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.fill();
      
      // Count text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(group.count, 0, 0);
      
      ctx.restore();
    });
  }
  
  // Request activities for current viewport
  function requestActivities() {
    if (viewportUpdateTimeout) {
      clearTimeout(viewportUpdateTimeout);
    }
    
    viewportUpdateTimeout = setTimeout(() => {
      if (props.wsManager && currentBounds()) {
        props.wsManager.send({
          type: 'getActivities',
          bounds: currentBounds(),
          zoom: mapZoom()
        });
      }
    }, 50); // Reduced from 200ms to 50ms for faster loading
  }
  
  // Handle activity selection
  function selectActivity(activity) {
    setSelectedActivity(activity);
    setShowActivityPanel(true);
    
    // Join the activity
    if (props.wsManager) {
      props.wsManager.send({
        type: 'joinActivity',
        activityId: activity.id
      });
    }
  }
  
  // Request default activity for a location
  function requestDefaultActivity(lat, lng, locationInfo) {
    if (!props.wsManager) {
      // If WebSocket not ready yet, try again in a bit
      setTimeout(() => requestDefaultActivity(lat, lng, locationInfo), 500);
      return;
    }
    
    // Check if connected
    if (!props.connected) {
      // If not connected yet, wait for connection
      setTimeout(() => requestDefaultActivity(lat, lng, locationInfo), 500);
      return;
    }
    
    props.wsManager.send({
      type: 'getDefaultActivity',
      lat,
      lng,
      locationName: locationInfo?.city || locationInfo?.name || 'Local',
      address: locationInfo?.displayName || '',
      street: locationInfo?.street || locationInfo?.road || 'Community Area'
    });
  }
  
  // Create new activity
  async function createActivity(data) {
    if (!props.wsManager) return;
    
    const location = userLocation();
    const address = await mapService.getLocationName(data.lat || location.lat, data.lng || location.lng);
    
    props.wsManager.send({
      type: 'createActivity',
      title: data.title,
      description: data.description,
      lat: data.lat || location.lat,
      lng: data.lng || location.lng,
      address: address?.displayName || '',
      street: address?.street || address?.road || 'Unknown Street'
    });
    
    setShowCreateActivity(false);
  }
  
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
    
    // Update location
    setLocationName(place.city || place.name.split(',')[0]);
    
    // Animate to location
    animateToLocation(place.lat, place.lng, 18); // Zoom to street level
    
    // Close search
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }
  
  // Animate to a new location
  function animateToLocation(targetLat, targetLng, targetZoomLevel) {
    setTargetZoom(targetZoomLevel);
    
    const currentZoom = mapZoom();
    const vp = viewport();
    const currentCenter = mapService.worldPixelToLatLng(
      vp.x + mapCanvasRef.width / 2,
      vp.y + mapCanvasRef.height / 2,
      currentZoom
    );
    
    const duration = 2000;
    const startTime = Date.now();
    const startLat = currentCenter.lat;
    const startLng = currentCenter.lng;
    const startZoom = currentZoom;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentLat = startLat + (targetLat - startLat) * eased;
      const currentLng = startLng + (targetLng - startLng) * eased;
      const currentZoom = startZoom + (targetZoomLevel - startZoom) * eased;
      
      setMapZoom(currentZoom);
      updateViewport(currentLat, currentLng, currentZoom);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
  
  // Mouse handlers
  function handleMouseDown(e) {
    if (e.shiftKey || e.button === 1) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX + viewport().x,
        y: e.clientY + viewport().y
      });
    }
  }
  
  function handleMouseMove(e) {
    if (isPanning()) {
      const newX = panStart().x - e.clientX;
      const newY = panStart().y - e.clientY;
      setViewport({ x: newX, y: newY });
      
      const newCenter = mapService.worldPixelToLatLng(
        newX + mapCanvasRef.width / 2,
        newY + mapCanvasRef.height / 2,
        mapZoom()
      );
      
      const bounds = mapService.getViewportBounds(
        newCenter.lat,
        newCenter.lng,
        mapCanvasRef.width,
        mapCanvasRef.height,
        mapZoom()
      );
      
      setCurrentBounds(bounds);
      loadTilesForCurrentView();
      renderMap();
      requestActivities();
    }
  }
  
  function handleMouseUp(e) {
    // Check if clicked on an activity marker
    if (!isPanning() && e.button === 0 && mapZoom() >= 17) {
      const rect = mapCanvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check if clicked on any activity
      const vp = viewport();
      const zoom = mapZoom();
      
      for (const activity of activities()) {
        const worldPos = mapService.latLngToWorldPixel(activity.lat, activity.lng, zoom);
        const actX = worldPos.x - vp.x;
        const actY = worldPos.y - vp.y;
        
        const distance = Math.sqrt((x - actX) ** 2 + (y - actY) ** 2);
        if (distance <= 20) {
          selectActivity(activity);
          break;
        }
      }
    }
    
    setIsPanning(false);
  }
  
  function handleWheel(e) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = e.deltaY * zoomSensitivity;
    
    const currentTarget = targetZoom();
    setTargetZoom(Math.max(mapService.minZoom, Math.min(mapService.maxZoom, currentTarget - delta)));
    
    const rect = mapCanvasRef.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (!zoomAnimationFrame) {
      const vp = viewport();
      const mouseWorldX = mouseX + vp.x;
      const mouseWorldY = mouseY + vp.y;
      const mouseLatLng = mapService.worldPixelToLatLng(mouseWorldX, mouseWorldY, mapZoom());
      animateZoom(mouseX, mouseY, mouseLatLng);
    }
  }
  
  function animateZoom(mouseX, mouseY, mouseLatLng) {
    const animate = () => {
      const current = mapZoom();
      const target = targetZoom();
      const diff = target - current;
      
      if (Math.abs(diff) < 0.01) {
        if (zoomAnimationFrame) {
          cancelAnimationFrame(zoomAnimationFrame);
          zoomAnimationFrame = null;
        }
        return;
      }
      
      const smoothing = 0.08;
      const newZoom = current + diff * smoothing;
      
      const newWorldPos = mapService.latLngToWorldPixel(mouseLatLng.lat, mouseLatLng.lng, newZoom);
      const newViewportX = newWorldPos.x - mouseX;
      const newViewportY = newWorldPos.y - mouseY;
      
      setViewport({ x: newViewportX, y: newViewportY });
      setMapZoom(newZoom);
      
      const newCenter = mapService.worldPixelToLatLng(
        newViewportX + mapCanvasRef.width / 2,
        newViewportY + mapCanvasRef.height / 2,
        newZoom
      );
      
      const bounds = mapService.getViewportBounds(
        newCenter.lat,
        newCenter.lng,
        mapCanvasRef.width,
        mapCanvasRef.height,
        newZoom
      );
      
      setCurrentBounds(bounds);
      loadTilesForCurrentView();
      renderMap();
      
      if (Math.abs(diff) < 0.5 || Math.floor(current) !== Math.floor(newZoom)) {
        requestActivities();
      }
      
      zoomAnimationFrame = requestAnimationFrame(animate);
    };
    
    zoomAnimationFrame = requestAnimationFrame(animate);
  }
  
  function animateZoomToCenter() {
    const centerX = mapCanvasRef.width / 2;
    const centerY = mapCanvasRef.height / 2;
    const vp = viewport();
    const centerWorldX = centerX + vp.x;
    const centerWorldY = centerY + vp.y;
    const centerLatLng = mapService.worldPixelToLatLng(centerWorldX, centerWorldY, mapZoom());
    
    if (!zoomAnimationFrame) {
      animateZoom(centerX, centerY, centerLatLng);
    }
  }
  
  // WebSocket message handlers
  createEffect(() => {
    if (props.wsManager) {
      const cleanup1 = props.wsManager.on('activities', (data) => {
        if (data.viewType === 'detailed') {
          setActivities(data.activities || []);
          setViewType('detailed');
        } else {
          setStreetActivities(data.streetActivities || {});
          setViewType('aggregated');
        }
        renderMap();
      });
      
      const cleanup2 = props.wsManager.on('activityCreated', (data) => {
        selectActivity(data.activity);
      });
      
      const cleanup3 = props.wsManager.on('activityUpdate', (data) => {
        // Update activity in list
        setActivities(prev => {
          const index = prev.findIndex(a => a.id === data.activity.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = data.activity;
            return next;
          } else {
            return [...prev, data.activity];
          }
        });
        renderMap();
      });
      
      const cleanup4 = props.wsManager.on('defaultActivity', (data) => {
        console.log('[ActivityView] Received default activity:', data.activity);
        
        // Add default activity to the list
        setActivities(prev => {
          const existing = prev.find(a => a.id === data.activity.id);
          if (!existing) {
            return [...prev, data.activity];
          }
          return prev;
        });
        
        // Automatically select the default activity
        selectActivity(data.activity);
        
        // Also trigger activities request to populate the list
        requestActivities();
      });
      
      onCleanup(() => {
        cleanup1();
        cleanup2();
        cleanup3();
        cleanup4();
        if (zoomAnimationFrame) {
          cancelAnimationFrame(zoomAnimationFrame);
        }
        if (viewportUpdateTimeout) {
          clearTimeout(viewportUpdateTimeout);
        }
      });
    }
  });
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Map View */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <canvas
          ref={tilesCanvasRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'none' }}
        />
        <canvas
          ref={mapCanvasRef}
          style={{
            width: '100%',
            height: '100%',
            cursor: isPanning() ? 'grabbing' : 'grab'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
      
      {/* Location Header */}
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
            'backdrop-filter': 'blur(10px)'
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
          'backdrop-filter': 'blur(10px)'
        }}>
          📍 {locationName()} • Zoom: {mapZoom().toFixed(1)}
          {mapZoom() >= 17 ? (
            <span style={{ color: '#4ade80', 'margin-left': '10px' }}>
              Street View ({activities().length} activities)
            </span>
          ) : (
            <span style={{ color: '#60a5fa', 'margin-left': '10px' }}>
              City View (zoom in for activities)
            </span>
          )}
        </div>
      </div>
      
      {/* Activity List Panel */}
      <Show when={mapZoom() >= 17 && !selectedActivity()}>
        <div style={{
          position: 'absolute',
          right: '20px',
          top: '80px',
          bottom: '80px',
          width: '350px',
          background: 'rgba(255, 255, 255, 0.95)',
          'border-radius': '15px',
          'backdrop-filter': 'blur(10px)',
          'box-shadow': '0 4px 30px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          'flex-direction': 'column'
        }}>
          <div style={{
            padding: '20px',
            'border-bottom': '1px solid rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', 'font-size': '18px' }}>
              Activities Nearby
            </h3>
            <button
              onClick={() => setShowCreateActivity(true)}
              style={{
                width: '100%',
                padding: '10px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                'border-radius': '10px',
                'font-weight': 'bold',
                cursor: 'pointer'
              }}
            >
              ✨ Create New Activity
            </button>
          </div>
          
          <div style={{
            flex: 1,
            'overflow-y': 'auto',
            padding: '10px'
          }}>
            {activities().map(activity => (
                <button
                  onClick={() => selectActivity(activity)}
                  style={{
                    width: '100%',
                    padding: '15px',
                    'margin-bottom': '10px',
                    background: 'white',
                    border: '2px solid transparent',
                    'border-radius': '10px',
                    'text-align': 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      'border-color': '#3b82f6'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = 'transparent';
                  }}
                >
                  <div style={{ 'font-weight': 'bold', 'margin-bottom': '5px' }}>
                    {activity.title}
                  </div>
                  <div style={{ 'font-size': '12px', color: '#6b7280', 'margin-bottom': '5px' }}>
                    📍 {activity.street}
                  </div>
                  <div style={{ 'font-size': '12px', color: '#6b7280' }}>
                    👥 {activity.participantCount} participant{activity.participantCount !== 1 ? 's' : ''}
                    • 🎨 {activity.drawingCount} drawing{activity.drawingCount !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </Show>
      
      {/* Selected Activity Canvas */}
      <Show when={selectedActivity()}>
        <ActivityCanvas
          activity={selectedActivity()}
          wsManager={props.wsManager}
          color={props.color}
          brushSize={props.brushSize}
          onClose={() => {
            const activity = selectedActivity();
            setSelectedActivity(null);
            if (props.wsManager && activity) {
              props.wsManager.send({
                type: 'leaveActivity',
                activityId: activity.id
              });
            }
          }}
        />
      </Show>
      
      {/* Create Activity Modal */}
      <Show when={showCreateActivity()}>
        <CreateActivityModal
          onClose={() => setShowCreateActivity(false)}
          onCreate={createActivity}
          currentLocation={userLocation()}
        />
      </Show>
      
      {/* Search UI */}
      <Show when={showSearch()}>
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
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await handleSearch();
                }
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
                opacity: isSearching() ? 0.5 : 1
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
                    transition: 'all 0.2s'
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
      </Show>
      
      {/* Navigation Help */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        left: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        'border-radius': '10px',
        'font-size': '12px',
        opacity: 0.7
      }}>
        <div>🖱️ Drag to explore</div>
        <div>🔍 Scroll to zoom</div>
        <div>⌨️ +/- keys to zoom</div>
        <div>/ Search places</div>
      </div>
    </div>
  );
}

// Create Activity Modal Component
function CreateActivityModal(props) {
  const [title, setTitle] = createSignal('');
  const [description, setDescription] = createSignal('');
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'z-index': 2000
    }}>
      <div style={{
        background: 'white',
        'border-radius': '15px',
        padding: '30px',
        width: '400px',
        'box-shadow': '0 10px 50px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ margin: '0 0 20px 0' }}>Create New Activity</h2>
        
        <input
          type="text"
          placeholder="Activity Title"
          value={title()}
          onInput={(e) => setTitle(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            'margin-bottom': '15px',
            border: '2px solid #e5e7eb',
            'border-radius': '8px',
            'font-size': '16px'
          }}
        />
        
        <textarea
          placeholder="Description (optional)"
          value={description()}
          onInput={(e) => setDescription(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            'margin-bottom': '20px',
            border: '2px solid #e5e7eb',
            'border-radius': '8px',
            'font-size': '14px',
            resize: 'vertical',
            'min-height': '80px'
          }}
        />
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => props.onCreate({ title: title(), description: description() })}
            disabled={!title().trim()}
            style={{
              flex: 1,
              padding: '12px',
              background: title().trim() ? '#3b82f6' : '#e5e7eb',
              color: title().trim() ? 'white' : '#9ca3af',
              border: 'none',
              'border-radius': '8px',
              'font-weight': 'bold',
              cursor: title().trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Create Activity
          </button>
          <button
            onClick={props.onClose}
            style={{
              padding: '12px 20px',
              background: '#e5e7eb',
              color: '#374151',
              border: 'none',
              'border-radius': '8px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}