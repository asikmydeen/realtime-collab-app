// Server-side space management
export class ServerSpaceManager {
  constructor() {
    this.spaces = new Map(); // spaceId -> space info
    this.userSpaces = new Map(); // userId -> spaceId
    this.gridSize = { width: 800, height: 600 };
    
    // Start at center (0,0)
    this.centerX = 0;
    this.centerY = 0;
    
    // Track activity
    setInterval(() => this.cleanupInactiveSpaces(), 10000); // Every 10 seconds
  }

  getSpaceId(x, y) {
    const col = Math.floor(x / this.gridSize.width);
    const row = Math.floor(y / this.gridSize.height);
    return `${col},${row}`;
  }

  findEmptySpace(viewportWidth = 800, viewportHeight = 600) {
    // Update grid size based on viewport
    this.gridSize = { 
      width: Math.ceil(viewportWidth), 
      height: Math.ceil(viewportHeight) 
    };

    // Start from center and spiral outward
    let x = 0;
    let y = 0;
    let dx = 0;
    let dy = -1;
    let steps = 1;
    let stepCount = 0;
    let stepSize = 1;

    for (let i = 0; i < 10000; i++) {
      const spaceId = this.getSpaceId(x, y);
      
      if (!this.isSpaceOccupied(spaceId)) {
        return {
          x: x,
          y: y,
          width: this.gridSize.width,
          height: this.gridSize.height,
          id: spaceId
        };
      }

      // Spiral pattern
      stepCount++;
      x += dx * this.gridSize.width;
      y += dy * this.gridSize.height;

      if (stepCount === stepSize) {
        stepCount = 0;
        
        // Turn right
        const temp = dx;
        dx = -dy;
        dy = temp;
        
        // Increase step size every two turns
        steps++;
        if (steps === 2) {
          steps = 0;
          stepSize++;
        }
      }
    }

    // Emergency fallback - place far away
    return {
      x: 10000 * this.gridSize.width,
      y: 0,
      width: this.gridSize.width,
      height: this.gridSize.height,
      id: this.getSpaceId(10000 * this.gridSize.width, 0)
    };
  }

  isSpaceOccupied(spaceId) {
    const space = this.spaces.get(spaceId);
    if (!space) return false;
    
    const now = Date.now();
    const idleTime = now - space.lastActivity;
    
    // Release space if idle for 1 minute without drawing
    if (idleTime > 60000 && !space.hasDrawn) {
      this.releaseSpace(spaceId);
      return false;
    }
    
    return true;
  }

  assignSpace(userId, viewportWidth, viewportHeight) {
    // Release any previous space
    this.releaseUserSpace(userId);
    
    // Find new empty space
    const space = this.findEmptySpace(viewportWidth, viewportHeight);
    
    // Claim the space
    this.spaces.set(space.id, {
      userId,
      ...space,
      lastActivity: Date.now(),
      hasDrawn: false,
      claimedAt: Date.now()
    });
    
    this.userSpaces.set(userId, space.id);
    
    console.log(`Assigned space ${space.id} at (${space.x}, ${space.y}) to user ${userId}`);
    
    return space;
  }

  updateActivity(userId, hasDrawn = false) {
    const spaceId = this.userSpaces.get(userId);
    if (!spaceId) return;
    
    const space = this.spaces.get(spaceId);
    if (space && space.userId === userId) {
      space.lastActivity = Date.now();
      if (hasDrawn) {
        space.hasDrawn = true;
        console.log(`User ${userId} has drawn in space ${spaceId}`);
      }
    }
  }

  releaseSpace(spaceId) {
    const space = this.spaces.get(spaceId);
    if (space) {
      console.log(`Releasing space ${spaceId} from user ${space.userId}`);
      this.userSpaces.delete(space.userId);
      this.spaces.delete(spaceId);
    }
  }

  releaseUserSpace(userId) {
    const spaceId = this.userSpaces.get(userId);
    if (spaceId) {
      this.releaseSpace(spaceId);
    }
  }

  getUserSpace(userId) {
    const spaceId = this.userSpaces.get(userId);
    return spaceId ? this.spaces.get(spaceId) : null;
  }

  getAllSpaces() {
    return Array.from(this.spaces.values());
  }

  cleanupInactiveSpaces() {
    const now = Date.now();
    const toRelease = [];
    
    this.spaces.forEach((space, spaceId) => {
      const idleTime = now - space.lastActivity;
      if (idleTime > 60000 && !space.hasDrawn) {
        toRelease.push(spaceId);
      }
    });
    
    toRelease.forEach(spaceId => {
      const space = this.spaces.get(spaceId);
      if (space) {
        console.log(`Auto-releasing inactive space ${spaceId} from user ${space.userId}`);
        this.releaseSpace(spaceId);
        
        // Notify user they need to reload
        const clients = global.wsClients;
        if (clients && clients.get(space.userId)) {
          const client = clients.get(space.userId);
          if (client.ws.readyState === 1) {
            client.ws.send(JSON.stringify({ type: 'forceReload' }));
          }
        }
      }
    });
  }
}