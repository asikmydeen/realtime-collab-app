import { createAuthClient } from 'better-auth/client';
import { createSignal } from 'solid-js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const authClient = createAuthClient({
  baseURL: API_URL
});

// Simple auth store for SolidJS
const [sessionData, setSessionData] = createSignal(null);

// Check session on load
authClient.getSession().then(session => {
  setSessionData(session);
}).catch(() => {
  setSessionData(null);
});

// Export hooks
export const useSession = () => sessionData;

export const useSignIn = () => async (email, password) => {
  try {
    const result = await authClient.signIn.email({ email, password });
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
    if (result.data) {
      setSessionData(result.data);
    }
    return result;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
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

export const session = sessionData;