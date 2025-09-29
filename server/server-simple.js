import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const server = createServer();
const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let clientId = Math.random().toString(36).substr(2, 9);
  
  console.log('New client connected:', clientId);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'join':
          currentRoom = message.room || 'default';
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          
          // Send init message
          ws.send(JSON.stringify({
            type: 'init',
            history: []
          }));
          
          // Broadcast user joined
          broadcast(currentRoom, {
            type: 'userJoined',
            clientId
          }, ws);
          break;
          
        case 'draw':
          broadcast(currentRoom, {
            type: 'draw',
            ...message
          }, ws);
          break;
          
        case 'cursor':
          broadcast(currentRoom, {
            type: 'cursor',
            clientId,
            ...message
          }, ws);
          break;
          
        case 'clear':
          broadcast(currentRoom, {
            type: 'clear'
          });
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      broadcast(currentRoom, {
        type: 'userLeft',
        clientId
      });
    }
  });
});

function broadcast(room, message, exclude = null) {
  if (!rooms.has(room)) return;
  
  const data = JSON.stringify(message);
  rooms.get(room).forEach(client => {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});