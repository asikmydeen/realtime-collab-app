import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Generate a secure secret if not provided
const authSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

// Use SQLite for auth data (Better Auth works best with SQL databases)
let db;
let auth;
let authInitialized = false;

try {
  db = new Database(join(__dirname, '..', 'auth.db'));
  console.log('[Auth] SQLite database initialized');
} catch (error) {
  console.error('[Auth] Failed to initialize SQLite database:', error);
}

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
    auth = betterAuth({
      database: db,
      baseURL: getBaseURL(),
      secret: authSecret,

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false
      },

      session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        cookieName: 'world-art-session'
      },

      user: {
        additionalFields: {
          displayName: {
            type: 'string',
            required: false,
            defaultValue: (user) => user.email ? user.email.split('@')[0] : 'Anonymous'
          }
        }
      },

      trustedOrigins: [
        process.env.CLIENT_URL || 'http://localhost:3000',
        'http://localhost:5173', // Vite dev server
        'https://realtime-collab-app.vercel.app',
        'https://www.alamuna.art' // Production domain
      ]
    });
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
      res.setHeader(key, value);
    });

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
    return null;
  }

  try {
    const session = await auth.api.getSession({ headers: { authorization: `Bearer ${token}` } });
    return session;
  } catch (error) {
    console.error('[Auth] Session verification failed:', error);
    return null;
  }
};

export { auth, authInitialized };