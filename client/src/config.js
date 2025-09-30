// Ensure the URL always has a protocol
const getWebSocketUrl = () => {
  const url = import.meta.env.VITE_WS_URL || 
              (import.meta.env.DEV 
                ? 'ws://localhost:3001' 
                : 'wss://realtime-collab-server-production.up.railway.app');
  
  // If URL doesn't start with ws:// or wss://, add wss://
  if (url && !url.startsWith('ws://') && !url.startsWith('wss://')) {
    return 'wss://' + url;
  }
  return url;
};

export const config = {
  // WebSocket URL based on environment
  wsUrl: getWebSocketUrl(),
};