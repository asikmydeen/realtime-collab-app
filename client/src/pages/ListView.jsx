import { CanvasList } from '../components/CanvasList';

export function ListView(props) {
  return (
    <>
      {/* Header */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '50px',
        background: 'rgba(0, 0, 0, 0.8)',
        'backdrop-filter': 'blur(10px)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '0 20px',
        'z-index': 1000,
        'box-shadow': '0 2px 20px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '20px' }}>
          <h1 style={{ 
            margin: 0, 
            'font-size': '18px', 
            'font-weight': '600',
            color: 'white',
            display: 'flex',
            'align-items': 'center',
            gap: '8px'
          }}>
            <span style={{ 'font-size': '24px' }}>✨</span>
            Infinite Canvas
          </h1>
          <div style={{ 
            display: 'flex', 
            gap: '15px',
            color: 'rgba(255, 255, 255, 0.8)',
            'font-size': '14px'
          }}>
            <span style={{ color: props.connected() ? '#4ade80' : '#ef4444' }}>
              {props.connected() ? '🟢' : '🔴'} {props.connected() ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </header>
      
      {/* List View */}
      <div style={{ 
        position: 'absolute',
        top: '50px',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fafafa',
        'overflow-y': 'auto'
      }}>
        <CanvasList
          wsManager={props.wsManager()}
          connected={props.connected()}
        />
      </div>
    </>
  );
}