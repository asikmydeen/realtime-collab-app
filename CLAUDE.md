# Real-Time Collaborative Drawing Application

## Project Overview

This is a sophisticated real-time collaborative drawing application that combines geo-location features with activity-based collaboration. Users can create and join drawing activities in their local area, with a robust permission and ownership system.

### Core Features

1. **Geo-Located Activities**
   - Activities are tied to physical locations using GPS coordinates
   - Users must be within 500 meters of a location to create activities there
   - Map-based interface using OpenStreetMap tiles
   - Street-level zoom (18-21) for precise activity placement

2. **Real-Time Collaboration**
   - WebSocket-based real-time drawing synchronization
   - Multiple users can draw simultaneously
   - Live cursor tracking and participant lists
   - Instant updates across all connected clients

3. **Ownership & Permissions System**
   - Activities are view-only by default
   - Users must request permission to contribute
   - Owners can approve/reject contribution requests
   - Owners can review and remove unwanted drawings
   - Persistent user identity across sessions

4. **Activity Management**
   - Create activities with title and description
   - Automatic default activity for each location
   - "My Activities" view to see owned activities
   - Activity aggregation at different zoom levels

## Technical Architecture

### Frontend (Client)
- **Framework**: SolidJS with Vite
- **Key Components**:
  - `ActivityView.jsx`: Main map view with activity markers
  - `ActivityCanvas.jsx`: Individual activity drawing canvas
  - `ActivityControls.jsx`: Owner control panel
  - `WebSocketManager`: Handles real-time communication
- **Libraries**:
  - OpenStreetMap for mapping
  - Canvas API for drawing
  - LocalStorage for user hash persistence

### Backend (Server)
- **Runtime**: Node.js with Express
- **Database**: Redis for persistence
- **Key Modules**:
  - `server.js`: Main WebSocket and HTTP server
  - `activityPersistence.js`: Activity data management
  - `userIdentity.js`: User identity management
  - `connectionManager.js`: WebSocket connection pooling
- **Features**:
  - Geospatial indexing using geohashes
  - Connection queuing for scalability
  - Message batching for performance

## Key Data Models

### Activity
```javascript
{
  id: string,
  title: string,
  description: string,
  ownerId: string,              // Persistent user hash
  ownerName: string,
  lat: number,
  lng: number,
  geohash: string,              // For spatial queries
  street: string,
  createdAt: number,
  permissions: {
    allowContributions: boolean, // Default: false
    contributorRequests: Array,  // Pending requests
    approvedContributors: Array, // Approved user hashes
    bannedUsers: Array,
    moderators: Array
  }
}
```

### Drawing Path
```javascript
{
  pathId: string,               // Unique identifier
  clientId: string,             // Session ID
  userHash: string,             // Persistent user ID
  color: string,
  size: number,
  points: Array<{x, y}>,
  timestamp: number
}
```

## User Identity System

Users are assigned a persistent SHA256 hash on first connection:
- Hash is stored in localStorage
- Passed via WebSocket URL parameters on reconnection
- Validated server-side before use
- Ensures ownership persists across sessions

## Permission Flow

1. **View-Only by Default**: New activities start locked
2. **Request Access**: Users click "Request to Contribute"
3. **Owner Review**: Owners see requests in real-time
4. **Approval**: Owners can approve contributors
5. **Contribution Review**: Owners can review all drawings
6. **Selective Removal**: Owners can remove specific contributions

## WebSocket Message Types

### Client → Server
- `authenticate`: Send stored user hash
- `createActivity`: Create new activity
- `joinActivity`: Join an activity
- `activityDraw`: Drawing data
- `requestContribution`: Request to contribute
- `approveContributor`: Approve a contributor
- `removeUserDrawing`: Remove specific drawing
- `getMyActivities`: Get owned activities
- `getActivities`: Get activities in viewport

### Server → Client
- `welcome`: Initial connection with user hash
- `activityCreated`: New activity created
- `activityJoined`: Joined activity data
- `remoteActivityDraw`: Remote drawing updates
- `contributionRequest`: New contribution request
- `contributionStatus`: Request status update
- `drawingRemoved`: Drawing removed notification
- `myActivities`: List of owned activities

## Key Implementation Details

### Geolocation Features
- Haversine formula for distance calculations
- Geohash-based spatial indexing (precision 5-6)
- Tile overzooming for zoom levels beyond 19
- Automatic viewport-based activity loading

### Performance Optimizations
- Connection pooling with queue management
- Drawing throttling (16ms/60fps)
- Message batching on server
- Viewport-based filtering
- Efficient Redis key patterns

### Security & Validation
- Location-based activity creation (500m radius)
- Owner-only drawing removal
- Persistent user identity validation
- Permission checks at every level

## Current Issues & Limitations

1. **Known Bugs**:
   - Redis WRONGTYPE errors with some keys (partially fixed)
   - Activity data structure inconsistencies

2. **Performance Considerations**:
   - Full key scan for "My Activities" (needs indexing)
   - No pagination for activity lists
   - Canvas data grows unbounded

3. **Missing Features**:
   - Moderator system (planned)
   - Ban user functionality (planned)
   - Drawing undo/redo
   - Activity search
   - Activity categories/tags

## Development Commands

### Client
```bash
cd client
npm install
npm run dev      # Development server
npm run build    # Production build
```

### Server
```bash
cd server
npm install
npm start        # Start server
```

### Environment Variables

#### Client (.env)
```
VITE_WS_URL=ws://localhost:8080  # WebSocket server URL
```

#### Server (.env)
```
REDIS_URL=redis://localhost:6379  # Redis connection
PORT=8080                         # Server port
HOST=0.0.0.0                      # Server host
```

## Deployment

- **Client**: Deployed on Vercel
- **Server**: Deployed on Railway
- **Redis**: Railway Redis instance

### Production URLs
- Client: https://realtime-collab-app.vercel.app
- Server: wss://realtime-collab-server-production.up.railway.app

## Future Enhancements

1. **Moderation System**
   - Activity moderators with special permissions
   - Report inappropriate content
   - Automated content filtering

2. **Enhanced Features**
   - Activity categories and tags
   - Search functionality
   - User profiles
   - Activity sharing/embedding
   - Drawing tools (shapes, text, etc.)

3. **Performance**
   - Implement proper indexing for user activities
   - Add pagination for large datasets
   - Optimize canvas rendering
   - Implement drawing compression

4. **Social Features**
   - Follow other artists
   - Activity comments
   - Likes/favorites
   - Activity discovery feed

## Testing Checklist

When testing the application, verify:

1. ✅ User identity persists on page reload
2. ✅ Can create activities only within 500m radius
3. ✅ Activities start as view-only
4. ✅ Contribution requests work properly
5. ✅ Owners can approve contributors
6. ✅ Owners can review and remove drawings
7. ✅ "My Activities" shows owned activities
8. ✅ Real-time drawing sync works
9. ✅ Map navigation and zoom work smoothly
10. ✅ Activity persistence across sessions

## Common Issues & Solutions

### "My Activities" Shows Empty
- Check if user hash is persisting in localStorage
- Verify server is using URL parameter for auth
- Check Redis for activity ownership data

### Can't Draw on Canvas
- Verify contribution permissions
- Check if activity allows contributions
- Ensure user is approved contributor or owner

### Activities Not Loading
- Check geolocation permissions
- Verify Redis connection
- Check for JavaScript console errors

### WebSocket Disconnections
- Check network stability
- Verify server is running
- Check for CORS issues

## Code Style Guidelines

1. **Component Structure**:
   - Use SolidJS reactive primitives (createSignal, createEffect)
   - Keep components focused and single-purpose
   - Use proper cleanup in onCleanup

2. **Server Code**:
   - Use async/await for all async operations
   - Comprehensive error handling
   - Detailed logging with prefixes [Module]

3. **General**:
   - No unnecessary comments
   - Clear variable names
   - Consistent formatting
   - Proper error boundaries

This documentation represents the complete current state of the application as of the latest implementation. Use this as a reference when continuing development in a new session.