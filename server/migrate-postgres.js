import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.log('[Migration] ⏭️  No DATABASE_URL - skipping migration');
  process.exit(0);
}

console.log('[Migration] 🔧 Running PostgreSQL migrations...');
console.log('[Migration] Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

// Parse connection string to force IPv4
// Supabase direct connection uses IPv6 which Railway doesn't support
// Use the pooler connection string instead (aws-0-*.pooler.supabase.com)
const connectionString = process.env.DATABASE_URL;

// Check if using direct connection (db.*.supabase.co) and warn
if (connectionString.includes('db.') && connectionString.includes('.supabase.co')) {
  console.warn('[Migration] ⚠️  WARNING: Using direct connection URL');
  console.warn('[Migration] ⚠️  Railway may not support IPv6');
  console.warn('[Migration] ⚠️  Consider using Session Pooler URL instead');
  console.warn('[Migration] ⚠️  Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
  try {
    console.log('[Migration] 📡 Connecting to PostgreSQL...');

    // Create user table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        name TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        image TEXT
      );
    `);
    console.log('[Migration] ✅ Created user table');

    // Create session table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "expiresAt" TIMESTAMP NOT NULL,
        token TEXT NOT NULL UNIQUE,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[Migration] ✅ Created session table');

    // Create account table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "account" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "expiresAt" TIMESTAMP,
        password TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("providerId", "accountId")
      );
    `);
    console.log('[Migration] ✅ Created account table');

    // Create verification table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "verification" (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[Migration] ✅ Created verification table');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"("userId");
      CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
      CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"("userId");
      CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);
    `);
    console.log('[Migration] ✅ Created indexes');

    console.log('[Migration] ✅ PostgreSQL migration completed successfully!');
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error.message);
    console.error('[Migration] Error details:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log('[Migration] 🎉 All migrations complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Migration] 💥 Migration failed:', error);
    process.exit(1);
  });
