import { Show } from 'solid-js';

export function ActivityControls(props) {
  const isOwner = () => props.wsManager?.userHash === props.activity?.ownerId;
  
  const styles = {
    container: {
      position: 'absolute',
      top: '20px',
      right: '20px',
      display: 'flex',
      'flex-direction': 'column',
      gap: '12px',
      animation: 'slideDown 0.3s ease-out',
      'max-width': '280px',
      'z-index': 100
    },
    button: {
      padding: '12px 20px',
      'border-radius': '12px',
      'font-weight': '600',
      'font-size': '14px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      'box-shadow': '0 8px 16px -2px rgba(0, 0, 0, 0.3), 0 4px 8px -2px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '8px',
      'white-space': 'nowrap'
    },
    reviewButton: {
      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      color: 'white',
      border: '1px solid rgba(251, 146, 60, 0.3)'
    },
    normalButton: {
      background: 'linear-gradient(135deg, rgba(71, 85, 105, 0.95) 0%, rgba(55, 65, 81, 0.95) 100%)',
      color: 'white',
      'backdrop-filter': 'blur(12px)',
      border: '1px solid rgba(148, 163, 184, 0.2)'
    },
    removeButton: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      color: 'white',
      animation: 'scaleIn 0.2s ease-out',
      border: '1px solid rgba(248, 113, 113, 0.3)'
    },
    instructions: {
      background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
      'backdrop-filter': 'blur(12px)',
      color: 'white',
      'font-size': '13px',
      padding: '16px',
      'border-radius': '12px',
      'box-shadow': '0 8px 16px -2px rgba(0, 0, 0, 0.3), 0 4px 8px -2px rgba(0, 0, 0, 0.2)',
      'max-width': '260px',
      animation: 'fadeIn 0.3s ease-in-out',
      border: '1px solid rgba(148, 163, 184, 0.1)'
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
          <span>{props.selectMode ? '🔙' : '🔍'}</span>
          <span>{props.selectMode ? 'Exit Review' : 'Review Contributions'}</span>
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
            <span>🗑️</span>
            <span>Remove ({props.selectedPaths.size})</span>
          </button>
        </Show>
        
        {/* Review Mode Instructions */}
        <Show when={props.selectMode}>
          <div style={styles.instructions}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px' }}>
              <span style={{ 'font-size': '18px' }}>⚠️</span>
              <span style={{ 'font-weight': '600' }}>Review Mode</span>
            </div>
            <p style={{ color: 'rgba(209, 213, 219, 1)', margin: 0, 'font-size': '12px', 'line-height': '1.4' }}>
              Click drawings to select them. Your own are dimmed and cannot be selected.
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