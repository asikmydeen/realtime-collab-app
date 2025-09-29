export class WebSocketManager {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.latency = 0;
  }

  connect() {
    console.log('Connecting to WebSocket server...');
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.startPing();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected');
      this.stopPing();
      this.attemptReconnect();
    };
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'welcome':
        this.clientId = data.clientId;
        this.emit('welcome', data);
        break;
      
      case 'init':
        this.emit('init', data);
        break;
      
      case 'draw':
        this.emit('draw', data);
        break;
      
      case 'cursor':
        this.emit('cursor', data);
        break;
      
      case 'userJoined':
        this.emit('userJoined', data);
        break;
      
      case 'userLeft':
        this.emit('userLeft', data);
        break;
      
      case 'clear':
        this.emit('clear', data);
        break;
      
      case 'pong':
        this.latency = Date.now() - data.timestamp;
        this.emit('latency', this.latency);
        break;
      
      default:
        this.emit(data.type, data);
    }
  }
  
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  joinRoom(roomId) {
    this.send({ type: 'join', room: roomId });
  }
  
  sendDraw(drawData) {
    this.send({ type: 'draw', ...drawData });
  }
  
  sendCursor(cursorData) {
    this.send({ type: 'cursor', ...cursorData });
  }
  
  sendClear() {
    this.send({ type: 'clear' });
  }
  
  startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, 5000);
  }
  
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('reconnectFailed');
    }
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
  
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }
  
  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
