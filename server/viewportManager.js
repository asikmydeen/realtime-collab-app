// Manages client viewports for efficient message routing
class ViewportManager {
  constructor() {
    this.clientViewports = new Map(); // clientId -> viewport info
    this.gridSize = 500; // Size of spatial grid cells
    this.grid = new Map(); // gridKey -> Set of clientIds
  }

  // Update client viewport
  updateViewport(clientId, viewport) {
    // Remove client from old grid cells
    this.removeFromGrid(clientId);
    
    // Store new viewport
    this.clientViewports.set(clientId, {
      x: viewport.x,
      y: viewport.y,
      width: viewport.width,
      height: viewport.height,
      zoom: viewport.zoom || 1
    });
    
    // Add client to new grid cells
    this.addToGrid(clientId, viewport);
  }

  // Get grid key for a coordinate
  getGridKey(x, y) {
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);
    return `${gridX},${gridY}`;
  }

  // Get all grid cells that intersect with a viewport
  getViewportGridCells(viewport) {
    const cells = new Set();
    const startX = Math.floor(viewport.x / this.gridSize);
    const startY = Math.floor(viewport.y / this.gridSize);
    const endX = Math.floor((viewport.x + viewport.width) / this.gridSize);
    const endY = Math.floor((viewport.y + viewport.height) / this.gridSize);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.add(`${x},${y}`);
      }
    }
    
    return cells;
  }

  // Add client to grid cells
  addToGrid(clientId, viewport) {
    const cells = this.getViewportGridCells(viewport);
    cells.forEach(cellKey => {
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, new Set());
      }
      this.grid.get(cellKey).add(clientId);
    });
  }

  // Remove client from all grid cells
  removeFromGrid(clientId) {
    this.grid.forEach(clients => {
      clients.delete(clientId);
    });
  }

  // Find clients that can see a specific point
  getClientsInView(x, y) {
    const gridKey = this.getGridKey(x, y);
    const potentialClients = this.grid.get(gridKey) || new Set();
    
    // Double-check viewport bounds for accuracy
    const visibleClients = new Set();
    potentialClients.forEach(clientId => {
      const viewport = this.clientViewports.get(clientId);
      if (viewport && this.isPointInViewport(x, y, viewport)) {
        visibleClients.add(clientId);
      }
    });
    
    return visibleClients;
  }

  // Find clients that can see a path
  getClientsForPath(points) {
    const visibleClients = new Set();
    
    // Sample points along the path to find visible clients
    const sampleRate = Math.max(1, Math.floor(points.length / 10));
    for (let i = 0; i < points.length; i += sampleRate) {
      const point = points[i];
      const clients = this.getClientsInView(point.x, point.y);
      clients.forEach(clientId => visibleClients.add(clientId));
    }
    
    return visibleClients;
  }

  // Check if a point is within a viewport
  isPointInViewport(x, y, viewport) {
    return x >= viewport.x && 
           x <= viewport.x + viewport.width &&
           y >= viewport.y && 
           y <= viewport.y + viewport.height;
  }

  // Remove client completely
  removeClient(clientId) {
    this.removeFromGrid(clientId);
    this.clientViewports.delete(clientId);
  }

  // Get statistics
  getStats() {
    let totalCells = 0;
    let totalClientsInCells = 0;
    
    this.grid.forEach(clients => {
      if (clients.size > 0) {
        totalCells++;
        totalClientsInCells += clients.size;
      }
    });
    
    return {
      totalClients: this.clientViewports.size,
      activeCells: totalCells,
      averageClientsPerCell: totalCells > 0 ? totalClientsInCells / totalCells : 0
    };
  }
}

export default ViewportManager;