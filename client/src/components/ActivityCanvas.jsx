import { createSignal, createEffect, onMount, onCleanup } from 'solid-js';

export function ActivityCanvas(props) {
  let canvasRef;
  let drawingCanvasRef;
  
  // Canvas state
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [paths, setPaths] = createSignal([]);
  const [remotePaths, setRemotePaths] = createSignal(new Map());
  const [participants, setParticipants] = createSignal(new Map());
  
  // Drawing state
  const drawingThrottle = {
    lastSendTime: 0,
    throttleMs: 50,
    pendingPoints: [],
    timeoutId: null
  };
  
  onMount(() => {
    setupCanvas();
  });
  
  function setupCanvas() {
    const parent = canvasRef.parentElement;
    canvasRef.width = parent.clientWidth;
    canvasRef.height = parent.clientHeight;
    drawingCanvasRef.width = parent.clientWidth;
    drawingCanvasRef.height = parent.clientHeight;
    renderCanvas();
  }
  
  function renderCanvas() {
    const ctx = canvasRef.getContext('2d');
    const drawCtx = drawingCanvasRef.getContext('2d');
    
    // Clear canvases
    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
    drawCtx.clearRect(0, 0, drawingCanvasRef.width, drawingCanvasRef.height);
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    
    // Render drawings
    renderDrawings(drawCtx);
    ctx.drawImage(drawingCanvasRef, 0, 0);
  }
  
  function renderDrawings(ctx) {
    // Render all paths
    const allPaths = [...paths(), ...Array.from(remotePaths().values())];
    
    allPaths.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color || '#000000';
      ctx.lineWidth = path.size || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      path.points.forEach((point, i) => {
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      
      ctx.stroke();
    });
  }
  
  // Mouse handlers
  function handleMouseDown(e) {
    if (e.button === 0) {
      setIsDrawing(true);
      
      const rect = canvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Start new path
      const newPath = {
        color: props.color || '#000000',
        size: props.brushSize || 3,
        points: [{ x, y }]
      };
      
      setPaths(prev => [...prev, newPath]);
      
      // Send draw start
      sendThrottledDraw({
        drawType: 'start',
        x,
        y,
        color: props.color || '#000000',
        size: props.brushSize || 3
      });
    }
  }
  
  function handleMouseMove(e) {
    if (isDrawing()) {
      const rect = canvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Add point to current path
      setPaths(prev => {
        const newPaths = [...prev];
        if (newPaths.length > 0) {
          const currentPath = newPaths[newPaths.length - 1];
          currentPath.points.push({ x, y });
        }
        return newPaths;
      });
      
      // Send draw update
      sendThrottledDraw({
        drawType: 'draw',
        x,
        y
      });
      
      renderCanvas();
    }
  }
  
  function handleMouseUp() {
    if (isDrawing()) {
      sendThrottledDraw({ drawType: 'end' });
    }
    setIsDrawing(false);
  }
  
  // Send drawing data with throttling
  function sendThrottledDraw(drawData) {
    const now = Date.now();
    
    if (drawData.drawType === 'start' || drawData.drawType === 'end') {
      // Send immediately for start/end
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
      
      if (drawingThrottle.pendingPoints.length > 0) {
        drawingThrottle.pendingPoints.forEach(point => {
          sendActivityDraw(point);
        });
        drawingThrottle.pendingPoints = [];
      }
      
      sendActivityDraw(drawData);
      drawingThrottle.lastSendTime = now;
      return;
    }
    
    // Throttle draw events
    drawingThrottle.pendingPoints.push(drawData);
    
    if (now - drawingThrottle.lastSendTime >= drawingThrottle.throttleMs) {
      drawingThrottle.pendingPoints.forEach(point => {
        sendActivityDraw(point);
      });
      drawingThrottle.pendingPoints = [];
      drawingThrottle.lastSendTime = now;
      
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
    } else if (!drawingThrottle.timeoutId) {
      const remainingTime = drawingThrottle.throttleMs - (now - drawingThrottle.lastSendTime);
      drawingThrottle.timeoutId = setTimeout(() => {
        drawingThrottle.pendingPoints.forEach(point => {
          sendActivityDraw(point);
        });
        drawingThrottle.pendingPoints = [];
        drawingThrottle.lastSendTime = Date.now();
        drawingThrottle.timeoutId = null;
      }, remainingTime);
    }
  }
  
  function sendActivityDraw(data) {
    if (props.wsManager) {
      props.wsManager.send({
        type: 'activityDraw',
        ...data
      });
    }
  }
  
  // Handle remote drawing
  function handleRemoteActivityDraw(data) {
    switch(data.drawType) {
      case 'start':
        setRemotePaths(prev => {
          const next = new Map(prev);
          next.set(data.clientId, {
            color: data.color || '#000000',
            size: data.size || 3,
            points: [{ x: data.x, y: data.y }]
          });
          return next;
        });
        break;
        
      case 'draw':
        setRemotePaths(prev => {
          const next = new Map(prev);
          let path = next.get(data.clientId);
          if (!path) {
            path = {
              color: data.color || '#000000',
              size: data.size || 3,
              points: []
            };
            next.set(data.clientId, path);
          }
          path.points.push({ x: data.x, y: data.y });
          return next;
        });
        break;
        
      case 'end':
        setRemotePaths(prev => {
          const next = new Map(prev);
          const finishedPath = next.get(data.clientId);
          if (finishedPath && finishedPath.points.length > 1) {
            setPaths(paths => [...paths, { ...finishedPath }]);
          }
          next.delete(data.clientId);
          return next;
        });
        break;
    }
    
    renderCanvas();
  }
  
  // WebSocket handlers
  createEffect(() => {
    if (props.wsManager) {
      const cleanup1 = props.wsManager.on('activityJoined', (data) => {
        // Load existing canvas data
        if (data.canvasData && data.canvasData.paths) {
          setPaths(data.canvasData.paths);
          renderCanvas();
        }
      });
      
      const cleanup2 = props.wsManager.on('remoteActivityDraw', (data) => {
        handleRemoteActivityDraw(data);
      });
      
      const cleanup3 = props.wsManager.on('participantJoined', (data) => {
        setParticipants(prev => {
          const next = new Map(prev);
          next.set(data.clientId, { username: data.username });
          return next;
        });
      });
      
      const cleanup4 = props.wsManager.on('participantLeft', (data) => {
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(data.clientId);
          return next;
        });
      });
      
      onCleanup(() => {
        cleanup1();
        cleanup2();
        cleanup3();
        cleanup4();
        if (drawingThrottle.timeoutId) {
          clearTimeout(drawingThrottle.timeoutId);
        }
      });
    }
  });
  
  // Re-render on remote path changes
  createEffect(() => {
    remotePaths();
    renderCanvas();
  });
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      'z-index': 1500
    }}>
      {/* Canvas Area */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center'
      }}>
        <div style={{
          width: '90%',
          height: '90%',
          'max-width': '1200px',
          'max-height': '800px',
          background: 'white',
          'border-radius': '15px',
          'box-shadow': '0 10px 50px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <canvas
            ref={drawingCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, display: 'none' }}
          />
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
        
        {/* Activity Info */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '15px 30px',
          'border-radius': '30px',
          'backdrop-filter': 'blur(10px)'
        }}>
          <h2 style={{ margin: 0, 'font-size': '20px' }}>{props.activity.title}</h2>
          <p style={{ margin: '5px 0 0 0', opacity: 0.7, 'font-size': '14px' }}>
            📍 {props.activity.street} • 👥 {participants().size + 1} participants
          </p>
        </div>
        
        {/* Close Button */}
        <button
          onClick={props.onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: 'none',
            'border-radius': '50%',
            'font-size': '20px',
            cursor: 'pointer',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          ✕
        </button>
      </div>
      
      {/* Participants List */}
      <div style={{
        width: '250px',
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '20px',
        'overflow-y': 'auto'
      }}>
        <h3 style={{ color: 'white', margin: '0 0 20px 0' }}>Active Participants</h3>
        <div style={{ color: 'white' }}>
          {Array.from(participants()).map(([id, participant]) => (
            <div style={{
              padding: '8px',
              'border-radius': '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              'margin-bottom': '8px'
            }}>
              🎨 {participant.username}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}