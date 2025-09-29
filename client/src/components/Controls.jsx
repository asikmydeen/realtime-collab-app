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
      <div class="color-palette">
        <For each={colors}>
          {(color) => (
            <button
              class={`color-btn ${props.color === color ? 'active' : ''}`}
              style={{ 'background-color': color }}
              onClick={() => props.setColor(color)}
            />
          )}
        </For>
      </div>
      
      <div class="brush-controls">
        <label>Brush Size: {props.brushSize}px</label>
        <input
          type="range"
          min="1"
          max="50"
          value={props.brushSize}
          onInput={(e) => props.setBrushSize(parseInt(e.target.value))}
        />
      </div>
      
      <div class="toggle-group">
        <label>
          <input
            type="checkbox"
            checked={props.webglEnabled}
            onChange={(e) => props.setWebglEnabled(e.target.checked)}
          />
          WebGL Rendering
        </label>
      </div>
      
      <button class="clear-btn" onClick={props.onClear}>
        Clear Canvas
      </button>
      
      <div class="upload-section">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) props.onImageUpload(file);
          }}
        />
      </div>
    </div>
  );
}
