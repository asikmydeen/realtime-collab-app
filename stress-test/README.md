# World Canvas Stress Testing Suite

This suite tests the scalability and performance limits of the World Canvas application.

## Installation

```bash
cd stress-test
npm install
```

## Tests Available

### 1. WebSocket Connection Stress Test

Simulates multiple users connecting and drawing simultaneously.

```bash
# Test with different user counts
npm run test:small    # 10 users
npm run test:medium   # 50 users
npm run test:large    # 100 users
npm run test:xlarge   # 500 users
npm run test:extreme  # 1000 users

# Custom user count
TARGET_USERS=2000 npm test
```

### 2. Browser Stress Test

Uses Puppeteer to simulate real browsers drawing on the canvas.

```bash
# Run with default 5 browsers
npm run browser-test

# Custom browser count
TARGET_BROWSERS=20 npm run browser-test

# Run with visible browsers
HEADLESS=false TARGET_BROWSERS=3 npm run browser-test
```

## Metrics Collected

### WebSocket Test Metrics:
- Connection success/failure rate
- Average connection time
- Drawing throughput (draws per second)
- Network latency for drawings
- Bandwidth usage (sent/received)
- Error rates

### Browser Test Metrics:
- Page load times
- Canvas initialization time
- Drawing render performance
- Memory usage
- JavaScript heap size
- Console errors

## Performance Targets

Based on the "World Canvas" vision:

### Minimum Requirements:
- Support 1,000 concurrent users
- < 100ms drawing latency at scale
- < 2s page load time
- < 50MB memory per browser session

### Stretch Goals:
- Support 10,000 concurrent users
- < 50ms drawing latency
- Real-time sync across all users
- Graceful degradation under load

## Optimization Recommendations

After running tests, consider:

1. **WebSocket Optimizations:**
   - Implement connection pooling
   - Add message batching
   - Use binary protocols (MessagePack)
   - Regional WebSocket servers

2. **Client Optimizations:**
   - Viewport-based rendering
   - Drawing throttling/debouncing
   - WebGL acceleration
   - Progressive canvas loading

3. **Server Optimizations:**
   - Horizontal scaling with Redis pub/sub
   - Load balancing
   - CDN for static assets
   - Database query optimization

4. **Infrastructure:**
   - Auto-scaling groups
   - Global edge locations
   - DDoS protection
   - Rate limiting

## Running Full Analysis

Run all tests and generate a report:

```bash
# Run small test first to verify setup
npm run test:small

# Run progressive load tests
npm run test:medium
npm run test:large

# Run browser tests
npm run browser-test

# Generate analysis report
npm run analyze
```

## Interpreting Results

### Good Performance Indicators:
- Connection time < 500ms
- Drawing latency < 100ms
- 0% connection failures
- Linear scaling with user count

### Warning Signs:
- Connection time > 2s
- Drawing latency > 500ms
- > 5% connection failures
- Memory usage > 100MB per session
- Exponential latency increase

### Critical Issues:
- Server crashes
- > 50% connection failures
- Drawing latency > 2s
- Out of memory errors