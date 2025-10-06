import { createSignal, Show, onMount } from 'solid-js';

export function AccountPrompt(props) {
  const [dismissed, setDismissed] = createSignal(false);
  const [dontShowAgain, setDontShowAgain] = createSignal(false);

  onMount(() => {
    // Check if user has dismissed this permanently
    const dismissed = localStorage.getItem('accountPromptDismissed');
    if (dismissed === 'true') {
      setDismissed(true);
    }
  });

  const handleDismiss = () => {
    if (dontShowAgain()) {
      localStorage.setItem('accountPromptDismissed', 'true');
    }
    setDismissed(true);
    props.onDismiss?.();
  };

  const handleCreateAccount = () => {
    setDismissed(true);
    props.onCreateAccount?.();
  };

  return (
    <Show when={!dismissed() && !props.isAuthenticated}>
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        'max-width': '380px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '20px',
        'border-radius': '12px',
        'box-shadow': '0 10px 40px rgba(0, 0, 0, 0.3)',
        'z-index': 9999,
        animation: 'slideInUp 0.4s ease-out'
      }}>
        <style>
          {`
            @keyframes slideInUp {
              from {
                transform: translateY(100px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
          `}
        </style>
        
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '12px' }}>
          <h3 style={{ margin: 0, 'font-size': '18px', 'font-weight': '600' }}>
            💾 Save Your Art!
          </h3>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              'font-size': '20px',
              padding: '0',
              opacity: '0.7',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '1'}
            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 16px 0', 'font-size': '14px', 'line-height': '1.5', opacity: '0.95' }}>
          You're currently using <strong>anonymous mode</strong>. Create a free account to:
        </p>

        <ul style={{ margin: '0 0 16px 0', 'padding-left': '20px', 'font-size': '13px', 'line-height': '1.6' }}>
          <li>Access your art from any device</li>
          <li>Keep your activities permanently</li>
          <li>Build your creative portfolio</li>
        </ul>

        <div style={{ display: 'flex', gap: '10px', 'margin-bottom': '12px' }}>
          <button
            onClick={handleCreateAccount}
            style={{
              flex: 1,
              background: 'white',
              color: '#667eea',
              border: 'none',
              padding: '10px 16px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': '14px',
              'font-weight': '600',
              transition: 'all 0.2s',
              'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            }}
          >
            Create Account
          </button>
          <button
            onClick={handleDismiss}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '10px 16px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': '14px',
              'font-weight': '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Maybe Later
          </button>
        </div>

        <label style={{ 
          display: 'flex', 
          'align-items': 'center', 
          gap: '8px', 
          'font-size': '12px', 
          opacity: '0.8',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={dontShowAgain()}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Don't show this again
        </label>
      </div>
    </Show>
  );
}

