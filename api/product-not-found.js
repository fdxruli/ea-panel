const HOME_URL = 'https://ea-panel.vercel.app/';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(slug = '') {
  const safeSlug = escapeHtml(slug.replace(/[-_]+/g, ' ').trim());
  const title = 'Producto no disponible | Entre Alas';
  const description = 'El producto que buscas ya no esta disponible o fue retirado del menu de Entre Alas.';

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="googlebot" content="noindex, nofollow, noarchive" />
    <meta property="og:site_name" content="Entre Alas" />
    <meta property="og:locale" content="es_MX" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${HOME_URL}" />
    <meta property="og:image" content="${HOME_URL}banner-social.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${HOME_URL}banner-social.png" />
    <style>
      :root {
        color-scheme: light;
        --bg: #fff7ef;
        --surface: #ffffff;
        --text: #1e1b18;
        --muted: #6c635a;
        --accent: #d14a2f;
        --accent-dark: #9f2f1a;
        --border: rgba(30, 27, 24, 0.1);
        font-family: "Segoe UI", system-ui, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(209, 74, 47, 0.18), transparent 34%),
          linear-gradient(180deg, #fff9f2 0%, var(--bg) 100%);
        color: var(--text);
      }

      main {
        width: min(92vw, 640px);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 28px;
        padding: 40px 28px;
        box-shadow: 0 24px 70px rgba(83, 48, 28, 0.12);
      }

      .eyebrow {
        margin: 0 0 12px;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1;
      }

      p {
        margin: 0 0 14px;
        color: var(--muted);
        line-height: 1.6;
      }

      .slug {
        display: inline-flex;
        margin: 12px 0 24px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(209, 74, 47, 0.08);
        color: var(--accent-dark);
        font-size: 0.92rem;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
      }

      a {
        text-decoration: none;
      }

      .primary,
      .secondary {
        border-radius: 999px;
        padding: 14px 18px;
        font-weight: 700;
      }

      .primary {
        background: var(--accent);
        color: #fff;
      }

      .secondary {
        border: 1px solid var(--border);
        color: var(--text);
        background: transparent;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Producto no disponible</p>
      <h1>Este producto ya no esta en el menu.</h1>
      <p>Puede que haya sido desactivado desde administracion o retirado temporalmente del catalogo publico.</p>
      <p>Te llevamos de vuelta al menu para que elijas otra opcion disponible.</p>
      ${safeSlug ? `<div class="slug">Referencia: ${safeSlug}</div>` : ''}
      <div class="actions">
        <a class="primary" href="/">Ver menu disponible</a>
        <a class="secondary" href="${HOME_URL}terminos">Ver terminos</a>
      </div>
    </main>
  </body>
</html>`;
}

export default function handler(request, response) {
  const slug = request.query?.slug;
  const slugValue = Array.isArray(slug) ? slug[0] : slug;

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.status(404).send(buildHtml(slugValue));
}
