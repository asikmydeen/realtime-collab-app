import 'dotenv/config';
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
import { DrawingPersistence } from './drawingPersistence.js';
import ConnectionManager from './connectionManager.js';
import MessageBatcher from './messageBatcher.js';
import ViewportManager from './viewportManager.js';
import { GeoDrawingPersistence } from './geoDrawingPersistence.js';
import { ActivityPersistence } from './activityPersistence.js';
import { UserIdentityManager } from './userIdentity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Redis for scaling (optional)
let redis = null;
try {
  // Use Redis Cloud configuration if credentials are available
  if (process.env.REDIS_HOST && process.env.REDIS_PASSWORD) {
    redis = createClient({
      username: 'default',
      password: process.env.REDIS_PASSWORD,
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });
  } else if (process.env.REDIS_URL) {
    // Fallback to Redis URL format
    redis = createClient({
      url: process.env.REDIS_URL
    });
  } else {
    // Local Redis
    redis = createClient({
      url: 'redis://localhost:6379'
    });
  }
  
  redis.on('error', err => console.error('Redis Client Error:', err));
  
  await redis.connect();
  console.log('✅ Redis connected successfully');
  
  // Test connection
  await redis.set('test_connection', 'ok');
  const test = await redis.get('test_connection');
  console.log('✅ Redis test:', test);
} catch (error) {
  console.log('⚠️ Redis not available, using in-memory state:', error.message);
  redis = null;
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

// Drawing persistence
const drawingPersistence = new DrawingPersistence(redis);
const geoDrawingPersistence = new GeoDrawingPersistence(redis);
const activityPersistence = new ActivityPersistence(redis);
const userIdentityManager = new UserIdentityManager(redis);

// Connection manager for handling connection queue
const connectionManager = new ConnectionManager({
  maxConcurrentConnections: 100,
  connectionTimeout: 30000
});

// Message batcher for optimizing broadcasts
const messageBatcher = new MessageBatcher({
  batchInterval: 50,
  maxBatchSize: 100
});

// Viewport manager for spatial filtering
const viewportManager = new ViewportManager();

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
    this.clients.forEach(clientId => {
      if (clientId !== excludeId) {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === 1) {
          // Use message batcher for non-critical messages
          if (message.type === 'remoteDraw' || message.type === 'cursor') {
            messageBatcher.addMessage(clientId, message, (data) => {
              if (client.ws.readyState === 1) {
                client.ws.send(data);
              }
            });
          } else {
            // Send immediately for critical messages
            client.ws.send(JSON.stringify(message));
          }
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

// WebSocket connection handler with queue management
wss.on('connection', async (ws, req) => {
  // Add to connection queue
  const connectionId = await connectionManager.addToQueue(ws, req);
  console.log(`⏳ Connection ${connectionId} added to queue`);
});

// Handle connections after they're processed by queue
connectionManager.on('connection', async (ws, req) => {
  const clientId = uuidv4();
  const clientIp = req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  console.log(`👤 New client connected: ${clientId} from ${clientIp}`);
  
  // Check for userHash in URL
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const urlUserHash = url.searchParams.get('userHash');
  
  // Get or create user hash
  const clientInfo = { ip: clientIp, userAgent };
  let userHash;
  
  if (urlUserHash) {
    console.log(`[Auth] Client provided userHash in URL: ${urlUserHash}`);
    // Verify it exists
    const exists = await userIdentityManager.userHashExists(urlUserHash);
    if (exists) {
      userHash = urlUserHash;
      console.log(`[Auth] Using authenticated hash: ${userHash}`);
      await userIdentityManager.getUserIdentity(userHash);
    } else {
      console.log(`[Auth] Invalid userHash provided, generating new one`);
      userHash = await userIdentityManager.getOrCreateUserHash(clientInfo);
    }
  } else {
    userHash = await userIdentityManager.getOrCreateUserHash(clientInfo);
    console.log(`[Auth] Generated new user hash for ${clientId}: ${userHash}`);
  }
  
  // Store client
  clients.set(clientId, {
    id: clientId,
    ws,
    room: null,
    lastPing: Date.now(),
    userHash, // Persistent user identifier
    location: null
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId,
    userHash, // Send user hash to client for persistent identity
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
        case 'authenticate':
          handleAuthenticate(clientId, message);
          break;
          
        case 'join':
          handleJoinRoom(clientId, message.room || 'default', message.username);
          break;
          
        case 'draw':
          console.log(`[Server] Received draw message from ${clientId}:`, message);
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
          
        case 'loadDrawings':
          handleLoadDrawings(clientId, message);
          break;
          
        case 'updateViewport':
          handleViewportUpdate(clientId, message);
          break;
          
        case 'geoDraw':
          handleGeoDraw(clientId, message);
          break;
          
        case 'setLocation':
          handleSetLocation(clientId, message);
          break;
          
        case 'updateGeoViewport':
          handleGeoViewportUpdate(clientId, message);
          break;
          
        case 'requestWorldArtwork':
          handleRequestWorldArtwork(clientId, message);
          break;
          
        case 'createActivity':
          handleCreateActivity(clientId, message);
          break;
          
        case 'getActivities':
          handleGetActivities(clientId, message);
          break;
          
        case 'joinActivity':
          handleJoinActivity(clientId, message);
          break;
          
        case 'leaveActivity':
          handleLeaveActivity(clientId, message);
          break;
          
        case 'activityDraw':
          handleActivityDraw(clientId, message);
          break;
          
        case 'getDefaultActivity':
          handleGetDefaultActivity(clientId, message);
          break;
          
        case 'getMyActivities':
          handleGetMyActivities(clientId, message);
          break;
          
        case 'updateActivityPermissions':
          handleUpdateActivityPermissions(clientId, message);
          break;
          
        case 'removeUserDrawing':
          handleRemoveUserDrawing(clientId, message);
          break;
          
        case 'requestContribution':
          handleRequestContribution(clientId, message);
          break;
          
        case 'approveContributor':
          handleApproveContributor(clientId, message);
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
    
    // Clean up message batcher
    messageBatcher.removeClient(clientId);
    
    // Clean up viewport manager
    viewportManager.removeClient(clientId);
    
    // Notify others that artist went offline
    if (client && client.location) {
      const locationUpdate = {
        type: 'artistLocation',
        clientId,
        active: false
      };
      
      clients.forEach((targetClient) => {
        if (targetClient.ws.readyState === 1) {
          targetClient.ws.send(JSON.stringify(locationUpdate));
        }
      });
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
app.get('/health', async (req, res) => {
  const drawingStats = await getDrawingStats();
  const connectionStats = connectionManager.getStats();
  const batcherStats = messageBatcher.getStats();
  const viewportStats = viewportManager.getStats();
  
  res.json({
    status: 'healthy',
    clients: clients.size,
    rooms: rooms.size,
    uptime: Date.now() - startTime,
    totalOperations,
    totalMessages,
    drawings: drawingStats,
    connections: connectionStats,
    batcher: batcherStats,
    viewports: viewportStats
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
  if (!client) {
    console.error(`[Draw] Client ${clientId} not found`);
    return;
  }
  
  console.log(`[Draw] Received from ${clientId}:`, { drawType: message.drawType, x: message.x, y: message.y });
  
  // Update activity when drawing
  if (message.drawType === 'draw' || message.drawType === 'start') {
    spaceManager.updateActivity(clientId, true);
  }
  
  totalOperations++;
  
  // Handle drawing path tracking
  if (message.drawType === 'start') {
    // Start a new path
    client.currentPath = {
      clientId,
      color: message.color,
      size: message.size,
      points: [{ x: message.x, y: message.y }]
    };
    client.lastDrawPos = { x: message.x, y: message.y };
  } else if (message.drawType === 'draw') {
    // Add point to current path
    if (client.currentPath) {
      client.currentPath.points.push({ x: message.x, y: message.y });
    }
    
    if (!client.lastDrawPos) {
      client.lastDrawPos = { x: message.x, y: message.y };
    }
    
    // Add last position to message for smooth lines
    message.lastX = client.lastDrawPos.x;
    message.lastY = client.lastDrawPos.y;
    
    client.lastDrawPos = { x: message.x, y: message.y };
  } else if (message.drawType === 'end') {
    // Save completed path
    if (client.currentPath && client.currentPath.points.length > 1) {
      drawingPersistence.savePath(client.currentPath).catch(err => {
        console.error('Failed to save drawing path:', err);
      });
    }
    
    client.currentPath = null;
    client.lastDrawPos = null;
  }
  
  // Remove the 'type' field from message before broadcasting to avoid conflicts
  const { type, ...drawData } = message;
  
  // Broadcast to clients with viewport filtering
  let broadcastCount = 0;
  const broadcastMessage = {
    type: 'remoteDraw',
    clientId,
    ...drawData  // This now excludes the original 'type' field
  };
  
  // Get clients that can see this drawing
  let visibleClients;
  if (message.drawType === 'draw' && message.x !== undefined && message.y !== undefined) {
    // For draw events, only send to clients who can see the point
    visibleClients = viewportManager.getClientsInView(message.x, message.y);
  } else if (message.drawType === 'end' && client.currentPath && client.currentPath.points.length > 0) {
    // For end events, send to all clients who saw any part of the path
    visibleClients = viewportManager.getClientsForPath(client.currentPath.points);
  } else {
    // For start events or fallback, use all clients
    visibleClients = new Set(clients.keys());
  }
  
  visibleClients.forEach(targetId => {
    if (targetId !== clientId) {
      const targetClient = clients.get(targetId);
      if (targetClient && targetClient.ws.readyState === 1) {
        broadcastCount++;
        messageBatcher.addMessage(targetId, broadcastMessage, (data) => {
          if (targetClient.ws.readyState === 1) {
            targetClient.ws.send(data);
          }
        });
      }
    }
  });
  
  console.log(`[Draw] Broadcasted to ${broadcastCount}/${clients.size - 1} visible clients`);
}

// Load drawings for viewport
async function handleLoadDrawings(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const { x, y, width, height } = message.viewport || { x: -2500, y: -2500, width: 5000, height: 5000 };
  
  try {
    console.log(`[Load] Loading drawings for viewport: ${x},${y} ${width}x${height}`);
    const drawings = await drawingPersistence.loadDrawingsInViewport(x, y, width, height);
    
    // If no drawings, send empty response
    if (drawings.length === 0) {
      client.ws.send(JSON.stringify({
        type: 'drawingHistory',
        drawings: [],
        batchIndex: 0,
        totalBatches: 0
      }));
      console.log(`[Load] No drawings found for viewport`);
      return;
    }
    
    // Send drawings in batches to avoid overwhelming the client
    const batchSize = 50;
    for (let i = 0; i < drawings.length; i += batchSize) {
      const batch = drawings.slice(i, i + batchSize);
      
      client.ws.send(JSON.stringify({
        type: 'drawingHistory',
        drawings: batch,
        batchIndex: Math.floor(i / batchSize),
        totalBatches: Math.ceil(drawings.length / batchSize)
      }));
      
      // Small delay between batches
      if (i + batchSize < drawings.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log(`[Load] Sent ${drawings.length} drawings in ${Math.ceil(drawings.length / batchSize)} batches`);
  } catch (error) {
    console.error('Failed to load drawings:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to load drawing history'
    }));
  }
}

// Get drawing statistics
async function getDrawingStats() {
  try {
    const stats = await drawingPersistence.getStats();
    return stats;
  } catch (error) {
    console.error('Failed to get drawing stats:', error);
    return { totalDrawings: 0, storageType: 'unknown' };
  }
}

// Handle viewport update
function handleViewportUpdate(clientId, message) {
  if (!message.viewport) return;
  
  const { x, y, width, height, zoom } = message.viewport;
  
  viewportManager.updateViewport(clientId, {
    x: x || 0,
    y: y || 0,
    width: width || 1920,
    height: height || 1080,
    zoom: zoom || 1
  });
  
  console.log(`[Viewport] Updated for ${clientId}: ${width}x${height} at (${x}, ${y}), zoom: ${zoom}`);
}

// Handle geo-based drawing
function handleGeoDraw(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  console.log(`[GeoDraw] Received from ${clientId}:`, { drawType: message.drawType, lat: message.lat, lng: message.lng });
  
  // Track geo path
  if (message.drawType === 'start') {
    client.currentGeoPath = {
      clientId,
      color: message.color,
      size: message.size,
      points: [{ lat: message.lat, lng: message.lng }],
      location: client.location
    };
  } else if (message.drawType === 'draw') {
    if (client.currentGeoPath) {
      client.currentGeoPath.points.push({ lat: message.lat, lng: message.lng });
    }
  } else if (message.drawType === 'end') {
    // Save completed geo path
    if (client.currentGeoPath && client.currentGeoPath.points.length > 1) {
      console.log(`[GeoDraw] Saving path with ${client.currentGeoPath.points.length} points`);
      geoDrawingPersistence.saveGeoPath(client.currentGeoPath)
        .then(pathId => {
          console.log(`[GeoDraw] Saved geo path: ${pathId}`);
        })
        .catch(err => {
          console.error('Failed to save geo path:', err);
        });
    }
    client.currentGeoPath = null;
  }
  
  // Broadcast to other clients
  const broadcastMessage = {
    type: 'remoteGeoDraw',
    clientId,
    ...message
  };
  
  // For now, broadcast to all clients (could optimize with geo proximity later)
  let broadcastCount = 0;
  clients.forEach((targetClient, targetId) => {
    if (targetId !== clientId && targetClient.ws.readyState === 1) {
      broadcastCount++;
      // Send geo draw messages immediately for real-time updates
      targetClient.ws.send(JSON.stringify(broadcastMessage));
    }
  });
  
  console.log(`[GeoDraw] Broadcasted to ${broadcastCount} clients`);
}

// Handle user location update
function handleSetLocation(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.location) return;
  
  client.location = message.location;
  console.log(`[Location] Client ${clientId} at ${message.location.lat}, ${message.location.lng}`);
  
  // Broadcast artist location for world map
  const locationUpdate = {
    type: 'artistLocation',
    clientId,
    lat: message.location.lat,
    lng: message.location.lng,
    active: true
  };
  
  clients.forEach((targetClient, targetId) => {
    if (targetClient.ws.readyState === 1) {
      targetClient.ws.send(JSON.stringify(locationUpdate));
    }
  });
}

// Handle geo viewport update
function handleGeoViewportUpdate(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.viewport) return;
  
  client.geoViewport = message.viewport;
  console.log(`[GeoViewport] Updated for ${clientId}:`, message.viewport.bounds);
  
  // Load drawings for the new viewport
  loadGeoDrawingsForClient(clientId, message.viewport.bounds);
}

// Load geo drawings for a client's viewport
async function loadGeoDrawingsForClient(clientId, bounds) {
  const client = clients.get(clientId);
  if (!client) return;
  
  console.log(`[LoadGeoDrawings] Loading drawings for ${clientId} in bounds:`, bounds);
  
  try {
    const drawings = await geoDrawingPersistence.loadGeoDrawings(bounds, 500);
    
    console.log(`[LoadGeoDrawings] Found ${drawings.length} drawings`);
    
    // If no drawings, send empty response
    if (drawings.length === 0) {
      client.ws.send(JSON.stringify({
        type: 'geoDrawingHistory',
        drawings: [],
        batchIndex: 0,
        totalBatches: 0
      }));
      return;
    }
    
    // Send in batches
    const batchSize = 50;
    for (let i = 0; i < drawings.length; i += batchSize) {
      const batch = drawings.slice(i, i + batchSize);
      
      client.ws.send(JSON.stringify({
        type: 'geoDrawingHistory',
        drawings: batch,
        batchIndex: Math.floor(i / batchSize),
        totalBatches: Math.ceil(drawings.length / batchSize)
      }));
      
      if (i + batchSize < drawings.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  } catch (error) {
    console.error('Failed to load geo drawings:', error);
  }
}

// Handle world artwork request
async function handleRequestWorldArtwork(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  try {
    // Get heatmap data
    const hotspots = await geoDrawingPersistence.getWorldHeatmap();
    const stats = await geoDrawingPersistence.getGlobalStats();
    
    client.ws.send(JSON.stringify({
      type: 'worldArtworkData',
      hotspots,
      stats: {
        totalArtists: clients.size,
        totalDrawings: stats.totalPaths,
        activeCountries: stats.activeCountries
      }
    }));
  } catch (error) {
    console.error('Failed to get world artwork data:', error);
  }
}

// Activity handlers
async function handleCreateActivity(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  try {
    // Check if user is at the location (within 500m)
    if (client.location) {
      const canCreate = await activityPersistence.canCreateActivityAt(
        client.location.lat,
        client.location.lng,
        message.lat,
        message.lng
      );
      
      if (!canCreate) {
        console.log(`[Activity] User ${clientId} not close enough to create activity at ${message.lat}, ${message.lng}`);
        client.ws.send(JSON.stringify({
          type: 'error',
          message: 'You must be within 500 meters of the location to create an activity there'
        }));
        return;
      }
    }
    
    console.log(`[CreateActivity] Creating activity with owner hash: ${client.userHash}`);
    
    const activity = await activityPersistence.createActivity({
      title: message.title,
      description: message.description,
      lat: message.lat,
      lng: message.lng,
      address: message.address,
      street: message.street,
      ownerId: client.userHash, // Set persistent owner
      ownerName: client.username,
      creatorId: clientId,
      creatorName: client.username
    });
    
    console.log(`[Activity] Created: ${activity.id} at ${activity.street} by owner ${client.userHash} (client: ${clientId}`);
    
    // Join the creator to their activity
    client.currentActivity = activity.id;
    
    client.ws.send(JSON.stringify({
      type: 'activityCreated',
      activity
    }));
    
    // Notify others in the area
    broadcastActivityUpdate(activity);
  } catch (error) {
    console.error('Failed to create activity:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create activity'
    }));
  }
}

async function handleGetActivities(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.bounds) return;
  
  try {
    const zoom = message.zoom || 15;
    console.log(`[GetActivities] Client ${clientId} requesting activities at zoom ${zoom}`);
    
    if (zoom >= 17) { // Street level - show individual activities
      const activities = await activityPersistence.getActivitiesInBounds(message.bounds);
      console.log(`[GetActivities] Found ${activities.length} activities at street level`);
      
      client.ws.send(JSON.stringify({
        type: 'activities',
        activities,
        viewType: 'detailed'
      }));
    } else { // Zoomed out - show aggregated by street
      const streetActivities = await activityPersistence.getStreetActivities(message.bounds);
      const streetCount = Object.keys(streetActivities).length;
      console.log(`[GetActivities] Found ${streetCount} streets with activities`);
      
      client.ws.send(JSON.stringify({
        type: 'activities',
        streetActivities,
        viewType: 'aggregated'
      }));
    }
  } catch (error) {
    console.error('Failed to get activities:', error);
  }
}

async function handleJoinActivity(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.activityId) return;
  
  // Leave current activity if any
  if (client.currentActivity) {
    handleLeaveActivity(clientId, { activityId: client.currentActivity });
  }
  
  client.currentActivity = message.activityId;
  console.log(`[JoinActivity] ${clientId} joining activity ${message.activityId}`);
  
  // Load canvas data for the activity
  const canvasData = await activityPersistence.loadActivityCanvas(message.activityId);
  
  // Also load activity data to get permissions/requests
  const activity = await activityPersistence.getActivity(message.activityId);
  
  client.ws.send(JSON.stringify({
    type: 'activityJoined',
    activityId: message.activityId,
    canvasData: canvasData || { paths: [] },
    activity: activity
  }));
  
  // Update participant count
  const participants = getActivityParticipants(message.activityId);
  console.log(`[JoinActivity] Activity ${message.activityId} now has ${participants.size} participants`);
  
  await activityPersistence.updateActivityStats(message.activityId, {
    participantCount: participants.size
  });
  
  // Notify other participants
  broadcastToActivity(message.activityId, {
    type: 'participantJoined',
    clientId,
    username: client.username
  }, clientId);
  
  console.log(`[Activity] ${clientId} joined activity ${message.activityId} with ${participants.size - 1} other participants`);
}

function handleLeaveActivity(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const activityId = message.activityId || client.currentActivity;
  if (!activityId) return;
  
  client.currentActivity = null;
  
  // Notify other participants
  broadcastToActivity(activityId, {
    type: 'participantLeft',
    clientId,
    username: client.username
  }, clientId);
  
  // Update participant count
  const participants = getActivityParticipants(activityId);
  activityPersistence.updateActivityStats(activityId, {
    participantCount: participants.size
  }).catch(err => console.error('Failed to update participant count:', err));
  
  console.log(`[Activity] ${clientId} left activity ${activityId}`);
}

async function handleActivityDraw(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.currentActivity) return;
  
  const activityId = client.currentActivity;
  
  // Check if user can contribute
  const canContribute = await activityPersistence.canUserContribute(activityId, client.userHash);
  if (!canContribute) {
    console.log(`[ActivityDraw] User ${client.userHash} not allowed to draw in activity ${activityId}`);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'You do not have permission to draw in this activity'
    }));
    return;
  }
  
  console.log(`[ActivityDraw] ${clientId} drawing in activity ${activityId}, type: ${message.drawType}`);
  
  // Track drawing path
  if (message.drawType === 'start') {
    client.currentActivityPath = {
      color: message.color,
      size: message.size,
      points: [{ x: message.x, y: message.y }]
    };
  } else if (message.drawType === 'draw') {
    if (client.currentActivityPath) {
      client.currentActivityPath.points.push({ x: message.x, y: message.y });
    }
  } else if (message.drawType === 'end') {
    // Save the path
    if (client.currentActivityPath && client.currentActivityPath.points.length > 1) {
      // Load existing canvas data
      let canvasData = await activityPersistence.loadActivityCanvas(activityId) || { paths: [] };
      
      // Add new path with unique ID
      canvasData.paths.push({
        ...client.currentActivityPath,
        pathId: `${clientId}_${Date.now()}`, // Unique path ID
        clientId,
        userHash: client.userHash, // Store user hash with path
        timestamp: Date.now()
      });
      
      // Save updated canvas
      await activityPersistence.saveActivityCanvas(activityId, canvasData);
    }
    client.currentActivityPath = null;
  }
  
  // Get participants for logging
  const participants = getActivityParticipants(activityId);
  console.log(`[ActivityDraw] Broadcasting to ${participants.size - 1} other participants in activity ${activityId}`);
  
  // Broadcast to other participants
  // Remove the 'type' field from message to avoid overwriting
  const { type, ...drawData } = message;
  broadcastToActivity(activityId, {
    type: 'remoteActivityDraw',
    clientId,
    ...drawData
  }, clientId);
}

// Helper: Get participants of an activity
function getActivityParticipants(activityId) {
  const participants = new Set();
  clients.forEach((client, clientId) => {
    if (client.currentActivity === activityId) {
      participants.add(clientId);
    }
  });
  return participants;
}

// Helper: Broadcast to all participants in an activity
function broadcastToActivity(activityId, message, excludeId = null) {
  const participants = getActivityParticipants(activityId);
  console.log(`[BroadcastActivity] Sending ${message.type} to ${participants.size - 1} participants in activity ${activityId}`);
  
  let sentCount = 0;
  participants.forEach(participantId => {
    if (participantId !== excludeId) {
      const participant = clients.get(participantId);
      if (participant && participant.ws.readyState === 1) {
        // Always send activity messages immediately for real-time collaboration
        participant.ws.send(JSON.stringify(message));
        sentCount++;
        console.log(`[BroadcastActivity] Sent ${message.type} to participant ${participantId}`);
      }
    } else {
      console.log(`[BroadcastActivity] Skipping sender ${participantId}`);
    }
  });
  
  if (sentCount === 0) {
    console.log(`[BroadcastActivity] WARNING: No participants received the message (activity: ${activityId})`);
  }
}

// Helper: Broadcast activity update to users in the area
function broadcastActivityUpdate(activity) {
  clients.forEach((client) => {
    if (client.ws.readyState === 1 && client.geoViewport) {
      // Check if activity is in client's viewport
      const bounds = client.geoViewport.bounds;
      if (bounds && activityPersistence.isInBounds(activity.lat, activity.lng, bounds)) {
        client.ws.send(JSON.stringify({
          type: 'activityUpdate',
          activity
        }));
      }
    }
  });
}

// Handle default activity
async function handleGetDefaultActivity(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  try {
    const activity = await activityPersistence.getOrCreateDefaultActivity({
      lat: message.lat,
      lng: message.lng,
      locationName: message.locationName,
      address: message.address,
      street: message.street || 'Community Area'
    });
    
    console.log(`[Activity] Got default activity: ${activity.id} for ${activity.street}`);
    
    // Auto-join the default activity
    client.currentActivity = activity.id;
    console.log(`[DefaultActivity] ${clientId} auto-joined activity ${activity.id}`);
    
    // Load canvas data
    const canvasData = await activityPersistence.loadActivityCanvas(activity.id);
    
    client.ws.send(JSON.stringify({
      type: 'defaultActivity',
      activity,
      canvasData: canvasData || { paths: [] }
    }));
    
    // Update participant count
    const participants = getActivityParticipants(activity.id);
    await activityPersistence.updateActivityStats(activity.id, {
      participantCount: participants.size
    });
    
    // Notify other participants
    broadcastToActivity(activity.id, {
      type: 'participantJoined',
      clientId,
      username: client.username
    }, clientId);
    
  } catch (error) {
    console.error('Failed to get default activity:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get default activity'
    }));
  }
}

// Get user's created activities
async function handleGetMyActivities(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  try {
    const activities = await activityPersistence.getActivitiesByOwner(client.userHash);
    console.log(`[MyActivities] Found ${activities.length} activities for owner ${client.userHash}`);
    
    client.ws.send(JSON.stringify({
      type: 'myActivities',
      activities
    }));
  } catch (error) {
    console.error('Failed to get user activities:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get your activities'
    }));
  }
}

// Update activity permissions (owner only)
async function handleUpdateActivityPermissions(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.activityId) return;
  
  try {
    // Load activity to check ownership
    const activityKey = `activity:${message.activityId}`;
    const activityData = await redis.get(activityKey);
    if (!activityData) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Activity not found'
      }));
      return;
    }
    
    const activity = JSON.parse(activityData);
    if (activity.ownerId !== client.userHash) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not own this activity'
      }));
      return;
    }
    
    // Update permissions
    await activityPersistence.updateActivityPermissions(message.activityId, message.permissions);
    
    console.log(`[Permissions] Updated permissions for activity ${message.activityId}`);
    
    client.ws.send(JSON.stringify({
      type: 'permissionsUpdated',
      activityId: message.activityId,
      permissions: message.permissions
    }));
    
    // Notify participants of permission change
    broadcastToActivity(message.activityId, {
      type: 'activityPermissionsChanged',
      permissions: message.permissions
    }, clientId);
  } catch (error) {
    console.error('Failed to update permissions:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to update permissions'
    }));
  }
}

// Remove a user's drawing from activity (owner/moderator only)
async function handleRemoveUserDrawing(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.activityId || !message.pathId) return;
  
  try {
    // Load activity to check ownership/moderation
    const activityKey = `activity:${message.activityId}`;
    const activityInfo = await redis.get(activityKey);
    if (!activityInfo) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Activity not found'
      }));
      return;
    }
    
    const activityData = JSON.parse(activityInfo);
    
    // Check if user is owner or moderator
    const isOwner = activityData.ownerId === client.userHash;
    const isModerator = activityData.permissions?.moderators?.includes(client.userHash);
    
    if (!isOwner && !isModerator) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to remove drawings'
      }));
      return;
    }
    
    // Load canvas and remove the path
    const canvasData = await activityPersistence.loadActivityCanvas(message.activityId);
    if (canvasData && canvasData.paths) {
      canvasData.paths = canvasData.paths.filter(path => path.pathId !== message.pathId);
      await activityPersistence.saveActivityCanvas(message.activityId, canvasData);
    }
    
    console.log(`[RemoveDraw] Removed drawing ${message.pathId} from activity ${message.activityId}`);
    
    // Broadcast removal to all participants
    broadcastToActivity(message.activityId, {
      type: 'drawingRemoved',
      pathId: message.pathId
    });
  } catch (error) {
    console.error('Failed to remove drawing:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to remove drawing'
    }));
  }
}

// Handle authentication with existing user hash
async function handleAuthenticate(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.userHash) return;
  
  try {
    // Verify the hash exists in our system
    const exists = await userIdentityManager.userHashExists(message.userHash);
    
    if (exists) {
      // Update client with the authenticated hash
      client.userHash = message.userHash;
      console.log(`[Auth] Client ${clientId} authenticated with existing hash: ${message.userHash}`);
      
      // Update user identity last seen
      await userIdentityManager.getUserIdentity(message.userHash);
      
      // Re-send welcome with the authenticated hash
      client.ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        userHash: message.userHash
      }));
    } else {
      console.log(`[Auth] Invalid user hash from ${clientId}: ${message.userHash}`);
      // Keep the originally generated hash
    }
  } catch (error) {
    console.error('Authentication error:', error);
  }
}

// Handle contribution request
async function handleRequestContribution(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.activityId) return;
  
  try {
    // Load activity
    const activity = await activityPersistence.getActivity(message.activityId);
    if (!activity) return;
    
    // Check if user is already approved or banned
    if (activity.permissions?.approvedContributors?.includes(client.userHash)) {
      client.ws.send(JSON.stringify({
        type: 'contributionStatus',
        status: 'already_approved'
      }));
      return;
    }
    
    if (activity.permissions?.bannedUsers?.includes(client.userHash)) {
      client.ws.send(JSON.stringify({
        type: 'contributionStatus',
        status: 'banned'
      }));
      return;
    }
    
    // Add to requests if not already there
    if (!activity.permissions.contributorRequests) {
      activity.permissions.contributorRequests = [];
    }
    
    const existingRequest = activity.permissions.contributorRequests.find(
      req => req.userHash === client.userHash
    );
    
    if (!existingRequest) {
      activity.permissions.contributorRequests.push({
        userHash: client.userHash,
        clientId: clientId,
        timestamp: Date.now()
      });
      
      // Update activity
      await activityPersistence.updateActivity(message.activityId, activity);
      
      // Notify the owner
      const ownerClients = Array.from(clients.entries())
        .filter(([_, c]) => c.userHash === activity.ownerId);
      
      ownerClients.forEach(([_, ownerClient]) => {
        ownerClient.ws.send(JSON.stringify({
          type: 'contributionRequest',
          activityId: message.activityId,
          activityTitle: activity.title,
          requester: {
            userHash: client.userHash,
            clientId: clientId
          }
        }));
      });
    }
    
    client.ws.send(JSON.stringify({
      type: 'contributionStatus',
      status: 'requested'
    }));
    
  } catch (error) {
    console.error('Failed to handle contribution request:', error);
  }
}

// Handle contributor approval
async function handleApproveContributor(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.activityId || !message.userHash) return;
  
  try {
    // Load activity
    const activity = await activityPersistence.getActivity(message.activityId);
    if (!activity) return;
    
    // Check if user is owner
    if (activity.ownerId !== client.userHash) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Only the owner can approve contributors'
      }));
      return;
    }
    
    // Add to approved contributors
    if (!activity.permissions.approvedContributors) {
      activity.permissions.approvedContributors = [];
    }
    
    if (!activity.permissions.approvedContributors.includes(message.userHash)) {
      activity.permissions.approvedContributors.push(message.userHash);
    }
    
    // Remove from requests
    if (activity.permissions.contributorRequests) {
      activity.permissions.contributorRequests = activity.permissions.contributorRequests.filter(
        req => req.userHash !== message.userHash
      );
    }
    
    // Update activity
    await activityPersistence.updateActivity(message.activityId, activity);
    
    // Notify the approved user
    const approvedClients = Array.from(clients.entries())
      .filter(([_, c]) => c.userHash === message.userHash);
    
    approvedClients.forEach(([_, approvedClient]) => {
      approvedClient.ws.send(JSON.stringify({
        type: 'contributionStatus',
        status: 'approved',
        activityId: message.activityId
      }));
    });
    
    // Broadcast to all participants
    broadcastToActivity(message.activityId, {
      type: 'activityUpdate',
      activity: activity
    });
    
  } catch (error) {
    console.error('Failed to approve contributor:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  
  clearInterval(heartbeatInterval);
  
  // Shutdown connection manager
  await connectionManager.shutdown();
  
  wss.clients.forEach((ws) => {
    ws.close();
  });
  
  server.close(() => {
    if (redis) redis.quit();
    process.exit(0);
  });
});
