const MOBILE_BREAKPOINT = 768;
const DEFAULT_DESTINATION_SELECTOR = '[data-cart-anchor="true"]';

const MOTION_PROFILES = {
  default: {
    flySize: 72,
    startSize: 72,
    durationMs: 700,
    peakLift: 18,
    midScale: 0.9,
    endScale: 0.1,
    curveProgress: 0.42,
  },
  'compact-mobile': {
    flySize: 40,
    startSize: 36,
    durationMs: 600,
    peakLift: 14,
    midScale: 0.84,
    endScale: 0.16,
    curveProgress: 0.38,
  },
};

const getDefaultFallbackDestination = () => ({
  x: window.innerWidth / 2,
  y: window.innerHeight - 92,
});

const isRectVisible = (rect) => (
  rect.width > 0 &&
  rect.height > 0 &&
  rect.bottom > 0 &&
  rect.right > 0 &&
  rect.top < window.innerHeight &&
  rect.left < window.innerWidth
);

const getRectCenter = (rect) => ({
  x: rect.left + (rect.width / 2),
  y: rect.top + (rect.height / 2),
});

const resolveDestinationRect = (destinationSelector, isMobile) => {
  const visibleRects = Array.from(document.querySelectorAll(destinationSelector))
    .map((anchor) => anchor.getBoundingClientRect())
    .filter(isRectVisible);

  if (visibleRects.length === 0) {
    return null;
  }

  return visibleRects.reduce((selectedRect, rect) => {
    if (!selectedRect) {
      return rect;
    }

    const currentCenterY = rect.top + (rect.height / 2);
    const selectedCenterY = selectedRect.top + (selectedRect.height / 2);

    if (isMobile) {
      return currentCenterY > selectedCenterY ? rect : selectedRect;
    }

    return currentCenterY < selectedCenterY ? rect : selectedRect;
  }, null);
};

/**
 * Ejecuta la animacion de vuelo de un producto hacia el carrito.
 */
export const animateToCart = ({
  originElement,
  imgSrc,
  className = 'global-fly-to-cart',
  flySize,
  destinationSelector = DEFAULT_DESTINATION_SELECTOR,
  fallbackDestination,
  safeTimeoutMs,
  motionProfile = 'default',
}) => {
  if (!originElement || !imgSrc) {
    return false;
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }

  const profile = MOTION_PROFILES[motionProfile] || MOTION_PROFILES.default;
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const originRect = originElement.getBoundingClientRect();

  if (originRect.width === 0 || originRect.height === 0) {
    return false;
  }

  const destinationRect = resolveDestinationRect(destinationSelector, isMobile);
  const resolvedFallbackDestination = fallbackDestination ?? getDefaultFallbackDestination();

  let destinationPoint = null;

  if (destinationRect) {
    destinationPoint = getRectCenter(destinationRect);
  } else if (!isMobile && resolvedFallbackDestination) {
    destinationPoint = resolvedFallbackDestination;
  } else {
    return false;
  }

  const resolvedFlySize = typeof flySize === 'number' ? flySize : profile.flySize;
  const resolvedStartSize = Math.min(profile.startSize ?? resolvedFlySize, resolvedFlySize);
  const startScale = resolvedStartSize / resolvedFlySize;
  const originCenter = getRectCenter(originRect);
  const startX = originCenter.x - (resolvedFlySize / 2);
  const startY = originCenter.y - (resolvedFlySize / 2);
  const endX = destinationPoint.x - (resolvedFlySize / 2);
  const endY = destinationPoint.y - (resolvedFlySize / 2);
  const midX = startX + ((endX - startX) * profile.curveProgress);
  const midY = startY - profile.peakLift;
  const timeoutMs = safeTimeoutMs ?? (profile.durationMs + 220);

  const flyImg = document.createElement('img');
  flyImg.src = imgSrc;
  flyImg.alt = '';
  flyImg.setAttribute('aria-hidden', 'true');

  if (className) {
    flyImg.classList.add(className);
  }

  flyImg.style.setProperty('--fly-size', `${resolvedFlySize}px`);
  flyImg.style.setProperty('--fly-duration', `${profile.durationMs}ms`);
  flyImg.style.setProperty('--fly-start-x', `${startX}px`);
  flyImg.style.setProperty('--fly-start-y', `${startY}px`);
  flyImg.style.setProperty('--fly-mid-x', `${midX}px`);
  flyImg.style.setProperty('--fly-mid-y', `${midY}px`);
  flyImg.style.setProperty('--fly-end-x', `${endX}px`);
  flyImg.style.setProperty('--fly-end-y', `${endY}px`);
  flyImg.style.setProperty('--fly-start-scale', `${startScale}`);
  flyImg.style.setProperty('--fly-mid-scale', `${profile.midScale}`);
  flyImg.style.setProperty('--fly-end-scale', `${profile.endScale}`);

  let isCleanedUp = false;
  const cleanup = (event) => {
    if (event && event.target !== flyImg) {
      return;
    }

    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
    flyImg.remove();
  };

  flyImg.addEventListener('animationend', cleanup, { once: true });
  document.body.appendChild(flyImg);

  requestAnimationFrame(() => {
    flyImg.dataset.animating = 'true';
  });

  setTimeout(cleanup, timeoutMs);

  return true;
};
