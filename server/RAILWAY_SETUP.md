# Railway Deployment Setup

## Important: Supabase Connection String

Railway **does not support IPv6** connections. You must use the **Session Pooler** connection string from Supabase, not the direct connection string.

### ❌ WRONG - Direct Connection (IPv6)
```
postgresql://postgres:password@db.zcpgprqeocumhgttqmhr.supabase.co:5432/postgres
```
This will fail with: `ENETUNREACH` error

### ✅ CORRECT - Session Pooler (IPv4)
```
postgresql://postgres.zcpgprqeocumhgttqmhr:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

## How to Get the Correct Connection String

1. Go to your Supabase project: https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr
2. Click **Settings** (⚙️) → **Database**
3. Scroll to **Connection string** section
4. Select **Session pooler** tab (NOT "Direct connection")
5. Select **URI** format
6. Copy the connection string
7. Replace `[YOUR-PASSWORD]` with your actual database password

## Add to Railway

1. Go to Railway: https://railway.app
2. Select your **server** service
3. Click **Variables** tab
4. Add or update:
   - **Variable name**: `DATABASE_URL`
   - **Value**: (paste the Session Pooler connection string)
5. Click **Add** or **Update**

Railway will automatically redeploy.

## Verify It's Working

After deployment, check Railway logs for:

```
[Migration] 🔧 Running PostgreSQL migrations...
[Migration] 📡 Connecting to PostgreSQL...
[Migration] ✅ Created user table
[Migration] ✅ Created session table
[Migration] ✅ Created account table
[Migration] ✅ Created verification table
[Migration] ✅ Created indexes
[Migration] ✅ PostgreSQL migration completed successfully!

[Auth] ✅ Better Auth initialized successfully
🚀 Server running on port 8080
```

If you see `ENETUNREACH` error, you're using the wrong connection string (direct instead of pooler).

