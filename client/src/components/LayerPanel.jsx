import { createSignal, createEffect, For } from 'solid-js';

export function LayerPanel(props) {
  const [layers, setLayers] = createSignal([]);
  const [selectedLayer, setSelectedLayer] = createSignal(null);
  
  createEffect(() => {
    if (props.canvas) {
      updateLayers();
      
      // Listen for canvas changes
      props.canvas.on('object:added', updateLayers);
      props.canvas.on('object:removed', updateLayers);
      props.canvas.on('object:modified', updateLayers);
      props.canvas.on('selection:created', handleSelection);
      props.canvas.on('selection:updated', handleSelection);
      props.canvas.on('selection:cleared', () => setSelectedLayer(null));
    }
  });
  
  function updateLayers() {
    if (!props.canvas) return;
    
    const objects = props.canvas.getObjects();
    const layerData = objects.map((obj, index) => ({
      id: obj.id || `layer-${index}`,
      name: getLayerName(obj),
      type: obj.type,
      objectType: obj.objectType,
      visible: obj.visible !== false,
      locked: obj.selectable === false,
      object: obj,
      index: index,
      userName: obj.userName || 'Unknown'
    })).reverse(); // Reverse to show top layers first
    
    setLayers(layerData);
  }
  
  function getLayerName(obj) {
    if (obj.objectType) {
      return obj.objectType.charAt(0).toUpperCase() + obj.objectType.slice(1);
    }
    
    switch (obj.type) {
      case 'rect': return 'Rectangle';
      case 'circle': return 'Circle';
      case 'triangle': return 'Triangle';
      case 'line': return 'Line';
      case 'i-text':
      case 'text': return 'Text';
      case 'path': return 'Drawing';
      default: return obj.type || 'Object';
    }
  }
  
  function handleSelection(e) {
    const activeObject = props.canvas.getActiveObject();
    if (activeObject) {
      setSelectedLayer(activeObject.id);
    }
  }
  
  function selectLayer(layer) {
    if (!props.canvas) return;
    
    props.canvas.setActiveObject(layer.object);
    props.canvas.renderAll();
    setSelectedLayer(layer.id);
  }
  
  function toggleVisibility(layer, e) {
    e.stopPropagation();
    if (!props.canvas) return;
    
    layer.object.visible = !layer.object.visible;
    props.canvas.renderAll();
    updateLayers();
  }
  
  function toggleLock(layer, e) {
    e.stopPropagation();
    if (!props.canvas) return;
    
    layer.object.selectable = !layer.object.selectable;
    layer.object.evented = layer.object.selectable;
    props.canvas.renderAll();
    updateLayers();
  }
  
  function deleteLayer(layer, e) {
    e.stopPropagation();
    if (!props.canvas) return;
    
    if (confirm(`Delete ${layer.name}?`)) {
      props.canvas.remove(layer.object);
      props.canvas.renderAll();
      updateLayers();
    }
  }
  
  function duplicateLayer(layer, e) {
    e.stopPropagation();
    if (!props.canvas) return;
    
    layer.object.clone((cloned) => {
      cloned.set({
        left: cloned.left + 10,
        top: cloned.top + 10,
        id: `${layer.id}_copy_${Date.now()}`
      });
      props.canvas.add(cloned);
      props.canvas.setActiveObject(cloned);
      props.canvas.renderAll();
      updateLayers();
    });
  }
  
  const styles = {
    panel: {
      width: props.isMobile ? '100%' : '280px',
      background: 'rgba(31, 41, 55, 0.95)',
      'backdrop-filter': 'blur(10px)',
      'border-radius': props.isMobile ? '12px 12px 0 0' : '12px',
      'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      'flex-direction': 'column',
      'max-height': props.isMobile ? '60vh' : 'calc(100vh - 200px)',
      position: props.isMobile ? 'fixed' : 'relative',
      bottom: props.isMobile ? 0 : 'auto',
      left: props.isMobile ? 0 : 'auto',
      right: props.isMobile ? 0 : 'auto',
      'z-index': props.isMobile ? 100 : 'auto'
    },
    header: {
      padding: '16px',
      'border-bottom': '1px solid rgba(75, 85, 99, 1)',
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center'
    },
    title: {
      color: 'white',
      'font-weight': '600',
      'font-size': '16px',
      margin: 0
    },
    closeButton: {
      background: 'transparent',
      border: 'none',
      color: 'rgba(209, 213, 219, 1)',
      cursor: 'pointer',
      'font-size': '20px',
      padding: '4px 8px'
    },
    layerList: {
      flex: 1,
      'overflow-y': 'auto',
      padding: '8px'
    },
    layerItem: {
      background: 'rgba(55, 65, 81, 0.5)',
      'border-radius': '8px',
      padding: '12px',
      'margin-bottom': '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      'align-items': 'center',
      gap: '12px'
    },
    layerItemSelected: {
      background: 'rgba(59, 130, 246, 0.5)',
      'box-shadow': '0 0 0 2px rgba(59, 130, 246, 1)'
    },
    layerInfo: {
      flex: 1,
      display: 'flex',
      'flex-direction': 'column',
      gap: '4px'
    },
    layerName: {
      color: 'white',
      'font-weight': '500',
      'font-size': '14px'
    },
    layerMeta: {
      color: 'rgba(156, 163, 175, 1)',
      'font-size': '12px'
    },
    layerActions: {
      display: 'flex',
      gap: '4px'
    },
    iconButton: {
      background: 'rgba(55, 65, 81, 0.5)',
      border: 'none',
      'border-radius': '4px',
      padding: '6px',
      cursor: 'pointer',
      'font-size': '14px',
      transition: 'all 0.2s',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center'
    },
    emptyState: {
      padding: '32px',
      'text-align': 'center',
      color: 'rgba(156, 163, 175, 1)'
    }
  };
  
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>📚 Layers ({layers().length})</h3>
        <button onClick={props.onClose} style={styles.closeButton}>
          ✕
        </button>
      </div>
      
      <div style={styles.layerList}>
        {layers().length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ 'font-size': '48px', 'margin-bottom': '16px' }}>🎨</div>
            <div>No layers yet</div>
            <div style={{ 'font-size': '12px', 'margin-top': '8px' }}>
              Start drawing to create layers
            </div>
          </div>
        ) : (
          <For each={layers()}>
            {(layer) => (
              <div
                onClick={() => selectLayer(layer)}
                style={{
                  ...styles.layerItem,
                  ...(selectedLayer() === layer.id ? styles.layerItemSelected : {})
                }}
              >
                <div style={styles.layerInfo}>
                  <div style={styles.layerName}>{layer.name}</div>
                  <div style={styles.layerMeta}>
                    by {layer.userName}
                  </div>
                </div>
                
                <div style={styles.layerActions}>
                  <button
                    onClick={(e) => toggleVisibility(layer, e)}
                    style={styles.iconButton}
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible ? '👁️' : '🚫'}
                  </button>
                  
                  <button
                    onClick={(e) => toggleLock(layer, e)}
                    style={styles.iconButton}
                    title={layer.locked ? 'Unlock' : 'Lock'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  
                  <button
                    onClick={(e) => duplicateLayer(layer, e)}
                    style={styles.iconButton}
                    title="Duplicate"
                  >
                    📋
                  </button>
                  
                  <button
                    onClick={(e) => deleteLayer(layer, e)}
                    style={{
                      ...styles.iconButton,
                      background: 'rgba(239, 68, 68, 0.5)'
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  );
}

