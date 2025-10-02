import { createSignal, onMount, onCleanup, createEffect, For } from 'solid-js';
import { ActivityView } from './components/ActivityView';
import { WebSocketManager } from './lib/websocket';
import { WasmProcessor } from './lib/wasm';
import { config } from './config';
import { getUserColor, generateUsername, getContrastColor } from './utils/userColors';

function App() {
  // State management
  const [connected, setConnected] = createSignal(false);
  const [users, setUsers] = createSignal(new Map());
  const [currentUser, setCurrentUser] = createSignal(null);
  const [tool, setTool] = createSignal('pen');
  const [color, setColor] = createSignal('#000000');
  const [brushSize, setBrushSize] = createSignal(3);
  const [username, setUsername] = createSignal(generateUsername());
  
  // We only have geo mode now - removed mode switching
  
  // Performance metrics
  const [fps, setFps] = createSignal(60);
  const [operations, setOperations] = createSignal(0);
  const [latency, setLatency] = createSignal(0);
  const [networkLatency, setNetworkLatency] = createSignal(0);
  
  // WebSocket and WASM managers
  const [wsManager, setWsManager] = createSignal(null);
  const [wasmProcessor, setWasmProcessor] = createSignal(null);
  
  // Canvas API
  const [canvasAPI, setCanvasAPI] = createSignal(null);
  
  onMount(async () => {
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
  
  const handleInactive = () => {
    // Show inactive message
    console.log('User inactive - need to reload for new space');
  };

  return (
    <div class="app" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Minimal Header */}
      <header style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '50px',
        background: 'rgba(0, 0, 0, 0.8)',
        'backdrop-filter': 'blur(10px)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '0 20px',
        'z-index': 1000,
        'box-shadow': '0 2px 20px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '20px' }}>
          <h1 style={{ 
            margin: 0, 
            'font-size': '18px', 
            'font-weight': '600',
            color: 'white',
            display: 'flex',
            'align-items': 'center',
            gap: '8px'
          }}>
            <span style={{ 'font-size': '24px' }}>✨</span>
            Infinite Canvas
          </h1>
          <div style={{ 
            display: 'flex', 
            gap: '15px',
            color: 'rgba(255, 255, 255, 0.8)',
            'font-size': '14px'
          }}>
            <span style={{ color: connected() ? '#4ade80' : '#ef4444' }}>
              {connected() ? '🟢' : '🔴'} {connected() ? 'Live' : 'Offline'}
            </span>
            <span>👥 {users().size} Artists</span>
            <span>✏️ {operations()} Strokes</span>
          </div>
        </div>
      </header>
      
      {/* Full Screen Activity View */}
      <div style={{ 
        position: 'absolute',
        top: '50px',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fafafa'
      }}>
        <ActivityView
          color={color()}
          brushSize={brushSize()}
          wsManager={wsManager()}
          connected={connected()}
        />
      </div>
      
      {/* Minimal Bottom Toolbar */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.9)',
        'backdrop-filter': 'blur(10px)',
        'border-radius': '20px',
        padding: '10px 20px',
        display: 'flex',
        gap: '20px',
        'align-items': 'center',
        'box-shadow': '0 4px 30px rgba(0, 0, 0, 0.3)',
        'z-index': 1000
      }}>
        {/* Color Palette */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map(c => (
            <button
              onClick={() => setColor(c)}
              style={{
                width: '28px',
                height: '28px',
                'border-radius': '50%',
                background: c,
                border: color() === c ? '3px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: color() === c ? 'scale(1.15)' : 'scale(1)',
                'box-shadow': color() === c ? `0 0 0 3px ${c}40` : 'none'
              }}
              onMouseEnter={(e) => {
                if (color() !== c) e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                if (color() !== c) e.target.style.transform = 'scale(1)';
              }}
            />
          ))}
        </div>
        
        {/* Separator */}
        <div style={{ width: '1px', height: '30px', background: 'rgba(255, 255, 255, 0.2)' }} />
        
        {/* Brush Size */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ color: 'white', 'font-size': '12px' }}>Size</span>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize()}
            onInput={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: '80px' }}
          />
          <div style={{
            width: `${brushSize()}px`,
            height: `${brushSize()}px`,
            'border-radius': '50%',
            background: color()
          }} />
        </div>
      </div>
    </div>
  );
}

export default App;