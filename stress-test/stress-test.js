import WebSocket from 'ws';
import { performance } from 'perf_hooks';

// Configuration
const config = {
  serverUrl: process.env.SERVER_URL || 'wss://realtime-collab-server-production.up.railway.app',
  testDuration: 60000, // 1 minute
  rampUpTime: 10000, // 10 seconds to ramp up
  targetUsers: parseInt(process.env.TARGET_USERS) || 100,
  drawingsPerSecondPerUser: 2,
  canvasSize: 5000,
  reportInterval: 5000 // Report every 5 seconds
};

// Metrics
const metrics = {
  connectedUsers: 0,
  failedConnections: 0,
  totalDrawsSent: 0,
  totalDrawsReceived: 0,
  connectionTimes: [],
  drawLatencies: [],
  errors: [],
  bytesReceived: 0,
  bytesSent: 0,
  startTime: null
};

// Generate random drawing path
function generateDrawingPath() {
  const startX = Math.random() * config.canvasSize - config.canvasSize / 2;
  const startY = Math.random() * config.canvasSize - config.canvasSize / 2;
  const points = [];
  
  // Generate a smooth curve
  const numPoints = 10 + Math.floor(Math.random() * 20);
  for (let i = 0; i < numPoints; i++) {
    points.push({
      x: startX + (Math.random() - 0.5) * 100,
      y: startY + (Math.random() - 0.5) * 100
    });
  }
  
  return {
    color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
    size: Math.random() * 10 + 1,
    points
  };
}

// Simulated user
class SimulatedUser {
  constructor(id) {
    this.id = id;
    this.username = `StressTest_${id}`;
    this.ws = null;
    this.connected = false;
    this.drawInterval = null;
    this.lastDrawTime = null;
    this.receivedDraws = 0;
    this.connectionStartTime = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.connectionStartTime = performance.now();
      
      try {
        this.ws = new WebSocket(config.serverUrl);
        
        this.ws.on('open', () => {
          const connectionTime = performance.now() - this.connectionStartTime;
          metrics.connectionTimes.push(connectionTime);
          metrics.connectedUsers++;
          this.connected = true;
          
          // Join world room
          this.ws.send(JSON.stringify({
            type: 'join',
            room: 'world',
            username: this.username
          }));
          
          console.log(`[User ${this.id}] Connected in ${connectionTime.toFixed(2)}ms`);
          resolve();
        });
        
        this.ws.on('message', (data) => {
          const messageSize = data.length;
          metrics.bytesReceived += messageSize;
          
          try {
            const message = JSON.parse(data);
            
            if (message.type === 'remoteDraw') {
              this.receivedDraws++;
              metrics.totalDrawsReceived++;
              
              // Calculate latency if this is our own drawing
              if (this.lastDrawTime && message.clientId === this.id) {
                const latency = performance.now() - this.lastDrawTime;
                metrics.drawLatencies.push(latency);
              }
            }
          } catch (error) {
            // Ignore parse errors
          }
        });
        
        this.ws.on('error', (error) => {
          metrics.errors.push(`User ${this.id}: ${error.message}`);
        });
        
        this.ws.on('close', () => {
          this.connected = false;
          metrics.connectedUsers--;
          this.stopDrawing();
        });
        
      } catch (error) {
        metrics.failedConnections++;
        reject(error);
      }
    });
  }

  startDrawing() {
    const drawDelay = 1000 / config.drawingsPerSecondPerUser;
    
    this.drawInterval = setInterval(() => {
      if (this.connected && this.ws.readyState === WebSocket.OPEN) {
        const path = generateDrawingPath();
        
        // Send start
        this.lastDrawTime = performance.now();
        const startMessage = JSON.stringify({
          type: 'draw',
          drawType: 'start',
          x: path.points[0].x,
          y: path.points[0].y,
          color: path.color,
          size: path.size
        });
        this.ws.send(startMessage);
        metrics.bytesSent += startMessage.length;
        
        // Send points
        for (let i = 1; i < path.points.length; i++) {
          const drawMessage = JSON.stringify({
            type: 'draw',
            drawType: 'draw',
            x: path.points[i].x,
            y: path.points[i].y,
            color: path.color,
            size: path.size
          });
          this.ws.send(drawMessage);
          metrics.bytesSent += drawMessage.length;
        }
        
        // Send end
        const endMessage = JSON.stringify({
          type: 'draw',
          drawType: 'end'
        });
        this.ws.send(endMessage);
        metrics.bytesSent += endMessage.length;
        
        metrics.totalDrawsSent++;
      }
    }, drawDelay);
  }

  stopDrawing() {
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
      this.drawInterval = null;
    }
  }

  disconnect() {
    this.stopDrawing();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

// Report metrics
function reportMetrics() {
  const elapsed = (performance.now() - metrics.startTime) / 1000;
  const avgConnectionTime = metrics.connectionTimes.length > 0 
    ? metrics.connectionTimes.reduce((a, b) => a + b, 0) / metrics.connectionTimes.length 
    : 0;
  const avgDrawLatency = metrics.drawLatencies.length > 0
    ? metrics.drawLatencies.reduce((a, b) => a + b, 0) / metrics.drawLatencies.length
    : 0;

  console.log('\n========== STRESS TEST METRICS ==========');
  console.log(`Elapsed Time: ${elapsed.toFixed(1)}s`);
  console.log(`Connected Users: ${metrics.connectedUsers}/${config.targetUsers}`);
  console.log(`Failed Connections: ${metrics.failedConnections}`);
  console.log(`Total Draws Sent: ${metrics.totalDrawsSent}`);
  console.log(`Total Draws Received: ${metrics.totalDrawsReceived}`);
  console.log(`Draws Per Second: ${(metrics.totalDrawsSent / elapsed).toFixed(2)}`);
  console.log(`Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
  console.log(`Avg Draw Latency: ${avgDrawLatency.toFixed(2)}ms`);
  console.log(`Data Sent: ${(metrics.bytesSent / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Data Received: ${(metrics.bytesReceived / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Errors: ${metrics.errors.length}`);
  console.log('==========================================\n');
}

// Main stress test
async function runStressTest() {
  console.log(`Starting stress test with ${config.targetUsers} users...`);
  console.log(`Server: ${config.serverUrl}`);
  console.log(`Test Duration: ${config.testDuration / 1000}s`);
  console.log(`Drawings Per Second Per User: ${config.drawingsPerSecondPerUser}\n`);
  
  metrics.startTime = performance.now();
  const users = [];
  
  // Ramp up users gradually
  const usersPerInterval = Math.ceil(config.targetUsers / (config.rampUpTime / 1000));
  const rampUpInterval = setInterval(async () => {
    const batchPromises = [];
    
    for (let i = 0; i < usersPerInterval && users.length < config.targetUsers; i++) {
      const user = new SimulatedUser(users.length + 1);
      users.push(user);
      batchPromises.push(user.connect().catch(err => {
        console.error(`Failed to connect user ${user.id}:`, err.message);
      }));
    }
    
    // Wait for batch to connect
    await Promise.all(batchPromises);
    
    // Start drawing for connected users
    users.forEach(user => {
      if (user.connected && !user.drawInterval) {
        user.startDrawing();
      }
    });
    
    if (users.length >= config.targetUsers) {
      clearInterval(rampUpInterval);
      console.log('All users ramped up!');
    }
  }, 1000);
  
  // Report metrics periodically
  const reportIntervalId = setInterval(reportMetrics, config.reportInterval);
  
  // Run test for specified duration
  setTimeout(() => {
    console.log('\nStopping stress test...');
    
    // Stop reporting
    clearInterval(reportIntervalId);
    
    // Disconnect all users
    users.forEach(user => user.disconnect());
    
    // Final report
    setTimeout(() => {
      reportMetrics();
      
      // Detailed error report
      if (metrics.errors.length > 0) {
        console.log('Error Details:');
        metrics.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        if (metrics.errors.length > 10) {
          console.log(`  ... and ${metrics.errors.length - 10} more errors`);
        }
      }
      
      process.exit(0);
    }, 2000);
  }, config.testDuration);
}

// Run the test
runStressTest().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});