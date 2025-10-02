// Map service for loading world map tiles and converting coordinates
export class MapService {
  constructor() {
    // Use OpenStreetMap tiles (free and open)
    this.tileServer = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.tileSize = 256;
    this.defaultZoom = 15; // Street level zoom for drawing
    this.minZoom = 2; // World view
    this.maxZoom = 19; // Maximum detail
    
    // Cache loaded tiles
    this.tileCache = new Map();
    this.maxCacheSize = 1000;
  }

  // Convert lat/lng to tile coordinates
  latLngToTile(lat, lng, zoom) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = (lng + 180) / 360 * n;
    const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      zoom
    };
  }

  // Convert tile coordinates back to lat/lng (for tile corners)
  tileToLatLng(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lng = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lng };
  }

  // Convert lat/lng to pixel coordinates within the world
  latLngToWorldPixel(lat, lng, zoom) {
    const tile = this.latLngToTile(lat, lng, zoom);
    const n = Math.pow(2, zoom);
    
    const latRad = lat * Math.PI / 180;
    const x = (lng + 180) / 360 * n * this.tileSize;
    const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n * this.tileSize;
    
    return { x, y };
  }

  // Convert world pixel back to lat/lng
  worldPixelToLatLng(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lng = (x / this.tileSize / n * 360) - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / this.tileSize / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lng };
  }

  // Get tile URL
  getTileUrl(x, y, zoom) {
    return this.tileServer
      .replace('{x}', x)
      .replace('{y}', y)
      .replace('{z}', zoom);
  }

  // Load a tile image
  async loadTile(x, y, zoom) {
    const key = `${zoom}/${x}/${y}`;
    
    // Check cache
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key);
    }

    // Clean cache if too large
    if (this.tileCache.size > this.maxCacheSize) {
      const toDelete = Array.from(this.tileCache.keys()).slice(0, 100);
      toDelete.forEach(k => this.tileCache.delete(k));
    }

    // Load tile
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        this.tileCache.set(key, img);
        resolve(img);
      };
      
      img.onerror = () => {
        console.error(`Failed to load tile ${key}`);
        // Return a placeholder or transparent image
        reject(new Error(`Failed to load tile ${key}`));
      };
      
      img.src = this.getTileUrl(x, y, zoom);
    });
  }

  // Get all tiles needed for a viewport
  getTilesForViewport(bounds, zoom) {
    const topLeft = this.latLngToTile(bounds.north, bounds.west, zoom);
    const bottomRight = this.latLngToTile(bounds.south, bounds.east, zoom);
    
    const tiles = [];
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        tiles.push({ x, y, zoom });
      }
    }
    
    return tiles;
  }

  // Calculate bounds for a center point and viewport size
  getViewportBounds(centerLat, centerLng, widthPx, heightPx, zoom) {
    const center = this.latLngToWorldPixel(centerLat, centerLng, zoom);
    
    const topLeft = this.worldPixelToLatLng(
      center.x - widthPx / 2,
      center.y - heightPx / 2,
      zoom
    );
    
    const bottomRight = this.worldPixelToLatLng(
      center.x + widthPx / 2,
      center.y + heightPx / 2,
      zoom
    );
    
    return {
      north: topLeft.lat,
      south: bottomRight.lat,
      west: topLeft.lng,
      east: bottomRight.lng,
      centerLat,
      centerLng
    };
  }

  // Get location name from coordinates (reverse geocoding)
  async getLocationName(lat, lng) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?` +
        `format=json&lat=${lat}&lon=${lng}&zoom=10`
      );
      
      if (response.ok) {
        const data = await response.json();
        return {
          city: data.address?.city || data.address?.town || data.address?.village,
          state: data.address?.state,
          country: data.address?.country,
          displayName: data.display_name
        };
      }
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
    }
    
    return null;
  }
}

export const mapService = new MapService();