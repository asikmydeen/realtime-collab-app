import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database
const db = new Database(join(__dirname, 'auth.db'));

console.log('[Migration] Creating Better Auth tables...');

// Create user table
db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    image TEXT
  );
`);

console.log('[Migration] ✓ Created user table');

// Create session table
db.exec(`
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );
`);

console.log('[Migration] ✓ Created session table');

// Create account table (for OAuth providers, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    expiresAt INTEGER,
    password TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );
`);

console.log('[Migration] ✓ Created account table');

// Create verification table
db.exec(`
  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);

console.log('[Migration] ✓ Created verification table');

// Create indexes for better performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
  CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
  CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
  CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
`);

console.log('[Migration] ✓ Created indexes');

db.close();

console.log('[Migration] ✅ Database migration completed successfully!');
console.log('[Migration] Database location:', join(__dirname, 'auth.db'));

