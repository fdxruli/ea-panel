export const siteName = 'Entre Alas';
export const siteUrl = 'https://ea-panel.vercel.app';
export const siteLocale = 'es_MX';
const siteLanguage = 'es-MX';
export const defaultSeoImagePath = '/banner-social.png';
export const defaultSeoImageAlt = 'Entre Alas, alitas y boneless a domicilio';
export const homeTitle = 'Alitas y Boneless a Domicilio en La Trinitaria, Chiapas | Entre Alas';
export const homeDescription = 'Pide alitas, boneless, hamburguesas y snacks a domicilio en La Trinitaria, Chiapas. Ordena en linea con Entre Alas y recibe rapido en Ejido 20 de Abril y alrededores.';

const businessAddress = {
  '@type': 'PostalAddress',
  streetAddress: 'Ejido 20 de Abril',
  addressLocality: 'La Trinitaria',
  addressRegion: 'Chiapas',
  postalCode: '30165',
  addressCountry: 'MX',
};

const businessGeo = {
  '@type': 'GeoCoordinates',
  latitude: '15.852133',
  longitude: '-91.977518',
};

export const staticPublicRoutes = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/terminos', priority: '0.3', changefreq: 'monthly' },
];

export function createSlug(text = '') {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function ensureLeadingSlash(pathname = '/') {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function joinSiteUrl(pathname = '/') {
  return `${siteUrl}${ensureLeadingSlash(pathname)}`;
}

export function normalizeCanonicalUrl(url) {
  if (!url) {
    return siteUrl;
  }

  try {
    const normalized = new URL(url, siteUrl);
    normalized.hash = '';
    normalized.search = '';

    if (normalized.pathname !== '/' && normalized.pathname.endsWith('/')) {
      normalized.pathname = normalized.pathname.replace(/\/+$/, '');
    }

    return normalized.toString();
  } catch {
    return joinSiteUrl(url);
  }
}

export function resolveSeoImage(image) {
  if (!image) {
    return joinSiteUrl(defaultSeoImagePath);
  }

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  return joinSiteUrl(image);
}

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: siteName,
  url: siteUrl,
  inLanguage: siteLanguage,
};

export const restaurantSchema = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  name: siteName,
  description: homeDescription,
  url: siteUrl,
  telephone: '+529631834700',
  image: [joinSiteUrl(defaultSeoImagePath)],
  address: businessAddress,
  geo: businessGeo,
  areaServed: {
    '@type': 'GeoCircle',
    geoMidpoint: businessGeo,
    geoRadius: '5000',
  },
  servesCuisine: ['Alitas', 'Boneless', 'Hamburguesas', 'Snacks'],
  keywords: 'alitas, boneless, hamburguesas, snacks, comida rapida, La Trinitaria, Chiapas',
  priceRange: '$$',
  hasMenu: {
    '@type': 'Menu',
    name: 'Menu Principal',
    url: siteUrl,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ],
      opens: '09:00',
      closes: '20:00',
    },
  ],
  potentialAction: {
    '@type': 'OrderAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: siteUrl,
      inLanguage: siteLanguage,
      actionPlatform: [
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/IOSPlatform',
        'https://schema.org/AndroidPlatform',
      ],
    },
    deliveryMethod: [
      'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet',
    ],
  },
};
