import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Generate a secure secret if not provided
const authSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

// Use SQLite for auth data (Better Auth works best with SQL databases)
const db = new Database(join(__dirname, '..', 'auth.db'));

// Create Better Auth instance
export const auth = betterAuth({
  database: db,
  baseURL: process.env.AUTH_BASE_URL || 'http://localhost:8080',
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
    'https://realtime-collab-app.vercel.app'
  ]
});

// Export auth handlers for Express
export const authHandler = async (req, res) => {
  return auth.handler(req, res);
};

// Helper to verify session token
export const verifySession = async (token) => {
  try {
    const session = await auth.api.getSession({ headers: { authorization: `Bearer ${token}` } });
    return session;
  } catch (error) {
    console.error('[Auth] Session verification failed:', error);
    return null;
  }
};