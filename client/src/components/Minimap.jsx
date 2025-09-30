import { onMount, onCleanup, createEffect, createSignal } from 'solid-js';

export function Minimap(props) {
  let canvasRef;
  let ctx;
  let animationFrame;
  const size = 250;
  const [isDragging, setIsDragging] = createSignal(false);
  
  // Dynamic world bounds based on content
  const [worldBounds, setWorldBounds] = createSignal({
    minX: -5000, maxX: 5000,
    minY: -5000, maxY: 5000
  });
  
  onMount(() => {
    ctx = canvasRef.getContext('2d');
    canvasRef.width = size;
    canvasRef.height = size;
    
    startAnimation();
  });

  onCleanup(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });

  function startAnimation() {
    function animate() {
      renderMinimap();
      animationFrame = requestAnimationFrame(animate);
    }
    animate();
  }

  function renderMinimap() {
    const context = canvasRef?.getContext('2d');
    if (!context) return;
    ctx = context;

    // Clear with subtle gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#0f0e17');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Update world bounds based on content
    updateWorldBounds();
    
    const bounds = worldBounds();
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 20; i++) {
      const pos = (i / 20) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Draw content chunks with glow effect
    if (props.chunkManager) {
      const chunks = Array.from(props.chunkManager.chunks.entries());
      
      chunks.forEach(([chunkId, chunk]) => {
        if (chunk.dirty || chunk.lastModified > 0) {
          const [chunkX, chunkY] = chunkId.split(':').map(Number);
          const worldX = chunkX * 512;
          const worldY = chunkY * 512;
          
          const x = ((worldX - bounds.minX) / worldWidth) * size;
          const y = ((worldY - bounds.minY) / worldHeight) * size;
          const chunkSize = (512 / worldWidth) * size;
          
          // Age-based opacity
          const age = Date.now() - (chunk.lastModified || 0);
          const opacity = Math.max(0.2, 1 - age / 600000); // Fade over 10 minutes
          
          // Glow effect for recent activity
          if (age < 5000) {
            const glowGradient = ctx.createRadialGradient(
              x + chunkSize/2, y + chunkSize/2, 0,
              x + chunkSize/2, y + chunkSize/2, chunkSize * 2
            );
            glowGradient.addColorStop(0, `rgba(74, 222, 128, ${opacity * 0.8})`);
            glowGradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
            ctx.fillStyle = glowGradient;
            ctx.fillRect(x - chunkSize, y - chunkSize, chunkSize * 3, chunkSize * 3);
          }
          
          // Content block
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.6})`;
          ctx.fillRect(x, y, chunkSize, chunkSize);
        }
      });
    }

    // Draw active users with pulsing effect
    if (props.users) {
      const time = Date.now() * 0.001;
      props.users().forEach(user => {
        if (user.space && !user.isMe) {
          const x = ((user.space.x - bounds.minX) / worldWidth) * size;
          const y = ((user.space.y - bounds.minY) / worldHeight) * size;
          
          // Pulsing circle
          const pulse = (Math.sin(time * 3 + user.id.charCodeAt(0)) + 1) / 2;
          const radius = 3 + pulse * 2;
          
          // Outer glow
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
          glowGradient.addColorStop(0, user.color);
          glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glowGradient;
          ctx.globalAlpha = 0.3 + pulse * 0.2;
          ctx.fillRect(x - radius * 3, y - radius * 3, radius * 6, radius * 6);
          ctx.globalAlpha = 1;
          
          // User dot
          ctx.fillStyle = user.color;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw viewport with smooth animation
    if (props.viewport) {
      const vp = props.viewport();
      const x = ((vp.x - bounds.minX) / worldWidth) * size;
      const y = ((vp.y - bounds.minY) / worldHeight) * size;
      const w = (vp.width / worldWidth) * size;
      const h = (vp.height / worldHeight) * size;

      // Viewport border with glow
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;
      
      // Viewport fill
      ctx.fillStyle = 'rgba(74, 222, 128, 0.1)';
      ctx.fillRect(x, y, w, h);
    }

  function updateWorldBounds() {
    if (!props.chunkManager) return;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let hasContent = false;
    
    props.chunkManager.chunks.forEach((chunk, chunkId) => {
      if (chunk.dirty || chunk.lastModified > 0) {
        hasContent = true;
        const [chunkX, chunkY] = chunkId.split(':').map(Number);
        const worldX = chunkX * 512;
        const worldY = chunkY * 512;
        
        minX = Math.min(minX, worldX);
        maxX = Math.max(maxX, worldX + 512);
        minY = Math.min(minY, worldY);
        maxY = Math.max(maxY, worldY + 512);
      }
    });
    
    if (hasContent) {
      // Add padding
      const padding = 2000;
      setWorldBounds({
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding
      });
    }
  }

  function handleMouseDown(e) {
    setIsDragging(true);
    handleClick(e);
  }

  function handleMouseMove(e) {
    if (isDragging()) {
      handleClick(e);
    }
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleClick(e) {
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to world coordinates
    const bounds = worldBounds();
    const worldX = (x / size) * (bounds.maxX - bounds.minX) + bounds.minX;
    const worldY = (y / size) * (bounds.maxY - bounds.minY) + bounds.minY;

    props.onNavigate?.(worldX, worldY);
  }

  return (
    <div class="minimap-container">
      <div class="minimap-header">
        <h3>World Overview</h3>
        <div class="minimap-stats">
          {props.users && <span>{props.users().length} artists</span>}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        class="minimap-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          cursor: isDragging() ? 'grabbing' : 'grab'
        }}
      />
      <div class="minimap-legend">
        <div class="legend-item">
          <div class="legend-dot active"></div>
          <span>Active Drawing</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot content"></div>
          <span>Content</span>
        </div>
        <div class="legend-item">
          <div class="legend-box viewport"></div>
          <span>Your View</span>
        </div>
      </div>
    </div>
  );
}