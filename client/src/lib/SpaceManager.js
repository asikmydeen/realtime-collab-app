// Smart space allocation for infinite collaborative canvas
export class SpaceManager {
  constructor() {
    this.occupiedSpaces = new Map(); // spaceId -> { userId, bounds, lastActivity, hasDrawn }
    this.userSpaces = new Map(); // userId -> spaceId
    this.gridSize = { width: 800, height: 600 }; // Default viewport size
  }

  setViewportSize(width, height) {
    this.gridSize = { width, height };
  }

  getSpaceId(x, y) {
    const col = Math.floor(x / this.gridSize.width);
    const row = Math.floor(y / this.gridSize.height);
    return `${col},${row}`;
  }

  getSpaceBounds(spaceId) {
    const [col, row] = spaceId.split(',').map(Number);
    return {
      x: col * this.gridSize.width,
      y: row * this.gridSize.height,
      width: this.gridSize.width,
      height: this.gridSize.height
    };
  }

  findEmptySpace(startX = 0, startY = 0) {
    // Spiral search from center outward
    let x = Math.floor(startX / this.gridSize.width);
    let y = Math.floor(startY / this.gridSize.height);
    let dx = 0;
    let dy = -1;
    let steps = 1;
    let stepCount = 0;
    let stepSize = 1;

    for (let i = 0; i < 10000; i++) {
      const spaceId = `${x},${y}`;
      
      if (!this.isSpaceOccupied(spaceId)) {
        return this.getSpaceBounds(spaceId);
      }

      // Spiral pattern
      stepCount++;
      x += dx;
      y += dy;

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

    // Fallback - return a far position
    return {
      x: 10000 * this.gridSize.width,
      y: 0,
      width: this.gridSize.width,
      height: this.gridSize.height
    };
  }

  isSpaceOccupied(spaceId) {
    const space = this.occupiedSpaces.get(spaceId);
    if (!space) return false;
    
    // Check if space has timed out (1 minute of inactivity)
    const now = Date.now();
    const idleTime = now - space.lastActivity;
    
    if (idleTime > 60000 && !space.hasDrawn) {
      // Release space if idle for 1 minute without drawing
      this.releaseSpace(spaceId);
      return false;
    }
    
    return true;
  }

  claimSpace(userId, bounds) {
    const spaceId = this.getSpaceId(bounds.x, bounds.y);
    
    // Release any previous space this user had
    const previousSpace = this.userSpaces.get(userId);
    if (previousSpace && previousSpace !== spaceId) {
      this.releaseSpace(previousSpace);
    }

    // Claim new space
    this.occupiedSpaces.set(spaceId, {
      userId,
      bounds,
      lastActivity: Date.now(),
      hasDrawn: false
    });
    
    this.userSpaces.set(userId, spaceId);
    
    return spaceId;
  }

  updateActivity(userId, hasDrawn = false) {
    const spaceId = this.userSpaces.get(userId);
    if (!spaceId) return;
    
    const space = this.occupiedSpaces.get(spaceId);
    if (space && space.userId === userId) {
      space.lastActivity = Date.now();
      if (hasDrawn) {
        space.hasDrawn = true;
      }
    }
  }

  releaseSpace(spaceId) {
    const space = this.occupiedSpaces.get(spaceId);
    if (space) {
      this.userSpaces.delete(space.userId);
      this.occupiedSpaces.delete(spaceId);
    }
  }

  releaseUserSpace(userId) {
    const spaceId = this.userSpaces.get(userId);
    if (spaceId) {
      this.releaseSpace(spaceId);
    }
  }

  getOccupiedSpaces() {
    const spaces = [];
    this.occupiedSpaces.forEach((space, id) => {
      spaces.push({
        id,
        ...space
      });
    });
    return spaces;
  }

  cleanupInactiveSpaces() {
    const now = Date.now();
    const toRelease = [];
    
    this.occupiedSpaces.forEach((space, spaceId) => {
      const idleTime = now - space.lastActivity;
      if (idleTime > 60000 && !space.hasDrawn) {
        toRelease.push(spaceId);
      }
    });
    
    toRelease.forEach(spaceId => this.releaseSpace(spaceId));
  }
}