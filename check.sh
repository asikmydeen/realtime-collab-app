#!/bin/bash

echo "🔍 Checking Real-Time Collaborative Canvas Setup"
echo "================================================"
echo ""

# Check Node.js
echo "✓ Node.js version: $(node -v)"
echo "✓ npm version: $(npm -v)"
echo ""

# Check server dependencies
echo "📦 Server Dependencies:"
cd /Users/ammydeen/realtime-collab-app/server
if [ -d "node_modules" ]; then
  echo "✅ Server dependencies installed"
else
  echo "❌ Server dependencies missing - run: npm install"
fi
echo ""

# Check client dependencies
echo "📦 Client Dependencies:"
cd /Users/ammydeen/realtime-collab-app/client
if [ -d "node_modules" ]; then
  echo "✅ Client dependencies installed"
else
  echo "❌ Client dependencies missing - run: npm install"
fi
echo ""

# Check for required files
echo "📁 Required Files:"
FILES=(
  "/Users/ammydeen/realtime-collab-app/server/server.js"
  "/Users/ammydeen/realtime-collab-app/client/src/App.jsx"
  "/Users/ammydeen/realtime-collab-app/client/src/lib/websocket.js"
  "/Users/ammydeen/realtime-collab-app/client/src/lib/webgl.js"
  "/Users/ammydeen/realtime-collab-app/client/src/lib/wasm.js"
  "/Users/ammydeen/realtime-collab-app/client/src/components/Stats.jsx"
  "/Users/ammydeen/realtime-collab-app/client/src/components/Canvas.jsx"
  "/Users/ammydeen/realtime-collab-app/client/src/components/Controls.jsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $(basename $file)"
  else
    echo "❌ $(basename $file) missing"
  fi
done

echo ""
echo "================================================"
echo "🎉 Setup check complete!"
echo ""
echo "To start the application:"
echo "  cd /Users/ammydeen/realtime-collab-app"
echo "  ./start.sh"
echo ""
echo "Or start services individually:"
echo "  Server: cd server && npm run dev"
echo "  Client: cd client && npm run dev"
echo "================================================"