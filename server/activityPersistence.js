// Persistence layer for location-based activities
export class ActivityPersistence {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = 'activity:';
    this.defaultPrecision = 7; // Street level geohash precision
  }

  // Create a new activity at a location
  async createActivity(data) {
    if (!this.redis) return null;

    try {
      const activityId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const geohash = await this.getGeohash(data.lat, data.lng);
      
      const activity = {
        id: activityId,
        title: data.title || 'Untitled Activity',
        description: data.description || '',
        creatorId: data.creatorId,
        creatorName: data.creatorName || 'Anonymous',
        lat: data.lat,
        lng: data.lng,
        geohash,
        address: data.address || '',
        street: data.street || '',
        createdAt: Date.now(),
        lastActive: Date.now(),
        participantCount: 1,
        drawingCount: 0
      };

      // Store activity
      await this.redis.set(`${this.keyPrefix}${activityId}`, JSON.stringify(activity));

      // Add to geohash indices for spatial queries
      for (let precision = 4; precision <= this.defaultPrecision; precision++) {
        const hash = geohash.substring(0, precision);
        await this.redis.sAdd(`${this.keyPrefix}geo:${hash}`, activityId);
      }

      // Add to street index if available
      if (data.street) {
        const streetKey = this.normalizeStreet(data.street);
        await this.redis.sAdd(`${this.keyPrefix}street:${streetKey}`, activityId);
      }

      // Update global stats
      await this.redis.hIncrBy('activity:stats', 'totalActivities', 1);

      return activity;
    } catch (error) {
      console.error('Failed to create activity:', error);
      throw error;
    }
  }

  // Get activities for a geographic area
  async getActivitiesInBounds(bounds, limit = 100) {
    if (!this.redis) return [];

    try {
      const activities = [];
      const geohashes = await this.getGeohashesForBounds(bounds, 6); // Lower precision for larger area

      // Collect activity IDs from all matching geohashes
      const activityIds = new Set();
      for (const geohash of geohashes) {
        const ids = await this.redis.sMembers(`${this.keyPrefix}geo:${geohash}`);
        ids.forEach(id => activityIds.add(id));
      }

      // Load activity details
      for (const activityId of activityIds) {
        const activityData = await this.redis.get(`${this.keyPrefix}${activityId}`);
        if (activityData) {
          const activity = JSON.parse(activityData);
          
          // Check if actually within bounds
          if (this.isInBounds(activity.lat, activity.lng, bounds)) {
            activities.push(activity);
            if (activities.length >= limit) break;
          }
        }
      }

      // Sort by last active
      activities.sort((a, b) => b.lastActive - a.lastActive);
      
      return activities;
    } catch (error) {
      console.error('Failed to get activities in bounds:', error);
      return [];
    }
  }

  // Get activities aggregated by street
  async getStreetActivities(bounds) {
    if (!this.redis) return {};

    try {
      const activities = await this.getActivitiesInBounds(bounds);
      
      // Group by street
      const streetGroups = {};
      activities.forEach(activity => {
        const street = activity.street || 'Unknown Street';
        if (!streetGroups[street]) {
          streetGroups[street] = {
            street,
            count: 0,
            activities: [],
            center: { lat: 0, lng: 0 }
          };
        }
        
        streetGroups[street].count++;
        streetGroups[street].activities.push(activity);
        streetGroups[street].center.lat += activity.lat;
        streetGroups[street].center.lng += activity.lng;
      });

      // Calculate center points
      Object.values(streetGroups).forEach(group => {
        group.center.lat /= group.count;
        group.center.lng /= group.count;
      });

      return streetGroups;
    } catch (error) {
      console.error('Failed to get street activities:', error);
      return {};
    }
  }

  // Update activity stats
  async updateActivityStats(activityId, updates) {
    if (!this.redis) return;

    try {
      const activityData = await this.redis.get(`${this.keyPrefix}${activityId}`);
      if (!activityData) return;

      const activity = JSON.parse(activityData);
      
      // Update fields
      if (updates.participantCount !== undefined) {
        activity.participantCount = updates.participantCount;
      }
      if (updates.drawingCount !== undefined) {
        activity.drawingCount = updates.drawingCount;
      }
      activity.lastActive = Date.now();

      await this.redis.set(`${this.keyPrefix}${activityId}`, JSON.stringify(activity));
    } catch (error) {
      console.error('Failed to update activity stats:', error);
    }
  }

  // Store canvas data for an activity
  async saveActivityCanvas(activityId, canvasData) {
    if (!this.redis) return;

    try {
      const key = `${this.keyPrefix}canvas:${activityId}`;
      await this.redis.set(key, JSON.stringify(canvasData));
      
      // Update activity stats
      await this.updateActivityStats(activityId, { 
        drawingCount: canvasData.paths?.length || 0 
      });
    } catch (error) {
      console.error('Failed to save activity canvas:', error);
    }
  }

  // Load canvas data for an activity
  async loadActivityCanvas(activityId) {
    if (!this.redis) return null;

    try {
      const key = `${this.keyPrefix}canvas:${activityId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load activity canvas:', error);
      return null;
    }
  }

  // Helper: Normalize street name for indexing
  normalizeStreet(street) {
    return street.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  // Helper: Check if point is in bounds
  isInBounds(lat, lng, bounds) {
    return lat >= bounds.south && 
           lat <= bounds.north &&
           lng >= bounds.west && 
           lng <= bounds.east;
  }

  // Geohash implementation (reuse from geoDrawingPersistence)
  async getGeohash(lat, lng, precision = this.defaultPrecision) {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let geohash = '';

    const latRange = [-90, 90];
    const lngRange = [-180, 180];

    while (geohash.length < precision) {
      if (evenBit) {
        const mid = (lngRange[0] + lngRange[1]) / 2;
        if (lng > mid) {
          idx |= (1 << (4 - bit));
          lngRange[0] = mid;
        } else {
          lngRange[1] = mid;
        }
      } else {
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

  // Get geohashes that cover a bounding box
  async getGeohashesForBounds(bounds, precision = 5) {
    const geohashes = new Set();
    
    const latStep = (bounds.north - bounds.south) / 3;
    const lngStep = (bounds.east - bounds.west) / 3;
    
    for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
      for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
        const hash = await this.getGeohash(lat, lng, precision);
        geohashes.add(hash);
      }
    }
    
    return Array.from(geohashes);
  }
}