import { createSignal, onMount, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ActivityCanvas } from '../components/ActivityCanvas';

export function CanvasPage(props) {
  const params = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);

  onMount(async () => {
    const activityId = params.id;
    
    if (!activityId) {
      setError('No activity ID provided');
      setLoading(false);
      return;
    }

    // Join the activity via WebSocket
    if (props.wsManager()) {
      console.log('[CanvasPage] Joining activity:', activityId);
      
      // Listen for activity data
      const cleanup = props.wsManager().on('activityJoined', (data) => {
        console.log('[CanvasPage] Activity joined:', data);
        if (data.activity && data.activity.id === activityId) {
          setActivity(data.activity);
          setLoading(false);
        }
      });

      // Also listen for default activity
      const cleanup2 = props.wsManager().on('defaultActivity', (data) => {
        console.log('[CanvasPage] Default activity:', data);
        if (data.activity && data.activity.id === activityId) {
          setActivity(data.activity);
          setLoading(false);
        }
      });

      // Request to join the activity
      props.wsManager().send({
        type: 'joinActivity',
        activityId: activityId
      });

      // Cleanup listeners
      return () => {
        cleanup();
        cleanup2();
      };
    } else {
      setError('WebSocket not connected');
      setLoading(false);
    }
  });

  const handleClose = () => {
    // Navigate back to map view
    navigate('/');
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#f8fafc',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center'
    }}>
      <Show when={loading()}>
        <div style={{
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          gap: '20px'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '3px solid #e2e8f0',
            'border-top-color': '#3b82f6',
            'border-radius': '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: '#64748b', 'font-size': '16px' }}>Loading canvas...</p>
        </div>
      </Show>

      <Show when={error()}>
        <div style={{
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          gap: '20px',
          padding: '40px',
          background: 'white',
          'border-radius': '12px',
          'box-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <span style={{ 'font-size': '48px' }}>⚠️</span>
          <h2 style={{ margin: 0, color: '#1e293b' }}>Error Loading Canvas</h2>
          <p style={{ color: '#64748b', margin: '0 0 20px 0' }}>{error()}</p>
          <button
            onClick={() => navigate('/')}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              'border-radius': '8px',
              padding: '10px 20px',
              'font-size': '16px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Back to Map
          </button>
        </div>
      </Show>

      <Show when={!loading() && !error() && activity()}>
        <ActivityCanvas
          activity={activity()}
          wsManager={props.wsManager()}
          color={props.color}
          setColor={props.setColor}
          brushSize={props.brushSize}
          setBrushSize={props.setBrushSize}
          onClose={handleClose}
        />
      </Show>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}