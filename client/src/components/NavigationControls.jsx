import { createSignal } from 'solid-js';

export function NavigationControls(props) {
  const [isExploring, setIsExploring] = createSignal(false);
  
  function handlePan(dx, dy) {
    const api = props.canvasAPI();
    if (!api) return;
    
    const viewport = api.getViewport();
    const distance = 200; // Pan distance in pixels
    
    api.navigate(
      viewport.x + viewport.width / 2 + (dx * distance),
      viewport.y + viewport.height / 2 + (dy * distance),
      true // animate
    );
  }
  
  function handleExploreToggle() {
    setIsExploring(!isExploring());
    
    if (isExploring()) {
      startExploring();
    } else {
      stopExploring();
    }
  }
  
  let exploreInterval;
  function startExploring() {
    // Slowly pan around the canvas to explore content
    let angle = 0;
    const radius = 2000;
    const speed = 0.0005;
    
    exploreInterval = setInterval(() => {
      const api = props.canvasAPI();
      if (!api) return;
      
      angle += speed;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      api.navigate(x, y, false);
    }, 50);
  }
  
  function stopExploring() {
    if (exploreInterval) {
      clearInterval(exploreInterval);
      exploreInterval = null;
    }
  }
  
  function handleHome() {
    const api = props.canvasAPI();
    if (api) {
      api.navigate(0, 0, true);
    }
  }
  
  return (
    <div class="navigation-panel">
      <h3>Navigation</h3>
      
      <div class="nav-buttons">
        <button class="nav-btn-large" onClick={() => handlePan(-1, -1)}>↖</button>
        <button class="nav-btn-large" onClick={() => handlePan(0, -1)}>↑</button>
        <button class="nav-btn-large" onClick={() => handlePan(1, -1)}>↗</button>
        
        <button class="nav-btn-large" onClick={() => handlePan(-1, 0)}>←</button>
        <button class="nav-btn-large" onClick={handleHome}>⌂</button>
        <button class="nav-btn-large" onClick={() => handlePan(1, 0)}>→</button>
        
        <button class="nav-btn-large" onClick={() => handlePan(-1, 1)}>↙</button>
        <button class="nav-btn-large" onClick={() => handlePan(0, 1)}>↓</button>
        <button class="nav-btn-large" onClick={() => handlePan(1, 1)}>↘</button>
      </div>
      
      <div style={{ 'margin-top': '1rem' }}>
        <button 
          class={`btn btn-secondary ${isExploring() ? 'exploring' : ''}`}
          onClick={handleExploreToggle}
          style={{ width: '100%' }}
        >
          {isExploring() ? '⏸ Stop Exploring' : '▶ Auto Explore'}
        </button>
      </div>
      
      <div class="nav-tips" style={{ 'margin-top': '1rem', 'font-size': '0.75rem', 'opacity': '0.6' }}>
        <div>• Shift + Drag to pan</div>
        <div>• Scroll to zoom</div>
        <div>• Click minimap to jump</div>
      </div>
    </div>
  );
}