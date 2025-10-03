# 🚀 Quick Start Guide - Fabric.js Canvas

## For Users

### Getting Started

1. **Open the App**: Navigate to your deployed URL or run locally
2. **Find a Location**: The map will show your current location
3. **Create or Join an Activity**: Click on a marker or create a new activity
4. **Start Drawing**: The canvas opens with a toolbar on the right

### Drawing Tools

Click any tool icon to activate it:

- **↖️ Select** (V) - Select and move objects
- **✏️ Pen** (P) - Freehand drawing
- **📏 Line** (L) - Draw straight lines
- **▭ Rectangle** (R) - Draw rectangles
- **⭕ Circle** (C) - Draw circles
- **△ Triangle** (T) - Draw triangles
- **📝 Text** (X) - Add text
- **🧹 Eraser** (E) - Erase drawings

### Customizing Your Drawing

**Colors:**
- Click any preset color or use the color picker
- Stroke color: Outline of shapes
- Fill color: Inside of shapes (rectangles, circles, triangles)

**Sizes:**
- Brush Size: 1-50px (for pen and eraser)
- Stroke Width: 1-20px (for shapes and lines)
- Opacity: 0-100%

### Managing Layers

Click the **📚 Layers** button to:
- View all objects on the canvas
- Show/hide specific layers (👁️)
- Lock/unlock layers (🔒)
- Duplicate layers (📋)
- Delete layers (🗑️)

### Keyboard Shortcuts

- `V` - Select tool
- `P` - Pen tool
- `L` - Line tool
- `R` - Rectangle tool
- `C` - Circle tool
- `T` - Triangle tool
- `X` - Text tool
- `E` - Eraser tool
- `Delete` - Delete selected object

### Collaboration

- **See Others**: Remote cursors show where other users are drawing
- **Real-Time Sync**: All drawings appear instantly for everyone
- **Request Access**: If you can't draw, click "Request to Contribute"

---

## For Developers

### Running Locally

```bash
# Terminal 1 - Start Server
cd server
npm install
npm start

# Terminal 2 - Start Client
cd client
npm install
npm run dev
```

### Environment Variables

**Client** (`client/.env`):
```env
VITE_WS_URL=ws://localhost:8080
```

**Server** (`server/.env`):
```env
REDIS_URL=redis://localhost:6379
PORT=8080
HOST=0.0.0.0
```

### Project Structure

```
client/src/components/
├── FabricCanvas.jsx       # Main canvas component
├── DrawingToolbar.jsx     # Tools and controls
├── LayerPanel.jsx         # Layer management
└── ActivityView.jsx       # Map and activity view

server/
└── server.js              # WebSocket handlers
```

### Key Components

**FabricCanvas.jsx**
- Initializes Fabric.js canvas
- Handles all drawing tools
- Manages WebSocket communication
- Serializes/deserializes objects

**DrawingToolbar.jsx**
- Tool selection UI
- Color pickers
- Size controls
- Action buttons

**LayerPanel.jsx**
- Layer list display
- Layer actions (show/hide, lock, duplicate, delete)
- Layer selection

### Adding a New Tool

1. **Add to toolbar** (`DrawingToolbar.jsx`):
```javascript
{ id: 'star', icon: '⭐', label: 'Star', shortcut: 'S' }
```

2. **Add handler** (`FabricCanvas.jsx`):
```javascript
case 'star':
  currentShape = new fabric.Polygon([
    // star points
  ], {
    fill: fillColor(),
    stroke: brushColor(),
    strokeWidth: strokeWidth()
  });
  canvas().add(currentShape);
  break;
```

3. **Add serialization** (if needed):
```javascript
// In serializeObject()
points: obj.points,

// In deserializeObject()
case 'polygon':
  obj = new fabric.Polygon(data.points, data);
  break;
```

### WebSocket Messages

**Send Object:**
```javascript
props.wsManager.send({
  type: 'fabricObjectAdded',
  activityId: props.activity.id,
  object: serializeObject(fabricObject),
  userHash: props.wsManager.userHash
});
```

**Receive Object:**
```javascript
props.wsManager.on('fabricObjectAdded', (data) => {
  const obj = deserializeObject(data.object);
  canvas().add(obj);
});
```

### Debugging

**Enable Fabric.js Logs:**
```javascript
fabric.Object.prototype.set({
  transparentCorners: false,
  borderColor: '#4299e1',
  cornerColor: '#4299e1'
});
```

**Check Canvas State:**
```javascript
console.log('Objects:', canvas().getObjects());
console.log('Active:', canvas().getActiveObject());
```

**Monitor WebSocket:**
```javascript
props.wsManager.on('*', (type, data) => {
  console.log('[WS]', type, data);
});
```

### Common Issues

**Objects not syncing?**
- Check WebSocket connection
- Verify user has contribution permission
- Check browser console for errors

**Canvas not rendering?**
- Ensure container has dimensions
- Check if Fabric.js loaded correctly
- Verify canvas initialization

**Tools not working?**
- Check if user can contribute
- Verify tool is properly activated
- Check for JavaScript errors

### Testing

```bash
# Run build
cd client
npm run build

# Check for errors
npm run lint

# Test WebSocket
# Open multiple browser windows and draw simultaneously
```

### Deployment

**Vercel (Client):**
```bash
cd client
vercel --prod
```

**Railway (Server):**
```bash
cd server
railway up
```

### Performance Tips

1. **Throttle Updates**: Already implemented (50ms)
2. **Limit Objects**: Consider pagination for 1000+ objects
3. **Optimize Serialization**: Only send changed properties
4. **Use Object Caching**: Fabric.js has built-in caching
5. **Lazy Load**: Load objects as needed for large canvases

### Useful Resources

- **Fabric.js Docs**: http://fabricjs.com/docs/
- **Fabric.js Demos**: http://fabricjs.com/demos/
- **SolidJS Guide**: https://www.solidjs.com/tutorial
- **WebSocket API**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

---

## Troubleshooting

### "Cannot read property 'add' of null"
**Solution**: Canvas not initialized. Check `canvasReady()` signal.

### "fabric is not defined"
**Solution**: Import issue. Use `import * as fabric from 'fabric'`

### Objects disappear on refresh
**Solution**: Check Redis persistence. Verify `saveActivityCanvas()` is called.

### Cursor lag
**Solution**: Increase throttle time in `updateThrottle.throttleMs`

### Mobile touch not working
**Solution**: Ensure `touch-action: none` on canvas element

---

## Quick Commands

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Preview build
npm run preview

# Lint
npm run lint

# Format
npm run format
```

---

## Support

- **Documentation**: See `FABRIC_CANVAS_UPGRADE.md`
- **Implementation**: See `IMPLEMENTATION_SUMMARY.md`
- **Issues**: Check browser console and server logs
- **Questions**: Review Fabric.js documentation

---

**Happy Drawing! 🎨**

