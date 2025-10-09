import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
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

  // Drawing state
  const drawingThrottle = {
    lastSendTime: 0,
    throttleMs: 16,
    pendingPoints: [],
    timeoutId: null
  };

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
          color: props.color || '#000000',
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
          color: props.color || '#000000',
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

  const modernStyles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      'backdrop-filter': 'blur(12px)',
      'z-index': 9999,
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: isMobile ? '0' : '20px',
      animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    modal: {
      width: '100%',
      height: '100%',
      'max-width': isMobile ? '100%' : '1400px',
      'max-height': isMobile ? '100%' : '90vh',
      background: 'transparent',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'visible',
      animation: 'modalSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative'
    },
    header: {
      background: 'transparent',
      padding: isMobile ? '16px 20px' : '20px 32px',
      'border-bottom': '1px solid rgba(148, 163, 184, 0.15)',
      'flex-shrink': 0,
      display: 'flex',
      'flex-direction': 'column',
      gap: '12px',
      'z-index': 10,
      position: 'relative'
    },
    headerTop: {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: '16px'
    },
    titleSection: {
      flex: 1,
      'min-width': 0
    },
    title: {
      margin: 0,
      'font-size': isMobile ? '20px' : '28px',
      'font-weight': '800',
      color: '#ffffff',
      'line-height': '1.2',
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      'letter-spacing': '-0.02em'
    },
    subtitle: {
      'font-size': isMobile ? '13px' : '15px',
      color: '#94a3b8',
      'line-height': '1.4',
      'max-width': '600px',
      'margin-top': '4px'
    },
    headerActions: {
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
      'flex-shrink': 0,
      'z-index': 20
    },
    metadata: {
      display: 'flex',
      'align-items': 'center',
      gap: isMobile ? '8px' : '12px',
      'flex-wrap': 'wrap',
      'overflow-x': 'auto',
      'scrollbar-width': 'thin',
      'scrollbar-color': 'rgba(148, 163, 184, 0.3) transparent',
      'padding-bottom': '4px'
    },
    metadataItem: {
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'font-size': isMobile ? '12px' : '13px',
      color: '#cbd5e1',
      background: 'rgba(51, 65, 85, 0.5)',
      padding: '6px 12px',
      'border-radius': '8px',
      border: '1px solid rgba(148, 163, 184, 0.1)',
      'white-space': 'nowrap',
      'flex-shrink': 0
    },
    mainContent: {
      flex: 1,
      display: 'flex',
      'min-height': 0,
      position: 'relative',
      background: 'transparent',
      overflow: 'hidden'
    },
    canvasWrapper: {
      flex: 1,
      display: 'flex',
      'flex-direction': 'column',
      'min-width': 0,
      position: 'relative',
      padding: isMobile ? '0' : '0'
    },
    canvasContainer: {
      flex: 1,
      margin: isMobile ? '12px' : '20px',
      background: '#ffffff',
      'border-radius': isMobile ? '12px' : '16px',
      'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
      overflow: 'hidden',
      position: 'relative',
      border: '2px solid rgba(148, 163, 184, 0.2)'
    },
    sidebar: {
      width: isMobile ? '100%' : '320px',
      background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
      'border-left': isMobile ? 'none' : '1px solid rgba(148, 163, 184, 0.1)',
      display: 'flex',
      'flex-direction': 'column',
      'overflow-y': 'auto',
      'flex-shrink': 0,
      'max-height': '100%',
      'scrollbar-width': 'thin',
      'scrollbar-color': 'rgba(148, 163, 184, 0.3) transparent'
    },
    button: {
      padding: isMobile ? '10px 16px' : '12px 20px',
      'border-radius': '12px',
      border: 'none',
      'font-weight': '600',
      'font-size': isMobile ? '13px' : '14px',
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'white-space': 'nowrap'
    },
    primaryButton: {
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      color: 'white',
      'box-shadow': '0 4px 12px rgba(59, 130, 246, 0.4)'
    },
    dangerButton: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      color: 'white',
      'box-shadow': '0 4px 12px rgba(239, 68, 68, 0.4)'
    },
    secondaryButton: {
      background: 'rgba(51, 65, 85, 0.8)',
      color: '#e2e8f0',
      border: '1px solid rgba(148, 163, 184, 0.2)'
    }
  };

  return (
    <div style={modernStyles.overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div style={modernStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          'flex-direction': 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          'border-radius': isMobile ? '0' : '24px',
          'box-shadow': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: isMobile ? 'none' : '1px solid rgba(148, 163, 184, 0.1)',
          overflow: 'hidden'
        }}>
        {/* Header */}
        <div style={modernStyles.header}>
          <div style={modernStyles.headerTop}>
            {/* Title Section */}
            <div style={modernStyles.titleSection}>
              <h1 style={modernStyles.title}>
                <span style={{ 'font-size': isMobile ? '24px' : '32px' }}>🎨</span>
                <span style={{
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  'max-width': isMobile ? 'calc(100vw - 180px)' : 'none'
                }}>
                  {props.activity.title || 'Untitled Canvas'}
                </span>
              </h1>
              <Show when={props.activity.description}>
                <p style={modernStyles.subtitle}>
                  {props.activity.description}
                </p>
              </Show>
            </div>

            {/* Header Actions */}
            <div style={modernStyles.headerActions}>
              <Show when={!isMobile}>
                <button
                  onClick={() => setShowParticipants(!showParticipants())}
                  style={{
                    ...modernStyles.button,
                    ...(showParticipants() ? modernStyles.primaryButton : modernStyles.secondaryButton),
                    padding: '10px 14px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <span style={{ 'font-size': '16px' }}>👥</span>
                  <span>{participants().size + 1}</span>
                </button>
              </Show>

              <button
                onClick={props.onClose}
                style={{
                  ...modernStyles.button,
                  ...modernStyles.dangerButton,
                  padding: isMobile ? '10px' : '10px 16px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
                }}
              >
                <span style={{ 'font-size': '16px' }}>✕</span>
                <Show when={!isMobile}>
                  <span>Close</span>
                </Show>
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div style={modernStyles.metadata}>
            <div style={{
              ...modernStyles.metadataItem,
              'max-width': isMobile ? '45%' : 'none'
            }}>
              <span style={{ 'font-size': '16px', 'flex-shrink': 0 }}>📍</span>
              <span style={{
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap'
              }}>
                {props.activity.street || 'Unknown Location'}
              </span>
            </div>

            <Show when={props.activity.ownerName && props.activity.ownerName !== 'Anonymous'}>
              <div style={modernStyles.metadataItem}>
                <span style={{ 'font-size': '16px' }}>👤</span>
                <span>by {props.activity.ownerName}</span>
              </div>
            </Show>

            <div style={modernStyles.metadataItem}>
              <span style={{ 'font-size': '16px' }}>🎯</span>
              <span>
                {props.wsManager?.userHash === props.activity?.ownerId ? 'Owner' :
                 canContribute() ? 'Contributor' : 'Viewer'}
              </span>
            </div>

            <Show when={isMobile && props.wsManager?.userHash === props.activity?.ownerId && contributionRequests().length > 0}>
              <button
                onClick={() => setShowMobileRequests(true)}
                style={{
                  ...modernStyles.metadataItem,
                  ...modernStyles.dangerButton,
                  cursor: 'pointer',
                  animation: 'pulse 2s infinite'
                }}
              >
                <span style={{ 'font-size': '16px' }}>🔔</span>
                <span>{contributionRequests().length}</span>
              </button>
            </Show>
          </div>
        </div>

        {/* Main Content */}
        <div style={modernStyles.mainContent}>
          {/* Canvas Wrapper */}
          <div style={modernStyles.canvasWrapper}>
            {/* Canvas Container */}
            <div ref={containerRef} style={modernStyles.canvasContainer}>
          <canvas
            ref={drawingCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'none'
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: selectMode() ? 'pointer' : (canContribute() ? 'crosshair' : 'not-allowed')
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* Canvas Overlays */}
          {/* Contribution Request UI */}
          <Show when={!canContribute() && props.wsManager?.userHash !== props.activity?.ownerId}>
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(31, 41, 55, 0.9)',
              'backdrop-filter': 'blur(10px)',
              'border-radius': '9999px',
              padding: '12px 24px',
              animation: 'slideUp 0.3s ease-out'
            }}>
              <div style={{ color: 'white', 'text-align': 'center' }}>
                <div style={{
                  'margin-bottom': '12px',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px'
                }}>
                  <span>🔒</span>
                  <span>This canvas is view-only</span>
                </div>
                {requestSent() ? (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: 'rgba(134, 239, 172, 1)',
                    padding: '8px 16px',
                    'border-radius': '9999px',
                    'font-size': '14px',
                    'font-weight': '500'
                  }}>
                    ✓ Request Sent - Waiting for approval
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (props.wsManager) {
                        console.log('[ActivityCanvas] Sending contribution request');
                        props.wsManager.send({
                          type: 'requestContribution',
                          activityId: props.activity.id
                        });
                        setRequestSent(true);
                      }
                    }}
                    style={{
                      background: '#3B82F6',
                      color: 'white',
                      padding: '8px 16px',
                      'border-radius': '9999px',
                      'font-size': '14px',
                      'font-weight': '500',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#2563EB';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#3B82F6';
                    }}
                  >
                    Request to Contribute
                  </button>
                )}
              </div>
            </div>
          </Show>

          {/* Drawing Author Overlay */}
          <Show when={selectMode() && hoveredPath() && props.wsManager?.userHash === props.activity?.ownerId}>
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(31, 41, 55, 0.9)',
              'backdrop-filter': 'blur(10px)',
              'border-radius': '8px',
              padding: '12px 24px',
              animation: 'slideUp 0.3s ease-out'
            }}>
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '16px',
                color: 'white'
              }}>
                <span>✏️ Contribution by:</span>
                <span style={{
                  'font-weight': '600',
                  color: 'rgba(147, 197, 253, 1)'
                }}>
                  {hoveredPath().clientId ? `User ${hoveredPath().clientId.slice(-4)}` : 'Unknown'}
                </span>
                {selectedPaths().has(hoveredPath().pathId) ? (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: 'rgba(248, 113, 113, 1)',
                    padding: '4px 12px',
                    'border-radius': '9999px',
                    'font-size': '14px',
                    'font-weight': '500'
                  }}>
                    ✓ Selected for removal
                  </span>
                ) : (
                  <span style={{
                    color: 'rgba(156, 163, 175, 1)',
                    'font-size': '14px'
                  }}>
                    Click to select
                  </span>
                )}
              </div>
            </div>
          </Show>

          {/* Owner Controls */}
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

          {/* Mobile Color Picker - Always visible at bottom */}
          <Show when={isMobile && canContribute()}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(31, 41, 55, 0.95)',
              'backdrop-filter': 'blur(10px)',
              padding: '12px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              gap: '8px',
              'border-top': '1px solid rgba(75, 85, 99, 0.5)',
              'z-index': 10
            }}>
              {/* Color palette */}
              <div style={{
                display: 'flex',
                gap: '6px',
                'align-items': 'center',
                'flex-wrap': 'wrap',
                'justify-content': 'center'
              }}>
                {['#000000', '#ef4444', '#f97316', '#fbbf24', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'].map(color => (
                  <button
                    onClick={() => props.setColor && props.setColor(color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      'border-radius': '50%',
                      background: color,
                      border: props.color === color ? '3px solid white' : '2px solid rgba(255, 255, 255, 0.2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      transform: props.color === color ? 'scale(1.2)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>

              {/* Brush size */}
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-left': '12px'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  'border-radius': '50%',
                  background: props.color || '#000000'
                }} />
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={props.brushSize || 3}
                  onInput={(e) => props.setBrushSize && props.setBrushSize(parseInt(e.target.value))}
                  style={{
                    width: '60px',
                    height: '4px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    outline: 'none',
                    'border-radius': '2px'
                  }}
                />
                <div style={{
                  width: `${(props.brushSize || 3) * 1.5}px`,
                  height: `${(props.brushSize || 3) * 1.5}px`,
                  'border-radius': '50%',
                  background: props.color || '#000000'
                }} />
              </div>
            </div>
          </Show>
            </div>
          </div>

          {/* Sidebar - Participants & Requests */}
          <Show when={!isMobile && (showParticipants() || (props.wsManager?.userHash === props.activity?.ownerId && contributionRequests().length > 0))}>
            <div style={modernStyles.sidebar}>
              {/* Participants Section */}
              <Show when={showParticipants()}>
                <div style={{
                  padding: '24px',
                  'border-bottom': '1px solid rgba(148, 163, 184, 0.1)'
                }}>
                  <h3 style={{
                    margin: '0 0 16px 0',
                    'font-size': '18px',
                    'font-weight': '700',
                    color: '#ffffff',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '10px'
                  }}>
                    <span style={{ 'font-size': '22px' }}>👥</span>
                    <span>Participants ({participants().size + 1})</span>
                  </h3>

                  <div style={{
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '10px'
                  }}>
                    {/* Current User */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      'border-radius': '12px',
                      padding: '14px 16px',
                      display: 'flex',
                      'align-items': 'center',
                      'justify-content': 'space-between'
                    }}>
                      <div style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '10px'
                      }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          'border-radius': '50%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          display: 'flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          'font-size': '18px'
                        }}>
                          👤
                        </div>
                        <span style={{
                          color: '#ffffff',
                          'font-weight': '600',
                          'font-size': '15px'
                        }}>
                          You
                        </span>
                      </div>
                      <Show when={props.wsManager?.userHash === props.activity?.ownerId}>
                        <span style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: '#6ee7b7',
                          padding: '4px 12px',
                          'border-radius': '8px',
                          'font-size': '12px',
                          'font-weight': '600',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}>
                          Owner
                        </span>
                      </Show>
                    </div>

                    {/* Other Participants */}
                    {Array.from(participants()).map(([id, participant]) => (
                      <div style={{
                        background: 'rgba(51, 65, 85, 0.5)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        'border-radius': '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        'align-items': 'center',
                        gap: '10px'
                      }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          'border-radius': '50%',
                          background: 'rgba(148, 163, 184, 0.2)',
                          display: 'flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          'font-size': '18px'
                        }}>
                          👤
                        </div>
                        <span style={{
                          color: '#cbd5e1',
                          'font-weight': '500',
                          'font-size': '15px'
                        }}>
                          {participant.username || `User ${id.slice(-4)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Show>

              {/* Contribution Requests Section (Owners Only) */}
              <Show when={props.wsManager?.userHash === props.activity?.ownerId && contributionRequests().length > 0}>
                <div style={{
                  padding: '24px'
                }}>
                  <h3 style={{
                    margin: '0 0 16px 0',
                    'font-size': '18px',
                    'font-weight': '700',
                    color: '#ffffff',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '10px'
                  }}>
                    <span style={{ 'font-size': '22px' }}>🔔</span>
                    <span>Requests ({contributionRequests().length})</span>
                  </h3>

                  <div style={{
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '12px'
                  }}>
                    {contributionRequests().map(request => (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        'border-radius': '12px',
                        padding: '16px',
                        animation: 'slideIn 0.3s ease-out'
                      }}>
                        <div style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '10px',
                          'margin-bottom': '12px'
                        }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            'border-radius': '50%',
                            background: 'rgba(239, 68, 68, 0.2)',
                            display: 'flex',
                            'align-items': 'center',
                            'justify-content': 'center',
                            'font-size': '16px'
                          }}>
                            👤
                          </div>
                          <span style={{
                            color: '#ffffff',
                            'font-weight': '600',
                            'font-size': '14px'
                          }}>
                            User {request.clientId?.slice(-4) || 'Unknown'}
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => {
                              if (props.wsManager) {
                                props.wsManager.send({
                                  type: 'approveContributor',
                                  activityId: props.activity.id,
                                  userHash: request.userHash
                                });
                                setContributionRequests(prev =>
                                  prev.filter(r => r.userHash !== request.userHash)
                                );
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '10px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white',
                              'border-radius': '8px',
                              'font-size': '14px',
                              'font-weight': '600',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              'box-shadow': '0 2px 8px rgba(16, 185, 129, 0.3)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                            }}
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => {
                              setContributionRequests(prev =>
                                prev.filter(r => r.userHash !== request.userHash)
                              );
                            }}
                            style={{
                              flex: 1,
                              padding: '10px',
                              background: 'rgba(51, 65, 85, 0.8)',
                              color: '#e2e8f0',
                              'border-radius': '8px',
                              'font-size': '14px',
                              'font-weight': '600',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(71, 85, 105, 0.9)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(51, 65, 85, 0.8)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            ✕ Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </div>

      {/* Participants Sidebar */}
      <Show when={showParticipants()}>
        <div style={{
          position: 'fixed',
          ...(isMobile ? {
            bottom: 0,
            left: 0,
            right: 0,
            'max-height': '50vh',
            'border-radius': '12px 12px 0 0'
          } : {
            right: '16px',
            top: '80px',
            width: '320px',
            'max-height': '384px',
            'border-radius': '12px'
          }),
          background: 'rgba(31, 41, 55, 0.95)',
          'backdrop-filter': 'blur(10px)',
          'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          animation: isMobile ? 'slideUp 0.3s ease-out' : 'slideDown 0.3s ease-out',
          'z-index': 100
        }}>
          <div style={{
            padding: '16px',
            'border-bottom': '1px solid rgba(75, 85, 99, 1)'
          }}>
            <h3 style={{
              color: 'white',
              'font-weight': '600',
              margin: 0,
              display: 'flex',
              'align-items': 'center',
              gap: '8px'
            }}>
              <span>🎨</span>
              <span>Active Participants ({participants().size + 1})</span>
            </h3>
          </div>
          <div style={{
            padding: '16px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            'overflow-y': 'auto',
            'max-height': '320px'
          }}>
            {/* Current User */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              'border-radius': '8px',
              padding: '12px',
              color: 'white',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between'
            }}>
              <span>You</span>
              {props.wsManager?.userHash === props.activity?.ownerId && (
                <span style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: 'rgba(134, 239, 172, 1)',
                  padding: '2px 12px',
                  'border-radius': '9999px',
                  'font-size': '12px',
                  'font-weight': '500'
                }}>
                  Owner
                </span>
              )}
            </div>
            {/* Other Participants */}
            {Array.from(participants()).map(([id, participant]) => (
              <div style={{
                background: 'rgba(55, 65, 81, 0.5)',
                'border-radius': '8px',
                padding: '12px',
                color: 'white'
              }}>
                {participant.username}
              </div>
            ))}
          </div>
        </div>
      </Show>

      {/* Mobile Contribution Requests Modal */}
      <Show when={showMobileRequests() && isMobile}>
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          'z-index': 300,
          display: 'flex',
          'align-items': 'flex-end'
        }}>
          <div style={{
            width: '100%',
            background: 'white',
            'border-radius': '20px 20px 0 0',
            padding: '20px',
            'max-height': '70vh',
            'overflow-y': 'auto',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{
              display: 'flex',
              'justify-content': 'space-between',
              'align-items': 'center',
              'margin-bottom': '20px'
            }}>
              <h3 style={{
                margin: 0,
                'font-size': '18px',
                'font-weight': '600'
              }}>
                📋 Contribution Requests ({contributionRequests().length})
              </h3>
              <button
                onClick={() => setShowMobileRequests(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  'font-size': '24px',
                  cursor: 'pointer',
                  padding: '5px'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
              {contributionRequests().map(request => (
                <div style={{
                  background: '#f3f4f6',
                  'border-radius': '12px',
                  padding: '16px',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between'
                }}>
                  <div>
                    <div style={{
                      'font-weight': '500',
                      'font-size': '16px',
                      'margin-bottom': '4px'
                    }}>
                      User {request.clientId?.slice(-4) || 'Unknown'}
                    </div>
                    <div style={{
                      'font-size': '14px',
                      color: '#6b7280'
                    }}>
                      Wants to contribute to this canvas
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        props.wsManager.send({
                          type: 'approveContributor',
                          activityId: props.activity.id,
                          userHash: request.userHash
                        });
                        setContributionRequests(prev =>
                          prev.filter(r => r.userHash !== request.userHash)
                        );
                        if (contributionRequests().length === 1) {
                          setShowMobileRequests(false);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#10B981',
                        color: 'white',
                        'border-radius': '8px',
                        'font-size': '15px',
                        'font-weight': '500',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => {
                        setContributionRequests(prev =>
                          prev.filter(r => r.userHash !== request.userHash)
                        );
                        if (contributionRequests().length === 1) {
                          setShowMobileRequests(false);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#EF4444',
                        color: 'white',
                        'border-radius': '8px',
                        'font-size': '15px',
                        'font-weight': '500',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      ✗ Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Show>

        {/* CSS Animations */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes modalSlideIn {
            from {
              opacity: 0;
              transform: ${isMobile ? 'translateY(100%)' : 'scale(0.95) translateY(20px)'};
            }
            to {
              opacity: 1;
              transform: ${isMobile ? 'translateY(0)' : 'scale(1) translateY(0)'};
            }
          }

          @keyframes slideUp {
            from {
              transform: ${isMobile ? 'translateY(100%)' : 'translateY(20px) translateX(-50%)'};
              opacity: ${isMobile ? 1 : 0};
            }
            to {
              transform: ${isMobile ? 'translateY(0)' : 'translateY(0) translateX(-50%)'};
              opacity: 1;
            }
          }

          @keyframes slideDown {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }

          @keyframes slideIn {
            from {
              transform: translateX(-10px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }

          @keyframes pulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            }
            50% {
              box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
            }
          }
        `}</style>
        </div>
      </div>
    </div>
  );
}