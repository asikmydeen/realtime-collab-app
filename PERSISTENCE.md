# Drawing Persistence

The World Canvas now features persistent drawing storage, making it a truly living canvas where artwork remains even after browser refreshes and server restarts.

## How It Works

### Server-Side Storage
- **Redis-based persistence** (when available) or **in-memory fallback**
- **Spatial indexing** for efficient storage and retrieval
- Drawings are organized into **500x500 pixel chunks**
- Each chunk stores up to 1000 drawing paths
- Automatic cleanup of oldest drawings when chunks are full
- 7-day expiry for Redis-stored chunks

### Client-Side Loading
- **Viewport-based loading** - only loads visible drawings
- **Automatic loading** when navigating to new areas
- **Batch loading** to prevent overwhelming the client
- **Smart caching** to avoid redundant loads

## Performance Features

1. **Spatial Indexing**: Drawings are indexed by their spatial location for fast retrieval
2. **Chunk-based Storage**: Only relevant chunks are loaded based on viewport
3. **Batch Processing**: Drawings are sent in batches of 50 to prevent lag
4. **Debounced Loading**: Prevents excessive loading when panning/zooming

## Deployment

### With Redis (Recommended for Production)
Set the `REDIS_URL` environment variable:
```bash
REDIS_URL=redis://your-redis-url:6379
```

Popular Redis providers:
- **Railway**: Add Redis service to your project
- **Upstash**: Serverless Redis with generous free tier
- **Redis Cloud**: Fully managed Redis
- **Heroku Redis**: If deploying to Heroku

### Without Redis (Development/Small Scale)
The server will automatically fall back to in-memory storage if Redis is not available. Note that drawings will be lost when the server restarts.

## Architecture

```
Client                          Server                          Storage
  |                               |                                |
  |-- Draw Event ---------------->|                                |
  |                               |-- Save Path ----------------->|
  |                               |                                |
  |-- Load Viewport ------------->|                                |
  |                               |-- Query Chunks --------------->|
  |<-- Drawing History (batched) -|<-- Return Drawings -----------|
```

## Future Improvements

- [ ] Compression for drawing data
- [ ] Progressive loading with LOD (Level of Detail)
- [ ] User-specific drawing layers
- [ ] Drawing versioning and history
- [ ] Export/import functionality