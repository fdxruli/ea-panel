import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetchWithTimeout.js';
import { wrapSupabaseClient } from './supabaseWrapper.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xvstqhvooabljhhfmuas.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2c3RxaHZvb2FibGpoZ2ZtdSIsImlhdCI6MTc1ODQ3MzcxNiwiZXhwIjoyMDc0MDQ5NzEwfQ';

const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: fetchWithTimeout,
  },
});

export const supabase = wrapSupabaseClient(supabaseClient);
