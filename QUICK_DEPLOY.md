# Quick Deploy Guide - Get Your App Working NOW

## Option 1: Deploy to Glitch (Instant & Free)

1. **Go to**: https://glitch.com/edit/#!/import/github/asikmydeen/realtime-collab-app
2. **Wait** for import to complete (1-2 minutes)
3. **Click** "Show" → "In a New Window" to get your server URL
4. **Copy** the URL (like `https://your-project-name.glitch.me`)

## Option 2: Deploy to Replit (Also Instant)

1. **Go to**: https://replit.com/github/asikmydeen/realtime-collab-app
2. **Click** "Import from GitHub"
3. **Run** the project
4. **Copy** the URL from the preview window

## Update Your Vercel Deployment

1. **Go to**: Your Vercel project dashboard
2. **Settings** → **Environment Variables**
3. **Add**:
   - Key: `VITE_WS_URL`
   - Value: `wss://your-glitch-project.glitch.me` (use your actual Glitch URL)
4. **Redeploy** on Vercel

## Local Testing (Immediate)

To test locally right now:

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

Then open http://localhost:5173 in multiple browsers.

## Why It's Not Working

Your Vercel deployment is trying to connect to a WebSocket server that doesn't exist yet. The client is deployed but has no server to talk to. Once you deploy the server using any method above, collaboration will work instantly.