import { Show, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ActivityView } from '../components/ActivityView';

export function MapView(props) {
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = createSignal(false);

  // Debug: Check props
  console.log('MapView props:', {
    hasSession: !!props.session,
    sessionValue: props.session?.(),
    hasOnShowAuth: !!props.onShowAuth
  });

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
        padding: window.innerWidth <= 768 ? '0 10px' : '0 20px',
        'z-index': 1000,
        'box-shadow': '0 2px 20px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Left side - App name */}
        <h1 style={{
          margin: 0,
          'font-size': window.innerWidth <= 768 ? '16px' : '18px',
          'font-weight': '600',
          color: 'white',
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          'white-space': 'nowrap'
        }}>
          <span style={{ 'font-size': window.innerWidth <= 768 ? '20px' : '24px' }}>🌎</span>
          <Show when={window.innerWidth > 480}>
            World Art
          </Show>
        </h1>

        {/* Right side - Navigation buttons */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: window.innerWidth <= 768 ? '8px' : '12px' }}>
          {/* User status */}
          <Show
            when={props.session && props.session()?.user}
            fallback={
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <Show when={window.innerWidth > 768}>
                  <span style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    'font-size': '13px'
                  }}>
                    👤 Anonymous
                  </span>
                </Show>
                <button
                  onClick={() => {
                    console.log('Sign In button clicked');
                    console.log('onShowAuth prop:', props.onShowAuth);
                    props.onShowAuth?.();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    color: 'white',
                    padding: window.innerWidth <= 768 ? '6px 10px' : '6px 14px',
                    'border-radius': '6px',
                    cursor: 'pointer',
                    'font-size': window.innerWidth <= 768 ? '12px' : '13px',
                    'font-weight': '500',
                    transition: 'all 0.2s',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '6px',
                    'box-shadow': '0 2px 8px rgba(102, 126, 234, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                  }}
                >
                  🔐 <Show when={window.innerWidth > 480}>Sign In</Show>
                </button>
              </div>
            }
          >
            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <Show when={window.innerWidth > 768}>
                <span style={{
                  color: '#4ade80',
                  'font-size': '13px',
                  'font-weight': '500'
                }}>
                  ✓ {props.session().user.name || props.session().user.email?.split('@')[0]}
                </span>
              </Show>
              <button
                onClick={() => props.onSignOut?.()}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  padding: window.innerWidth <= 768 ? '6px 10px' : '5px 12px',
                  'border-radius': '6px',
                  cursor: 'pointer',
                  'font-size': window.innerWidth <= 768 ? '12px' : '13px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '6px'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                  e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'transparent';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
              >
                <Show when={window.innerWidth > 480}>Sign Out</Show>
                <Show when={window.innerWidth <= 480}>🚪</Show>
              </button>
            </div>
          </Show>

          {/* Connection status - only on desktop */}
          <Show when={window.innerWidth > 768}>
            <span style={{
              color: props.connected() ? '#4ade80' : '#ef4444',
              'font-size': '14px'
            }}>
              {props.connected() ? '🟢' : '🔴'} {props.connected() ? 'Connected' : 'Offline'}
            </span>
          </Show>

          {/* Search button - moved from ActivityView */}
          <button
            onClick={() => setShowSearch(!showSearch())}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: window.innerWidth <= 768 ? '6px 10px' : '5px 12px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': window.innerWidth <= 768 ? '12px' : '13px',
              transition: 'all 0.2s',
              display: 'flex',
              'align-items': 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            🔍 <Show when={window.innerWidth > 480}>Search</Show>
          </button>

          {/* List View button */}
          <button
            onClick={() => navigate('/list')}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: window.innerWidth <= 768 ? '6px 10px' : '5px 12px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': window.innerWidth <= 768 ? '12px' : '13px',
              transition: 'all 0.2s',
              display: 'flex',
              'align-items': 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            📋 <Show when={window.innerWidth > 480}>List</Show>
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
          showSearch={showSearch()}
          setShowSearch={setShowSearch}
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