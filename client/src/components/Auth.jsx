import { createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useSignIn, useSignUp, refreshSession } from '../lib/auth';

export function Auth(props) {
  const [mode, setMode] = createSignal('signin'); // 'signin' or 'signup'
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const signIn = useSignIn();
  const signUp = useSignUp();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode() === 'signup') {
        const result = await signUp(
          email(),
          password(),
          displayName() || email().split('@')[0]
        );

        if (result.error) {
          setError(result.error.message || 'Failed to sign up');
        } else {
          // Refresh session to update UI
          await refreshSession();
          props.onSuccess?.();
        }
      } else {
        const result = await signIn(email(), password());

        if (result.error) {
          setError(result.error.message || 'Failed to sign in');
        } else {
          // Refresh session to update UI
          await refreshSession();
          props.onSuccess?.();
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 99999
        }}
        onClick={(e) => {
          // Close modal when clicking backdrop
          if (e.target === e.currentTarget) {
            props.onClose?.();
          }
        }}
      >
      <div style={{
        background: 'white',
        padding: '30px',
        'border-radius': '12px',
        width: '90%',
        'max-width': '400px',
        'box-shadow': '0 10px 40px rgba(0, 0, 0, 0.2)',
        position: 'relative'
      }}>
        {/* Close button */}
        <button
          onClick={() => props.onClose?.()}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            background: 'transparent',
            border: 'none',
            'font-size': '24px',
            color: '#999',
            cursor: 'pointer',
            padding: '0',
            width: '30px',
            height: '30px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'border-radius': '50%',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#f0f0f0';
            e.target.style.color = '#333';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#999';
          }}
        >
          ×
        </button>

        <h2 style={{
          margin: '0 0 20px 0',
          'font-size': '24px',
          'text-align': 'center',
          color: '#333'
        }}>
          {mode() === 'signin' ? 'Welcome Back!' : 'Create Account'}
        </h2>

        <form onSubmit={handleSubmit}>
          <Show when={mode() === 'signup'}>
            <div style={{ 'margin-bottom': '15px' }}>
              <label style={{
                display: 'block',
                'margin-bottom': '5px',
                color: '#666',
                'font-size': '14px'
              }}>
                Display Name (optional)
              </label>
              <input
                type="text"
                value={displayName()}
                onInput={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  'border-radius': '6px',
                  'font-size': '16px',
                  'box-sizing': 'border-box'
                }}
              />
            </div>
          </Show>

          <div style={{ 'margin-bottom': '15px' }}>
            <label style={{
              display: 'block',
              'margin-bottom': '5px',
              color: '#666',
              'font-size': '14px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                'border-radius': '6px',
                'font-size': '16px',
                'box-sizing': 'border-box'
              }}
            />
          </div>

          <div style={{ 'margin-bottom': '20px' }}>
            <label style={{
              display: 'block',
              'margin-bottom': '5px',
              color: '#666',
              'font-size': '14px'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                'border-radius': '6px',
                'font-size': '16px',
                'box-sizing': 'border-box'
              }}
            />
          </div>

          <Show when={error()}>
            <div style={{
              background: '#fee',
              color: '#c33',
              padding: '10px',
              'border-radius': '6px',
              'margin-bottom': '15px',
              'font-size': '14px'
            }}>
              {error()}
            </div>
          </Show>

          <button
            type="submit"
            disabled={loading()}
            style={{
              width: '100%',
              padding: '12px',
              background: loading() ? '#666' : '#3b82f6',
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              'font-size': '16px',
              'font-weight': '500',
              cursor: loading() ? 'default' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading() ? 'Loading...' : (mode() === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{
          'margin-top': '20px',
          'text-align': 'center',
          color: '#666',
          'font-size': '14px'
        }}>
          {mode() === 'signin' ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode() === 'signin' ? 'signup' : 'signin');
              setError('');
            }}
            style={{
              color: '#3b82f6',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              'text-decoration': 'underline'
            }}
          >
            {mode() === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        <Show when={props.onClose}>
          <button
            onClick={props.onClose}
            style={{
              position: 'absolute',
              top: '15px',
              right: '15px',
              width: '30px',
              height: '30px',
              background: '#f5f5f5',
              border: 'none',
              'border-radius': '50%',
              cursor: 'pointer',
              'font-size': '16px',
              color: '#666',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center'
            }}
          >
            ✕
          </button>
        </Show>
      </div>
    </div>
    </Portal>
  );
}