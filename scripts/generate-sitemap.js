import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Cargar variables de entorno (.env)
dotenv.config();

// Configurar rutas para ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CONFIGURACIÓN ---
const BASE_URL = 'https://ea-panel.vercel.app';
// Asegúrate de que estas variables se llamen igual que en tu .env local y en Vercel
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY; 

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: No se encontraron VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en las variables de entorno.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tu función exacta de creación de Slugs para asegurar consistencia
const createSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

async function generateSitemap() {
  console.log('🔄 Iniciando generación de Sitemap...');

  // 1. Obtener productos de Supabase
  // Asumo que tu tabla se llama 'products'. Si tienes un campo 'is_active', úsalo.
  const { data: products, error } = await supabase
    .from('products')
    .select('name, updated_at') // Necesitamos nombre y fecha de actualización
    .eq('is_active', true);    // Opcional: Solo productos activos

  if (error) {
    console.error('❌ Error conectando con Supabase:', error.message);
    process.exit(1);
  }

  console.log(`📦 Se encontraron ${products?.length || 0} productos activos.`);

  // 2. Definir rutas estáticas (Home, Términos, etc.)
  const staticRoutes = [
    { url: '', priority: '1.0', changefreq: 'weekly' },       // Home
    { url: '/terminos', priority: '0.3', changefreq: 'yearly' }
  ];

  // 3. Construir el XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  // -> Agregar estáticas
  staticRoutes.forEach(route => {
    xml += `
  <url>
    <loc>${BASE_URL}${route.url}</loc>
    <priority>${route.priority}</priority>
    <changefreq>${route.changefreq}</changefreq>
  </url>`;
  });

  // -> Agregar productos dinámicos
  if (products) {
    products.forEach(product => {
      const slug = createSlug(product.name);
      // Si tienes updated_at úsalo, si no, usa la fecha de hoy
      const lastMod = product.updated_at 
        ? new Date(product.updated_at).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0];
      
      xml += `
  <url>
    <loc>${BASE_URL}/producto/${slug}</loc>
    <priority>0.8</priority>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
  </url>`;
    });
  }

  xml += `
</urlset>`;

  // 4. Guardar el archivo en la carpeta public
  const publicPath = path.resolve(__dirname, '../public/sitemap.xml');
  
  try {
    fs.writeFileSync(publicPath, xml);
    console.log(`✅ Sitemap generado con éxito en: ${publicPath}`);
  } catch (err) {
    console.error('❌ Error escribiendo el archivo:', err);
  }
}

generateSitemap();