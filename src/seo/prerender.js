const SEO_READY_EVENT = 'seo-ready';

export function notifySeoReady() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const dispatch = () => {
    window.__SEO_READY__ = true;
    document.dispatchEvent(new Event(SEO_READY_EVENT));
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(dispatch);
    return;
  }

  window.setTimeout(dispatch, 0);
}
