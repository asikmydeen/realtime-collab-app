import { createSignal, Show, For } from 'solid-js';

export function ActivityControls(props) {
  const [showSettings, setShowSettings] = createSignal(false);
  const [allowContributions, setAllowContributions] = createSignal(
    props.activity?.permissions?.allowContributions ?? true
  );
  
  const isOwner = () => {
    return props.wsManager?.userHash === props.activity?.ownerId;
  };
  
  const handleToggleContributions = () => {
    const newValue = !allowContributions();
    setAllowContributions(newValue);
    
    if (props.wsManager) {
      props.wsManager.send({
        type: 'updateActivityPermissions',
        activityId: props.activity.id,
        permissions: {
          allowContributions: newValue
        }
      });
    }
  };
  
  return (
    <Show when={isOwner()}>
      <div style={{
        position: 'absolute',
        top: '80px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        'border-radius': '15px',
        padding: '15px',
        'backdrop-filter': 'blur(10px)',
        color: 'white',
        'min-width': '200px'
      }}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          'margin-bottom': '10px'
        }}>
          <span style={{ 'font-weight': 'bold' }}>Owner Controls</span>
          <button
            onClick={() => setShowSettings(!showSettings())}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              'font-size': '18px'
            }}
          >
            ⚙️
          </button>
        </div>
        
        <Show when={showSettings()}>
          <div style={{
            'border-top': '1px solid rgba(255, 255, 255, 0.2)',
            'padding-top': '10px'
          }}>
            <label style={{
              display: 'flex',
              'align-items': 'center',
              gap: '10px',
              cursor: 'pointer',
              'margin-bottom': '10px'
            }}>
              <input
                type="checkbox"
                checked={allowContributions()}
                onChange={handleToggleContributions}
                style={{ cursor: 'pointer' }}
              />
              <span>Allow contributions</span>
            </label>
            
            <div style={{
              'font-size': '12px',
              opacity: 0.7,
              'margin-top': '10px'
            }}>
              <div>👑 You own this activity</div>
              <div>📍 Created at {props.activity.street}</div>
            </div>
            
            <button
              onClick={props.onToggleSelectMode}
              style={{
                width: '100%',
                padding: '8px',
                'margin-top': '10px',
                background: props.selectMode ? '#ef4444' : 'rgba(239, 68, 68, 0.1)',
                color: props.selectMode ? 'white' : '#ef4444',
                border: '1px solid #ef4444',
                'border-radius': '6px',
                'font-size': '12px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {props.selectMode ? '✕ Cancel Selection' : '🗑️ Remove Drawings'}
            </button>
            
            <Show when={props.selectMode}>
              <div style={{
                'margin-top': '10px',
                padding: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                'border-radius': '6px'
              }}>
                <div style={{ 'font-size': '11px', 'margin-bottom': '8px' }}>
                  Click on drawings to select them for removal
                </div>
                <div style={{ 'font-size': '12px', 'margin-bottom': '8px' }}>
                  Selected: {props.selectedPaths?.size || 0} drawing{props.selectedPaths?.size !== 1 ? 's' : ''}
                </div>
                <button
                  onClick={props.onRemoveSelected}
                  disabled={!props.selectedPaths?.size}
                  style={{
                    width: '100%',
                    padding: '6px',
                    background: props.selectedPaths?.size > 0 ? '#ef4444' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    'border-radius': '4px',
                    'font-size': '11px',
                    cursor: props.selectedPaths?.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: props.selectedPaths?.size > 0 ? 1 : 0.5
                  }}
                >
                  Remove Selected
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}