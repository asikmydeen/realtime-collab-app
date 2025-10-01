import puppeteer from 'puppeteer';
import { performance } from 'perf_hooks';

// Configuration
const config = {
  appUrl: process.env.APP_URL || 'https://realtime-collab-app.vercel.app',
  targetBrowsers: parseInt(process.env.TARGET_BROWSERS) || 5,
  testDuration: 60000, // 1 minute
  drawingsPerBrowser: 5,
  headless: process.env.HEADLESS !== 'false'
};

// Metrics
const browserMetrics = {
  pageLoadTimes: [],
  canvasReadyTimes: [],
  drawingRenderTimes: [],
  memoryUsage: [],
  cpuUsage: [],
  errors: []
};

// Simulate drawing in browser
async function simulateDrawing(page, browserId) {
  try {
    // Wait for canvas to be ready
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && !document.querySelector('[style*="Loading Canvas"]');
    }, { timeout: 30000 });

    // Get canvas element
    const canvas = await page.$('canvas');
    const box = await canvas.boundingBox();
    
    // Perform multiple drawings
    for (let i = 0; i < config.drawingsPerBrowser; i++) {
      const startX = box.x + Math.random() * box.width;
      const startY = box.y + Math.random() * box.height;
      
      // Start drawing
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      
      // Draw a curve
      for (let j = 0; j < 10; j++) {
        const x = startX + (Math.random() - 0.5) * 100;
        const y = startY + (Math.random() - 0.5) * 100;
        await page.mouse.move(x, y);
        await page.waitForTimeout(10);
      }
      
      // End drawing
      await page.mouse.up();
      
      // Wait between drawings
      await page.waitForTimeout(1000);
    }
    
    console.log(`[Browser ${browserId}] Completed ${config.drawingsPerBrowser} drawings`);
  } catch (error) {
    browserMetrics.errors.push(`Browser ${browserId}: ${error.message}`);
  }
}

// Monitor browser performance
async function monitorPerformance(page, browserId) {
  try {
    // Get performance metrics
    const metrics = await page.metrics();
    
    // Get memory usage
    const performanceData = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize
        };
      }
      return null;
    });
    
    if (performanceData) {
      browserMetrics.memoryUsage.push({
        browserId,
        heapUsed: performanceData.usedJSHeapSize / 1024 / 1024, // MB
        heapTotal: performanceData.totalJSHeapSize / 1024 / 1024 // MB
      });
    }
    
    // Get render time for drawings
    const renderMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('measure')
        .filter(entry => entry.name.includes('render'));
      return entries.map(e => ({ name: e.name, duration: e.duration }));
    });
    
    if (renderMetrics.length > 0) {
      browserMetrics.drawingRenderTimes.push(...renderMetrics.map(m => m.duration));
    }
    
  } catch (error) {
    console.error(`Performance monitoring error for browser ${browserId}:`, error.message);
  }
}

// Run browser stress test
async function runBrowserStressTest() {
  console.log(`Starting browser stress test with ${config.targetBrowsers} browsers...`);
  console.log(`App URL: ${config.appUrl}`);
  console.log(`Headless: ${config.headless}`);
  console.log(`Test Duration: ${config.testDuration / 1000}s\n`);
  
  const startTime = performance.now();
  const browsers = [];
  const pages = [];
  
  try {
    // Launch browsers
    for (let i = 0; i < config.targetBrowsers; i++) {
      const browserStartTime = performance.now();
      
      const browser = await puppeteer.launch({
        headless: config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,720'
        ]
      });
      
      browsers.push(browser);
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      
      // Set up console logging
      page.on('console', msg => {
        if (msg.type() === 'error') {
          browserMetrics.errors.push(`Browser ${i + 1} console: ${msg.text()}`);
        }
      });
      
      // Navigate to app
      const pageLoadStart = performance.now();
      await page.goto(config.appUrl, { waitUntil: 'networkidle2' });
      const pageLoadTime = performance.now() - pageLoadStart;
      
      browserMetrics.pageLoadTimes.push(pageLoadTime);
      pages.push(page);
      
      console.log(`[Browser ${i + 1}] Launched and loaded in ${pageLoadTime.toFixed(2)}ms`);
      
      // Start drawing after a delay
      setTimeout(async () => {
        await simulateDrawing(page, i + 1);
      }, 2000 + i * 1000); // Stagger the start
    }
    
    // Monitor performance periodically
    const monitorInterval = setInterval(async () => {
      for (let i = 0; i < pages.length; i++) {
        await monitorPerformance(pages[i], i + 1);
      }
    }, 5000);
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, config.testDuration));
    
    // Stop monitoring
    clearInterval(monitorInterval);
    
    // Final metrics collection
    for (let i = 0; i < pages.length; i++) {
      await monitorPerformance(pages[i], i + 1);
    }
    
  } finally {
    // Close all browsers
    for (const browser of browsers) {
      await browser.close();
    }
  }
  
  // Report results
  reportBrowserMetrics(performance.now() - startTime);
}

// Report browser metrics
function reportBrowserMetrics(totalTime) {
  console.log('\n========== BROWSER STRESS TEST RESULTS ==========');
  console.log(`Total Test Time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`Browsers Tested: ${config.targetBrowsers}`);
  
  const avgPageLoad = browserMetrics.pageLoadTimes.reduce((a, b) => a + b, 0) / browserMetrics.pageLoadTimes.length;
  console.log(`\nPage Load Times:`);
  console.log(`  Average: ${avgPageLoad.toFixed(2)}ms`);
  console.log(`  Min: ${Math.min(...browserMetrics.pageLoadTimes).toFixed(2)}ms`);
  console.log(`  Max: ${Math.max(...browserMetrics.pageLoadTimes).toFixed(2)}ms`);
  
  if (browserMetrics.drawingRenderTimes.length > 0) {
    const avgRender = browserMetrics.drawingRenderTimes.reduce((a, b) => a + b, 0) / browserMetrics.drawingRenderTimes.length;
    console.log(`\nDrawing Render Times:`);
    console.log(`  Average: ${avgRender.toFixed(2)}ms`);
    console.log(`  Min: ${Math.min(...browserMetrics.drawingRenderTimes).toFixed(2)}ms`);
    console.log(`  Max: ${Math.max(...browserMetrics.drawingRenderTimes).toFixed(2)}ms`);
  }
  
  if (browserMetrics.memoryUsage.length > 0) {
    const avgHeap = browserMetrics.memoryUsage.reduce((a, b) => a + b.heapUsed, 0) / browserMetrics.memoryUsage.length;
    console.log(`\nMemory Usage:`);
    console.log(`  Average Heap: ${avgHeap.toFixed(2)}MB`);
  }
  
  console.log(`\nErrors: ${browserMetrics.errors.length}`);
  if (browserMetrics.errors.length > 0) {
    browserMetrics.errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('================================================\n');
}

// Run the test
runBrowserStressTest().catch(err => {
  console.error('Browser stress test failed:', err);
  process.exit(1);
});