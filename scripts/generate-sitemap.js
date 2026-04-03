import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchPublicSeoRoutes } from './seo-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateSitemap() {
  console.log('Iniciando generacion de sitemap...');

  const { siteUrl, productRoutes, allRoutes } = await fetchPublicSeoRoutes();

  console.log(`Se encontraron ${productRoutes.length} rutas publicas de producto.`);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  allRoutes.forEach((route) => {
    xml += `
  <url>
    <loc>${siteUrl}${route.path === '/' ? '' : route.path}</loc>
    <priority>${route.priority}</priority>
    <changefreq>${route.changefreq}</changefreq>
${route.lastmod ? `    <lastmod>${route.lastmod}</lastmod>\n` : ''}  </url>`;
  });

  xml += `
</urlset>`;

  const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');

  try {
    fs.writeFileSync(sitemapPath, xml);
    console.log(`Sitemap generado con exito en: ${sitemapPath}`);
  } catch (error) {
    console.error('Error escribiendo el sitemap:', error);
    globalThis.process.exit(1);
  }
}

generateSitemap().catch((error) => {
  console.error(error.message);
  globalThis.process.exit(1);
});
