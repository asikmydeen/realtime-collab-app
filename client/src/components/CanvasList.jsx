import { createSignal, createEffect, onMount, For } from 'solid-js';

export function CanvasList(props) {
  const [allCanvases, setAllCanvases] = createSignal([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [sortColumn, setSortColumn] = createSignal('createdAt');
  const [sortOrder, setSortOrder] = createSignal('desc');

  onMount(() => {
    requestAllCanvases();
  });

  // Request all canvases
  function requestAllCanvases() {
    if (props.wsManager) {
      setIsLoading(true);
      // Request all activities without bounds restriction
      props.wsManager.send({
        type: 'getAllActivities'
      });
    }
  }

  // Listen for canvas data
  createEffect(() => {
    if (props.wsManager) {
      const cleanup = props.wsManager.on('allActivities', (data) => {
        console.log('[CanvasList] Received all activities:', data.activities?.length);
        setAllCanvases(data.activities || []);
        setIsLoading(false);
      });

      const cleanup2 = props.wsManager.on('activityCreated', (data) => {
        if (data.activity) {
          setAllCanvases(prev => [...prev, data.activity]);
        }
      });

      const cleanup3 = props.wsManager.on('activityDeleted', (data) => {
        setAllCanvases(prev => prev.filter(a => a.id !== data.activityId));
      });

      return () => {
        cleanup();
        cleanup2();
        cleanup3();
      };
    }
  });

  // Sort canvases
  function sortCanvases(canvases) {
    const sorted = [...canvases];
    sorted.sort((a, b) => {
      let aVal = a[sortColumn()];
      let bVal = b[sortColumn()];
      
      // Handle nested owner name
      if (sortColumn() === 'ownerName') {
        aVal = a.ownerName || 'Anonymous';
        bVal = b.ownerName || 'Anonymous';
      }
      
      if (sortColumn() === 'createdAt') {
        return sortOrder() === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      if (typeof aVal === 'string') {
        return sortOrder() === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortOrder() === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }

  // Toggle sort
  function toggleSort(column) {
    if (sortColumn() === column) {
      setSortOrder(sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('desc');
    }
  }

  // Format date
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  // Navigate to canvas
  function navigateToCanvas(canvas) {
    // Navigate back to map view and open this canvas
    window.location.href = `/?canvas=${canvas.id}`;
  }

  const tableStyles = {
    container: {
      padding: '20px',
      'max-width': '1400px',
      margin: '0 auto'
    },
    header: {
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'margin-bottom': '20px'
    },
    title: {
      'font-size': '28px',
      'font-weight': 'bold',
      margin: 0
    },
    table: {
      width: '100%',
      'border-collapse': 'collapse',
      'background': 'white',
      'border-radius': '8px',
      overflow: 'hidden',
      'box-shadow': '0 2px 10px rgba(0, 0, 0, 0.1)'
    },
    th: {
      padding: '12px 16px',
      'text-align': 'left',
      'background': '#f3f4f6',
      'font-weight': '600',
      'font-size': '14px',
      'color': '#374151',
      cursor: 'pointer',
      'user-select': 'none',
      'border-bottom': '2px solid #e5e7eb'
    },
    td: {
      padding: '12px 16px',
      'border-bottom': '1px solid #e5e7eb',
      'font-size': '14px'
    },
    tr: {
      transition: 'background 0.2s',
      cursor: 'pointer'
    },
    loading: {
      'text-align': 'center',
      padding: '60px',
      'font-size': '18px',
      color: '#6b7280'
    }
  };

  return (
    <div style={tableStyles.container}>
      <div style={tableStyles.header}>
        <h1 style={tableStyles.title}>🎨 All Canvases</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={requestAllCanvases}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-weight': '500'
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-weight': '500'
            }}
          >
            🗺️ Map View
          </button>
        </div>
      </div>

      <div style={{ 
        background: 'white', 
        'border-radius': '8px',
        overflow: 'hidden',
        'box-shadow': '0 2px 10px rgba(0, 0, 0, 0.1)'
      }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('id')}
              >
                Canvas ID {sortColumn() === 'id' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('title')}
              >
                Title {sortColumn() === 'title' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('ownerName')}
              >
                Created By {sortColumn() === 'ownerName' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('street')}
              >
                Location {sortColumn() === 'street' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('participantCount')}
              >
                Artists {sortColumn() === 'participantCount' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('drawingCount')}
              >
                Drawings {sortColumn() === 'drawingCount' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                style={tableStyles.th}
                onClick={() => toggleSort('createdAt')}
              >
                Created {sortColumn() === 'createdAt' && (sortOrder() === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ ...tableStyles.th, cursor: 'default' }}>
                Coordinates
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading() ? (
              <tr>
                <td colSpan="8" style={tableStyles.loading}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    border: '3px solid #e5e7eb',
                    'border-top': '3px solid #3b82f6',
                    'border-radius': '50%',
                    margin: '0 auto 15px',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Loading canvases...
                </td>
              </tr>
            ) : sortCanvases(allCanvases()).length === 0 ? (
              <tr>
                <td colSpan="8" style={tableStyles.loading}>
                  No canvases found
                </td>
              </tr>
            ) : (
              <For each={sortCanvases(allCanvases())}>
                {(canvas) => (
                  <tr 
                    style={tableStyles.tr}
                    onClick={() => navigateToCanvas(canvas)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td style={{ ...tableStyles.td, 'font-family': 'monospace', 'font-size': '12px' }}>
                      {canvas.id}
                    </td>
                    <td style={{ ...tableStyles.td, 'font-weight': '500' }}>
                      {canvas.title}
                    </td>
                    <td style={tableStyles.td}>
                      {canvas.ownerName || 'Anonymous'}
                    </td>
                    <td style={tableStyles.td}>
                      📍 {canvas.street || 'Unknown Location'}
                    </td>
                    <td style={{ ...tableStyles.td, 'text-align': 'center' }}>
                      {canvas.participantCount || 0}
                    </td>
                    <td style={{ ...tableStyles.td, 'text-align': 'center' }}>
                      {canvas.drawingCount || 0}
                    </td>
                    <td style={tableStyles.td}>
                      {formatDate(canvas.createdAt)}
                    </td>
                    <td style={{ ...tableStyles.td, 'font-family': 'monospace', 'font-size': '12px' }}>
                      {canvas.lat?.toFixed(6)}, {canvas.lng?.toFixed(6)}
                    </td>
                  </tr>
                )}
              </For>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}