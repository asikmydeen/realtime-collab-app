import { createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { Stats } from './components/Stats';
import { WebSocketManager } from './lib/websocket';
import { WasmProcessor } from './lib/wasm';
import { config } from './config';

function App() {
  // State management
  const [connected, setConnected] = createSignal(false);
  const [room, setRoom] = createSignal('default');
  const [users, setUsers] = createSignal([]);
  const [tool, setTool] = createSignal('pen');
  const [color, setColor] = createSignal('#4ade80');
  const [brushSize, setBrushSize] = createSignal(5);
  const [webglEnabled, setWebglEnabled] = createSignal(true);
  
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
      ws.joinRoom(room());
    });
    
    ws.on('disconnected', () => {
      setConnected(false);
    });
    
    ws.on('userJoined', (data) => {
      setUsers(prev => [...prev, data.clientId]);
    });
    
    ws.on('userLeft', (data) => {
      setUsers(prev => prev.filter(id => id !== data.clientId));
    });
    
    ws.on('latency', (value) => {
      setNetworkLatency(value);
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
          users={users().length}
        />
      </header>
      
      <main class="main">
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
        />
        
        <div class="users-panel">
          <h3>Users in Room</h3>
          <For each={users()}>
            {(userId) => (
              <div class="user-item">
                {userId.slice(-4)}
              </div>
            )}
          </For>
        </div>
      </main>
    </div>
  );
}

export default App;
