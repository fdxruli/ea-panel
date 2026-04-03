import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createSlug, siteUrl, staticPublicRoutes } from '../src/seo/config.js';

dotenv.config();

const SUPABASE_URL = globalThis.process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = globalThis.process.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('No se encontraron VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en las variables de entorno.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  return supabaseClient;
}

function dedupeProductRoutes(products = []) {
  const seenSlugs = new Set();

  return products.reduce((routes, product) => {
    const slug = createSlug(product.name);

    if (!slug || seenSlugs.has(slug)) {
      return routes;
    }

    seenSlugs.add(slug);
    routes.push({
      type: 'product',
      path: `/producto/${slug}`,
      priority: '0.8',
      changefreq: 'daily',
      lastmod: product.created_at
        ? new Date(product.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    });

    return routes;
  }, []);
}

export async function fetchPublicSeoRoutes() {
  const supabase = getSupabaseClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('name, created_at')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Error conectando con Supabase: ${error.message}`);
  }

  const staticRoutes = staticPublicRoutes.map((route) => ({
    type: 'static',
    path: route.path,
    priority: route.priority,
    changefreq: route.changefreq,
  }));

  const productRoutes = dedupeProductRoutes(products || []);

  return {
    siteUrl,
    staticRoutes,
    productRoutes,
    allRoutes: [...staticRoutes, ...productRoutes],
  };
}
