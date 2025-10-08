# Supabase Auth Migration

## What Changed

We switched from Better Auth (with PostgreSQL) to Supabase's built-in authentication system.

### Why?

1. **Simpler** - No server-side database connection needed
2. **More Reliable** - No connection issues between Railway and Supabase
3. **Better Integration** - Supabase Auth is designed to work with Supabase
4. **Less Code** - Removed ~21,000 lines of dependencies
5. **Easier Deployment** - No database migrations or connection string configuration

## What Was Removed

### Server
- ❌ `better-auth` package
- ❌ `kysely` package (SQL query builder)
- ❌ `pg` package (PostgreSQL driver)
- ❌ `server/config/auth.config.js`
- ❌ `server/migrate-postgres.js`
- ❌ Server-side auth routes (`/api/auth/*`)

### Client
- ❌ `better-auth` package
- ✅ Now uses `@supabase/supabase-js` directly

## What Was Added/Updated

### Server
- ✅ `server/config/supabase.config.js` - Added `verifySession()` function
- ✅ `server/server.js` - Updated to use Supabase's `verifySession()`

### Client
- ✅ `client/src/lib/auth.js` - Completely rewritten to use Supabase Auth
  - `useSignIn()` - Sign in with email/password
  - `useSignUp()` - Sign up with email/password
  - `useSignOut()` - Sign out
  - `useUser()` - Get current user
  - `getSessionToken()` - Get JWT token for WebSocket auth

## How Authentication Works Now

### Client-Side (Browser)

1. User signs up/in using Supabase Auth
2. Supabase stores session in localStorage
3. Session includes JWT access token
4. Client sends access token to server via WebSocket

### Server-Side (Node.js)

1. Server receives access token from WebSocket connection
2. Server calls `verifySession(token)` using Supabase client
3. Supabase validates the JWT token
4. Server gets user info (id, email, name)
5. Server associates WebSocket connection with user

### No Database Connection Needed!

The server doesn't need to connect to PostgreSQL. Supabase handles all auth operations via its REST API.

## Environment Variables

### Server (Railway)

Only need these two:

```
SUPABASE_URL=https://zcpgprqeocumhgttqmhr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get from: https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/settings/api

### Client (Vercel)

Same two variables (with `VITE_` prefix):

```
VITE_SUPABASE_URL=https://zcpgprqeocumhgttqmhr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Deployment Steps

### 1. Railway (Server)

1. Go to Railway: https://railway.app
2. Select your server service
3. Click **Variables** tab
4. **Remove** old variables:
   - `DATABASE_URL`
   - `DATABASE_PASSWORD`
   - `AUTH_SECRET`
   - `AUTH_BASE_URL`
5. **Add** new variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Railway will auto-redeploy

### 2. Vercel (Client)

1. Go to Vercel: https://vercel.com
2. Select your client project
3. Click **Settings** → **Environment Variables**
4. Verify these exist:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. If not, add them
6. Redeploy if needed

## Testing

### 1. Sign Up

1. Go to https://www.alamuna.art
2. Click "Sign In" button
3. Click "Sign Up" tab
4. Enter email, password, and name
5. Click "Sign Up"
6. Should see your name in header (not "Sign In" button)

### 2. Create Activity

1. Click on map to create activity
2. Activity should show your real name (not "Anonymous")
3. Check Supabase Dashboard → Authentication → Users
4. Should see your user account

### 3. Sign Out & Sign In

1. Sign out
2. Sign in with same credentials
3. Should work without issues
4. Activities should still show your name

### 4. Persistence Test

1. Sign in
2. Refresh page
3. Should still be signed in (session persists in localStorage)

## Supabase Dashboard

### View Users

https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/auth/users

### View Auth Logs

https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/logs/auth-logs

### Configure Auth Settings

https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr/auth/settings

## Benefits

1. ✅ **No Database Connection Issues** - No more ECONNREFUSED, IPv6, or pooler errors
2. ✅ **Automatic Email Verification** - Supabase can send verification emails
3. ✅ **Password Reset** - Built-in password reset flow
4. ✅ **OAuth Support** - Can easily add Google, GitHub, etc.
5. ✅ **Rate Limiting** - Built-in protection against brute force
6. ✅ **Session Management** - Automatic token refresh
7. ✅ **Security** - Industry-standard JWT tokens
8. ✅ **Scalability** - Supabase handles millions of users

## Migration Complete! 🎉

The app now uses Supabase Auth exclusively. No more database connection headaches!

