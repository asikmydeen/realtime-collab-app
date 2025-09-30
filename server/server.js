import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { createServer } from 'http';
import { createClient } from 'redis';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { InfiniteCanvasServer } from './infiniteCanvas.js';
import { ServerSpaceManager } from './spaceManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Redis for scaling (optional)
let redis = null;
try {
  redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  await redis.connect();
  console.log('✅ Redis connected');
} catch (error) {
  console.log('⚠️ Redis not available, using in-memory state');
}

// HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024
  }
});

// In-memory state
const rooms = new Map();
const clients = new Map();

// Infinite canvas server
const infiniteCanvas = new InfiniteCanvasServer();

// Space manager for world canvas
const spaceManager = new ServerSpaceManager();

// Make clients globally accessible for space manager
global.wsClients = clients;

// Performance metrics
let totalOperations = 0;
let totalMessages = 0;
const startTime = Date.now();

// Room management
class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.drawingHistory = [];
    this.cursors = new Map();
    this.lastActivity = Date.now();
  }

  addClient(clientId, ws) {
    this.clients.add(clientId);
    this.lastActivity = Date.now();
    
    // Send current state to new client
    ws.send(JSON.stringify({
      type: 'init',
      history: this.drawingHistory.slice(-1000), // Last 1000 operations
      cursors: Array.from(this.cursors.entries()).map(([id, data]) => ({
        id,
        ...data
      })),
      users: Array.from(this.clients).map(id => {
        const client = clients.get(id);
        return {
          id,
          username: client?.username || `User ${id.slice(-4)}`
        };
      })
    }));
    
    // Send pixel data for pixel canvas mode
    const pixels = [];
    pixelOwners.forEach((data, key) => {
      const [x, y] = key.split(',').map(Number);
      pixels.push({ x, y, ...data });
    });
    
    if (pixels.length > 0) {
      ws.send(JSON.stringify({
        type: 'bulkPixelUpdate',
        pixels
      }));
    }
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    this.cursors.delete(clientId);
    this.lastActivity = Date.now();
  }

  broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    this.clients.forEach(clientId => {
      if (clientId !== excludeId) {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === 1) {
          client.ws.send(data);
        }
      }
    });
  }

  addDrawingOperation(operation) {
    this.drawingHistory.push({
      ...operation,
      timestamp: Date.now()
    });
    
    // Keep only last 10000 operations
    if (this.drawingHistory.length > 10000) {
      this.drawingHistory = this.drawingHistory.slice(-5000);
    }
    
    this.lastActivity = Date.now();
  }

  updateCursor(clientId, cursorData) {
    this.cursors.set(clientId, cursorData);
    this.lastActivity = Date.now();
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const clientIp = req.socket.remoteAddress;
  
  console.log(`👤 New client connected: ${clientId} from ${clientIp}`);
  
  // Store client
  clients.set(clientId, {
    id: clientId,
    ws,
    room: null,
    lastPing: Date.now()
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId,
    serverTime: Date.now(),
    stats: {
      totalClients: clients.size,
      uptime: Date.now() - startTime,
      totalOperations,
      totalMessages
    }
  }));
  
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Message handler
  ws.on('message', async (data) => {
    totalMessages++;
    
    try {
      const message = JSON.parse(data);
      const client = clients.get(clientId);
      
      switch (message.type) {
        case 'join':
          handleJoinRoom(clientId, message.room || 'default', message.username);
          break;
          
        case 'draw':
          // Use world canvas draw handler for the infinite canvas
          handleWorldCanvasDraw(clientId, message);
          break;
          
        case 'cursor':
          handleCursor(clientId, message);
          break;
          
        case 'clear':
          handleClear(clientId);
          break;
          
        case 'image':
          handleImageProcess(clientId, message);
          break;
          
        case 'switchRegion':
          handleRegionSwitch(clientId, message.regionId);
          break;
          
        case 'requestChunk':
          handleChunkRequest(clientId, message.chunkId);
          break;
          
        case 'pixelPlace':
          handlePixelPlace(clientId, message);
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ 
            type: 'pong', 
            timestamp: Date.now(),
            latency: Date.now() - message.timestamp 
          }));
          break;

        // Space management messages
        case 'requestSpace':
          handleRequestSpace(clientId, message);
          break;
          
        case 'activity':
          handleActivity(clientId, message);
          break;
          
        case 'markDrawn':
          handleMarkDrawn(clientId);
          break;
          
        case 'releaseSpace':
          handleReleaseSpace(clientId);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Message error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Invalid message format' 
      }));
    }
  });
  
  // Disconnect handler
  ws.on('close', () => {
    console.log(`👋 Client disconnected: ${clientId}`);
    
    const client = clients.get(clientId);
    if (client && client.room) {
      const room = rooms.get(client.room);
      if (room) {
        room.removeClient(clientId);
        room.broadcast({
          type: 'userLeft',
          clientId
        }, clientId);
        
        // Clean up empty rooms
        if (room.clients.size === 0) {
          rooms.delete(client.room);
        }
      }
    }
    
    clients.delete(clientId);
    cleanupInfiniteCanvas(clientId);
    
    // Release space on disconnect
    spaceManager.releaseUserSpace(clientId);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Message handlers
function handleJoinRoom(clientId, roomId, username) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Leave current room if any
  if (client.room) {
    const oldRoom = rooms.get(client.room);
    if (oldRoom) {
      oldRoom.removeClient(clientId);
    }
  }
  
  // Join new room
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
  }
  
  room.addClient(clientId, client.ws);
  client.room = roomId;
  
  // Store username with client
  client.username = username || `User ${clientId.slice(-4)}`;
  
  // Notify others
  room.broadcast({
    type: 'userJoined',
    clientId,
    username: client.username,
    totalUsers: room.clients.size
  }, clientId);
  
  console.log(`📍 Client ${clientId} joined room ${roomId}`);
}

function handleDraw(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.room) return;
  
  const room = rooms.get(client.room);
  if (!room) return;
  
  totalOperations++;
  
  const drawOp = {
    id: uuidv4(),
    clientId,
    x1: message.x1,
    y1: message.y1,
    x2: message.x2,
    y2: message.y2,
    color: message.color,
    size: message.size,
    tool: message.tool || 'pen'
  };
  
  room.addDrawingOperation(drawOp);
  
  console.log(`📝 Broadcasting draw from ${clientId.slice(-4)} to ${room.clients.size - 1} other clients`);
  
  room.broadcast({
    type: 'draw',
    ...drawOp
  }, clientId);
}

function handleCursor(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.room) return;

  const room = rooms.get(client.room);
  if (!room) return;
  
  room.updateCursor(clientId, {
    x: message.x,
    y: message.y,
    color: message.color,
    name: message.name || `User ${clientId.slice(-4)}`
  });
  
  room.broadcast({
    type: 'cursor',
    clientId,
    x: message.x,
    y: message.y,
    color: message.color,
    name: message.name
  }, clientId);
}

function handleClear(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.room) return;
  
  const room = rooms.get(client.room);
  if (!room) return;
  
  room.drawingHistory = [];
  room.broadcast({
    type: 'clear'
  });
}

async function handleImageProcess(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  try {
    // Use Sharp for image processing (WebAssembly-based)
    const imageBuffer = Buffer.from(message.imageData, 'base64');
    
    const processed = await sharp(imageBuffer)
      .resize(800, 600, { fit: 'inside' })
      .blur(message.blur || 0)
      .sharpen(message.sharpen || 0)
      .normalize(message.normalize || false)
      .toBuffer();
    
    client.ws.send(JSON.stringify({
      type: 'processedImage',
      imageData: processed.toString('base64')
    }));
  } catch (error) {
    console.error('Image processing error:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Image processing failed'
    }));
  }
}

// Heartbeat interval
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Cleanup old rooms
setInterval(() => {
  const now = Date.now();
  const timeout = 60 * 60 * 1000; // 1 hour
  
  rooms.forEach((room, id) => {
    if (room.clients.size === 0 && now - room.lastActivity > timeout) {
      rooms.delete(id);
      console.log(`🧹 Cleaned up room ${id}`);
    }
  });
}, 5 * 60 * 1000); // Every 5 minutes

// REST endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    clients: clients.size,
    rooms: rooms.size,
    uptime: Date.now() - startTime,
    totalOperations,
    totalMessages
  });
});

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    clients: room.clients.size,
    operations: room.drawingHistory.length,
    lastActivity: room.lastActivity
  }));
  res.json(roomList);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket available on ws://localhost:${PORT}`);
});

// Infinite Canvas Handlers
async function handleRegionSwitch(clientId, regionId) {
  infiniteCanvas.regionManager.switchRegion(clientId, regionId);
  console.log(`Client ${clientId} switched to ${regionId}`);
}

async function handleChunkRequest(clientId, chunkId) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    const chunkData = await infiniteCanvas.getChunkData(chunkId);
    client.ws.send(JSON.stringify({
      type: 'chunkData',
      ...chunkData
    }));
  } catch (error) {
    console.error('Error loading chunk:', error);
  }
}

// Modified draw handler for infinite canvas
async function handleInfiniteCanvasDraw(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  // Process draw operation
  const affectedClients = await infiniteCanvas.handleDrawOperation(clientId, message);
  
  // Broadcast to clients in the same region
  const drawOp = {
    type: 'remoteDraw',
    clientId,
    ...message
  };

  affectedClients.forEach(targetId => {
    if (targetId !== clientId) {
      const targetClient = clients.get(targetId);
      if (targetClient && targetClient.ws.readyState === 1) {
        targetClient.ws.send(JSON.stringify(drawOp));
      }
    }
  });
}

// Cleanup on disconnect
function cleanupInfiniteCanvas(clientId) {
  infiniteCanvas.regionManager.removeClient(clientId);
}

// Pixel Canvas Handlers
const pixelOwners = new Map(); // pixel coordinate -> owner info
const pixelCooldowns = new Map(); // clientId -> last placed timestamp

function handlePixelPlace(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const { x, y, color } = message;
  const pixelKey = `${x},${y}`;
  
  // Check cooldown (5 seconds)
  const lastPlaced = pixelCooldowns.get(clientId) || 0;
  const now = Date.now();
  if (now - lastPlaced < 5000) {
    client.ws.send(JSON.stringify({
      type: 'pixelError',
      reason: 'cooldown',
      timeLeft: Math.ceil((5000 - (now - lastPlaced)) / 1000)
    }));
    return;
  }
  
  // Check if pixel is already owned by someone else
  const currentOwner = pixelOwners.get(pixelKey);
  if (currentOwner && currentOwner.owner !== clientId) {
    client.ws.send(JSON.stringify({
      type: 'pixelError',
      reason: 'owned',
      owner: currentOwner.owner
    }));
    return;
  }
  
  // Place the pixel
  pixelOwners.set(pixelKey, {
    owner: clientId,
    color,
    timestamp: now,
    username: client.username
  });
  
  pixelCooldowns.set(clientId, now);
  
  // Broadcast to all clients in the room
  const room = client.room || 'default';
  const roomObj = rooms.get(room);
  if (roomObj) {
    roomObj.broadcast({
      type: 'pixelUpdate',
      x,
      y,
      color,
      owner: clientId,
      timestamp: now
    });
  }
  
  console.log(`Pixel placed at (${x},${y}) by ${clientId}`);
}

// Space Management Handlers
function handleRequestSpace(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const space = spaceManager.assignSpace(
    clientId, 
    message.viewportWidth, 
    message.viewportHeight
  );
  
  client.ws.send(JSON.stringify({
    type: 'spaceAssigned',
    space
  }));
  
  // Broadcast space update to all clients
  broadcastSpaceUpdate();
}

function handleActivity(clientId, message) {
  spaceManager.updateActivity(clientId, message.isDrawing);
}

function handleMarkDrawn(clientId) {
  spaceManager.updateActivity(clientId, true);
}

function handleReleaseSpace(clientId) {
  spaceManager.releaseUserSpace(clientId);
  broadcastSpaceUpdate();
}

function broadcastSpaceUpdate() {
  const allSpaces = spaceManager.getAllSpaces();
  
  // Broadcast to all connected clients
  clients.forEach((client) => {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({
        type: 'spaceUpdate',
        spaces: allSpaces
      }));
    }
  });
}

// Modified draw handler to work with space-based canvas
function handleWorldCanvasDraw(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Update activity when drawing
  if (message.type === 'draw') {
    spaceManager.updateActivity(clientId, true);
  }
  
  totalOperations++;
  
  // Store last position for smooth line drawing
  if (message.type === 'draw') {
    if (!client.lastDrawPos) {
      client.lastDrawPos = { x: message.x, y: message.y };
    }
    
    // Add last position to message
    message.lastX = client.lastDrawPos.x;
    message.lastY = client.lastDrawPos.y;
    
    // Update last position
    client.lastDrawPos = { x: message.x, y: message.y };
  } else if (message.type === 'end') {
    // Clear last position on draw end
    client.lastDrawPos = null;
  }
  
  // Broadcast to all clients (they handle visibility themselves)
  clients.forEach((targetClient, targetId) => {
    if (targetId !== clientId && targetClient.ws.readyState === 1) {
      targetClient.ws.send(JSON.stringify({
        type: 'remoteDraw',
        clientId,
        ...message
      }));
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  
  clearInterval(heartbeatInterval);
  
  wss.clients.forEach((ws) => {
    ws.close();
  });
  
  server.close(() => {
    if (redis) redis.quit();
    process.exit(0);
  });
});
