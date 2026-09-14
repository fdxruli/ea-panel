import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

const sql = `
SELECT 
    t.typname AS type_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type,
    a.attnum AS column_position
FROM pg_type t
JOIN pg_attribute a ON a.attrelid = t.typrelid
WHERE t.typname = 'cart_item'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;
`;
sb.rpc('execute_sql', { sql }).then(r => console.log('DATA:', r.data, 'ERROR:', r.error)).catch(e => console.error(e));
