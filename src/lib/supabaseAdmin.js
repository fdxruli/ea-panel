import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetchWithTimeout';
import { wrapSupabaseClient } from './supabaseWrapper';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Cliente solo para operaciones de administrador
const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    global: {
        fetch: fetchWithTimeout,
    },
});

export const supabaseAdmin = wrapSupabaseClient(supabaseAdminClient);
