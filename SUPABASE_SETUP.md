# 🚀 Supabase Setup Guide

This guide will help you set up Supabase as the database for your Real-Time Collaborative Drawing App.

## 📋 Prerequisites

- Supabase account (already created)
- Supabase project: https://zcpgprqeocumhgttqmhr.supabase.co
- Railway account with deployed server

---

## 🔧 Step 1: Get PostgreSQL Connection String

1. Go to your Supabase project: https://zcpgprqeocumhgttqmhr.supabase.co
2. Click **Settings** (gear icon in sidebar)
3. Click **Database** in the settings menu
4. Scroll down to **Connection string** section
5. Select the **URI** tab (not Transaction or Session)
6. Copy the connection string - it looks like:
   ```
   postgresql://postgres.zcpgprqeocumhgttqmhr:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```
7. **Replace `[YOUR-PASSWORD]`** with your actual database password (the one you set when creating the project)

---

## 🗄️ Step 2: Set Up Database Tables

### Option A: Run Setup Script Locally (Recommended)

1. Create a `.env` file in the `server/` directory:
   ```bash
   cd server
   cp .env.example .env
   ```

2. Edit `server/.env` and add your connection string:
   ```env
   DATABASE_URL=postgresql://postgres.zcpgprqeocumhgttqmhr:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

3. Run the setup script:
   ```bash
   node setup-database.js
   ```

4. You should see:
   ```
   ✅ Connected successfully!
   ✅ Tables created successfully!
   ✅ Found tables:
      - account
      - session
      - user
      - verification
   ✨ Database setup complete!
   ```

### Option B: Run SQL Manually in Supabase

If the script doesn't work, you can run the SQL manually:

1. Go to your Supabase project
2. Click **SQL Editor** in the sidebar
3. Click **New query**
4. Copy and paste the SQL from `server/setup-database.js` (lines 30-110)
5. Click **Run**

---

## ☁️ Step 3: Configure Railway

1. Go to your Railway project: https://railway.app
2. Click on your **server service**
3. Go to **Variables** tab
4. Add the following environment variables:

   **DATABASE_URL**
   ```
   postgresql://postgres.zcpgprqeocumhgttqmhr:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

   **SUPABASE_URL**
   ```
   https://zcpgprqeocumhgttqmhr.supabase.co
   ```

   **SUPABASE_ANON_KEY**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcGdwcnFlb2N1bWhndHRxbWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQwNjYsImV4cCI6MjA3NTQzMDA2Nn0.AelUwRIYOcA8itR6ihEllykmkPVJV7435gwTUENcdCM
   ```

5. Railway will automatically redeploy with the new configuration

---

## 🌐 Step 4: Configure Vercel (Client)

1. Go to your Vercel project
2. Go to **Settings** → **Environment Variables**
3. Add the following variables:

   **VITE_SUPABASE_URL**
   ```
   https://zcpgprqeocumhgttqmhr.supabase.co
   ```

   **VITE_SUPABASE_ANON_KEY**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcGdwcnFlb2N1bWhndHRxbWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQwNjYsImV4cCI6MjA3NTQzMDA2Nn0.AelUwRIYOcA8itR6ihEllykmkPVJV7435gwTUENcdCM
   ```

4. Redeploy your Vercel app

---

## ✅ Step 5: Test Authentication

1. Wait for Railway and Vercel to finish deploying (2-3 minutes)
2. Go to https://www.alamuna.art
3. Click **Sign In**
4. Click **Sign Up** and create a new account:
   - Email: test@example.com
   - Password: TestPassword123
   - Name: Test User
5. Sign in with the new account
6. You should see your name in the header!

### Verify Data Persistence

1. Sign out
2. **Trigger a Railway redeploy** (push a small change or manually redeploy)
3. Wait for redeploy to complete
4. Sign in again with the same credentials
5. ✅ **It should work!** Your account persisted across deployments!

---

## 🔍 Step 6: Verify Database in Supabase

1. Go to your Supabase project
2. Click **Table Editor** in the sidebar
3. You should see these tables:
   - `user` - User accounts
   - `session` - Active sessions
   - `account` - Authentication providers
   - `verification` - Email verification tokens

4. Click on the `user` table to see your registered users

---

## 🐛 Troubleshooting

### "Connection failed" error

- Check that your DATABASE_URL is correct
- Make sure you replaced `[YOUR-PASSWORD]` with your actual password
- Verify the connection string format is correct

### "Table does not exist" error

- Run the setup script again: `node setup-database.js`
- Or manually run the SQL in Supabase SQL Editor

### "Invalid credentials" after redeploy

- This means the database wasn't set up correctly
- Check Railway environment variables
- Verify DATABASE_URL is set correctly
- Check Railway logs for database connection errors

### Can't sign up

- Check browser console for errors
- Verify Vercel environment variables are set
- Check that CORS is configured correctly in server

---

## 📊 Database Schema

The setup creates these tables for Better Auth:

### `user` table
- `id` - Unique user ID
- `email` - User email (unique)
- `emailVerified` - Email verification status
- `name` - User display name
- `image` - Profile image URL
- `createdAt` - Account creation timestamp
- `updatedAt` - Last update timestamp

### `session` table
- `id` - Session ID
- `userId` - Reference to user
- `expiresAt` - Session expiration
- `token` - Session token (unique)
- `ipAddress` - Client IP
- `userAgent` - Client browser info

### `account` table
- `id` - Account ID
- `userId` - Reference to user
- `providerId` - Auth provider (email-password, google, etc.)
- `password` - Hashed password (for email/password auth)
- `accessToken` - OAuth access token
- `refreshToken` - OAuth refresh token

### `verification` table
- `id` - Verification ID
- `identifier` - Email or phone
- `value` - Verification code
- `expiresAt` - Code expiration

---

## 🎉 Success!

Once everything is set up:

✅ Users can sign up and sign in
✅ Sessions persist across server restarts
✅ User data is stored in Supabase PostgreSQL
✅ Activities show real usernames instead of "Anonymous"
✅ Authentication works seamlessly across deployments

---

## 📝 Notes

- **Free Tier Limits**: Supabase free tier includes 500MB database, which is plenty for this app
- **Backups**: Supabase automatically backs up your database (on paid tiers)
- **Scaling**: PostgreSQL can handle thousands of users easily
- **Security**: All passwords are hashed with bcrypt
- **Sessions**: Sessions expire after 30 days of inactivity

---

## 🔗 Useful Links

- Supabase Dashboard: https://zcpgprqeocumhgttqmhr.supabase.co
- Supabase Docs: https://supabase.com/docs
- Better Auth Docs: https://www.better-auth.com/docs
- Railway Dashboard: https://railway.app
- Vercel Dashboard: https://vercel.com

---

Need help? Check the troubleshooting section or review the server logs in Railway!

