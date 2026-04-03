import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { fetchPublicSeoRoutes } from './seo-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function resolveRequestPath(requestPathname) {
  const decodedPath = decodeURIComponent(requestPathname || '/');
  const absolutePath = path.join(distDir, decodedPath);

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    return absolutePath;
  }

  const htmlPath = `${absolutePath}.html`;
  if (fs.existsSync(htmlPath)) {
    return htmlPath;
  }

  const nestedIndexPath = path.join(absolutePath, 'index.html');
  if (fs.existsSync(nestedIndexPath)) {
    return nestedIndexPath;
  }

  if (path.extname(decodedPath)) {
    return null;
  }

  return path.join(distDir, 'index.html');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const filePath = resolveRequestPath(requestUrl.pathname);

      if (!filePath) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[extension] || 'application/octet-stream';

      fs.readFile(filePath, (error, content) => {
        if (error) {
          response.writeHead(500);
          response.end('Error serving file');
          return;
        }

        response.writeHead(200, { 'Content-Type': contentType });
        response.end(content);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('No se pudo levantar el servidor temporal de prerender.'));
        return;
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function getOutputPath(routePath) {
  if (routePath === '/') {
    return path.join(distDir, 'index.html');
  }

  return path.join(distDir, routePath.replace(/^\/+/, ''), 'index.html');
}

async function prerenderRoute(page, baseUrl, routePath) {
  const targetUrl = `${baseUrl}${routePath}`;

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForFunction(() => window.__SEO_READY__ === true, {
    timeout: 60000,
  });

  const html = await page.content();
  const outputPath = getOutputPath(routePath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `<!DOCTYPE html>\n${html}`);
}

async function prerenderPublicRoutes() {
  console.log('Iniciando prerender de rutas publicas...');

  const { allRoutes } = await fetchPublicSeoRoutes();
  const { server, baseUrl } = await startStaticServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(() => {
      window.__SEO_READY__ = false;
      document.addEventListener('seo-ready', () => {
        window.__SEO_READY__ = true;
      });
    });

    for (const route of allRoutes) {
      console.log(`Prerenderizando ${route.path}...`);
      await prerenderRoute(page, baseUrl, route.path);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Prerender completado.');
}

prerenderPublicRoutes().catch((error) => {
  console.error('Error durante el prerender:', error);
  globalThis.process.exit(1);
});
