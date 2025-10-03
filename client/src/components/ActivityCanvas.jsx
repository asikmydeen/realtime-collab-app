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
  
  // Mouse handlers
  function handleMouseDown(e) {
    if (e.button === 0) {
      if (selectMode()) {
        // In select mode, find the clicked path
        const rect = canvasRef.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
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
        
        const rect = canvasRef.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Start new path
        const newPath = {
          color: props.color || '#000000',
          size: props.brushSize || 3,
          points: [{ x, y }],
          pathId: `${props.wsManager?.clientId}_${Date.now()}`,
          clientId: props.wsManager?.clientId,
          userHash: props.wsManager?.userHash
        };
        
        setPaths(prev => [...prev, newPath]);
        
        // Send draw start
        sendThrottledDraw({
          drawType: 'start',
          x,
          y,
          color: props.color || '#000000',
          size: props.brushSize || 3
        });
      }
    }
  }
  
  function handleMouseMove(e) {
    if (selectMode() && !isDrawing()) {
      // Only owners can hover/select in review mode
      const isOwner = props.wsManager?.userHash === props.activity?.ownerId;
      if (!isOwner) return;
      
      // In select mode, track which path is under the mouse
      const rect = canvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
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
      const rect = canvasRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Add point to current path
      setPaths(prev => {
        const newPaths = [...prev];
        if (newPaths.length > 0) {
          const currentPath = newPaths[newPaths.length - 1];
          currentPath.points.push({ x, y });
        }
        return newPaths;
      });
      
      // Send draw update
      sendThrottledDraw({
        drawType: 'draw',
        x,
        y
      });
      
      renderCanvas();
    }
  }
  
  function handleMouseUp() {
    if (isDrawing()) {
      sendThrottledDraw({ drawType: 'end' });
    }
    setIsDrawing(false);
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
      console.log('[ActivityCanvas] Sending draw for activity:', props.activity.id);
      props.wsManager.send({
        type: 'activityDraw',
        activityId: props.activity.id, // Ensure activity ID is included
        ...data
      });
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
            setPaths(paths => [...paths, { ...finishedPath }]);
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
        
        // If we have activity data with permissions, update contribution requests
        if (data.activity && props.wsManager?.userHash === data.activity.ownerId) {
          const requests = data.activity.permissions?.contributorRequests || [];
          console.log('[ActivityCanvas] Loading contribution requests:', requests.length);
          setContributionRequests(requests);
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
          updateContributeStatus();
          // Show success message
          alert('Your contribution request has been approved!');
        } else if (data.status === 'requested') {
          alert('Your contribution request has been sent to the owner.');
        } else if (data.status === 'already_approved') {
          updateContributeStatus();
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
  
  return (
    <div class="fixed inset-0 bg-gray-900/95 backdrop-blur-sm z-50 flex flex-col animate-fade-in">
      {/* Header Bar */}
      <div class="flex items-center justify-between p-4 md:p-6 bg-gray-800/50 backdrop-blur border-b border-gray-700">
        <div class="flex items-center space-x-4">
          <div class="animate-slide-down">
            <h2 class="text-lg md:text-xl font-semibold text-white">{props.activity.title}</h2>
            <p class="text-sm text-gray-300 flex items-center gap-2">
              <span>📍</span>
              <span>{props.activity.street}</span>
            </p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          {/* Participants Button */}
          <button
            onClick={() => setShowParticipants(!showParticipants())}
            class="relative p-2.5 rounded-full bg-gray-700/50 hover:bg-gray-700 transition-colors duration-200 animate-scale-in"
          >
            <span class="text-xl">👥</span>
            <span class="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
              {participants().size + 1}
            </span>
          </button>
          
          {/* Close Button */}
          <button
            onClick={props.onClose}
            class="p-2.5 rounded-full bg-gray-700/50 hover:bg-red-500/20 hover:text-red-400 transition-all duration-200 text-gray-300 animate-scale-in"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div class="flex-1 flex p-4 md:p-6 gap-4 min-h-0">
        {/* Canvas Container */}
        <div ref={containerRef} class="flex-1 bg-white rounded-lg shadow-2xl overflow-hidden relative animate-scale-in">
          <canvas
            ref={drawingCanvasRef}
            class="absolute inset-0 pointer-events-none"
            style={{ display: 'none' }}
          />
          <canvas
            ref={canvasRef}
            class="absolute inset-0 w-full h-full"
            style={{
              cursor: selectMode() ? 'pointer' : (canContribute() ? 'crosshair' : 'not-allowed')
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          
          {/* Canvas Overlays */}
          {/* Contribution Request UI */}
          <Show when={!canContribute() && props.wsManager?.userHash !== props.activity?.ownerId}>
            <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800/90 backdrop-blur rounded-full px-6 py-3 animate-slide-up">
              <div class="text-white text-center">
                <div class="mb-3 flex items-center gap-2">
                  <span>🔒</span>
                  <span>This canvas is view-only</span>
                </div>
                {requestSent() ? (
                  <div class="bg-green-500/20 text-green-300 px-4 py-2 rounded-full text-sm font-medium">
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
                    class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  >
                    Request to Contribute
                  </button>
                )}
              </div>
            </div>
          </Show>
          
          {/* Drawing Author Overlay */}
          <Show when={selectMode() && hoveredPath() && props.wsManager?.userHash === props.activity?.ownerId}>
            <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800/90 backdrop-blur rounded-lg px-6 py-3 animate-slide-up">
              <div class="flex items-center gap-4 text-white">
                <span>✏️ Contribution by:</span>
                <span class="font-semibold text-blue-300">
                  {hoveredPath().clientId ? `User ${hoveredPath().clientId.slice(-4)}` : 'Unknown'}
                </span>
                {selectedPaths().has(hoveredPath().pathId) ? (
                  <span class="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-sm font-medium">
                    ✓ Selected for removal
                  </span>
                ) : (
                  <span class="text-gray-400 text-sm">
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
        </div>
        
        {/* Contribution Requests Panel (Owners) */}
        <Show when={props.wsManager?.userHash === props.activity?.ownerId && contributionRequests().length > 0}>
          <div class="w-80 bg-gray-800/50 backdrop-blur rounded-lg p-4 animate-slide-down">
            <h4 class="text-white font-semibold mb-4 flex items-center gap-2">
              <span>📋</span>
              <span>Contribution Requests ({contributionRequests().length})</span>
            </h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              {contributionRequests().map(request => (
                <div class="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                  <span class="text-white text-sm">
                    User {request.clientId?.slice(-4) || 'Unknown'}
                  </span>
                  <div class="flex gap-2">
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
                      class="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setContributionRequests(prev =>
                          prev.filter(r => r.userHash !== request.userHash)
                        );
                      }}
                      class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Show>
      </div>
      
      {/* Participants Sidebar */}
      <Show when={showParticipants()}>
        <div class="fixed right-4 top-20 w-80 max-h-96 bg-gray-800/95 backdrop-blur rounded-lg shadow-2xl overflow-hidden animate-slide-down z-10">
          <div class="p-4 border-b border-gray-700">
            <h3 class="text-white font-semibold flex items-center gap-2">
              <span>🎨</span>
              <span>Active Participants ({participants().size + 1})</span>
            </h3>
          </div>
          <div class="p-4 space-y-2 overflow-y-auto max-h-80">
            {/* Current User */}
            <div class="bg-blue-500/20 border border-blue-500/40 rounded-lg p-3 text-white flex items-center justify-between">
              <span>You</span>
              {props.wsManager?.userHash === props.activity?.ownerId && (
                <span class="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-xs font-medium">
                  Owner
                </span>
              )}
            </div>
            {/* Other Participants */}
            {Array.from(participants()).map(([id, participant]) => (
              <div class="bg-gray-700/50 rounded-lg p-3 text-white">
                {participant.username}
              </div>
            ))}
          </div>
        </div>
      </Show>
    </div>
  );
}