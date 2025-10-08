# Railway Deployment Setup

## Supabase Configuration

The app now uses Supabase's built-in authentication (no database connection needed from server).

### Required Environment Variables

Add these to Railway:

1. Go to Railway: https://railway.app
2. Select your **server** service
3. Click **Variables** tab
4. Add these variables:

#### SUPABASE_URL
- Get from: https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/settings/api
- Value: `https://zcpgprqeocumhgttqmhr.supabase.co`

#### SUPABASE_ANON_KEY
- Get from: https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/settings/api
- Copy the **anon/public** key
- Paste as value

Railway will automatically redeploy.

## Verify It's Working

After deployment, check Railway logs for:

```
[Supabase] Client initialized
[Supabase] URL: https://zcpgprqeocumhgttqmhr.supabase.co
✅ Redis connected successfully
🚀 Server running on http://localhost:3001
🔌 WebSocket available on ws://localhost:3001
```

The server should start without any database connection errors!
