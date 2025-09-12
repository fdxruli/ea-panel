const SUPABASE_URL = 'https://utibrjxslqwoifpsajaj.supabase.co'; // Reemplaza con tu URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0aWJyanhzbHF3b2lmcHNhamFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MzA5MjEsImV4cCI6MjA3MzIwNjkyMX0.UpjmtZ3dfpMuEFWONqGPsuALKOKnQXprNCavDmWKwkU'; // Reemplaza con tu llave anónima

/**
 * La librería de Supabase (el script que agregaste en el HTML) crea
 * un objeto global llamado `supabase`.
 *
 * Usamos ese objeto `supabase` global para llamar a la función `createClient`.
 *
 * ¡Importante! Guardamos el resultado en una nueva constante con un nombre
 * diferente, como `supabaseClient`, para evitar el error de referencia.
 */
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);