import { For } from 'solid-js';

export function Controls(props) {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
  ];

  return (
    <div class="controls">
      <div class="control-section">
        <div class="control-label">Colors</div>
        <div class="color-grid">
          <For each={colors}>
            {(color) => (
              <button
                class={`color-btn ${props.color === color ? 'active' : ''}`}
                style={{ 'background-color': color }}
                onClick={() => props.setColor(color)}
                title={color}
              />
            )}
          </For>
        </div>
      </div>
      
      <div class="control-section">
        <div class="control-label">Brush Size</div>
        <div class="brush-controls">
          <div class="brush-slider">
            <input
              type="range"
              class="slider"
              min="1"
              max="50"
              value={props.brushSize}
              onInput={(e) => props.setBrushSize(parseInt(e.target.value))}
            />
            <div class="brush-preview">
              <div 
                class="brush-preview-dot" 
                style={{ 
                  width: `${Math.min(props.brushSize, 30)}px`,
                  height: `${Math.min(props.brushSize, 30)}px`,
                  'background-color': props.color
                }}
              />
            </div>
          </div>
          <div class="brush-value">{props.brushSize}px</div>
        </div>
      </div>
      
      <div class="control-section">
        <div class="control-label">Options</div>
        <div class="toggle" onClick={() => props.setWebglEnabled(!props.webglEnabled)}>
          <div class={`toggle-switch ${props.webglEnabled ? 'active' : ''}`} />
          <span>WebGL Rendering</span>
        </div>
      </div>
      
      <div class="control-section">
        <div class="control-label">Actions</div>
        <div class="action-buttons">
          <button class="btn btn-danger" onClick={props.onClear}>
            🗑️ Clear Canvas
          </button>
          
          <label class="btn btn-secondary">
            📁 Upload Image
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) props.onImageUpload(file);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}