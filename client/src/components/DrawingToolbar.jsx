import { Show, For } from 'solid-js';

export function DrawingToolbar(props) {
  const tools = [
    { id: 'select', icon: '↖️', label: 'Select', shortcut: 'V' },
    { id: 'pen', icon: '✏️', label: 'Pen', shortcut: 'P' },
    { id: 'line', icon: '📏', label: 'Line', shortcut: 'L' },
    { id: 'rectangle', icon: '▭', label: 'Rectangle', shortcut: 'R' },
    { id: 'circle', icon: '⭕', label: 'Circle', shortcut: 'C' },
    { id: 'triangle', icon: '△', label: 'Triangle', shortcut: 'T' },
    { id: 'text', icon: '📝', label: 'Text', shortcut: 'X' },
    { id: 'eraser', icon: '🧹', label: 'Eraser', shortcut: 'E' }
  ];
  
  const colors = [
    '#000000', '#FFFFFF', '#EF4444', '#F97316', '#FBBF24', 
    '#22C55E', '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899'
  ];
  
  const styles = {
    toolbar: {
      width: props.isMobile ? '100%' : '280px',
      background: 'rgba(31, 41, 55, 0.5)',
      'backdrop-filter': 'blur(10px)',
      'border-radius': props.isMobile ? '0' : '12px',
      padding: '16px',
      display: 'flex',
      'flex-direction': 'column',
      gap: '16px',
      'max-height': props.isMobile ? 'auto' : 'calc(100vh - 200px)',
      'overflow-y': 'auto',
      position: props.isMobile ? 'fixed' : 'relative',
      bottom: props.isMobile ? 0 : 'auto',
      left: props.isMobile ? 0 : 'auto',
      right: props.isMobile ? 0 : 'auto',
      'z-index': props.isMobile ? 50 : 'auto'
    },
    section: {
      display: 'flex',
      'flex-direction': 'column',
      gap: '8px'
    },
    sectionTitle: {
      color: 'rgba(156, 163, 175, 1)',
      'font-size': '12px',
      'font-weight': '600',
      'text-transform': 'uppercase',
      'letter-spacing': '0.05em'
    },
    toolGrid: {
      display: 'grid',
      'grid-template-columns': 'repeat(4, 1fr)',
      gap: '8px'
    },
    toolButton: {
      padding: '12px',
      background: 'rgba(55, 65, 81, 0.5)',
      border: 'none',
      'border-radius': '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      gap: '4px',
      'font-size': '20px',
      position: 'relative'
    },
    toolButtonActive: {
      background: 'rgba(59, 130, 246, 0.8)',
      'box-shadow': '0 0 0 2px rgba(59, 130, 246, 1)'
    },
    toolLabel: {
      'font-size': '10px',
      color: 'rgba(209, 213, 219, 1)',
      'font-weight': '500'
    },
    colorGrid: {
      display: 'grid',
      'grid-template-columns': 'repeat(5, 1fr)',
      gap: '8px'
    },
    colorButton: {
      width: '40px',
      height: '40px',
      'border-radius': '8px',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      cursor: 'pointer',
      transition: 'all 0.2s',
      position: 'relative'
    },
    colorButtonActive: {
      border: '3px solid white',
      'box-shadow': '0 0 0 2px rgba(59, 130, 246, 1)',
      transform: 'scale(1.1)'
    },
    slider: {
      width: '100%',
      height: '6px',
      'border-radius': '3px',
      background: 'rgba(55, 65, 81, 0.5)',
      outline: 'none',
      cursor: 'pointer'
    },
    sliderLabel: {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      color: 'rgba(209, 213, 219, 1)',
      'font-size': '12px'
    },
    actionButton: {
      padding: '10px 16px',
      background: 'rgba(55, 65, 81, 0.5)',
      color: 'white',
      border: 'none',
      'border-radius': '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      'font-size': '14px',
      'font-weight': '500',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '8px'
    },
    actionButtonDanger: {
      background: 'rgba(239, 68, 68, 0.5)'
    }
  };
  
  return (
    <div style={styles.toolbar}>
      {/* Tools Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Tools</div>
        <div style={styles.toolGrid}>
          <For each={tools}>
            {(tool) => (
              <button
                onClick={() => props.onToolChange(tool.id)}
                style={{
                  ...styles.toolButton,
                  ...(props.activeTool === tool.id ? styles.toolButtonActive : {})
                }}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <span>{tool.icon}</span>
                <span style={styles.toolLabel}>{tool.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>
      
      {/* Stroke Color Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Stroke Color</div>
        <div style={styles.colorGrid}>
          <For each={colors}>
            {(color) => (
              <button
                onClick={() => props.onBrushColorChange(color)}
                style={{
                  ...styles.colorButton,
                  background: color,
                  ...(props.brushColor === color ? styles.colorButtonActive : {})
                }}
                title={color}
              />
            )}
          </For>
        </div>
        <input
          type="color"
          value={props.brushColor}
          onInput={(e) => props.onBrushColorChange(e.target.value)}
          style={{
            width: '100%',
            height: '40px',
            'border-radius': '8px',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            cursor: 'pointer'
          }}
        />
      </div>
      
      {/* Fill Color Section */}
      <Show when={['rectangle', 'circle', 'triangle'].includes(props.activeTool)}>
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Fill Color</div>
          <div style={styles.colorGrid}>
            <button
              onClick={() => props.onFillColorChange('transparent')}
              style={{
                ...styles.colorButton,
                background: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)',
                'background-size': '10px 10px',
                'background-position': '0 0, 5px 5px',
                ...(props.fillColor === 'transparent' ? styles.colorButtonActive : {})
              }}
              title="Transparent"
            />
            <For each={colors}>
              {(color) => (
                <button
                  onClick={() => props.onFillColorChange(color)}
                  style={{
                    ...styles.colorButton,
                    background: color,
                    ...(props.fillColor === color ? styles.colorButtonActive : {})
                  }}
                  title={color}
                />
              )}
            </For>
          </div>
          <input
            type="color"
            value={props.fillColor === 'transparent' ? '#ffffff' : props.fillColor}
            onInput={(e) => props.onFillColorChange(e.target.value)}
            style={{
              width: '100%',
              height: '40px',
              'border-radius': '8px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              cursor: 'pointer'
            }}
          />
        </div>
      </Show>
      
      {/* Brush Size Section */}
      <Show when={['pen', 'eraser'].includes(props.activeTool)}>
        <div style={styles.section}>
          <div style={styles.sliderLabel}>
            <span style={styles.sectionTitle}>Brush Size</span>
            <span>{props.brushSize}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={props.brushSize}
            onInput={(e) => props.onBrushSizeChange(parseInt(e.target.value))}
            style={styles.slider}
          />
          <div style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            padding: '12px',
            background: 'rgba(55, 65, 81, 0.5)',
            'border-radius': '8px'
          }}>
            <div style={{
              width: `${props.brushSize}px`,
              height: `${props.brushSize}px`,
              'border-radius': '50%',
              background: props.brushColor,
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }} />
          </div>
        </div>
      </Show>
      
      {/* Stroke Width Section */}
      <Show when={['line', 'rectangle', 'circle', 'triangle'].includes(props.activeTool)}>
        <div style={styles.section}>
          <div style={styles.sliderLabel}>
            <span style={styles.sectionTitle}>Stroke Width</span>
            <span>{props.strokeWidth}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={props.strokeWidth}
            onInput={(e) => props.onStrokeWidthChange(parseInt(e.target.value))}
            style={styles.slider}
          />
        </div>
      </Show>
      
      {/* Opacity Section */}
      <div style={styles.section}>
        <div style={styles.sliderLabel}>
          <span style={styles.sectionTitle}>Opacity</span>
          <span>{Math.round(props.brushOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={props.brushOpacity}
          onInput={(e) => props.onBrushOpacityChange(parseFloat(e.target.value))}
          style={styles.slider}
        />
      </div>
      
      {/* Actions Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Actions</div>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <button onClick={props.onUndo} style={styles.actionButton}>
            ↶ Undo
          </button>
          <button onClick={props.onRedo} style={styles.actionButton}>
            ↷ Redo
          </button>
          <button onClick={props.onDelete} style={styles.actionButton}>
            🗑️ Delete Selected
          </button>
          <button onClick={props.onBringForward} style={styles.actionButton}>
            ⬆️ Bring Forward
          </button>
          <button onClick={props.onSendBackward} style={styles.actionButton}>
            ⬇️ Send Backward
          </button>
          <button onClick={props.onToggleLayers} style={styles.actionButton}>
            📚 Layers
          </button>
          <button 
            onClick={props.onClear} 
            style={{...styles.actionButton, ...styles.actionButtonDanger}}
          >
            🗑️ Clear Canvas
          </button>
        </div>
      </div>
    </div>
  );
}

