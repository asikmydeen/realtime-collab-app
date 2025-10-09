import { createSignal, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { ActivityControls } from './ActivityControls';

export function ActivityCanvas(props) {
  let canvasRef;
  let drawingCanvasRef;
  let containerRef;

  // Canvas state
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [paths, setPaths] = createSignal([]);
  const [remotePaths, setRemotePaths] = createSignal(new Map());
  const [participants, setParticipants] = createSignal(new Map());
  const [canvasReady, setCanvasReady] = createSignal(false);
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedPaths, setSelectedPaths] = createSignal(new Set());
  const [hoveredPath, setHoveredPath] = createSignal(null);
  const [canContribute, setCanContribute] = createSignal(false);
  const [requestSent, setRequestSent] = createSignal(false);
  const [contributionRequests, setContributionRequests] = createSignal([]);
  const [showParticipants, setShowParticipants] = createSignal(false);
  const [showMobileRequests, setShowMobileRequests] = createSignal(false);
  const [currentTool, setCurrentTool] = createSignal('pen');
  const [showColorPicker, setShowColorPicker] = createSignal(false);

  // Drawing state
  const drawingThrottle = {
    lastSendTime: 0,
    throttleMs: 16,
    pendingPoints: [],
    timeoutId: null
  };

  // Tool definitions
  const tools = [
    { id: 'pen', icon: '✏️', name: 'Pen' },
    { id: 'eraser', icon: '🧹', name: 'Eraser' }
  ];

  const colors = [
    '#000000', '#FFFFFF', '#EF4444', '#F97316', '#FDE047',
    '#22C55E', '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899'
  ];

  const brushSizes = [2, 5, 10, 20];

  // Helper function to check if a point is near a path
  function isPointNearPath(x, y, path, threshold = 10) {
    if (!path.points || path.points.length < 2) return false;

    for (let i = 1; i < path.points.length; i++) {
      const p1 = path.points[i - 1];
      const p2 = path.points[i];

      const A = x - p1.x;
      const B = y - p1.y;
      const C = p2.x - p1.x;
      const D = p2.y - p1.y;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;

      if (lenSq !== 0) {
        param = dot / lenSq;
      }

      let xx, yy;

      if (param < 0) {
        xx = p1.x;
        yy = p1.y;
      } else if (param > 1) {
        xx = p2.x;
        yy = p2.y;
      } else {
        xx = p1.x + param * C;
        yy = p1.y + param * D;
      }

      const dx = x - xx;
      const dy = y - yy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= threshold) {
        return true;
      }
    }

    return false;
  }

  onMount(() => {
    // Setup canvas with proper timing
    requestAnimationFrame(() => {
      setupCanvas();
    });

    if (props.activity) {
      console.log('[ActivityCanvas] Mounted with activity:', props.activity.id);
      setCanvasReady(true);
    }

    // Handle window resize
    const handleResize = () => {
      setupCanvas();
    };

    window.addEventListener('resize', handleResize);

    // Create resize observer
    const resizeObserver = new ResizeObserver(() => {
      setupCanvas();
    });

    if (containerRef) {
      resizeObserver.observe(containerRef);
    }

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    });
  });

  function setupCanvas() {
    if (!canvasRef || !drawingCanvasRef || !containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width > 0 && height > 0) {
      canvasRef.width = width;
      canvasRef.height = height;
      drawingCanvasRef.width = width;
      drawingCanvasRef.height = height;
      console.log('[ActivityCanvas] Canvas setup:', width, 'x', height);
      renderCanvas();
    }
  }

  function renderCanvas() {
    if (!canvasRef || !drawingCanvasRef) {
      console.log('[ActivityCanvas] Canvas refs not ready');
      return;
    }

    const ctx = canvasRef.getContext('2d');
    const drawCtx = drawingCanvasRef.getContext('2d');

    console.log('[ActivityCanvas] Rendering canvas:', canvasRef.width, 'x', canvasRef.height);

    // Clear canvases
    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
    drawCtx.clearRect(0, 0, drawingCanvasRef.width, drawingCanvasRef.height);

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);

    // Render drawings
    renderDrawings(drawCtx);
    ctx.drawImage(drawingCanvasRef, 0, 0);
  }

  function renderDrawings(ctx) {
    const isOwner = props.wsManager?.userHash === props.activity?.ownerId;

    // Render all completed paths
    paths().forEach(path => {
      if (path.points && path.points.length > 0) {
        ctx.beginPath();

        // Highlight selected paths
        if (selectMode() && selectedPaths().has(path.pathId)) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = (path.size || 3) + 2;
        } else if (selectMode() && isOwner) {
          // In owner select mode, distinguish between own drawings and others'
          if (path.userHash === props.wsManager?.userHash) {
            // Owner's own drawings
            ctx.strokeStyle = path.color || '#000000';
            ctx.lineWidth = path.size || 3;
            ctx.globalAlpha = 0.3;
          } else {
            // Others' drawings - make more visible for review
            ctx.strokeStyle = path.color || '#000000';
            ctx.lineWidth = path.size || 3;
            ctx.globalAlpha = 1;
          }
        } else {
          ctx.strokeStyle = path.color || '#000000';
          ctx.lineWidth = path.size || 3;
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        path.points.forEach((point, i) => {
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });

        ctx.stroke();
        ctx.globalAlpha = 1; // Reset alpha
      }
    });

    // Render active remote paths
    remotePaths().forEach((path) => {
      if (path.points && path.points.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = path.color || '#000000';
        ctx.lineWidth = path.size || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        path.points.forEach((point, i) => {
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });

        ctx.stroke();
      }
    });
  }

  // Ensure canvas is setup when refs are ready
  createEffect(() => {
    if (canvasRef && drawingCanvasRef && containerRef) {
      setupCanvas();
    }
  });

  // Check if user can contribute
  function updateContributeStatus() {
    const activity = props.activity;
    const userHash = props.wsManager?.userHash;
    if (!activity || !userHash) {
      setCanContribute(false);
      return;
    }

    // Owner can always contribute
    if (activity.ownerId === userHash) {
      console.log('[ActivityCanvas] User is owner, can contribute');
      setCanContribute(true);
      return;
    }

    // Check if user is approved contributor
    const isApproved = activity.permissions?.approvedContributors?.includes(userHash);
    const isAllowed = activity.permissions?.allowContributions;
    console.log('[ActivityCanvas] User contribute status:', { userHash, isApproved, isAllowed });
    setCanContribute(isApproved || isAllowed);
  }

  createEffect(() => {
    updateContributeStatus();

    // Load contribution requests if owner
    if (props.activity && props.wsManager?.userHash === props.activity.ownerId) {
      const requests = props.activity.permissions?.contributorRequests || [];
      setContributionRequests(requests);
    }
  });

  // Get coordinates from mouse or touch event
  function getCoordinates(e) {
    const rect = canvasRef.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  // Combined pointer down handler for mouse and touch
  function handlePointerDown(e) {
    e.preventDefault();
    const coords = getCoordinates(e);

    if (selectMode()) {
      // In select mode, find the clicked path
      const { x, y } = coords;

        // Only owners can select drawings
        const isOwner = props.wsManager?.userHash === props.activity?.ownerId;
        if (!isOwner) return;

        // Find path under click (check in reverse order for top-most path)
        for (let i = paths().length - 1; i >= 0; i--) {
          const path = paths()[i];
          // Owners can only select others' paths, not their own
          if (path.userHash === props.wsManager?.userHash) continue;

          if (isPointNearPath(x, y, path)) {
            setSelectedPaths(prev => {
              const next = new Set(prev);
              if (next.has(path.pathId)) {
                next.delete(path.pathId);
              } else {
                next.add(path.pathId);
              }
              return next;
            });
            renderCanvas();
            return;
          }
        }
      } else if (canContribute()) {
        setIsDrawing(true);

        const { x, y } = coords;

        // Start new path
        const pathId = `${props.wsManager?.clientId}_${Date.now()}`;
        const newPath = {
          color: currentTool() === 'eraser' ? '#FFFFFF' : (props.color || '#000000'),
          size: props.brushSize || 3,
          points: [{ x, y }],
          pathId: pathId,
          clientId: props.wsManager?.clientId,
          userHash: props.wsManager?.userHash,
          timestamp: Date.now()
        };

        setPaths(prev => [...prev, newPath]);

        // Send draw start
        sendThrottledDraw({
          drawType: 'start',
          x,
          y,
          color: currentTool() === 'eraser' ? '#FFFFFF' : (props.color || '#000000'),
          size: props.brushSize || 3,
          pathId: pathId,
          userHash: props.wsManager?.userHash,
          timestamp: Date.now()
        });
      }
    }

  function handlePointerMove(e) {
    e.preventDefault();
    const coords = getCoordinates(e);
    const { x, y } = coords;

    if (selectMode() && !isDrawing()) {
      // Only owners can hover/select in review mode
      const isOwner = props.wsManager?.userHash === props.activity?.ownerId;
      if (!isOwner) return;

      let foundPath = null;
      for (let i = paths().length - 1; i >= 0; i--) {
        const path = paths()[i];
        // Only show others' contributions for review
        if (path.userHash === props.wsManager?.userHash) continue;

        if (isPointNearPath(x, y, path)) {
          foundPath = path;
          break;
        }
      }

      if (foundPath !== hoveredPath()) {
        setHoveredPath(foundPath);
        renderCanvas();
      }
    } else if (isDrawing()) {

      // Add point to current path
      setPaths(prev => {
        const newPaths = [...prev];
        if (newPaths.length > 0) {
          const currentPath = newPaths[newPaths.length - 1];
          currentPath.points.push({ x, y });
        }
        return newPaths;
      });

      // Send draw update with current path info
      const currentPath = paths()[paths().length - 1];
      sendThrottledDraw({
        drawType: 'draw',
        x,
        y,
        pathId: currentPath?.pathId,
        userHash: props.wsManager?.userHash
      });

      renderCanvas();
    }
  }

  function handlePointerUp() {
    if (isDrawing()) {
      // Send end event with path info
      const currentPath = paths()[paths().length - 1];
      sendThrottledDraw({
        drawType: 'end',
        pathId: currentPath?.pathId,
        userHash: props.wsManager?.userHash,
        timestamp: Date.now()
      });
    }
    setIsDrawing(false);
  }

  // Mouse specific handlers
  function handleMouseDown(e) {
    if (e.button === 0) {
      handlePointerDown(e);
    }
  }

  function handleMouseMove(e) {
    handlePointerMove(e);
  }

  function handleMouseUp() {
    handlePointerUp();
  }

  // Touch handlers
  function handleTouchStart(e) {
    handlePointerDown(e);
  }

  function handleTouchMove(e) {
    handlePointerMove(e);
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    handlePointerUp();
  }

  // Send drawing data with throttling
  function sendThrottledDraw(drawData) {
    const now = Date.now();

    if (drawData.drawType === 'start' || drawData.drawType === 'end') {
      // Send immediately for start/end
      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }

      if (drawingThrottle.pendingPoints.length > 0) {
        drawingThrottle.pendingPoints.forEach(point => {
          sendActivityDraw(point);
        });
        drawingThrottle.pendingPoints = [];
      }

      sendActivityDraw(drawData);
      drawingThrottle.lastSendTime = now;
      return;
    }

    // Throttle draw events
    drawingThrottle.pendingPoints.push(drawData);

    if (now - drawingThrottle.lastSendTime >= drawingThrottle.throttleMs) {
      drawingThrottle.pendingPoints.forEach(point => {
        sendActivityDraw(point);
      });
      drawingThrottle.pendingPoints = [];
      drawingThrottle.lastSendTime = now;

      if (drawingThrottle.timeoutId) {
        clearTimeout(drawingThrottle.timeoutId);
        drawingThrottle.timeoutId = null;
      }
    } else if (!drawingThrottle.timeoutId) {
      const remainingTime = drawingThrottle.throttleMs - (now - drawingThrottle.lastSendTime);
      drawingThrottle.timeoutId = setTimeout(() => {
        drawingThrottle.pendingPoints.forEach(point => {
          sendActivityDraw(point);
        });
        drawingThrottle.pendingPoints = [];
        drawingThrottle.lastSendTime = Date.now();
        drawingThrottle.timeoutId = null;
      }, remainingTime);
    }
  }

  function sendActivityDraw(data) {
    if (props.wsManager && props.activity) {
      console.log('[ActivityCanvas] Sending draw for activity:', props.activity.id, 'type:', data.drawType);
      const message = {
        type: 'activityDraw',
        activityId: props.activity.id, // Ensure activity ID is included
        ...data
      };
      console.log('[ActivityCanvas] Full draw message:', message);
      props.wsManager.send(message);
    } else {
      console.warn('[ActivityCanvas] Cannot send draw - missing wsManager or activity');
    }
  }

  // Handle remote drawing
  function handleRemoteActivityDraw(data) {
    console.log('[ActivityCanvas] Received remote draw:', data.drawType, 'from client:', data.clientId);

    // Skip if it's our own draw (shouldn't happen but just in case)
    if (props.wsManager && data.clientId === props.wsManager.clientId) {
      console.log('[ActivityCanvas] Skipping own draw message');
      return;
    }

    switch(data.drawType) {
      case 'start':
        setRemotePaths(prev => {
          const next = new Map(prev);
          next.set(data.clientId, {
            color: data.color || '#000000',
            size: data.size || 3,
            points: [{ x: data.x, y: data.y }]
          });
          return next;
        });
        break;

      case 'draw':
        setRemotePaths(prev => {
          const next = new Map(prev);
          let path = next.get(data.clientId);
          if (!path) {
            path = {
              color: data.color || '#000000',
              size: data.size || 3,
              points: []
            };
            next.set(data.clientId, path);
          }
          path.points.push({ x: data.x, y: data.y });
          return next;
        });
        break;

      case 'end':
        setRemotePaths(prev => {
          const next = new Map(prev);
          const finishedPath = next.get(data.clientId);
          if (finishedPath && finishedPath.points.length > 1) {
            // Include all necessary path data
            setPaths(paths => [...paths, {
              ...finishedPath,
              pathId: data.pathId,
              clientId: data.clientId,
              userHash: data.userHash,
              timestamp: data.timestamp
            }]);
          }
          next.delete(data.clientId);
          return next;
        });
        break;
    }

    // Force immediate re-render
    requestAnimationFrame(() => renderCanvas());
  }

  // WebSocket handlers
  createEffect(() => {
    if (props.wsManager) {
      const cleanup1 = props.wsManager.on('activityJoined', (data) => {
        console.log('[ActivityCanvas] Activity joined, loading canvas data');
        // Load existing canvas data
        if (data.canvasData && data.canvasData.paths) {
          setPaths(data.canvasData.paths);
          renderCanvas();
        }
        setCanvasReady(true);

        // Update contribute status with fresh data
        if (data.activity) {
          // Update local activity reference if needed
          if (props.activity && props.activity.id === data.activity.id) {
            // Refresh contribution status
            const userHash = props.wsManager?.userHash;
            const isOwner = data.activity.ownerId === userHash;
            const isApproved = data.activity.permissions?.approvedContributors?.includes(userHash);
            const isAllowed = data.activity.permissions?.allowContributions;
            console.log('[ActivityCanvas] Updated contribute status:', { isOwner, isApproved, isAllowed });
            setCanContribute(isOwner || isApproved || isAllowed);
          }

          // If we have activity data with permissions, update contribution requests
          if (props.wsManager?.userHash === data.activity.ownerId) {
            const requests = data.activity.permissions?.contributorRequests || [];
            console.log('[ActivityCanvas] Loading contribution requests:', requests.length);
            setContributionRequests(requests);
          }
        }
      });

      const cleanup2 = props.wsManager.on('remoteActivityDraw', (data) => {
        handleRemoteActivityDraw(data);
      });

      const cleanup3 = props.wsManager.on('participantJoined', (data) => {
        setParticipants(prev => {
          const next = new Map(prev);
          next.set(data.clientId, { username: data.username });
          return next;
        });
      });

      const cleanup4 = props.wsManager.on('participantLeft', (data) => {
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(data.clientId);
          return next;
        });
      });

      // Also handle defaultActivity response which includes canvas data
      const cleanup5 = props.wsManager.on('defaultActivity', (data) => {
        if (props.activity && props.activity.id === data.activity.id) {
          console.log('[ActivityCanvas] Default activity loaded, setting canvas data');
          if (data.canvasData && data.canvasData.paths) {
            setPaths(data.canvasData.paths);
            renderCanvas();
          }
          setCanvasReady(true);
        }
      });

      // Handle drawing removal
      const cleanup6 = props.wsManager.on('drawingRemoved', (data) => {
        console.log('[ActivityCanvas] Drawing removed:', data.pathId);
        setPaths(prev => {
          console.log('[ActivityCanvas] Current paths:', prev.map(p => p.pathId));
          const filtered = prev.filter(path => path.pathId !== data.pathId);
          console.log('[ActivityCanvas] Paths after removal:', filtered.map(p => p.pathId));
          return filtered;
        });
        // Force re-render
        setTimeout(() => renderCanvas(), 0);
      });

      // Handle contribution status
      const cleanup7 = props.wsManager.on('contributionStatus', (data) => {
        console.log('[ActivityCanvas] Contribution status:', data.status);
        if (data.status === 'approved') {
          // Directly update the contribute status since we're approved
          setCanContribute(true);
          setRequestSent(false);
          // Show success message
          alert('Your contribution request has been approved! You can now draw.');

          // Rejoin the activity to refresh permissions
          if (props.activity) {
            console.log('[ActivityCanvas] Rejoining activity to refresh permissions');
            props.wsManager.send({
              type: 'joinActivity',
              activityId: props.activity.id
            });
          }
        } else if (data.status === 'requested') {
          alert('Your contribution request has been sent to the owner.');
        } else if (data.status === 'already_approved') {
          setCanContribute(true);
          setRequestSent(false);
        }
      });

      // Handle activity updates
      const cleanup8 = props.wsManager.on('activityUpdate', (data) => {
        if (data.activity && data.activity.id === props.activity?.id) {
          // Update local activity state if needed
          updateContributeStatus();
        }
      });

      // Handle welcome (re-authentication)
      const cleanup9 = props.wsManager.on('welcome', (data) => {
        console.log('[ActivityCanvas] Received welcome with userHash:', data.userHash);
        updateContributeStatus();
      });

      // Handle contribution requests (for owners)
      const cleanup10 = props.wsManager.on('contributionRequest', (data) => {
        console.log('[ActivityCanvas] Received contribution request:', data);
        if (data.activityId === props.activity?.id && props.wsManager?.userHash === props.activity?.ownerId) {
          setContributionRequests(prev => [...prev, data.requester]);
        }
      });

      // Handle contributor approval (update owner's UI)
      const cleanup11 = props.wsManager.on('contributorApproved', (data) => {
        console.log('[ActivityCanvas] Contributor approved:', data);
        if (data.activityId === props.activity?.id) {
          // Remove from pending requests
          setContributionRequests(prev =>
            prev.filter(req => req.userHash !== data.userHash)
          );
        }
      });

      onCleanup(() => {
        cleanup1();
        cleanup2();
        cleanup3();
        cleanup4();
        cleanup5();
        cleanup6();
        cleanup7();
        cleanup8();
        cleanup9();
        cleanup10();
        cleanup11?.();
        if (drawingThrottle.timeoutId) {
          clearTimeout(drawingThrottle.timeoutId);
        }
      });
    }
  });

  // Re-render on remote path changes
  createEffect(() => {
    remotePaths();
    renderCanvas();
  });

  // Check if mobile device
  const isMobile = window.innerWidth <= 768;
  const isOwner = () => props.wsManager?.userHash === props.activity?.ownerId;

  const styles = {
    container: {
      position: 'fixed',
      inset: '0',
      background: '#f8fafc',
      display: 'flex',
      'flex-direction': 'column',
      'z-index': 1000
    },
    header: {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      height: '60px',
      background: 'rgba(255, 255, 255, 0.95)',
      'backdrop-filter': 'blur(10px)',
      'box-shadow': '0 1px 3px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      padding: '0 20px',
      'z-index': 100
    },
    headerTitle: {
      display: 'flex',
      'align-items': 'center',
      gap: '12px'
    },
    title: {
      'font-size': '18px',
      'font-weight': '600',
      color: '#1e293b',
      margin: '0',
      display: 'flex',
      'align-items': 'center',
      gap: '8px'
    },
    locationBadge: {
      background: '#f1f5f9',
      padding: '4px 12px',
      'border-radius': '999px',
      'font-size': '13px',
      color: '#64748b',
      display: 'flex',
      'align-items': 'center',
      gap: '6px'
    },
    headerActions: {
      display: 'flex',
      'align-items': 'center',
      gap: '8px'
    },
    iconButton: {
      background: 'transparent',
      border: '1px solid #e2e8f0',
      'border-radius': '8px',
      padding: '8px 12px',
      cursor: 'pointer',
      color: '#64748b',
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'font-size': '14px',
      transition: 'all 0.2s',
      '&:hover': {
        background: '#f8fafc',
        'border-color': '#cbd5e1'
      }
    },
    closeButton: {
      background: '#fee2e2',
      border: 'none',
      'border-radius': '8px',
      padding: '8px 16px',
      cursor: 'pointer',
      color: '#dc2626',
      'font-weight': '500',
      'font-size': '14px',
      transition: 'all 0.2s',
      '&:hover': {
        background: '#fecaca'
      }
    },
    canvasArea: {
      position: 'absolute',
      top: '60px',
      left: '0',
      right: '0',
      bottom: '0',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: isMobile ? '0' : '20px',
      background: '#e2e8f0'
    },
    canvasContainer: {
      width: '100%',
      height: '100%',
      'max-width': '1400px',
      'max-height': '900px',
      background: 'white',
      'border-radius': isMobile ? '0' : '12px',
      'box-shadow': isMobile ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      position: 'relative',
      overflow: 'hidden'
    },
    canvas: {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      cursor: selectMode() ? 'pointer' : (canContribute() ? 'crosshair' : 'not-allowed')
    },
    toolbar: {
      position: 'absolute',
      bottom: isMobile ? '20px' : '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255, 255, 255, 0.95)',
      'backdrop-filter': 'blur(10px)',
      'border-radius': '16px',
      padding: '12px',
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
      'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      'z-index': 50
    },
    toolButton: {
      background: 'white',
      border: '1px solid #e2e8f0',
      'border-radius': '10px',
      width: '40px',
      height: '40px',
      cursor: 'pointer',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'font-size': '20px',
      transition: 'all 0.2s'
    },
    toolButtonActive: {
      background: '#3b82f6',
      'border-color': '#3b82f6',
      transform: 'scale(1.1)'
    },
    colorButton: {
      width: '32px',
      height: '32px',
      'border-radius': '50%',
      cursor: 'pointer',
      border: '2px solid transparent',
      transition: 'all 0.2s'
    },
    colorButtonActive: {
      border: '2px solid #3b82f6',
      transform: 'scale(1.2)'
    },
    brushSizeButton: {
      background: 'white',
      border: '1px solid #e2e8f0',
      'border-radius': '8px',
      padding: '6px 12px',
      cursor: 'pointer',
      'font-size': '13px',
      transition: 'all 0.2s'
    },
    separator: {
      width: '1px',
      height: '24px',
      background: '#e2e8f0'
    },
    requestCard: {
      position: 'absolute',
      bottom: isMobile ? '90px' : '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'white',
      'border-radius': '12px',
      padding: '16px 24px',
      'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      display: 'flex',
      'align-items': 'center',
      gap: '16px',
      'z-index': 40
    },
    requestButton: {
      background: '#3b82f6',
      color: 'white',
      border: 'none',
      'border-radius': '8px',
      padding: '8px 16px',
      'font-size': '14px',
      'font-weight': '500',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    contributorPanel: {
      position: 'absolute',
      top: '80px',
      right: '20px',
      background: 'white',
      'border-radius': '12px',
      padding: '16px',
      'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      'max-width': '300px',
      'max-height': '400px',
      'overflow-y': 'auto',
      'z-index': 40
    }
  };

  return (
    <div style={styles.container}>
      {/* Minimal Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>
            <span>🎨</span>
            {props.activity.title || 'Untitled Canvas'}
          </h2>
          <div style={styles.locationBadge}>
            <span>📍</span>
            <span>{props.activity.street || 'Unknown Location'}</span>
          </div>
        </div>

        <div style={styles.headerActions}>
          {/* Participants Counter */}
          <Show when={!isMobile}>
            <button
              style={styles.iconButton}
              onClick={() => setShowParticipants(!showParticipants())}
            >
              <span>👥</span>
              <span>{participants().size + 1}</span>
            </button>
          </Show>

          {/* Contribution Requests for Owners */}
          <Show when={isOwner() && contributionRequests().length > 0}>
            <button
              style={{
                ...styles.iconButton,
                background: '#fef3c7',
                'border-color': '#fbbf24',
                color: '#f59e0b'
              }}
            >
              <span>🔔</span>
              <span>{contributionRequests().length}</span>
            </button>
          </Show>

          {/* Close Button */}
          <button
            style={styles.closeButton}
            onClick={props.onClose}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={styles.canvasArea}>
        <div ref={containerRef} style={styles.canvasContainer}>
          <canvas
            ref={drawingCanvasRef}
            style={{ display: 'none' }}
          />
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* Owner Controls */}
          <Show when={isOwner()}>
            <ActivityControls
              activity={props.activity}
              wsManager={props.wsManager}
              selectMode={selectMode()}
              selectedPaths={selectedPaths()}
              onToggleSelectMode={() => {
                setSelectMode(!selectMode());
                setSelectedPaths(new Set());
                renderCanvas();
              }}
              onRemoveSelected={() => {
                const pathsToRemove = Array.from(selectedPaths());
                pathsToRemove.forEach(pathId => {
                  if (props.wsManager) {
                    props.wsManager.send({
                      type: 'removeUserDrawing',
                      activityId: props.activity.id,
                      pathId
                    });
                  }
                });
                setSelectedPaths(new Set());
                setSelectMode(false);
              }}
            />
          </Show>
        </div>
      </div>

      {/* Drawing Toolbar */}
      <Show when={canContribute() && !selectMode()}>
        <div style={styles.toolbar}>
          {/* Tools */}
          <For each={tools}>
            {tool => (
              <button
                style={{
                  ...styles.toolButton,
                  ...(currentTool() === tool.id ? styles.toolButtonActive : {})
                }}
                onClick={() => setCurrentTool(tool.id)}
              >
                {tool.icon}
              </button>
            )}
          </For>

          <div style={styles.separator} />

          {/* Colors */}
          <Show when={currentTool() !== 'eraser'}>
            <For each={colors.slice(0, 5)}>
              {color => (
                <button
                  style={{
                    ...styles.colorButton,
                    background: color,
                    border: color === props.color ? '2px solid #3b82f6' : '2px solid transparent'
                  }}
                  onClick={() => props.setColor && props.setColor(color)}
                />
              )}
            </For>
          </Show>

          <div style={styles.separator} />

          {/* Brush Sizes */}
          <For each={brushSizes}>
            {size => (
              <button
                style={{
                  ...styles.brushSizeButton,
                  ...(props.brushSize === size ? { background: '#eff6ff', 'border-color': '#3b82f6' } : {})
                }}
                onClick={() => props.setBrushSize && props.setBrushSize(size)}
              >
                {size}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Request to Contribute Card */}
      <Show when={!canContribute() && !isOwner()}>
        <div style={styles.requestCard}>
          <span>🔒 This canvas is view-only</span>
          <Show when={!requestSent()}>
            <button
              style={styles.requestButton}
              onClick={() => {
                if (props.wsManager) {
                  props.wsManager.send({
                    type: 'requestContribution',
                    activityId: props.activity.id
                  });
                  setRequestSent(true);
                }
              }}
            >
              Request to Contribute
            </button>
          </Show>
          <Show when={requestSent()}>
            <span style={{ color: '#22c55e', 'font-size': '14px' }}>
              ✓ Request sent
            </span>
          </Show>
        </div>
      </Show>

      {/* Contribution Requests Panel for Owners */}
      <Show when={isOwner() && contributionRequests().length > 0 && !isMobile}>
        <div style={styles.contributorPanel}>
          <h3 style={{ margin: '0 0 12px 0', 'font-size': '16px' }}>
            Contribution Requests
          </h3>
          <For each={contributionRequests()}>
            {request => (
              <div style={{
                padding: '12px',
                background: '#f8fafc',
                'border-radius': '8px',
                'margin-bottom': '8px'
              }}>
                <div style={{ 'font-size': '14px', 'margin-bottom': '8px' }}>
                  User {request.clientId?.slice(-4)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      ...styles.requestButton,
                      background: '#22c55e',
                      'font-size': '13px',
                      padding: '6px 12px'
                    }}
                    onClick={() => {
                      props.wsManager.send({
                        type: 'approveContributor',
                        activityId: props.activity.id,
                        userHash: request.userHash
                      });
                      setContributionRequests(prev =>
                        prev.filter(r => r.userHash !== request.userHash)
                      );
                    }}
                  >
                    Approve
                  </button>
                  <button
                    style={{
                      ...styles.requestButton,
                      background: '#ef4444',
                      'font-size': '13px',
                      padding: '6px 12px'
                    }}
                    onClick={() => {
                      setContributionRequests(prev =>
                        prev.filter(r => r.userHash !== request.userHash)
                      );
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}