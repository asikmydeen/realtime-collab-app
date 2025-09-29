# 🚀 EASIEST Way to Deploy Your Server (2 minutes)

## Option 1: Railway (Recommended - Instant Deploy)

1. **Click this link**: https://railway.app/new/github
2. **Login** with GitHub
3. **Select** your repository: `asikmydeen/realtime-collab-app`
4. **Wait** 30 seconds for deployment
5. **Click** on the deployment
6. **Go to** Settings → Networking → Generate Domain
7. **Copy** your URL (like `https://realtime-collab-app-production.up.railway.app`)

## Option 2: Replit

1. **Go to**: https://replit.com/new/github/asikmydeen/realtime-collab-app
2. **Click** "Import from GitHub"
3. **Click** "Run" button
4. **Copy** the URL from the preview window

## Option 3: Deploy Server Only to Vercel

Create a new file `server/vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

Then deploy just the server folder to a new Vercel project.

## Update Your Client

Once deployed, update your Vercel environment:

1. **Vercel Dashboard** → Your Project → Settings → Environment Variables
2. **Add**: 
   - Key: `VITE_WS_URL`
   - Value: `wss://your-server-url.railway.app` (use your actual server URL)
3. **Redeploy**

## Test It!

Open your app in multiple browser windows/tabs and start drawing. You should see real-time collaboration!