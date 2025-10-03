import { createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import { Route } from '@solidjs/router';
import { MapView } from './pages/MapView';
import { ListView } from './pages/ListView';
import { WebSocketManager } from './lib/websocket';
import { WasmProcessor } from './lib/wasm';
import { config } from './config';
import { getUserColor, generateUsername } from './utils/userColors';
import { inject } from '@vercel/analytics';

function App() {
  // State management
  const [connected, setConnected] = createSignal(false);
  const [users, setUsers] = createSignal(new Map());
  const [currentUser, setCurrentUser] = createSignal(null);
  const [tool, setTool] = createSignal('pen');
  const [color, setColor] = createSignal('#000000');
  const [brushSize, setBrushSize] = createSignal(3);
  const [username, setUsername] = createSignal(generateUsername());
  
  // Performance metrics
  const [fps, setFps] = createSignal(60);
  const [operations, setOperations] = createSignal(0);
  const [latency, setLatency] = createSignal(0);
  const [networkLatency, setNetworkLatency] = createSignal(0);
  
  // WebSocket and WASM managers
  const [wsManager, setWsManager] = createSignal(null);
  const [wasmProcessor, setWasmProcessor] = createSignal(null);
  
  onMount(async () => {
    // Initialize Vercel Analytics
    inject();
    
    // Initialize WebAssembly
    const wasm = new WasmProcessor();
    await wasm.init();
    setWasmProcessor(wasm);
    
    // Initialize WebSocket
    console.log('WebSocket URL from config:', config.wsUrl);
    const ws = new WebSocketManager(config.wsUrl);
    
    ws.on('connected', () => {
      setConnected(true);
      ws.joinRoom('world', username());
    });
    
    ws.on('welcome', (data) => {
      const userIndex = users().size;
      const userColor = getUserColor(userIndex);
      const user = {
        id: data.clientId,
        name: username(),
        color: userColor,
        isMe: true
      };
      setCurrentUser(user);
      setUsers(prev => {
        const newUsers = new Map(prev);
        newUsers.set(data.clientId, user);
        return newUsers;
      });
    });
    
    ws.on('disconnected', () => {
      setConnected(false);
    });
    
    ws.on('userJoined', (data) => {
      const userIndex = users().size;
      const userColor = getUserColor(userIndex);
      setUsers(prev => {
        const newUsers = new Map(prev);
        newUsers.set(data.clientId, {
          id: data.clientId,
          name: data.username || `User ${data.clientId.slice(-4)}`,
          color: userColor,
          isMe: false
        });
        return newUsers;
      });
    });
    
    ws.on('userLeft', (data) => {
      setUsers(prev => {
        const newUsers = new Map(prev);
        newUsers.delete(data.clientId);
        return newUsers;
      });
    });
    
    ws.on('latency', (value) => {
      setNetworkLatency(value);
    });
    
    ws.on('init', (data) => {
      // Add existing users from the room
      if (data.users) {
        data.users.forEach((user, index) => {
          if (user.id !== ws.clientId) {
            const userColor = getUserColor(users().size);
            setUsers(prev => {
              const newUsers = new Map(prev);
              newUsers.set(user.id, {
                id: user.id,
                name: user.username || `User ${user.id.slice(-4)}`,
                color: userColor,
                isMe: false
              });
              return newUsers;
            });
          }
        });
      }
    });
    
    // Set the WebSocket manager before connecting
    setWsManager(ws);
    
    // Connect after setting up the manager
    ws.connect();
    
    // Start FPS monitoring
    startFPSMonitor();
    
    // Cleanup
    onCleanup(() => {
      if (ws) ws.disconnect();
    });
  });
  
  function startFPSMonitor() {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const monitor = () => {
      frameCount++;
      const currentTime = performance.now();
      const delta = currentTime - lastTime;
      
      if (delta >= 1000) {
        setFps(Math.round((frameCount * 1000) / delta));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(monitor);
    };
    
    monitor();
  }
  
  const handleDraw = (drawData) => {
    const ws = wsManager();
    if (ws && connected()) {
      // Always send geo-based draw
      ws.send({
        type: 'geoDraw',
        ...drawData
      });
      setOperations(prev => prev + 1);
    }
  };

  return (
    <>
      <Route path="/" component={() => 
        <MapView
          connected={connected}
          users={users}
          operations={operations}
          color={color}
          setColor={setColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          wsManager={wsManager}
        />
      } />
      <Route path="/list" component={() => 
        <ListView
          connected={connected}
          wsManager={wsManager}
        />
      } />
    </>
  );
}

export default App;