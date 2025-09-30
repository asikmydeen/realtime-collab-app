import { onMount, onCleanup, createSignal, createEffect, Show } from 'solid-js';
import { PixelCanvasController } from '../lib/PixelCanvas';

export function PixelCanvas(props) {
  let canvasRef;
  let controller;
  const [cooldownTime, setCooldownTime] = createSignal(0);
  const [hoveredPixel, setHoveredPixel] = createSignal(null);
  const [pixelOwner, setPixelOwner] = createSignal(null);

  onMount(() => {
    const rect = canvasRef.parentElement.getBoundingClientRect();
    canvasRef.width = rect.width;
    canvasRef.height = rect.height;

    controller = new PixelCanvasController(canvasRef);
    controller.setUserId(props.currentUser?.id);
    controller.setColor(props.color);

    // Navigate to available space on mount
    setTimeout(() => {
      controller.navigateToAvailableSpace();
    }, 100);

    // Handle pixel placement
    controller.onPixelPlaced = (x, y, color) => {
      props.onPixelPlace?.({ x, y, color });
      setCooldownTime(5);
      
      // Start cooldown countdown
      const interval = setInterval(() => {
        setCooldownTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    controller.onPlaceFailed = (result) => {
      if (result.reason === 'cooldown') {
        setCooldownTime(result.timeLeft);
      } else if (result.reason === 'owned') {
        // Show owner info
        console.log('Pixel already owned');
      }
    };

    // Update hover info
    const updateInterval = setInterval(() => {
      if (controller.hoveredPixel) {
        setHoveredPixel(controller.hoveredPixel);
        const info = controller.pixelManager.getPixelInfo(
          controller.hoveredPixel.x, 
          controller.hoveredPixel.y
        );
        setPixelOwner(info);
      }
    }, 100);

    // Handle WebSocket events
    setupWebSocketHandlers();

    // Window resize
    window.addEventListener('resize', handleResize);

    onCleanup(() => {
      clearInterval(updateInterval);
      window.removeEventListener('resize', handleResize);
    });
  });

  function handleResize() {
    const rect = canvasRef.parentElement.getBoundingClientRect();
    canvasRef.width = rect.width;
    canvasRef.height = rect.height;
  }

  function setupWebSocketHandlers() {
    const ws = props.wsManager;
    if (!ws) return;

    ws.on('pixelUpdate', (data) => {
      controller.pixelManager.pixelOwners.set(
        controller.pixelManager.getPixelId(data.x, data.y),
        {
          owner: data.owner,
          color: data.color,
          timestamp: data.timestamp
        }
      );
    });

    ws.on('bulkPixelUpdate', (data) => {
      // Load many pixels at once
      data.pixels.forEach(pixel => {
        controller.pixelManager.pixelOwners.set(
          controller.pixelManager.getPixelId(pixel.x, pixel.y),
          {
            owner: pixel.owner,
            color: pixel.color,
            timestamp: pixel.timestamp
          }
        );
      });
    });
  }

  // Update color when prop changes
  createEffect(() => {
    if (controller) {
      controller.setColor(props.color);
    }
  });

  function navigateToSpace() {
    const space = controller.navigateToAvailableSpace();
    if (!space) {
      alert('No available space found! The canvas is getting full!');
    }
  }

  return (
    <div class="pixel-canvas-container">
      <canvas
        ref={canvasRef}
        style={{ cursor: 'crosshair' }}
      />
      
      {/* UI Overlay */}
      <div class="pixel-canvas-ui">
        {/* Cooldown Timer */}
        <Show when={cooldownTime() > 0}>
          <div class="cooldown-timer">
            <div class="cooldown-circle">
              <svg width="60" height="60">
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.2)"
                  stroke-width="4"
                />
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke="#4ade80"
                  stroke-width="4"
                  stroke-dasharray={`${(1 - cooldownTime() / 5) * 157} 157`}
                  transform="rotate(-90 30 30)"
                  style={{ transition: 'stroke-dasharray 1s linear' }}
                />
              </svg>
              <div class="cooldown-text">{cooldownTime()}</div>
            </div>
            <div class="cooldown-label">Next pixel in...</div>
          </div>
        </Show>

        {/* Pixel Info */}
        <div class="pixel-info">
          <Show when={hoveredPixel()}>
            <div>Position: ({hoveredPixel().x}, {hoveredPixel().y})</div>
            <Show when={pixelOwner()}>
              <div>Owned by: {pixelOwner().owner.slice(-4)}</div>
            </Show>
          </Show>
        </div>

        {/* Navigation */}
        <div class="pixel-nav">
          <button class="nav-btn" onClick={navigateToSpace}>
            🎯 Find Space
          </button>
        </div>

        {/* Instructions */}
        <div class="pixel-instructions">
          <div>Click to place a pixel</div>
          <div>Shift+Drag to pan</div>
          <div>Scroll to zoom</div>
        </div>
      </div>
    </div>
  );
}