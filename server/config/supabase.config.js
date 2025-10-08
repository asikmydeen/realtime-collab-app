import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://zcpgprqeocumhgttqmhr.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcGdwcnFlb2N1bWhndHRxbWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQwNjYsImV4cCI6MjA3NTQzMDA2Nn0.AelUwRIYOcA8itR6ihEllykmkPVJV7435gwTUENcdCM';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // Server-side doesn't need session persistence
    detectSessionInUrl: false
  }
});

// Test connection
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('_test').select('*').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist (expected)
      console.log('[Supabase] Connection test - table not found (expected)');
    } else {
      console.log('✅ [Supabase] Connected successfully');
    }
    return true;
  } catch (error) {
    console.error('❌ [Supabase] Connection failed:', error.message);
    return false;
  }
}

// Helper function to check if a table exists
export async function tableExists(tableName) {
  try {
    const { error } = await supabase.from(tableName).select('*').limit(1);
    return !error || error.code !== 'PGRST116';
  } catch (error) {
    return false;
  }
}

/**
 * Verify a user's session token
 * @param {string} token - JWT token from client
 * @returns {Promise<{user: object} | null>}
 */
export async function verifySession(token) {
  if (!token) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('[Supabase Auth] ❌ Invalid token:', error?.message);
      return null;
    }

    console.log('[Supabase Auth] ✅ User verified:', user.email);
    return { user };
  } catch (error) {
    console.error('[Supabase Auth] ❌ Error verifying session:', error);
    return null;
  }
}

console.log('[Supabase] Client initialized');
console.log('[Supabase] URL:', supabaseUrl);
