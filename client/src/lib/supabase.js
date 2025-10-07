import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zcpgprqeocumhgttqmhr.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcGdwcnFlb2N1bWhndHRxbWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQwNjYsImV4cCI6MjA3NTQzMDA2Nn0.AelUwRIYOcA8itR6ihEllykmkPVJV7435gwTUENcdCM';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

console.log('[Supabase] Client initialized');
console.log('[Supabase] URL:', supabaseUrl);

