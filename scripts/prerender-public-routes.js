import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

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

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    });
  } catch (err) {
    console.warn(`[Prerender] Advertencia en navegación a ${routePath}: ${err.message}`);
  }

  try {
    await page.waitForFunction(() => window.__SEO_READY__ === true, {
      timeout: 3000,
    });
  } catch {
    // Si no emite seo-ready a tiempo, continuar con el HTML disponible
  }

  const html = await page.content();
  const outputPath = getOutputPath(routePath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `<!DOCTYPE html>\n${html}`);
}

async function prerenderPublicRoutes() {
  if (process.env.VERCEL === '1' || process.env.SKIP_PRERENDER === '1') {
    console.log('Entorno Vercel o SKIP_PRERENDER detectado. Se omite el prerender publico.');
    return;
  }

  console.log('Iniciando prerender de rutas publicas...');

  let server;
  let browser;
  let tempUserDataDir;

  try {
    const [{ default: puppeteer }, { fetchPublicSeoRoutes }] = await Promise.all([
      import('puppeteer'),
      import('./seo-routes.js'),
    ]);
    const { allRoutes } = await fetchPublicSeoRoutes();
    const serverInfo = await startStaticServer();
    server = serverInfo.server;
    const baseUrl = serverInfo.baseUrl;
    
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `ea-prerender-${Date.now()}-`));
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: tempUserDataDir,
      timeout: 10000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-sync',
        '--remote-debugging-port=0',
      ],
    });

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
      try {
        await prerenderRoute(page, baseUrl, route.path);
      } catch (routeError) {
        console.warn(`Aviso: No se pudo prerenderizar ${route.path}: ${routeError.message}`);
      }
    }

    console.log('Prerender completado.');
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      }).catch(() => {});
    }
    if (tempUserDataDir) {
      try {
        fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      } catch {
        // El directorio temporal ya puede haber sido eliminado por el sistema.
      }
    }
  }
}

prerenderPublicRoutes()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.warn('Advertencia durante el prerender local (el build de la app continua):', error.message);
    process.exit(0);
  });
