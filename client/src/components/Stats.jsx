import { Show } from 'solid-js';

export function Stats(props) {
  return (
    <div class="stats">
      <div class="stat-item">
        <div class="stat-value">{props.fps}</div>
        <div class="stat-label">FPS</div>
      </div>
      
      <div class="stat-item">
        <div class="stat-value">{props.operations}</div>
        <div class="stat-label">Ops/sec</div>
      </div>
      
      <div class="stat-item">
        <div class="stat-value">{props.latency}ms</div>
        <div class="stat-label">Draw Latency</div>
      </div>
      
      <div class="stat-item">
        <div class="stat-value">{props.networkLatency}ms</div>
        <div class="stat-label">Network</div>
      </div>
      
      <div class="stat-item">
        <div class="stat-value">{props.users}</div>
        <div class="stat-label">Users</div>
      </div>
      
      <div class="stat-item">
        <div 
          class="stat-value"
          style={{
            color: props.connected ? '#4ade80' : '#ef4444'
          }}
        >
          {props.connected ? 'LIVE' : 'OFF'}
        </div>
        <div class="stat-label">Status</div>
      </div>
    </div>
  );
}