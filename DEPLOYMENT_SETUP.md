# Deployment Setup Guide

## Current Status

✅ Code has been pushed to GitHub
✅ Railway will auto-deploy from the main branch
✅ Better Auth is now optional and won't crash the server if it fails
✅ CORS is configured for production domains

## Railway Environment Variables

Go to your Railway project dashboard and set these environment variables:

### Required Variables:

1. **`REDIS_HOST`**
   ```
   redis-19899.crce214.us-east-1-3.ec2.redns.redis-cloud.com
   ```

2. **`REDIS_PORT`**
   ```
   19899
   ```

3. **`REDIS_PASSWORD`**
   ```
   lFcvAvSAhEhjM7EGeVkS1urw2MyhB6Tp
   ```

4. **`PORT`** (Railway usually sets this automatically)
   ```
   3001
   ```

### Auth Variables (Optional but Recommended):

5. **`AUTH_SECRET`** - Generate a strong random string:
   ```bash
   # Run this command locally to generate:
   openssl rand -base64 32
   ```
   Then paste the output as the value in Railway.

6. **`AUTH_BASE_URL`**
   ```
   https://realtime-collab-server-production.up.railway.app
   ```

7. **`CLIENT_URL`**
   ```
   https://www.alamuna.art
   ```

## Vercel Environment Variables

Go to your Vercel project (www.alamuna.art) → Settings → Environment Variables:

### Required Variables:

1. **`VITE_API_URL`**
   ```
   https://realtime-collab-server-production.up.railway.app
   ```

2. **`VITE_WS_URL`**
   ```
   wss://realtime-collab-server-production.up.railway.app
   ```

**Important:** After adding these variables, you must **redeploy** your Vercel app for them to take effect.

## What Was Fixed

### 1. Made Better Auth Optional
- Server won't crash if Better Auth fails to initialize
- Auth endpoints return 503 if auth is unavailable
- App continues to work with legacy userHash system

### 2. Fixed CORS Configuration
- Added multiple allowed origins
- Properly handles production domain (www.alamuna.art)
- Logs blocked origins for debugging

### 3. Fixed Better Auth baseURL
- Now properly uses PORT environment variable
- Defaults to correct port (3001)
- Handles both development and production URLs

### 4. Added Error Handling
- Auth handler wrapped in try-catch
- Client-side auth fails gracefully
- Detailed logging for debugging

## Testing After Deployment

1. **Check Railway Logs**
   - Look for: `[Auth] Better Auth initialized successfully`
   - Look for: `✅ Redis connected successfully`
   - Look for: `🚀 Server running on...`

2. **Test Your Production Site**
   - Visit: https://www.alamuna.art
   - Open browser console (F12)
   - Check for WebSocket connection: `✅ WebSocket connected`
   - Should NOT see CORS errors

3. **Test Auth (if configured)**
   - Try signing up with email/password
   - Check if session persists on page reload

## Troubleshooting

### If Railway keeps crashing:

1. Check Railway logs for specific error messages
2. Verify all environment variables are set correctly
3. Make sure `AUTH_BASE_URL` is the full HTTPS URL
4. Check that SQLite database can be created (Railway has persistent storage)

### If CORS errors persist:

1. Verify `CLIENT_URL` is set in Railway
2. Check that the domain matches exactly (with or without www)
3. Look for `[CORS] Blocked origin:` in Railway logs

### If WebSocket disconnects immediately:

1. Check Railway logs when connection happens
2. Verify `VITE_WS_URL` uses `wss://` (not `ws://`)
3. Make sure Railway service is running

### If auth doesn't work but app works:

This is expected! The app will work fine without auth using the legacy userHash system. Auth is optional.

To enable auth:
1. Set all auth environment variables in Railway
2. Redeploy Railway
3. Check logs for `[Auth] Better Auth initialized successfully`

## Current Behavior

### Without Auth Variables:
- ✅ App works normally
- ✅ WebSocket connects
- ✅ Drawing works
- ✅ Activities work
- ✅ Uses legacy userHash for identity
- ⚠️ Auth endpoints return 503

### With Auth Variables:
- ✅ Everything above, plus:
- ✅ User sign up/sign in
- ✅ Persistent user accounts
- ✅ Real user names
- ✅ Cross-device identity

## Next Steps

1. **Set Railway environment variables** (at minimum: Redis variables)
2. **Wait for Railway to redeploy** (automatic from git push)
3. **Set Vercel environment variables** (VITE_API_URL and VITE_WS_URL)
4. **Redeploy Vercel** (or wait for automatic deployment)
5. **Test the production site**

## Optional: Enable Full Authentication

If you want to enable user accounts:

1. Set all auth environment variables in Railway (especially `AUTH_SECRET`)
2. Generate schema in Railway:
   ```bash
   # In Railway's terminal or locally with Railway CLI:
   npx @better-auth/cli@latest generate
   ```
3. Redeploy Railway
4. Test sign up/sign in on production site

## Support

If you encounter issues:

1. Check Railway logs first
2. Check browser console for client-side errors
3. Verify all environment variables are set correctly
4. Make sure domains match exactly (https://www.alamuna.art vs https://alamuna.art)

The app should work fine even without auth - it will just use the legacy userHash system for user identity.

