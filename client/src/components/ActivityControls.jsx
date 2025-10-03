import { Show } from 'solid-js';

export function ActivityControls(props) {
  const isOwner = () => props.wsManager?.userHash === props.activity?.ownerId;
  
  const styles = {
    container: {
      position: 'absolute',
      top: '16px',
      right: '16px',
      display: 'flex',
      'flex-direction': 'column',
      gap: '8px',
      animation: 'slideDown 0.3s ease-out'
    },
    button: {
      padding: '8px 16px',
      'border-radius': '8px',
      'font-weight': '500',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      'box-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    },
    reviewButton: {
      background: 'rgba(249, 115, 22, 0.9)',
      color: 'white'
    },
    normalButton: {
      background: 'rgba(55, 65, 81, 0.9)',
      color: 'white',
      'backdrop-filter': 'blur(10px)'
    },
    removeButton: {
      background: '#EF4444',
      color: 'white',
      animation: 'scaleIn 0.2s ease-out'
    },
    instructions: {
      background: 'rgba(31, 41, 55, 0.9)',
      'backdrop-filter': 'blur(10px)',
      color: 'white',
      'font-size': '14px',
      padding: '12px',
      'border-radius': '8px',
      'box-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      'max-width': '240px',
      animation: 'fadeIn 0.3s ease-in-out'
    }
  };
  
  return (
    <Show when={isOwner()}>
      <div style={styles.container}>
        {/* Toggle Select Mode Button */}
        <button
          onClick={props.onToggleSelectMode}
          style={{
            ...styles.button,
            ...(props.selectMode ? styles.reviewButton : styles.normalButton)
          }}
          onMouseEnter={(e) => {
            if (props.selectMode) {
              e.target.style.background = 'rgba(234, 88, 12, 1)';
            } else {
              e.target.style.background = 'rgba(55, 65, 81, 1)';
            }
          }}
          onMouseLeave={(e) => {
            if (props.selectMode) {
              e.target.style.background = 'rgba(249, 115, 22, 0.9)';
            } else {
              e.target.style.background = 'rgba(55, 65, 81, 0.9)';
            }
          }}
        >
          {props.selectMode ? 'Exit Review Mode' : 'Review Contributions'}
        </button>
        
        {/* Remove Selected Button */}
        <Show when={props.selectMode && props.selectedPaths.size > 0}>
          <button
            onClick={props.onRemoveSelected}
            style={styles.removeButton}
            onMouseEnter={(e) => {
              e.target.style.background = '#DC2626';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#EF4444';
            }}
          >
            Remove Selected ({props.selectedPaths.size})
          </button>
        </Show>
        
        {/* Review Mode Instructions */}
        <Show when={props.selectMode}>
          <div style={styles.instructions}>
            <p style={{ 'font-weight': '600', margin: '0 0 4px 0' }}>Review Mode Active</p>
            <p style={{ color: 'rgba(209, 213, 219, 1)', margin: 0, 'font-size': '13px' }}>
              Click on drawings to select them for removal. Your own drawings are dimmed.
            </p>
          </div>
        </Show>
      </div>
      
      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Show>
  );
}