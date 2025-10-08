import { createSignal } from 'solid-js';
import { supabase } from './supabase';

// Supabase Auth integration for SolidJS
// Using Supabase's built-in authentication (no server-side auth needed)
const [sessionData, setSessionData] = createSignal(null);
const [isLoading, setIsLoading] = createSignal(true);

// Check session on load
supabase.auth.getSession().then(({ data: { session } }) => {
  console.log('[Supabase Auth] Session loaded:', session);
  if (session) {
    setSessionData({ user: session.user, session });
  }
  setIsLoading(false);
}).catch((error) => {
  console.warn('[Supabase Auth] Failed to load session:', error.message);
  setSessionData(null);
  setIsLoading(false);
});

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase Auth] Auth state changed:', event, session);
  if (session) {
    setSessionData({ user: session.user, session });
  } else {
    setSessionData(null);
  }
});

// Export hooks
export const useSession = () => sessionData;
export const useIsLoading = () => isLoading;

export const useSignIn = () => async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    console.log('[Supabase Auth] Sign in successful:', data);
    if (data.session) {
      setSessionData({ user: data.user, session: data.session });
    }
    return { data, error: null };
  } catch (error) {
    console.error('[Supabase Auth] Sign in error:', error);
    return { data: null, error };
  }
};

export const useSignUp = () => async (email, password, name) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0]
        }
      }
    });

    if (error) throw error;

    console.log('[Supabase Auth] Sign up successful:', data);
    if (data.session) {
      setSessionData({ user: data.user, session: data.session });
    }
    return { data, error: null };
  } catch (error) {
    console.error('[Supabase Auth] Sign up error:', error);
    return { data: null, error };
  }
};

// Refresh session from server
export const refreshSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) throw error;

    console.log('[Supabase Auth] Session refreshed:', session);
    if (session) {
      setSessionData({ user: session.user, session });
      return { user: session.user, session };
    }
    return null;
  } catch (error) {
    console.error('[Supabase Auth] Failed to refresh session:', error);
    setSessionData(null);
    return null;
  }
};

export const useSignOut = () => async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSessionData(null);
  } catch (error) {
    console.error('[Supabase Auth] Sign out error:', error);
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
  // Supabase uses access_token
  return session?.session?.access_token || null;
};

export const session = sessionData;