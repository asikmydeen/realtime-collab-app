export const config = {
  // WebSocket URL based on environment
  wsUrl: import.meta.env.VITE_WS_URL || 
         (import.meta.env.DEV 
           ? 'ws://localhost:3001' 
           : 'wss://realtime-collab-server.onrender.com'), // Will update this after deploying server
};