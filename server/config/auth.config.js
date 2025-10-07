import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import { Kysely, PostgresDialect } from 'kysely';
import postgres from 'postgres';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Generate a secure secret if not provided
const authSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

// Database configuration - use PostgreSQL in production, SQLite for local dev
let db;
let auth;
let authInitialized = false;

// Check if PostgreSQL is configured (production)
const usePostgres = !!process.env.DATABASE_URL;

console.log('='.repeat(60));
console.log('[Auth] 🔧 Initializing Authentication System');
console.log('[Auth] Database mode:', usePostgres ? 'PostgreSQL (Production)' : 'SQLite (Local Dev)');
console.log('[Auth] Environment:', process.env.NODE_ENV || 'development');

if (usePostgres) {
  try {
    console.log('[Auth] 🔧 Setting up PostgreSQL with Kysely...');
    console.log('[Auth] Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')); // Hide password

    // Create postgres.js client
    const sql = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 10, // Maximum number of connections
      idle_timeout: 20,
      connect_timeout: 10
    });

    // Create Kysely instance with PostgreSQL dialect
    db = new Kysely({
      dialect: new PostgresDialect({
        postgres: sql
      })
    });

    console.log('[Auth] ✅ Kysely PostgreSQL adapter created');

    // Test the connection
    db.selectFrom('pg_catalog.pg_tables')
      .select('tablename')
      .limit(1)
      .execute()
      .then(() => {
        console.log('[Auth] ✅ PostgreSQL connection test successful');
      })
      .catch((err) => {
        console.error('[Auth] ❌ PostgreSQL connection test failed:', err.message);
      });
  } catch (error) {
    console.error('[Auth] ❌ Failed to initialize PostgreSQL:', error.message);
    console.error('[Auth] Error details:', error);
  }
} else {
  // Use SQLite for local development
  try {
    db = new Database(join(__dirname, '..', 'auth.db'));
    console.log('[Auth] ✅ SQLite database initialized (local dev)');
  } catch (error) {
    console.error('[Auth] ❌ Failed to initialize SQLite database:', error);
  }
}
console.log('='.repeat(60));

// Determine base URL from environment
const getBaseURL = () => {
  if (process.env.AUTH_BASE_URL) {
    return process.env.AUTH_BASE_URL;
  }
  // Default to localhost with the correct port
  const port = process.env.PORT || 3001;
  return `http://localhost:${port}`;
};

// Create Better Auth instance
try {
  if (db) {
    const authConfig = {
      database: db, // Pass connection string for PostgreSQL or Database instance for SQLite
      baseURL: getBaseURL(),
      secret: authSecret,

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false
      },

      session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5 // 5 minutes
        }
      },

      user: {
        additionalFields: {
          displayName: {
            type: 'string',
            required: false
          }
        }
      },

      trustedOrigins: [
        process.env.CLIENT_URL || 'http://localhost:3000',
        'http://localhost:5173', // Vite dev server
        'https://realtime-collab-app.vercel.app',
        'https://www.alamuna.art' // Production domain
      ],

      // Advanced options
      advanced: {
        useSecureCookies: process.env.NODE_ENV === 'production',
        generateId: () => crypto.randomBytes(16).toString('hex')
      }
    };

    console.log('[Auth] 🔧 Creating Better Auth instance...');
    console.log('[Auth] Database type:', usePostgres ? 'PostgreSQL (Kysely adapter)' : 'SQLite (instance)');

    auth = betterAuth(authConfig);
    authInitialized = true;
    console.log('[Auth] Better Auth initialized successfully');
  } else {
    console.warn('[Auth] Better Auth disabled - database not available');
  }
} catch (error) {
  console.error('[Auth] Failed to initialize Better Auth:', error);
  console.warn('[Auth] Continuing without authentication');
}

// Export auth handlers for Express
export const authHandler = async (req, res) => {
  if (!authInitialized || !auth) {
    return res.status(503).json({
      error: 'Authentication service unavailable',
      message: 'Auth is disabled or not initialized'
    });
  }

  try {
    // Better Auth expects a Web Request, but we're using Express
    // We need to construct the full URL from the request
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.originalUrl || req.url}`;

    console.log('[Auth] Processing request:', {
      method: req.method,
      url: url,
      headers: {
        host: req.headers.host,
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'x-forwarded-proto': req.headers['x-forwarded-proto']
      }
    });

    // Create a Web Request object
    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' ? JSON.stringify(req.body) : undefined
    });

    // Call Better Auth handler
    const response = await auth.handler(webRequest);

    // Convert Web Response to Express response
    res.status(response.status);

    // Copy headers
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        res.setHeader(key, value);
      }
    });

    // Handle Set-Cookie headers separately (can have multiple values)
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    if (setCookieHeaders.length > 0) {
      const modifiedCookies = setCookieHeaders.map(cookie => {
        // Modify cookie to include SameSite=None and Secure
        let modifiedCookie = cookie;

        // Replace SameSite=Lax or SameSite=Strict with SameSite=None
        modifiedCookie = modifiedCookie.replace(/SameSite=(Lax|Strict)/gi, 'SameSite=None');

        // Add SameSite=None if not present
        if (!modifiedCookie.includes('SameSite')) {
          modifiedCookie += '; SameSite=None';
        }

        // Add Secure if not present
        if (!modifiedCookie.includes('Secure')) {
          modifiedCookie += '; Secure';
        }

        return modifiedCookie;
      });

      res.setHeader('Set-Cookie', modifiedCookies);
    }

    // Send body
    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error('[Auth] Handler error:', error);
    throw error;
  }
};

// Helper to verify session token
export const verifySession = async (token) => {
  if (!authInitialized || !auth) {
    console.log('[Auth] ❌ Auth not initialized');
    return null;
  }

  try {
    console.log('[Auth] 🔍 Verifying token:', token.substring(0, 10) + '...');

    // Better Auth expects the session token in a cookie, but for WebSocket
    // we need to verify it manually. Create a mock request with the token.
    const mockRequest = new Request('http://localhost/api/auth/get-session', {
      headers: {
        'cookie': `better-auth.session_token=${token}`
      }
    });

    const result = await auth.api.getSession({
      headers: mockRequest.headers
    });

    console.log('[Auth] 🔍 Session result type:', typeof result);
    console.log('[Auth] 🔍 Session result keys:', result ? Object.keys(result) : 'null');

    // Better Auth returns { session, user } structure
    if (result && result.session && result.user) {
      console.log('[Auth] ✅ Session valid for user:', result.user.id, result.user.name || result.user.email);
      return result;
    } else if (result && result.user) {
      // Sometimes it might just return { user }
      console.log('[Auth] ✅ Session valid for user (no session object):', result.user.id, result.user.name || result.user.email);
      return result;
    } else {
      console.log('[Auth] ❌ Session invalid or expired - result:', JSON.stringify(result));
      return null;
    }
  } catch (error) {
    console.error('[Auth] ❌ Session verification error:', error.message);
    console.error('[Auth] Error stack:', error.stack);
    return null;
  }
};

export { auth, authInitialized };