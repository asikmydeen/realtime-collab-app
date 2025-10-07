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

console.log('[Supabase] Client initialized');
console.log('[Supabase] URL:', supabaseUrl);

