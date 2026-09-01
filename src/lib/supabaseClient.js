import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetchWithTimeout';
import { wrapSupabaseClient } from './supabaseWrapper';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xvstqhvooabljhhfmuas.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2c3RxaHZvb2FibGpoaGZtdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzM3MTYsImV4cCI6MjA3NDA0OTcxNn0.Chn3b255Bm7FpHj5Vld7G5aoui4lj1wT4HPoF6u5kVQ';

const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: fetchWithTimeout,
  },
});

export const supabase = wrapSupabaseClient(supabaseClient);
