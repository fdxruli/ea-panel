/**
 * Utilidad para crear funciones con throttle (limitación de frecuencia).
 * Útil para evitar múltiples ejecuciones consecutivas en cortos períodos.
 */

import { useRef, useCallback, useEffect } from 'react';

/**
 * Crea una versión con throttle de una función.
 *
 * @param {function} func - Función a limitar
 * @param {number} limit - Tiempo en milisegundos entre ejecuciones
 * @param {object} options - Opciones adicionales
 * @param {boolean} options.leading - Ejecutar al inicio del intervalo (default: true)
 * @param {boolean} options.trailing - Ejecutar al final del intervalo (default: true)
 * @returns {function} Función con throttle aplicado
 *
 * @example
 * const throttledInvalidate = createThrottle(() => invalidate(), 2000);
 * realtimeChannel.on('changes', throttledInvalidate);
 */
export const createThrottle = (func, limit, options = {}) => {
  const { leading = true, trailing = true } = options;

  let inWait = false;
  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;

  const invokeFunc = (args, context) => {
    const result = func.apply(context, args);
    inWait = false;
    return result;
  };

  const throttled = function(...args) {
    const context = this;

    if (inWait) {
      // Ya estamos en período de espera
      if (trailing) {
        // Guardar últimos args para ejecutar al final
        lastArgs = args;
        lastThis = context;
      }
      return;
    }

    if (leading) {
      // Ejecutar inmediatamente
      invokeFunc(args, context);
      inWait = true;

      // Programar fin del período de espera
      timeoutId = setTimeout(() => {
        inWait = false;

        // Ejecutar trailing si hubo llamadas durante el espera
        if (trailing && lastArgs) {
          const result = invokeFunc(lastArgs, lastThis);
          lastArgs = null;
          lastThis = null;
          return result;
        }
      }, limit);
    } else if (trailing && !timeoutId) {
      // Solo trailing, programar primera ejecución
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (trailing && lastArgs) {
          const result = invokeFunc(lastArgs, lastThis);
          lastArgs = null;
          lastThis = null;
          return result;
        }
      }, limit);
    }
  };

  // Función para cancelar el throttle
  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inWait = false;
    lastArgs = null;
    lastThis = null;
  };

  // Función para ejecutar inmediatamente
  throttled.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inWait = false;

    if (lastArgs) {
      const result = func.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
      return result;
    }
  };

  return throttled;
};

/**
 * Hook personalizado para usar throttle en componentes React.
 *
 * @param {function} callback - Función a limitar
 * @param {number} delay - Delay en milisegundos
 * @returns {function} Función con throttle
 *
 * @example
 * const throttledCallback = useThrottle((value) => setValue(value), 300);
 */
export const useThrottle = (callback, delay) => {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef(null);
  const lastExecutionTime = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args) => {
    const now = Date.now();
    const timeSinceLastExecution = now - lastExecutionTime.current;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (timeSinceLastExecution >= delay) {
      // Ejecutar inmediatamente
      callbackRef.current(...args);
      lastExecutionTime.current = now;
    } else if (delay - timeSinceLastExecution > 0) {
      // Programar para después
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        lastExecutionTime.current = Date.now();
        timeoutRef.current = null;
      }, delay - timeSinceLastExecution);
    }
  }, [delay]);
};

export default createThrottle;
