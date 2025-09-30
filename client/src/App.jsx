import { createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { Controls } from './components/Controls';
import { Stats } from './components/Stats';
import { Minimap } from './components/Minimap';
import { WebSocketManager } from './lib/websocket';
import { WasmProcessor } from './lib/wasm';
import { config } from './config';
import { getUserColor, generateUsername, getContrastColor } from './utils/userColors';

function App() {
  // State management
  const [connected, setConnected] = createSignal(false);
  const [room, setRoom] = createSignal('default');
  const [users, setUsers] = createSignal(new Map());
  const [currentUser, setCurrentUser] = createSignal(null);
  const [tool, setTool] = createSignal('pen');
  const [color, setColor] = createSignal('#4ade80');
  const [brushSize, setBrushSize] = createSignal(5);
  const [webglEnabled, setWebglEnabled] = createSignal(true);
  const [showControls, setShowControls] = createSignal(true);
  const [username, setUsername] = createSignal(generateUsername());
  const [navigateTo, setNavigateTo] = createSignal(null);
  const [canvasMode, setCanvasMode] = createSignal('infinite'); // 'classic' or 'infinite'
  
  // Performance metrics
  const [fps, setFps] = createSignal(60);
  const [operations, setOperations] = createSignal(0);
  const [latency, setLatency] = createSignal(0);
  const [networkLatency, setNetworkLatency] = createSignal(0);
  
  // WebSocket and WASM managers as signals
  const [wsManager, setWsManager] = createSignal(null);
  const [wasmProcessor, setWasmProcessor] = createSignal(null);
  
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
      ws.joinRoom(room(), username());
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
      ws.sendDraw(drawData);
      setOperations(prev => prev + 1);
    }
  };
  
  const handleCursor = (cursorData) => {
    const ws = wsManager();
    if (ws && connected()) {
      ws.sendCursor(cursorData);
    }
  };
  
  const handleClear = () => {
    const ws = wsManager();
    if (ws && connected()) {
      ws.sendClear();
    }
  };
  
  const handleImageUpload = async (file) => {
    const wasm = wasmProcessor();
    if (wasm) {
      const processed = await wasm.processImage(file);
      // Handle processed image
    }
  };
  
  return (
    <div class="app">
      <header class="header">
        <h1 class="title">
          <span class="logo">⚡</span>
          SolidJS Real-Time Canvas
        </h1>
        
        <Stats
          fps={fps()}
          operations={operations()}
          latency={latency()}
          networkLatency={networkLatency()}
          connected={connected()}
          users={users().size}
        />
      </header>
      
      <main class="main">
        <div class="controls-panel">
          <Controls
            tool={tool()}
            setTool={setTool}
            color={color()}
            setColor={setColor}
            brushSize={brushSize()}
            setBrushSize={setBrushSize}
            webglEnabled={webglEnabled()}
            setWebglEnabled={setWebglEnabled}
            onClear={handleClear}
            onImageUpload={handleImageUpload}
          />
        </div>
        
        <div class="canvas-container">
          <div class="canvas-wrapper">
            <Show when={canvasMode() === 'infinite'} fallback={
              <Canvas
                tool={tool()}
                color={color()}
                brushSize={brushSize()}
                webglEnabled={webglEnabled()}
                onDraw={handleDraw}
                onCursor={handleCursor}
                setLatency={setLatency}
                wsManager={wsManager()}
                wasmProcessor={wasmProcessor()}
                currentUser={currentUser()}
                users={users()}
              />
            }>
              <InfiniteCanvas
                tool={tool()}
                color={color()}
                brushSize={brushSize()}
                onDraw={handleDraw}
                onCursor={handleCursor}
                setLatency={setLatency}
                wsManager={wsManager()}
                currentUser={currentUser()}
                users={users()}
                navigateTo={navigateTo()}
              />
            </Show>
          </div>
        </div>
        
        <div class="users-panel">
          <div class="toggle" onClick={() => setCanvasMode(canvasMode() === 'infinite' ? 'classic' : 'infinite')}>
            <div class={`toggle-switch ${canvasMode() === 'infinite' ? 'active' : ''}`} />
            <span>Infinite Canvas</span>
          </div>
          
          <Show when={canvasMode() === 'infinite'}>
            <Minimap 
              viewport={currentUser()?.viewport}
              users={Array.from(users().values())}
              onNavigate={(x, y) => setNavigateTo({ x, y })}
            />
          </Show>
          
          <h3>Users in Room</h3>
          <div class="users-list" style={{ 'max-height': '300px', 'overflow-y': 'auto' }}>
            <For each={Array.from(users().values())}>
              {(user) => (
                <div class={`user-item ${user.isMe ? 'me' : ''}`}>
                  <div 
                    class="user-avatar" 
                    style={{ 
                      'background-color': user.color,
                      color: getContrastColor(user.color)
                    }}
                  >
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div class="user-info">
                    <div class="user-name">{user.name}</div>
                    <div class="user-status">{user.isMe ? 'You' : 'Connected'}</div>
                  </div>
                  <div class="user-dot" />
                </div>
              )}
            </For>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
