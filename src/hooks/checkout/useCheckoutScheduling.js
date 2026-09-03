/**
 * useCheckoutScheduling.js
 * Custom hook that manages checkout scheduling state and validates
 * the 2-hour advance rule.
 */
import { useCallback, useMemo, useState } from 'react';
import {
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
  const [scheduleDetails, setScheduleDetails] = useState(getDefaultScheduleDetails());

  const { scheduledTime, scheduleError } = useMemo(() => {
    if (!isScheduling) {
      return { scheduledTime: null, scheduleError: null };
    }

    const result = buildScheduledISO(scheduleDetails);

    if (!result.ok) {
      return { scheduledTime: null, scheduleError: result.error };
    }

    return { scheduledTime: result.isoString, scheduleError: null };
  }, [isScheduling, scheduleDetails]);

  const handleToggleScheduling = useCallback((shouldSchedule) => {
    setIsScheduling(shouldSchedule);

    if (shouldSchedule) {
      // Reset to default schedule (now + 2 hours) when enabling
      setScheduleDetails(getDefaultScheduleDetails());
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
