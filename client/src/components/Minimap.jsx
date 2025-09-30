import { onMount, onCleanup, createEffect } from 'solid-js';

export function Minimap(props) {
  let canvasRef;
  let ctx;
  const size = 200;
  const worldSize = 10000; // Initial world bounds
  
  onMount(() => {
    ctx = canvasRef.getContext('2d');
    canvasRef.width = size;
    canvasRef.height = size;
    
    renderMinimap();
  });

  createEffect(() => {
    renderMinimap();
  });

  function renderMinimap() {
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Draw grid
    ctx.strokeStyle = '#16213e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const pos = (i / 10) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Draw active areas (heatmap)
    const heatmap = props.heatmap || [];
    heatmap.forEach(({ x, y, intensity }) => {
      const px = ((x + worldSize/2) / worldSize) * size;
      const py = ((y + worldSize/2) / worldSize) * size;
      const alpha = Math.min(intensity / 100, 1);
      
      ctx.fillStyle = `rgba(255, 107, 107, ${alpha})`;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    });

    // Draw current viewport
    if (props.viewport) {
      const vp = props.viewport;
      const x = ((vp.x + worldSize/2) / worldSize) * size;
      const y = ((vp.y + worldSize/2) / worldSize) * size;
      const w = (vp.width / worldSize) * size / vp.zoom;
      const h = (vp.height / worldSize) * size / vp.zoom;

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    // Draw other users' viewports
    const users = props.users || [];
    users.forEach(user => {
      if (user.viewport && !user.isMe) {
        const vp = user.viewport;
        const x = ((vp.x + worldSize/2) / worldSize) * size;
        const y = ((vp.y + worldSize/2) / worldSize) * size;
        const w = (vp.width / worldSize) * size / vp.zoom;
        const h = (vp.height / worldSize) * size / vp.zoom;

        ctx.strokeStyle = user.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    });
  }

  function handleClick(e) {
    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to world coordinates
    const worldX = (x / size) * worldSize - worldSize/2;
    const worldY = (y / size) * worldSize - worldSize/2;

    props.onNavigate?.(worldX, worldY);
  }

  return (
    <div class="minimap">
      <h3>World Map</h3>
      <canvas
        ref={canvasRef}
        class="minimap-canvas"
        onClick={handleClick}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          cursor: 'pointer',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      />
      <div class="minimap-coords">
        {props.viewport && (
          <>
            <div>X: {Math.round(props.viewport.x)}</div>
            <div>Y: {Math.round(props.viewport.y)}</div>
            <div>Zoom: {props.viewport.zoom.toFixed(1)}x</div>
          </>
        )}
      </div>
    </div>
  );
}