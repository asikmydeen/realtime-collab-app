# Railway Deployment Setup

## Quick Setup - Just Add Your Database Password

The easiest way to set up Supabase PostgreSQL on Railway:

### Step 1: Get Your Database Password

1. Go to your Supabase project: https://supabase.com/dashboard/project/zcpgprqeocumhgttqmhr
2. Click **Settings** (⚙️) → **Database**
3. Find your database password (you set this when creating the project)

### Step 2: Add to Railway

1. Go to Railway: https://railway.app
2. Select your **server** service
3. Click **Variables** tab
4. Add a new variable:
   - **Variable name**: `DATABASE_PASSWORD`
   - **Value**: (paste your database password)
5. Click **Add**

Railway will automatically redeploy.

**That's it!** The connection string is built automatically using the Supabase Session Pooler (IPv4).

---

## Alternative: Use Full Connection String

If you prefer to provide the full connection string:

### ❌ WRONG - Direct Connection (IPv6)
```
postgresql://postgres:password@db.zcpgprqeocumhgttqmhr.supabase.co:5432/postgres
```
This will fail with: `ENETUNREACH` error on Railway

### ✅ CORRECT - Session Pooler (IPv4)
```
postgresql://postgres.zcpgprqeocumhgttqmhr:password@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

Add as `DATABASE_URL` environment variable in Railway.

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
