/**
 * checkoutDateUtils.js
 * Pure utility functions for date validation, conversion, and formatting
 * related to checkout scheduling. No React dependencies.
 */

const MIN_ADVANCE_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

/**
 * Returns a YYYY-MM-DD string in local time for the given date.
 */
export const getLocalYYYYMMDD = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Converts schedule details (date, hour, minute, period) into a validated ISO string.
 *
 * @param {object} details - { date: string (YYYY-MM-DD), hour: string, minute: string, period: 'am'|'pm' }
 * @returns {{ ok: boolean, isoString: string|null, error: string|null }}
 */
export const buildScheduledISO = (details) => {
  if (!details?.date) {
    return { ok: false, isoString: null, error: 'La fecha es requerida.' };
  }

  const hour = parseInt(details.hour, 10);
  const minute = parseInt(details.minute, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return { ok: false, isoString: null, error: 'Hora o minuto inválido.' };
  }

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return { ok: false, isoString: null, error: 'Hora fuera de rango.' };
  }

  let twentyFourHour = hour;
  const period = details.period?.toLowerCase();

  if (period === 'pm' && twentyFourHour < 12) {
    twentyFourHour += 12;
  }
  if (period === 'am' && twentyFourHour === 12) {
    twentyFourHour = 0;
  }

  const scheduledDate = new Date(`${details.date}T00:00:00`);
  scheduledDate.setHours(twentyFourHour, minute);

  if (Number.isNaN(scheduledDate.getTime())) {
    return { ok: false, isoString: null, error: 'Fecha inválida.' };
  }

  return { ok: true, isoString: scheduledDate.toISOString(), error: null };
};

/**
 * Validates that the scheduled time is at least 2 hours in the future.
 *
 * @param {string} isoString - ISO date string from buildScheduledISO
 * @returns {{ ok: boolean, error: string|null }}
 */
export const validateScheduleAdvance = (isoString) => {
  const scheduledDate = new Date(isoString);
  const now = new Date();
  const diffInMs = scheduledDate.getTime() - now.getTime();

  if (diffInMs < MIN_ADVANCE_MS) {
    return {
      ok: false,
      error:
        'Para pedidos inmediatos, es mejor elegir la opción "Lo antes posible". La programación requiere al menos 2 horas de anticipación.',
    };
  }

  return { ok: true, error: null };
};

/**
 * Builds default schedule details for "now + 2 hours".
 *
 * @returns {{ date: string, hour: string, minute: string, period: string }}
 */
export const getDefaultScheduleDetails = () => {
  const now = new Date();
  const defaultDate = getLocalYYYYMMDD(now);

  let nextHour = now.getHours() + 2;
  let period = 'am';

  if (nextHour >= 24) {
    nextHour -= 24;
  }

  if (nextHour >= 12) {
    period = 'pm';
    if (nextHour > 12) nextHour -= 12;
  } else if (nextHour === 0) {
    nextHour = 12;
  }

  return {
    date: defaultDate,
    hour: nextHour.toString().padStart(2, '0'),
    minute: '00',
    period,
  };
};

/**
 * Formats a scheduled ISO string into a human-readable Spanish string.
 *
 * @param {string} isoString
 * @returns {string}
 */
export const formatScheduledTime = (isoString) => {
  const scheduledDate = new Date(isoString);
  const dateOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  const formattedDate = scheduledDate.toLocaleDateString('es-MX', dateOptions);
  const formattedTime = scheduledDate.toLocaleTimeString('es-MX', timeOptions);

  return `${formattedDate} a las ${formattedTime}`;
};
