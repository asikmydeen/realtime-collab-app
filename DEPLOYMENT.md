# Deployment Guide for Realtime Collaboration App

Your GitHub repository has been created at: https://github.com/asikmydeen/realtime-collab-app

## Deployment Options

### Option 1: Deploy to Vercel (Recommended for Client)

1. Go to https://vercel.com and sign in with your GitHub account
2. Click "New Project"
3. Import your repository: `asikmydeen/realtime-collab-app`
4. Configure the build settings:
   - Framework: Vite
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click "Deploy"

### Option 2: Deploy to Render

For the complete app (client + server):

1. Go to https://render.com and sign in
2. Create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && node server.js`
5. Add environment variables if needed

### Option 3: Deploy to Railway

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect and deploy both services

### Option 4: Deploy Server to Heroku

Create a `Procfile` in the server directory:
```
web: node server.js
```

Then deploy using Heroku CLI or GitHub integration.

### Option 5: Deploy Client to Netlify

1. Go to https://netlify.com
2. Drag and drop the `client/dist` folder
3. Or connect GitHub and configure:
   - Build command: `cd client && npm run build`
   - Publish directory: `client/dist`

## Local Development

To run locally:
```bash
# Terminal 1 - Server
cd server
npm install
npm start

# Terminal 2 - Client
cd client
npm install
npm run dev
```

## WebSocket Configuration

Remember to update the WebSocket URL in `client/src/lib/websocket.js` to point to your deployed server URL when deploying to production.