import { onMount, onCleanup, createEffect } from 'solid-js';
import { WebGLRenderer } from '../lib/webgl';

export function Canvas(props) {
  let canvasRef;
  let renderer;
  let ctx;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  onMount(() => {
    // Set up proper canvas dimensions
    const setupCanvas = () => {
      const rect = canvasRef.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Set actual canvas size accounting for device pixel ratio
      canvasRef.width = rect.width * dpr;
      canvasRef.height = rect.height * dpr;
      
      // Scale canvas back down using CSS
      canvasRef.style.width = rect.width + 'px';
      canvasRef.style.height = rect.height + 'px';
      
      if (props.webglEnabled) {
        renderer = new WebGLRenderer(canvasRef);
        if (!renderer.gl) {
          // Fallback to 2D
          ctx = canvasRef.getContext('2d');
          ctx.scale(dpr, dpr);
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
      } else {
        ctx = canvasRef.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
    };
    
    setupCanvas();
    
    // Handle window resize
    window.addEventListener('resize', setupCanvas);

    onCleanup(() => {
      if (renderer) renderer.destroy();
      window.removeEventListener('resize', setupCanvas);
    });
  });

  // Set up WebSocket listeners when wsManager becomes available
  createEffect(() => {
    const ws = props.wsManager;
    if (ws) {
      console.log('Setting up WebSocket listeners in Canvas');
      ws.on('draw', handleRemoteDraw);
      ws.on('clear', handleClear);
      ws.on('init', handleInit);
      
      onCleanup(() => {
        // Clean up listeners if needed
      });
    }
  });

  function handleInit(data) {
    console.log('Received init data with', data.history?.length || 0, 'operations');
    // Redraw history if needed
    if (data.history && data.history.length > 0) {
      data.history.forEach(op => {
        drawLine(op.x1, op.y1, op.x2, op.y2, op.color, op.size);
      });
    }
  }

  function drawLine(x1, y1, x2, y2, color, size) {
    const startTime = performance.now();
    
    if (renderer && renderer.gl) {
      renderer.drawLine(x1, y1, x2, y2, color, size);
    } else if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    
    props.setLatency(Math.round(performance.now() - startTime));
  }

  function handleRemoteDraw(data) {
    console.log('Received remote draw:', data);
    // Don't draw if it's our own drawing (prevent echo)
    if (data.clientId && props.wsManager && data.clientId === props.wsManager.clientId) {
      return;
    }
    drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size);
  }

  function handleClear() {
    if (renderer && renderer.gl) {
      renderer.clear();
    } else if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    }
  }

  function getMousePos(e) {
    const rect = canvasRef.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // For WebGL, we need the actual pixel coordinates
    if (renderer && renderer.gl) {
      return {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr
      };
    }
    
    // For 2D context, we're already scaled
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function handleMouseDown(e) {
    const pos = getMousePos(e);
    lastX = pos.x;
    lastY = pos.y;
    isDrawing = true;
  }

  function handleMouseMove(e) {
    const pos = getMousePos(e);

    if (isDrawing) {
      drawLine(lastX, lastY, pos.x, pos.y, props.color, props.brushSize);
      
      // Send normalized coordinates for network transmission
      const rect = canvasRef.getBoundingClientRect();
      props.onDraw({
        x1: lastX,
        y1: lastY,
        x2: pos.x,
        y2: pos.y,
        color: props.color,
        size: props.brushSize
      });
      lastX = pos.x;
      lastY = pos.y;
    }

    // Send cursor position
    props.onCursor({
      x: e.clientX,
      y: e.clientY,
      color: props.color
    });
  }

  function handleMouseUp() {
    isDrawing = false;
  }

  function handleMouseLeave() {
    isDrawing = false;
  }

  // Touch events for mobile
  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getMousePos(touch);
    lastX = pos.x;
    lastY = pos.y;
    isDrawing = true;
  }

  function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getMousePos(touch);
    
    if (isDrawing) {
      drawLine(lastX, lastY, pos.x, pos.y, props.color, props.brushSize);
      props.onDraw({
        x1: lastX,
        y1: lastY,
        x2: pos.x,
        y2: pos.y,
        color: props.color,
        size: props.brushSize
      });
      lastX = pos.x;
      lastY = pos.y;
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    isDrawing = false;
  }

  return (
    <div class="canvas-container">
      <canvas
        ref={canvasRef}
        class="canvas"
        style={{
          width: '800px',
          height: '600px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          cursor: 'crosshair'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}
