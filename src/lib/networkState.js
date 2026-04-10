export const NETWORK_STATUS = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
  SLOW: 'slow',
});

export const NETWORK_SLOW_THRESHOLD_MS = 3000;
export const NETWORK_TIMEOUT_MS = 5000;
export const NETWORK_POLL_INTERVAL_MS = 20000;
export const NETWORK_EVENT_DEBOUNCE_MS = 750;
export const NETWORK_CONFIRMED_ONLINE_EVENT = 'app:network-confirmed-online';
