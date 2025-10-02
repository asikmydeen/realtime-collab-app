// Persistence layer for geo-based drawings
export class GeoDrawingPersistence {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = 'geo:';
    
    // Geohash precision levels
    // Level 5 = ~5km, Level 7 = ~150m, Level 9 = ~5m
    this.defaultPrecision = 7; // Street level detail
  }

  // Convert lat/lng to geohash for spatial indexing
  async getGeohash(lat, lng, precision = this.defaultPrecision) {
    // Simple geohash implementation (you could use a library for this)
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let geohash = '';

    const latRange = [-90, 90];
    const lngRange = [-180, 180];

    while (geohash.length < precision) {
      if (evenBit) {
        // longitude
        const mid = (lngRange[0] + lngRange[1]) / 2;
        if (lng > mid) {
          idx |= (1 << (4 - bit));
          lngRange[0] = mid;
        } else {
          lngRange[1] = mid;
        }
      } else {
        // latitude
        const mid = (latRange[0] + latRange[1]) / 2;
        if (lat > mid) {
          idx |= (1 << (4 - bit));
          latRange[0] = mid;
        } else {
          latRange[1] = mid;
        }
      }

      evenBit = !evenBit;

      if (bit < 4) {
        bit++;
      } else {
        geohash += base32[idx];
        bit = 0;
        idx = 0;
      }
    }

    return geohash;
  }

  // Save a geo-located drawing path
  async saveGeoPath(path) {
    if (!this.redis) return;

    try {
      const pathId = `path:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate geohash for the path's starting point
      const startPoint = path.points[0];
      const geohash = await this.getGeohash(startPoint.lat, startPoint.lng);
      
      // Store the path
      const pathKey = `${this.keyPrefix}${pathId}`;
      await this.redis.set(pathKey, JSON.stringify({
        ...path,
        geohash,
        timestamp: Date.now()
      }));

      // Add to geohash index for efficient spatial queries
      for (let precision = 3; precision <= this.defaultPrecision; precision++) {
        const hash = geohash.substring(0, precision);
        await this.redis.sadd(`${this.keyPrefix}geohash:${hash}`, pathId);
      }

      // Add to global activity tracking
      await this.redis.hincrby('geo:stats', 'totalPaths', 1);
      
      // Track activity by country/region (if we have that info)
      if (path.location) {
        await this.redis.hincrby('geo:activity', path.location.country || 'unknown', 1);
      }

      return pathId;
    } catch (error) {
      console.error('Failed to save geo path:', error);
      throw error;
    }
  }

  // Load drawings for a geographic area
  async loadGeoDrawings(bounds, limit = 1000) {
    if (!this.redis) return [];

    try {
      const paths = [];
      
      // Calculate geohashes that cover the bounds
      const geohashes = await this.getGeohashesForBounds(bounds);
      
      // Load paths from each geohash
      for (const geohash of geohashes) {
        const pathIds = await this.redis.smembers(`${this.keyPrefix}geohash:${geohash}`);
        
        for (const pathId of pathIds) {
          const pathData = await this.redis.get(`${this.keyPrefix}${pathId}`);
          if (pathData) {
            const path = JSON.parse(pathData);
            
            // Double-check that path is actually within bounds
            if (this.isPathInBounds(path, bounds)) {
              paths.push(path);
              
              if (paths.length >= limit) {
                return paths;
              }
            }
          }
        }
      }

      return paths;
    } catch (error) {
      console.error('Failed to load geo drawings:', error);
      return [];
    }
  }

  // Get geohashes that cover a bounding box
  async getGeohashesForBounds(bounds, precision = 5) {
    const geohashes = new Set();
    
    // Sample points across the bounds to get covering geohashes
    const latStep = (bounds.north - bounds.south) / 4;
    const lngStep = (bounds.east - bounds.west) / 4;
    
    for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
      for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
        const hash = await this.getGeohash(lat, lng, precision);
        geohashes.add(hash);
      }
    }
    
    return Array.from(geohashes);
  }

  // Check if a path intersects with bounds
  isPathInBounds(path, bounds) {
    return path.points.some(point => 
      point.lat >= bounds.south && 
      point.lat <= bounds.north &&
      point.lng >= bounds.west && 
      point.lng <= bounds.east
    );
  }

  // Get heatmap data for world view
  async getWorldHeatmap() {
    if (!this.redis) return [];

    try {
      const hotspots = [];
      
      // Get aggregated data by low-precision geohash
      const pattern = `${this.keyPrefix}geohash:???`;
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        const geohash = key.split(':').pop();
        const count = await this.redis.scard(key);
        
        if (count > 0) {
          // Convert geohash back to approximate lat/lng
          const center = await this.geohashToLatLng(geohash);
          hotspots.push({
            lat: center.lat,
            lng: center.lng,
            drawingCount: count,
            geohash
          });
        }
      }

      return hotspots;
    } catch (error) {
      console.error('Failed to get world heatmap:', error);
      return [];
    }
  }

  // Convert geohash to lat/lng (center point)
  async geohashToLatLng(geohash) {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let evenBit = true;
    const latRange = [-90, 90];
    const lngRange = [-180, 180];

    for (let i = 0; i < geohash.length; i++) {
      const idx = base32.indexOf(geohash[i]);
      
      for (let j = 4; j >= 0; j--) {
        const bit = (idx >> j) & 1;
        
        if (evenBit) {
          const mid = (lngRange[0] + lngRange[1]) / 2;
          if (bit === 1) {
            lngRange[0] = mid;
          } else {
            lngRange[1] = mid;
          }
        } else {
          const mid = (latRange[0] + latRange[1]) / 2;
          if (bit === 1) {
            latRange[0] = mid;
          } else {
            latRange[1] = mid;
          }
        }
        
        evenBit = !evenBit;
      }
    }

    return {
      lat: (latRange[0] + latRange[1]) / 2,
      lng: (lngRange[0] + lngRange[1]) / 2
    };
  }

  // Get global statistics
  async getGlobalStats() {
    if (!this.redis) return {};

    try {
      const stats = await this.redis.hgetall('geo:stats');
      const activity = await this.redis.hgetall('geo:activity');
      
      return {
        totalPaths: parseInt(stats.totalPaths || 0),
        totalArtists: parseInt(stats.totalArtists || 0),
        activeCountries: Object.keys(activity).length,
        countryActivity: activity
      };
    } catch (error) {
      console.error('Failed to get global stats:', error);
      return {};
    }
  }
}