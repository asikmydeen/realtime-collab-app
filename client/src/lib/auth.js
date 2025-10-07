import { createAuthClient } from 'better-auth/client';
import { createSignal } from 'solid-js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create auth client with localStorage for cross-origin support
export const authClient = createAuthClient({
  baseURL: API_URL,
  // Use localStorage instead of cookies for cross-origin
  fetchOptions: {
    credentials: 'include'
  }
});

// Simple auth store for SolidJS
const [sessionData, setSessionData] = createSignal(null);
const [isLoading, setIsLoading] = createSignal(true);

// Check session on load - silently fail if auth service is unavailable
authClient.getSession().then(response => {
  console.log('[Auth] Session loaded:', response);
  // Better Auth returns { data: { user, session }, error }
  setSessionData(response.data);
  setIsLoading(false);
}).catch((error) => {
  console.warn('[Auth] Auth service unavailable, continuing without authentication:', error.message);
  setSessionData(null);
  setIsLoading(false);
});

// Export hooks
export const useSession = () => sessionData;
export const useIsLoading = () => isLoading;

export const useSignIn = () => async (email, password) => {
  try {
    const result = await authClient.signIn.email({ email, password });
    console.log('[Auth] Sign in result:', result);
    if (result.data) {
      setSessionData(result.data);
    }
    return result;
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const useSignUp = () => async (email, password, name) => {
  try {
    const result = await authClient.signUp.email({ email, password, name });
    console.log('[Auth] Sign up result:', result);
    if (result.data) {
      setSessionData(result.data);
    }
    return result;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};

// Refresh session from server
export const refreshSession = async () => {
  try {
    const response = await authClient.getSession();
    console.log('[Auth] Session refreshed:', response);
    // Better Auth returns { data: { user, session }, error }
    setSessionData(response.data);
    return response.data;
  } catch (error) {
    console.error('[Auth] Failed to refresh session:', error);
    setSessionData(null);
    return null;
  }
};

export const useSignOut = () => async () => {
  try {
    await authClient.signOut();
    setSessionData(null);
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

export const useUser = () => {
  const session = sessionData();
  return session?.user || null;
};

// Get the session token for WebSocket authentication
export const getSessionToken = () => {
  const session = sessionData();
  return session?.session?.token || null;
};

export const session = sessionData;