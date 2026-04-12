/**
 * useCheckoutScheduling.js
 * Custom hook that manages checkout scheduling state and validates
 * the 2-hour advance rule.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getLocalYYYYMMDD,
  buildScheduledISO,
  validateScheduleAdvance,
  getDefaultScheduleDetails,
} from '../../utils/checkoutDateUtils';

/**
 * @returns {{
 *   isScheduling: boolean,
 *   scheduleDetails: { date: string, hour: string, minute: string, period: string },
 *   scheduledTime: string|null, - ISO string
 *   scheduleError: string|null,
 *   handleToggleScheduling: (shouldSchedule: boolean) => void,
 *   handleScheduleChange: (e: React.ChangeEvent) => void,
 *   validateScheduledTime: () => { ok: boolean, error: string|null },
 * }}
 */
export const useCheckoutScheduling = () => {
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledTime, setScheduledTime] = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  const [scheduleDetails, setScheduleDetails] = useState(getDefaultScheduleDetails());

  // Recompute ISO string whenever scheduling is toggled or details change
  useEffect(() => {
    if (!isScheduling) {
      setScheduledTime(null);
      setScheduleError(null);
      return;
    }

    const result = buildScheduledISO(scheduleDetails);

    if (!result.ok) {
      setScheduledTime(null);
      setScheduleError(result.error);
      return;
    }

    setScheduledTime(result.isoString);
    setScheduleError(null);
  }, [isScheduling, scheduleDetails]);

  const handleToggleScheduling = useCallback((shouldSchedule) => {
    setIsScheduling(shouldSchedule);

    if (shouldSchedule) {
      // Reset to default schedule (now + 2 hours) when enabling
      setScheduleDetails(getDefaultScheduleDetails());
      setScheduleError(null);
    } else {
      setScheduledTime(null);
      setScheduleError(null);
    }
  }, []);

  const handleScheduleChange = useCallback((e) => {
    const { name, value } = e.target;
    setScheduleDetails((prev) => ({ ...prev, [name]: value }));
  }, []);

  const validateScheduledTime = useCallback(() => {
    if (!isScheduling) {
      return { ok: true, error: null };
    }

    if (!scheduledTime) {
      return { ok: false, error: 'Por favor, selecciona una fecha y hora válidas para programar tu pedido.' };
    }

    const validation = validateScheduleAdvance(scheduledTime);

    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    return { ok: true, error: null };
  }, [isScheduling, scheduledTime]);

  return {
    isScheduling,
    scheduleDetails,
    scheduledTime,
    scheduleError,
    handleToggleScheduling,
    handleScheduleChange,
    validateScheduledTime,
  };
};
