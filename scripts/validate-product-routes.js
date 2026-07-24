import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercelConfigUrl = new URL('../vercel.json', import.meta.url);
const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigUrl, 'utf8'));
const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];

const productNotFoundRewrite = rewrites.find((rewrite) => (
  typeof rewrite?.source === 'string'
  && rewrite.source.startsWith('/producto/')
  && rewrite.destination === '/api/product-not-found'
));

assert.equal(
  productNotFoundRewrite,
  undefined,
  'Las rutas /producto/* no deben enviarse incondicionalmente a product-not-found.'
);

const spaFallback = rewrites.find((rewrite) => rewrite?.destination === '/index.html');

assert.ok(spaFallback, 'Debe existir un fallback SPA hacia /index.html.');
assert.equal(
  spaFallback.source,
  '/((?!api/|assets/|.*\\..*).*)',
  'El fallback SPA debe cubrir rutas de producto sin interceptar API, assets o archivos.'
);

console.log('Configuración de rutas de producto validada correctamente.');
