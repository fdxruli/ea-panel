import { useEffect } from 'react';
import {
  defaultSeoImageAlt,
  normalizeCanonicalUrl,
  resolveSeoImage,
  siteLocale,
  siteName,
  siteUrl,
} from '../seo/config';

const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large';
const NOINDEX_ROBOTS = 'noindex, nofollow, noarchive';
const MANAGED_SCHEMA_SELECTOR = 'script[data-seo-schema="true"]';

const ensureHeadElement = (selector, createElement) => {
  const existing = document.head.querySelector(selector);

  if (existing) {
    return existing;
  }

  const nextElement = createElement();
  document.head.appendChild(nextElement);
  return nextElement;
};

const setMetaTag = (selector, attributes, content) => {
  const element = ensureHeadElement(selector, () => {
    const meta = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => {
      meta.setAttribute(key, value);
    });
    return meta;
  });

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  element.setAttribute('content', content);
  return element;
};

const setLinkTag = (selector, attributes) => {
  const element = ensureHeadElement(selector, () => {
    const link = document.createElement('link');
    Object.entries(attributes).forEach(([key, value]) => {
      link.setAttribute(key, value);
    });
    return link;
  });

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
};

const removeManagedSchemas = () => {
  document.head.querySelectorAll(MANAGED_SCHEMA_SELECTOR).forEach((node) => node.remove());
};

const appendSchemas = (schemaMarkup) => {
  const entries = Array.isArray(schemaMarkup) ? schemaMarkup : [schemaMarkup];

  entries.filter(Boolean).forEach((schema) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seoSchema = 'true';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  });
};

export default function SEO({
  title,
  description,
  type = 'website',
  schemaMarkup,
  canonicalUrl,
  image,
  imageAlt,
  noindex = false,
}) {
  useEffect(() => {
    const resolvedTitle = title || siteName;
    const resolvedDescription = description || '';
    const resolvedCanonicalUrl = normalizeCanonicalUrl(
      canonicalUrl || window.location.pathname || siteUrl
    );
    const resolvedImage = resolveSeoImage(image);
    const resolvedImageAlt = imageAlt || defaultSeoImageAlt;
    const robotsValue = noindex ? NOINDEX_ROBOTS : DEFAULT_ROBOTS;

    document.title = resolvedTitle;

    setMetaTag('meta[name="description"]', { name: 'description' }, resolvedDescription);
    setMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, siteName);
    setMetaTag('meta[property="og:locale"]', { property: 'og:locale' }, siteLocale);
    setMetaTag('meta[property="og:type"]', { property: 'og:type' }, type);
    setMetaTag('meta[property="og:title"]', { property: 'og:title' }, resolvedTitle);
    setMetaTag('meta[property="og:description"]', { property: 'og:description' }, resolvedDescription);
    setMetaTag('meta[property="og:url"]', { property: 'og:url' }, resolvedCanonicalUrl);
    setMetaTag('meta[property="og:image"]', { property: 'og:image' }, resolvedImage);
    setMetaTag('meta[property="og:image:alt"]', { property: 'og:image:alt' }, resolvedImageAlt);
    setMetaTag('meta[property="og:image:width"]', { property: 'og:image:width' }, '1200');
    setMetaTag('meta[property="og:image:height"]', { property: 'og:image:height' }, '630');

    setMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, resolvedTitle);
    setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, resolvedDescription);
    setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, resolvedImage);
    setMetaTag('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt' }, resolvedImageAlt);

    setMetaTag('meta[name="robots"]', { name: 'robots' }, robotsValue);
    setMetaTag('meta[name="googlebot"]', { name: 'googlebot' }, robotsValue);
    setLinkTag('link[rel="canonical"]', { rel: 'canonical', href: resolvedCanonicalUrl });

    removeManagedSchemas();
    appendSchemas(schemaMarkup);

    return () => {
      removeManagedSchemas();
    };
  }, [canonicalUrl, description, image, imageAlt, noindex, schemaMarkup, title, type]);

  return null;
}
