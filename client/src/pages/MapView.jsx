import { Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ActivityView } from '../components/ActivityView';

export function MapView(props) {
  const navigate = useNavigate();
  
  return (
    <>
      {/* Header with navigation */}
      <header style={{
        position: 'absolute',
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
            <span>👥 {props.users().size} Artists</span>
            <span>✏️ {props.operations()} Strokes</span>
          </div>
          <button
            onClick={() => navigate('/list')}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '5px 10px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': '13px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
            }}
          >
            📋 List View
          </button>
        </div>
      </header>
      
      {/* Map View */}
      <div style={{ 
        position: 'absolute',
        top: '50px',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fafafa'
      }}>
        <ActivityView
          color={props.color()}
          brushSize={props.brushSize()}
          setColor={props.setColor}
          setBrushSize={props.setBrushSize}
          wsManager={props.wsManager()}
          connected={props.connected()}
        />
      </div>
      
      {/* Bottom Toolbar - Desktop Only */}
      <Show when={window.innerWidth > 768}>
        <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.9)',
        'backdrop-filter': 'blur(10px)',
        'border-radius': '20px',
        padding: '10px 20px',
        display: 'flex',
        gap: '20px',
        'align-items': 'center',
        'box-shadow': '0 4px 30px rgba(0, 0, 0, 0.3)',
        'z-index': 1000
      }}>
        {/* Color Palette */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map(c => (
            <button
              onClick={() => props.setColor(c)}
              style={{
                width: '28px',
                height: '28px',
                'border-radius': '50%',
                background: c,
                border: props.color() === c ? '3px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: props.color() === c ? 'scale(1.15)' : 'scale(1)',
                'box-shadow': props.color() === c ? `0 0 0 3px ${c}40` : 'none'
              }}
              onMouseEnter={(e) => {
                if (props.color() !== c) e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                if (props.color() !== c) e.target.style.transform = 'scale(1)';
              }}
            />
          ))}
        </div>
        
        {/* Separator */}
        <div style={{ width: '1px', height: '30px', background: 'rgba(255, 255, 255, 0.2)' }} />
        
        {/* Brush Size */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ color: 'white', 'font-size': '12px' }}>Size</span>
          <input
            type="range"
            min="1"
            max="20"
            value={props.brushSize()}
            onInput={(e) => props.setBrushSize(Number(e.target.value))}
            style={{ width: '80px' }}
          />
          <div style={{
            width: `${props.brushSize()}px`,
            height: `${props.brushSize()}px`,
            'border-radius': '50%',
            background: props.color()
          }} />
        </div>
      </div>
      </Show>
    </>
  );
}