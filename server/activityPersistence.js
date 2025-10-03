// Persistence layer for location-based activities
export class ActivityPersistence {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = 'activity:';
    this.defaultPrecision = 7; // Street level geohash precision
  }

  // Get or create default activity for a location
  async getOrCreateDefaultActivity(data) {
    if (!this.redis) return null;

    try {
      const geohash = await this.getGeohash(data.lat, data.lng, 5); // Use even less precision to ensure same default activity for nearby users
      const defaultKey = `${this.keyPrefix}default:${geohash}`;
      
      // Check if default activity exists for this area
      const existingId = await this.redis.get(defaultKey);
      if (existingId) {
        const activity = await this.redis.get(`${this.keyPrefix}${existingId}`);
        if (activity) {
          return JSON.parse(activity);
        }
      }
      
      // Create default activity for this location
      const activityId = `default_${geohash}_${Date.now()}`;
      const activity = {
        id: activityId,
        title: `${data.locationName || 'Local'} Canvas`,
        description: 'Community canvas for this area',
        isDefault: true,
        creatorId: 'system',
        creatorName: 'System',
        lat: data.lat,
        lng: data.lng,
        geohash: await this.getGeohash(data.lat, data.lng),
        address: data.address || '',
        street: data.street || 'Community Area',
        createdAt: Date.now(),
        lastActive: Date.now(),
        participantCount: 0,
        drawingCount: 0
      };

      // Store activity
      await this.redis.set(`${this.keyPrefix}${activityId}`, JSON.stringify(activity));
      await this.redis.set(defaultKey, activityId);

      // Add to indices
      for (let precision = 4; precision <= this.defaultPrecision; precision++) {
        const hash = activity.geohash.substring(0, precision);
        await this.redis.sAdd(`${this.keyPrefix}geo:${hash}`, activityId);
      }

      return activity;
    } catch (error) {
      console.error('Failed to get/create default activity:', error);
      throw error;
    }
  }

  // Create a new activity at a location
  async createActivity(data) {
    if (!this.redis) return null;

    try {
      const activityId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const geohash = await this.getGeohash(data.lat, data.lng);
      
      if (!data.ownerId) {
        console.error('[CreateActivity] ERROR: No ownerId provided!', data);
        throw new Error('ownerId is required to create an activity');
      }
      
      const activity = {
        id: activityId,
        title: data.title || 'Untitled Activity',
        description: data.description || '',
        ownerId: data.ownerId, // Persistent owner hash
        ownerName: data.ownerName || 'Anonymous',
        creatorId: data.creatorId, // Session-specific creator ID
        creatorName: data.creatorName || 'Anonymous',
        lat: data.lat,
        lng: data.lng,
        geohash,
        address: data.address || '',
        street: data.street || '',
        createdAt: Date.now(),
        lastActive: Date.now(),
        participantCount: 1,
        drawingCount: 0,
        isDefault: false,
        permissions: {
          allowContributions: false, // Default to view-only mode
          contributorRequests: [], // List of users requesting to contribute
          approvedContributors: [data.ownerId], // Owner is always approved
          bannedUsers: [], // List of banned user hashes
          moderators: [] // List of user hashes who can moderate
        }
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
  
  // Check if user is within range of a location (500 meters)
  async isUserNearLocation(userLat, userLng, targetLat, targetLng, maxDistance = 500) {
    // Calculate distance using Haversine formula
    const R = 6371e3; // Earth's radius in meters
    const φ1 = userLat * Math.PI / 180;
    const φ2 = targetLat * Math.PI / 180;
    const Δφ = (targetLat - userLat) * Math.PI / 180;
    const Δλ = (targetLng - userLng) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in meters
    
    return distance <= maxDistance;
  }
  
  // Check if user can create activity at location
  async canCreateActivityAt(userLat, userLng, targetLat, targetLng) {
    // User must be within 500 meters of the location to create an activity
    return await this.isUserNearLocation(userLat, userLng, targetLat, targetLng, 500);
  }
  
  // Get a single activity by ID
  async getActivity(activityId) {
    if (!this.redis || !activityId) return null;
    
    try {
      const data = await this.redis.get(`${this.keyPrefix}${activityId}`);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Failed to get activity:', error);
      return null;
    }
  }
  
  // Get activities created by a specific owner
  async getActivitiesByOwner(ownerId) {
    if (!this.redis || !ownerId) {
      console.log('[getActivitiesByOwner] Missing redis or ownerId:', { redis: !!this.redis, ownerId });
      return [];
    }
    
    try {
      const activities = [];
      // We need to scan all activities to find ones by this owner
      // In production, you'd want an index for this
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      console.log(`[getActivitiesByOwner] Found ${keys.length} total activity keys`);
      
      for (const key of keys) {
        // Skip canvas, default, geo, and street data keys
        if (key.includes(':canvas:') || key.includes(':default:') || key.includes(':geo:') || key.includes(':street:')) {
          continue;
        }
        
        // Check if it's a proper activity key (should be activity:ID format)
        const activityIdMatch = key.match(/^activity:([^:]+)$/);
        if (!activityIdMatch) {
          console.log(`[getActivitiesByOwner] Skipping invalid key format: ${key}`);
          continue;
        }
        
        try {
          const activityData = await this.redis.get(key);
          if (activityData) {
            const activity = JSON.parse(activityData);
            console.log(`[getActivitiesByOwner] Checking activity ${activity.id}, owner: ${activity.ownerId}, looking for: ${ownerId}`);
            if (activity.ownerId === ownerId) {
              activities.push(activity);
            }
          }
        } catch (err) {
          // Skip keys that aren't strings (could be hashes, sets, etc)
          console.log(`[getActivitiesByOwner] Skipping non-string key: ${key}`);
          continue;
        }
      }
      
      console.log(`[getActivitiesByOwner] Found ${activities.length} activities for owner ${ownerId}`);
      // Sort by creation date, newest first
      activities.sort((a, b) => b.createdAt - a.createdAt);
      return activities;
    } catch (error) {
      console.error('Failed to get activities by owner:', error);
      return [];
    }
  }
  
  // Update activity permissions
  async updateActivity(activityId, activityData) {
    if (!this.redis || !activityId) return false;
    
    try {
      await this.redis.set(`${this.keyPrefix}${activityId}`, JSON.stringify(activityData));
      console.log(`[Activity] Updated activity: ${activityId}`);
      return true;
    } catch (error) {
      console.error('Failed to update activity:', error);
      return false;
    }
  }
  
  async updateActivityPermissions(activityId, permissions) {
    if (!this.redis) return false;
    
    try {
      const activityData = await this.redis.get(`${this.keyPrefix}${activityId}`);
      if (!activityData) return false;
      
      const activity = JSON.parse(activityData);
      activity.permissions = { ...activity.permissions, ...permissions };
      
      await this.redis.set(`${this.keyPrefix}${activityId}`, JSON.stringify(activity));
      return true;
    } catch (error) {
      console.error('Failed to update activity permissions:', error);
      return false;
    }
  }
  
  // Check if user can contribute to activity
  async canUserContribute(activityId, userHash) {
    if (!this.redis) return true; // Default to allow if no Redis
    
    try {
      const activityData = await this.redis.get(`${this.keyPrefix}${activityId}`);
      if (!activityData) return false;
      
      const activity = JSON.parse(activityData);
      
      // Owner can always contribute
      if (activity.ownerId === userHash) return true;
      
      // Check if contributions are allowed
      if (!activity.permissions || !activity.permissions.allowContributions) return false;
      
      // Check if user is banned
      if (activity.permissions.bannedUsers && activity.permissions.bannedUsers.includes(userHash)) return false;
      
      return true;
    } catch (error) {
      console.error('Failed to check contribution permission:', error);
      return true; // Default to allow on error
    }
  }
}