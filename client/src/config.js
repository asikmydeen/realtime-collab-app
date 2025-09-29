export const config = {
  // WebSocket URL based on environment
  wsUrl: import.meta.env.VITE_WS_URL || 
         (import.meta.env.DEV 
           ? 'ws://localhost:3001' 
           : window.location.protocol === 'https:' 
             ? 'wss://realtime-collab-server.glitch.me' 
             : 'ws://localhost:3001'),
};