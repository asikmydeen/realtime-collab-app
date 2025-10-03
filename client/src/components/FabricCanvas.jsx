import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import * as fabric from 'fabric';
import { DrawingToolbar } from './DrawingToolbar';
import { LayerPanel } from './LayerPanel';
import { ActivityControls } from './ActivityControls';

export function FabricCanvas(props) {
  let canvasContainerRef;
  let canvasElement;

  // Canvas state
  const [canvas, setCanvas] = createSignal(null);
  const [canvasReady, setCanvasReady] = createSignal(false);
  const [canContribute, setCanContribute] = createSignal(false);
  const [requestSent, setRequestSent] = createSignal(false);
  const [contributionRequests, setContributionRequests] = createSignal([]);
  const [showParticipants, setShowParticipants] = createSignal(false);
  const [showMobileRequests, setShowMobileRequests] = createSignal(false);
  const [participants, setParticipants] = createSignal(new Map());
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedObjects, setSelectedObjects] = createSignal([]);
  const [showLayers, setShowLayers] = createSignal(false);

  // Drawing tool state
  const [activeTool, setActiveTool] = createSignal('select');
  const [brushColor, setBrushColor] = createSignal('#000000');
  const [brushSize, setBrushSize] = createSignal(5);
  const [brushOpacity, setBrushOpacity] = createSignal(1);
  const [fillColor, setFillColor] = createSignal('transparent');
  const [strokeWidth, setStrokeWidth] = createSignal(2);

  // Drawing state
  let isDrawing = false;
  let currentShape = null;
  let startPoint = null;

  // Remote cursors
  const [remoteCursors, setRemoteCursors] = createSignal(new Map());

  // Throttle for sending updates
  const updateThrottle = {
    lastSendTime: 0,
    throttleMs: 50,
    pendingUpdate: null,
    timeoutId: null
  };

  onMount(() => {
    initializeCanvas();
    setupEventListeners();

    onCleanup(() => {
      if (canvas()) {
        canvas().dispose();
      }
      if (updateThrottle.timeoutId) {
        clearTimeout(updateThrottle.timeoutId);
      }
    });
  });

  function initializeCanvas() {
    const fabricCanvas = new fabric.Canvas(canvasElement, {
      width: canvasContainerRef.clientWidth,
      height: canvasContainerRef.clientHeight,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      enableRetinaScaling: true,
      allowTouchScrolling: false,
      stopContextMenu: true
    });

    // Initialize free drawing brush
    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
    fabricCanvas.freeDrawingBrush.color = brushColor();
    fabricCanvas.freeDrawingBrush.width = brushSize();

    setCanvas(fabricCanvas);
    setCanvasReady(true);

    // Handle window resize
    const handleResize = () => {
      fabricCanvas.setDimensions({
        width: canvasContainerRef.clientWidth,
        height: canvasContainerRef.clientHeight
      });
      fabricCanvas.renderAll();
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvasContainerRef);

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    });
  }

  function setupEventListeners() {
    createEffect(() => {
      const fabricCanvas = canvas();
      if (!fabricCanvas) return;

      // Mouse down
      fabricCanvas.on('mouse:down', handleMouseDown);

      // Mouse move
      fabricCanvas.on('mouse:move', handleMouseMove);

      // Mouse up
      fabricCanvas.on('mouse:up', handleMouseUp);

      // Object modified
      fabricCanvas.on('object:modified', handleObjectModified);

      // Object added
      fabricCanvas.on('object:added', handleObjectAdded);

      // Object removed
      fabricCanvas.on('object:removed', handleObjectRemoved);

      // Path created (for free drawing with pen/eraser)
      fabricCanvas.on('path:created', handlePathCreated);

      // Selection
      fabricCanvas.on('selection:created', handleSelectionCreated);
      fabricCanvas.on('selection:updated', handleSelectionUpdated);
      fabricCanvas.on('selection:cleared', handleSelectionCleared);
    });

    // Update brush settings when they change
    createEffect(() => {
      const fabricCanvas = canvas();
      if (!fabricCanvas || !fabricCanvas.freeDrawingBrush) return;

      const tool = activeTool();
      if (tool === 'pen') {
        fabricCanvas.freeDrawingBrush.color = brushColor();
        fabricCanvas.freeDrawingBrush.width = brushSize();
      } else if (tool === 'eraser') {
        fabricCanvas.freeDrawingBrush.color = '#ffffff';
        fabricCanvas.freeDrawingBrush.width = brushSize() * 2;
      }
    });
  }

  function handleMouseDown(e) {
    if (!canContribute()) return;

    const tool = activeTool();

    // Don't handle drawing for select tool - let Fabric.js handle selection
    if (tool === 'select') return;

    const pointer = canvas().getPointer(e.e);
    isDrawing = true;
    startPoint = pointer;

    switch (tool) {
      case 'pen':
        canvas().isDrawingMode = true;
        if (canvas().freeDrawingBrush) {
          canvas().freeDrawingBrush.color = brushColor();
          canvas().freeDrawingBrush.width = brushSize();
        }
        break;

      case 'line':
        currentShape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: brushColor(),
          strokeWidth: strokeWidth(),
          selectable: true,
          objectType: 'line',
          userId: props.wsManager?.userHash,
          userName: props.wsManager?.userName || 'Anonymous'
        });
        canvas().add(currentShape);
        break;

      case 'rectangle':
        currentShape = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: fillColor(),
          stroke: brushColor(),
          strokeWidth: strokeWidth(),
          selectable: true,
          objectType: 'rectangle',
          userId: props.wsManager?.userHash,
          userName: props.wsManager?.userName || 'Anonymous'
        });
        canvas().add(currentShape);
        break;

      case 'circle':
        currentShape = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 0,
          fill: fillColor(),
          stroke: brushColor(),
          strokeWidth: strokeWidth(),
          selectable: true,
          objectType: 'circle',
          userId: props.wsManager?.userHash,
          userName: props.wsManager?.userName || 'Anonymous'
        });
        canvas().add(currentShape);
        break;

      case 'triangle':
        currentShape = new fabric.Triangle({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: fillColor(),
          stroke: brushColor(),
          strokeWidth: strokeWidth(),
          selectable: true,
          objectType: 'triangle',
          userId: props.wsManager?.userHash,
          userName: props.wsManager?.userName || 'Anonymous'
        });
        canvas().add(currentShape);
        break;

      case 'text':
        const text = new fabric.IText('Type here...', {
          left: pointer.x,
          top: pointer.y,
          fill: brushColor(),
          fontSize: brushSize() * 4,
          selectable: true,
          objectType: 'text',
          userId: props.wsManager?.userHash,
          userName: props.wsManager?.userName || 'Anonymous'
        });
        canvas().add(text);
        canvas().setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        break;

      case 'eraser':
        // Eraser mode - draw in white to simulate erasing
        canvas().isDrawingMode = true;
        if (canvas().freeDrawingBrush) {
          canvas().freeDrawingBrush.color = '#ffffff';
          canvas().freeDrawingBrush.width = brushSize() * 2;
        }
        break;
    }
  }

  function handleMouseMove(e) {
    if (!isDrawing || !currentShape || !canContribute()) return;

    const pointer = canvas().getPointer(e.e);
    const tool = activeTool();

    switch (tool) {
      case 'line':
        currentShape.set({ x2: pointer.x, y2: pointer.y });
        break;

      case 'rectangle':
        const width = pointer.x - startPoint.x;
        const height = pointer.y - startPoint.y;
        currentShape.set({
          width: Math.abs(width),
          height: Math.abs(height),
          left: width > 0 ? startPoint.x : pointer.x,
          top: height > 0 ? startPoint.y : pointer.y
        });
        break;

      case 'circle':
        const radius = Math.sqrt(
          Math.pow(pointer.x - startPoint.x, 2) +
          Math.pow(pointer.y - startPoint.y, 2)
        ) / 2;
        currentShape.set({ radius });
        break;

      case 'triangle':
        const triWidth = pointer.x - startPoint.x;
        const triHeight = pointer.y - startPoint.y;
        currentShape.set({
          width: Math.abs(triWidth),
          height: Math.abs(triHeight),
          left: triWidth > 0 ? startPoint.x : pointer.x,
          top: triHeight > 0 ? startPoint.y : pointer.y
        });
        break;
    }

    canvas().renderAll();

    // Send cursor position
    sendCursorPosition(pointer);
  }

  function handleMouseUp() {
    isDrawing = false;
    canvas().isDrawingMode = false;

    if (currentShape) {
      // Send the completed object
      sendObjectAdded(currentShape);
      currentShape = null;
    }

    startPoint = null;
  }

  function handleObjectModified(e) {
    if (!canContribute()) return;
    sendObjectModified(e.target);
  }

  function handleObjectAdded(e) {
    // Only send if it's a user action, not a remote sync
    if (e.target && !e.target.isRemote) {
      sendObjectAdded(e.target);
    }
  }

  function handleObjectRemoved(e) {
    if (e.target && !e.target.isRemote) {
      sendObjectRemoved(e.target);
    }
  }

  function handleSelectionCreated(e) {
    setSelectedObjects(e.selected || []);
  }

  function handleSelectionUpdated(e) {
    setSelectedObjects(e.selected || []);
  }

  function handleSelectionCleared() {
    setSelectedObjects([]);
  }

  function handlePathCreated(e) {
    if (!canContribute()) {
      console.log('[FabricCanvas] Cannot contribute, skipping path creation');
      return;
    }

    const path = e.path;
    if (path) {
      console.log('[FabricCanvas] Path created:', path);
      // Add metadata to the path
      path.set({
        id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        objectType: activeTool() === 'eraser' ? 'eraser' : 'pen',
        userId: props.wsManager?.userHash,
        userName: props.wsManager?.userName || 'Anonymous'
      });

      // The path is already added to canvas by Fabric.js
      // Just send it to other users
      sendObjectAdded(path);
    }
  }

  // WebSocket message handlers
  function sendObjectAdded(obj) {
    if (!props.wsManager || !props.activity) {
      console.log('[FabricCanvas] Cannot send object - wsManager or activity missing');
      return;
    }

    console.log('[FabricCanvas] Sending object added:', obj.type, obj.id);
    const serialized = serializeObject(obj);
    sendThrottledUpdate({
      type: 'fabricObjectAdded',
      activityId: props.activity.id,
      object: serialized,
      userHash: props.wsManager.userHash,
      userName: props.wsManager.userName || 'Anonymous'
    });
  }

  function sendObjectModified(obj) {
    if (!props.wsManager || !props.activity) return;

    const serialized = serializeObject(obj);
    sendThrottledUpdate({
      type: 'fabricObjectModified',
      activityId: props.activity.id,
      objectId: obj.id,
      object: serialized,
      userHash: props.wsManager.userHash
    });
  }

  function sendObjectRemoved(obj) {
    if (!props.wsManager || !props.activity) return;

    props.wsManager.send({
      type: 'fabricObjectRemoved',
      activityId: props.activity.id,
      objectId: obj.id,
      userHash: props.wsManager.userHash
    });
  }

  function sendCursorPosition(pointer) {
    if (!props.wsManager || !props.activity) return;

    sendThrottledUpdate({
      type: 'fabricCursor',
      activityId: props.activity.id,
      x: pointer.x,
      y: pointer.y,
      userHash: props.wsManager.userHash,
      userName: props.wsManager.userName || 'Anonymous',
      color: brushColor()
    });
  }

  function sendThrottledUpdate(data) {
    const now = Date.now();

    updateThrottle.pendingUpdate = data;

    if (now - updateThrottle.lastSendTime >= updateThrottle.throttleMs) {
      props.wsManager.send(data);
      updateThrottle.pendingUpdate = null;
      updateThrottle.lastSendTime = now;

      if (updateThrottle.timeoutId) {
        clearTimeout(updateThrottle.timeoutId);
        updateThrottle.timeoutId = null;
      }
    } else if (!updateThrottle.timeoutId) {
      const remainingTime = updateThrottle.throttleMs - (now - updateThrottle.lastSendTime);
      updateThrottle.timeoutId = setTimeout(() => {
        if (updateThrottle.pendingUpdate) {
          props.wsManager.send(updateThrottle.pendingUpdate);
          updateThrottle.pendingUpdate = null;
        }
        updateThrottle.lastSendTime = Date.now();
        updateThrottle.timeoutId = null;
      }, remainingTime);
    }
  }

  function serializeObject(obj) {
    if (!obj) return null;

    // Generate unique ID if not exists
    if (!obj.id) {
      obj.id = `${props.wsManager?.clientId}_${Date.now()}_${Math.random()}`;
    }

    return {
      id: obj.id,
      type: obj.type,
      objectType: obj.objectType,
      left: obj.left,
      top: obj.top,
      width: obj.width,
      height: obj.height,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      radius: obj.radius,
      x1: obj.x1,
      y1: obj.y1,
      x2: obj.x2,
      y2: obj.y2,
      text: obj.text,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      fontStyle: obj.fontStyle,
      textAlign: obj.textAlign,
      path: obj.path,
      userId: obj.userId || props.wsManager?.userHash,
      userName: obj.userName || props.wsManager?.userName || 'Anonymous'
    };
  }

  function deserializeObject(data) {
    let obj = null;

    switch (data.type) {
      case 'rect':
        obj = new fabric.Rect(data);
        break;
      case 'circle':
        obj = new fabric.Circle(data);
        break;
      case 'triangle':
        obj = new fabric.Triangle(data);
        break;
      case 'line':
        obj = new fabric.Line([data.x1, data.y1, data.x2, data.y2], data);
        break;
      case 'i-text':
      case 'text':
        obj = new fabric.IText(data.text || '', data);
        break;
      case 'path':
        obj = new fabric.Path(data.path, data);
        break;
      default:
        console.warn('[FabricCanvas] Unknown object type:', data.type);
        return null;
    }

    if (obj) {
      obj.id = data.id;
      obj.objectType = data.objectType;
      obj.userId = data.userId;
      obj.userName = data.userName;
      obj.isRemote = true;
      obj.selectable = canContribute();
    }

    return obj;
  }

  // Handle remote updates
  function handleRemoteObjectAdded(data) {
    console.log('[FabricCanvas] Received remote object:', data);
    const obj = deserializeObject(data.object);
    if (obj && canvas()) {
      obj.isRemote = true; // Mark as remote to prevent re-sending
      canvas().add(obj);
      canvas().renderAll();
      console.log('[FabricCanvas] Added remote object to canvas');
    }
  }

  function handleRemoteObjectModified(data) {
    if (!canvas()) return;

    const obj = canvas().getObjects().find(o => o.id === data.objectId);
    if (obj) {
      obj.set(data.object);
      obj.setCoords();
      canvas().renderAll();
    }
  }

  function handleRemoteObjectRemoved(data) {
    if (!canvas()) return;

    const obj = canvas().getObjects().find(o => o.id === data.objectId);
    if (obj) {
      canvas().remove(obj);
      canvas().renderAll();
    }
  }

  function handleRemoteCursor(data) {
    setRemoteCursors(prev => {
      const next = new Map(prev);
      next.set(data.userHash, {
        x: data.x,
        y: data.y,
        userName: data.userName,
        color: data.color,
        timestamp: Date.now()
      });
      return next;
    });

    // Remove stale cursors after 3 seconds
    setTimeout(() => {
      setRemoteCursors(prev => {
        const next = new Map(prev);
        const cursor = next.get(data.userHash);
        if (cursor && Date.now() - cursor.timestamp > 2500) {
          next.delete(data.userHash);
        }
        return next;
      });
    }, 3000);
  }

  // Load canvas data
  function loadCanvasData(canvasData) {
    if (!canvas() || !canvasData) return;

    canvas().clear();

    if (canvasData.objects && Array.isArray(canvasData.objects)) {
      canvasData.objects.forEach(objData => {
        const obj = deserializeObject(objData);
        if (obj) {
          canvas().add(obj);
        }
      });
    }

    canvas().renderAll();
  }

  // Export canvas data
  function exportCanvasData() {
    if (!canvas()) return null;

    const objects = canvas().getObjects().map(obj => serializeObject(obj));
    return { objects };
  }

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
      setCanContribute(true);
      return;
    }

    // Check if user is approved contributor
    const isApproved = activity.permissions?.approvedContributors?.includes(userHash);
    const isAllowed = activity.permissions?.allowContributions;
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

  // WebSocket event handlers
  createEffect(() => {
    if (!props.wsManager) return;

    const cleanup1 = props.wsManager.on('activityJoined', (data) => {
      console.log('[FabricCanvas] Activity joined, loading canvas data');
      if (data.canvasData) {
        loadCanvasData(data.canvasData);
      }
      setCanvasReady(true);

      if (data.activity) {
        const userHash = props.wsManager?.userHash;
        const isOwner = data.activity.ownerId === userHash;
        const isApproved = data.activity.permissions?.approvedContributors?.includes(userHash);
        const isAllowed = data.activity.permissions?.allowContributions;
        setCanContribute(isOwner || isApproved || isAllowed);

        if (props.wsManager?.userHash === data.activity.ownerId) {
          const requests = data.activity.permissions?.contributorRequests || [];
          setContributionRequests(requests);
        }
      }
    });

    const cleanup2 = props.wsManager.on('fabricObjectAdded', (data) => {
      if (data.userHash !== props.wsManager?.userHash) {
        handleRemoteObjectAdded(data);
      }
    });

    const cleanup3 = props.wsManager.on('fabricObjectModified', (data) => {
      if (data.userHash !== props.wsManager?.userHash) {
        handleRemoteObjectModified(data);
      }
    });

    const cleanup4 = props.wsManager.on('fabricObjectRemoved', (data) => {
      if (data.userHash !== props.wsManager?.userHash) {
        handleRemoteObjectRemoved(data);
      }
    });

    const cleanup5 = props.wsManager.on('fabricCursor', (data) => {
      if (data.userHash !== props.wsManager?.userHash) {
        handleRemoteCursor(data);
      }
    });

    const cleanup6 = props.wsManager.on('participantJoined', (data) => {
      setParticipants(prev => {
        const next = new Map(prev);
        next.set(data.clientId, { username: data.username });
        return next;
      });
    });

    const cleanup7 = props.wsManager.on('participantLeft', (data) => {
      setParticipants(prev => {
        const next = new Map(prev);
        next.delete(data.clientId);
        return next;
      });
    });

    const cleanup8 = props.wsManager.on('contributionStatus', (data) => {
      if (data.status === 'approved') {
        setCanContribute(true);
        setRequestSent(false);
        alert('Your contribution request has been approved! You can now draw.');

        if (props.activity) {
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

    const cleanup9 = props.wsManager.on('contributionRequest', (data) => {
      if (data.activityId === props.activity?.id && props.wsManager?.userHash === props.activity?.ownerId) {
        setContributionRequests(prev => [...prev, data.requester]);
      }
    });

    const cleanup10 = props.wsManager.on('contributorApproved', (data) => {
      if (data.activityId === props.activity?.id) {
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
    });
  });

  // Tool handlers
  function handleToolChange(tool) {
    setActiveTool(tool);

    if (canvas()) {
      // Enable drawing mode for pen and eraser
      if (tool === 'pen' || tool === 'eraser') {
        canvas().isDrawingMode = true;
        if (canvas().freeDrawingBrush) {
          if (tool === 'pen') {
            canvas().freeDrawingBrush.color = brushColor();
            canvas().freeDrawingBrush.width = brushSize();
          } else if (tool === 'eraser') {
            canvas().freeDrawingBrush.color = '#ffffff';
            canvas().freeDrawingBrush.width = brushSize() * 2;
          }
        }
      } else {
        canvas().isDrawingMode = false;
      }

      canvas().selection = tool === 'select';

      // Deselect all objects when changing tools
      canvas().discardActiveObject();
      canvas().renderAll();
    }
  }

  function handleDelete() {
    if (!canvas() || !canContribute()) return;

    const activeObjects = canvas().getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach(obj => {
        canvas().remove(obj);
        sendObjectRemoved(obj);
      });
      canvas().discardActiveObject();
      canvas().renderAll();
    }
  }

  function handleClear() {
    if (!canvas() || !canContribute()) return;

    if (confirm('Are you sure you want to clear the entire canvas?')) {
      const objects = canvas().getObjects();
      objects.forEach(obj => {
        sendObjectRemoved(obj);
      });
      canvas().clear();
      canvas().backgroundColor = '#ffffff';
      canvas().renderAll();
    }
  }

  function handleUndo() {
    // TODO: Implement undo/redo stack
    console.log('Undo not yet implemented');
  }

  function handleRedo() {
    // TODO: Implement undo/redo stack
    console.log('Redo not yet implemented');
  }

  function handleBringForward() {
    if (!canvas()) return;
    const activeObject = canvas().getActiveObject();
    if (activeObject) {
      canvas().bringForward(activeObject);
      canvas().renderAll();
      sendObjectModified(activeObject);
    }
  }

  function handleSendBackward() {
    if (!canvas()) return;
    const activeObject = canvas().getActiveObject();
    if (activeObject) {
      canvas().sendBackwards(activeObject);
      canvas().renderAll();
      sendObjectModified(activeObject);
    }
  }

  // Check if mobile device
  const isMobile = window.innerWidth <= 768;

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.95)',
      'backdrop-filter': 'blur(4px)',
      'z-index': 50,
      display: 'flex',
      'flex-direction': 'column'
    },
    header: {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      padding: isMobile ? '12px 16px' : '16px 24px',
      background: 'rgba(31, 41, 55, 0.5)',
      'backdrop-filter': 'blur(10px)',
      'border-bottom': '1px solid rgba(75, 85, 99, 1)',
      'flex-shrink': 0
    },
    mainContent: {
      flex: 1,
      display: 'flex',
      padding: isMobile ? '8px' : '16px 24px',
      gap: isMobile ? '8px' : '16px',
      'min-height': 0,
      'overflow': 'hidden'
    },
    canvasContainer: {
      flex: 1,
      background: 'white',
      'border-radius': isMobile ? '8px' : '12px',
      'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      position: 'relative'
    },
    closeButton: {
      padding: '10px',
      'border-radius': '50%',
      background: 'rgba(55, 65, 81, 0.5)',
      color: 'rgba(209, 213, 219, 1)',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }
  };

  return (
    <div style={styles.container}>
      {/* Header Bar */}
      <div style={styles.header}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
          <div>
            <h2 style={{
              margin: 0,
              'font-size': isMobile ? '16px' : '20px',
              'font-weight': '600',
              color: 'white'
            }}>
              {props.activity.title}
            </h2>
            <p style={{
              margin: '4px 0 0 0',
              'font-size': isMobile ? '12px' : '14px',
              color: 'rgba(156, 163, 175, 1)',
              display: isMobile ? 'none' : 'flex',
              'align-items': 'center',
              gap: '8px'
            }}>
              <span>📍</span>
              <span>{props.activity.street}</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', 'align-items': 'center', gap: isMobile ? '8px' : '12px' }}>
          {/* Participants Button */}
          <button
            onClick={() => setShowParticipants(!showParticipants())}
            style={{
              padding: '10px',
              'border-radius': '50%',
              background: showParticipants() ? 'rgba(59, 130, 246, 0.8)' : 'rgba(55, 65, 81, 0.5)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            👥
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#3B82F6',
              color: 'white',
              'font-size': '12px',
              'border-radius': '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-weight': 'bold'
            }}>
              {participants().size + 1}
            </span>
          </button>

          {/* Close Button */}
          <button
            onClick={props.onClose}
            style={{
              ...styles.closeButton,
              padding: isMobile ? '12px' : '10px',
              background: isMobile ? 'rgba(239, 68, 68, 0.8)' : 'rgba(55, 65, 81, 0.5)'
            }}
          >
            <svg style={{ width: isMobile ? '24px' : '20px', height: isMobile ? '24px' : '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Canvas Container */}
        <div ref={canvasContainerRef} style={styles.canvasContainer}>
          <canvas ref={canvasElement} />

          {/* Remote Cursors */}
          {Array.from(remoteCursors()).map(([userHash, cursor]) => (
            <div style={{
              position: 'absolute',
              left: `${cursor.x}px`,
              top: `${cursor.y}px`,
              'pointer-events': 'none',
              'z-index': 1000,
              transform: 'translate(-50%, -50%)'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={cursor.color}>
                <path d="M5 3l14 9-6 1-3 5-5-15z"/>
              </svg>
              <div style={{
                background: cursor.color,
                color: 'white',
                padding: '2px 6px',
                'border-radius': '4px',
                'font-size': '12px',
                'white-space': 'nowrap',
                'margin-top': '4px'
              }}>
                {cursor.userName}
              </div>
            </div>
          ))}

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
              'z-index': 100
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
                      cursor: 'pointer'
                    }}
                  >
                    Request to Contribute
                  </button>
                )}
              </div>
            </div>
          </Show>
        </div>

        {/* Drawing Toolbar */}
        <Show when={canContribute()}>
          <DrawingToolbar
            activeTool={activeTool()}
            onToolChange={handleToolChange}
            brushColor={brushColor()}
            onBrushColorChange={setBrushColor}
            brushSize={brushSize()}
            onBrushSizeChange={setBrushSize}
            brushOpacity={brushOpacity()}
            onBrushOpacityChange={setBrushOpacity}
            fillColor={fillColor()}
            onFillColorChange={setFillColor}
            strokeWidth={strokeWidth()}
            onStrokeWidthChange={setStrokeWidth}
            onDelete={handleDelete}
            onClear={handleClear}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onBringForward={handleBringForward}
            onSendBackward={handleSendBackward}
            onToggleLayers={() => setShowLayers(!showLayers())}
            isMobile={isMobile}
          />
        </Show>

        {/* Layer Panel */}
        <Show when={showLayers() && canvas()}>
          <LayerPanel
            canvas={canvas()}
            onClose={() => setShowLayers(false)}
            isMobile={isMobile}
          />
        </Show>

        {/* Owner Controls */}
        <Show when={props.wsManager?.userHash === props.activity?.ownerId}>
          <ActivityControls
            activity={props.activity}
            wsManager={props.wsManager}
            selectMode={selectMode()}
            selectedPaths={new Set()}
            onToggleSelectMode={() => setSelectMode(!selectMode())}
            onRemoveSelected={() => {}}
          />
        </Show>

        {/* Contribution Requests Panel */}
        <Show when={!isMobile && props.wsManager?.userHash === props.activity?.ownerId && contributionRequests().length > 0}>
          <div style={{
            width: '320px',
            background: 'rgba(31, 41, 55, 0.5)',
            'backdrop-filter': 'blur(10px)',
            'border-radius': '12px',
            padding: '16px'
          }}>
            <h4 style={{
              color: 'white',
              'font-weight': '600',
              margin: '0 0 16px 0'
            }}>
              📋 Contribution Requests ({contributionRequests().length})
            </h4>
            <div style={{
              display: 'flex',
              'flex-direction': 'column',
              gap: '8px',
              'max-height': '240px',
              'overflow-y': 'auto'
            }}>
              {contributionRequests().map(request => (
                <div style={{
                  background: 'rgba(55, 65, 81, 0.5)',
                  'border-radius': '8px',
                  padding: '12px',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between'
                }}>
                  <span style={{ color: 'white', 'font-size': '14px' }}>
                    User {request.clientId?.slice(-4) || 'Unknown'}
                  </span>
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
                      }}
                      style={{
                        padding: '4px 12px',
                        background: '#10B981',
                        color: 'white',
                        'border-radius': '4px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setContributionRequests(prev =>
                          prev.filter(r => r.userHash !== request.userHash)
                        );
                      }}
                      style={{
                        padding: '4px 12px',
                        background: '#EF4444',
                        color: 'white',
                        'border-radius': '4px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
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
          'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          'z-index': 100
        }}>
          <div style={{
            padding: '16px',
            'border-bottom': '1px solid rgba(75, 85, 99, 1)'
          }}>
            <h3 style={{
              color: 'white',
              'font-weight': '600',
              margin: 0
            }}>
              🎨 Active Participants ({participants().size + 1})
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
              color: 'white'
            }}>
              <span>You</span>
              {props.wsManager?.userHash === props.activity?.ownerId && (
                <span style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: 'rgba(134, 239, 172, 1)',
                  padding: '2px 12px',
                  'border-radius': '9999px',
                  'font-size': '12px',
                  'margin-left': '8px'
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
    </div>
  );
}
