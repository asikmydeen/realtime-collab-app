# Deployment Steps - Realtime Collaboration App

## Current Status
✅ Client deployed to Vercel: https://realtime-collab-app.vercel.app
❌ Server needs to be deployed

## Deploy Server to Render (Recommended - Free Tier)

1. **Go to Render**: https://render.com
2. **Sign up/Login** with your GitHub account
3. **Click "New +" → "Web Service"**
4. **Connect your repository**: Select `asikmydeen/realtime-collab-app`
5. **Configure the service**:
   - **Name**: `realtime-collab-server`
   - **Root Directory**: Leave blank (we have package.json in root)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Select "Free"
6. **Click "Create Web Service"**

Your server will be deployed to something like: `https://realtime-collab-server.onrender.com`

## Update Client Configuration

After deploying the server, update the WebSocket URL:

1. **Option 1 - Environment Variable on Vercel**:
   - Go to your Vercel project settings
   - Add environment variable:
     - Name: `VITE_WS_URL`
     - Value: `wss://your-server-url.onrender.com`
   - Redeploy

2. **Option 2 - Update config.js**:
   ```javascript
   export const config = {
     wsUrl: import.meta.env.VITE_WS_URL || 'wss://realtime-collab-server.onrender.com'
   };
   ```

## Alternative: Deploy to Railway (Also Free)

1. Go to https://railway.app
2. Click "Start a New Project"
3. Choose "Deploy from GitHub repo"
4. Select your repository
5. Railway will auto-detect and deploy

## Alternative: Deploy to Heroku

1. Create `Procfile` in root:
   ```
   web: npm start
   ```

2. Deploy via Heroku CLI:
   ```bash
   heroku create realtime-collab-server
   heroku git:remote -a realtime-collab-server
   git push heroku main
   ```

## Testing the Deployment

1. Check server health: `https://your-server-url.onrender.com/health`
2. Open your Vercel app and check if it connects
3. Open in multiple browsers to test real-time collaboration

## Important Notes

- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- For production, consider upgrading to paid tier
- WebSocket connections require `wss://` (secure) in production