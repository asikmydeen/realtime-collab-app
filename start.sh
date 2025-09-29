#!/bin/bash

echo "🚀 Starting Real-Time Collaborative Canvas Application"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Start the server
echo -e "${YELLOW}Starting WebSocket Server...${NC}"
cd server
npm start &
SERVER_PID=$!
echo -e "${GREEN}✓ Server started with PID: $SERVER_PID${NC}"

# Wait for server to be ready
sleep 3

# Start the client
echo -e "${YELLOW}Starting SolidJS Client...${NC}"
cd ../client
npm run dev &
CLIENT_PID=$!
echo -e "${GREEN}✓ Client started with PID: $CLIENT_PID${NC}"

echo ""
echo -e "${GREEN}=================================================="
echo "Application is running!"
echo "=================================================="
echo ""
echo "📱 Client: http://localhost:3000"
echo "🔌 Server: http://localhost:3001"
echo "📊 Health: http://localhost:3001/health"
echo ""
echo "Press Ctrl+C to stop both services"
echo -e "==================================================${NC}"

# Handle Ctrl+C
trap "echo ''; echo 'Shutting down...'; kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" INT

# Keep script running
wait