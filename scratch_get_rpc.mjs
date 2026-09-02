import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
const sql = `
SELECT pg_get_functiondef(p.oid) as def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'get_advanced_dashboard_stats'
AND n.nspname = 'public';
`;
sb.rpc('execute_sql', { sql })
  .then(r => console.log('Result:', JSON.stringify(r.data, null, 2)))
  .catch(e => console.error(e));
