// src/components/ReloadPrompt.jsx
// Gestión unificada de instalación y actualización PWA para cliente y admin.
//
// Política de actualización:
// - La app instalada muestra un banner y deja la decisión al usuario.
// - La web abierta en un navegador no muestra banner: activa la versión pendiente
//   y recarga automáticamente después de cinco minutos.
// - El service worker se comprueba al volver a la pestaña y periódicamente para
//   que una sesión abierta no dependa únicamente del ciclo automático del navegador.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import styles from './ReloadPrompt.module.css';
import { CheckCircle2 } from 'lucide-react';

const INSTALL_PROMPT_DISMISSED_KEY = 'pwa-install-dismissed_at';
const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_RELOAD_DELAY_MS = 5 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const INSTALLED_DISPLAY_MODES = Object.freeze([
  'standalone',
  'minimal-ui',
  'fullscreen',
  'window-controls-overlay',
]);

function isRunningAsInstalledPwa() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasInstalledDisplayMode = INSTALLED_DISPLAY_MODES.some((mode) => {
    if (typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia('(display-mode: ' + mode + ')').matches;
  });

  const isIosStandalone = window.navigator?.standalone === true;
  const isAndroidTrustedWebActivity =
    typeof document !== 'undefined' &&
    document.referrer.startsWith('android-app://');

  return hasInstalledDisplayMode || isIosStandalone || isAndroidTrustedWebActivity;
}

function ReloadPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallDismissed, setIsInstallDismissed] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(() => isRunningAsInstalledPwa());
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);
  const swRegistrationRef = useRef(null);
  const pendingAutoReloadRef = useRef(false);

  // Detectar si la ventana se abrió como PWA instalada. Incluye Safari iOS,
  // Android Trusted Web Activity y los modos de ventana de escritorio.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQueries = INSTALLED_DISPLAY_MODES
      .map((mode) => (
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(display-mode: ' + mode + ')')
          : null
      ))
      .filter(Boolean);

    const handleInstalledStateChange = () => {
      const installed = isRunningAsInstalledPwa();
      setIsPwaInstalled(installed);

      if (installed) {
        setInstallPrompt(null);
      }
    };

    mediaQueries.forEach((query) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handleInstalledStateChange);
      } else if (typeof query.addListener === 'function') {
        query.addListener(handleInstalledStateChange);
      }
    });

    window.addEventListener('appinstalled', handleInstalledStateChange);
    window.addEventListener('pageshow', handleInstalledStateChange);

    return () => {
      mediaQueries.forEach((query) => {
        if (typeof query.removeEventListener === 'function') {
          query.removeEventListener('change', handleInstalledStateChange);
        } else if (typeof query.removeListener === 'function') {
          query.removeListener(handleInstalledStateChange);
        }
      });

      window.removeEventListener('appinstalled', handleInstalledStateChange);
      window.removeEventListener('pageshow', handleInstalledStateChange);
    };
  }, []);

  // Capturar el evento de instalación PWA solamente cuando se está navegando
  // desde el navegador; una PWA instalada no necesita este prompt.
  useEffect(() => {
    if (typeof window === 'undefined' || isPwaInstalled) {
      return undefined;
    }

    const dismissedAt = localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number.parseInt(dismissedAt, 10);

      if (elapsed < INSTALL_PROMPT_COOLDOWN_MS) {
        setIsInstallDismissed(true);
        return undefined;
      }

      localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();

      if (!isInstallDismissed) {
        setInstallPrompt((currentPrompt) => currentPrompt ?? event);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isInstallDismissed, isPwaInstalled]);

  const handleServiceWorkerRegistered = useCallback((registration) => {
    swRegistrationRef.current = registration ?? null;
    console.log('[ReloadPrompt] SW registrado:', registration);
  }, []);

  const handleServiceWorkerRegisterError = useCallback((error) => {
    console.error('[ReloadPrompt] Error al registrar SW:', error);
  }, []);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered: handleServiceWorkerRegistered,
    onRegisterError: handleServiceWorkerRegisterError,
  });

  // En una SPA abierta no hay navegación que obligue al navegador a comprobar
  // el SW. Revalidar al volver a la pestaña y cada cinco minutos reduce la
  // ventana en la que una sesión puede quedarse con un shell antiguo.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const checkForServiceWorkerUpdate = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      const registration = swRegistrationRef.current;
      if (!registration || typeof registration.update !== 'function') {
        return;
      }

      try {
        Promise.resolve(registration.update()).catch((error) => {
          console.error('[ReloadPrompt] No se pudo comprobar la actualización del SW:', error);
        });
      } catch (error) {
        console.error('[ReloadPrompt] Falló la comprobación de actualización del SW:', error);
      }
    };

    const intervalId = window.setInterval(
      checkForServiceWorkerUpdate,
      UPDATE_CHECK_INTERVAL_MS
    );

    window.addEventListener('focus', checkForServiceWorkerUpdate);
    document.addEventListener('visibilitychange', checkForServiceWorkerUpdate);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForServiceWorkerUpdate);
      document.removeEventListener('visibilitychange', checkForServiceWorkerUpdate);
    };
  }, []);

  const applyAutomaticUpdate = useCallback(async () => {
    if (!needRefresh || isPwaInstalled) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      pendingAutoReloadRef.current = true;
      return;
    }

    pendingAutoReloadRef.current = false;
    console.log('[ReloadPrompt] Nueva versión en navegador; actualizando y recargando.');

    try {
      await updateServiceWorker(true);
    } catch (error) {
      console.error('[ReloadPrompt] Falló la actualización automática; recargando:', error);
      window.location.reload();
    }
  }, [isPwaInstalled, needRefresh, updateServiceWorker]);

  // En navegador, la actualización queda silenciosa durante cinco minutos.
  // En una PWA instalada no se programa este temporizador: se muestra el banner.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (!needRefresh || isPwaInstalled) {
      pendingAutoReloadRef.current = false;
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void applyAutomaticUpdate();
    }, AUTO_RELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [applyAutomaticUpdate, isPwaInstalled, needRefresh]);

  const handleNetworkRestored = useCallback(() => {
    if (!needRefresh) {
      return;
    }

    if (!isPwaInstalled) {
      if (pendingAutoReloadRef.current) {
        void applyAutomaticUpdate();
      }
      return;
    }

    const isAdmin = window.location.pathname.startsWith('/admin');
    console.log(
      '[ReloadPrompt] Conexión restaurada + actualización pendiente' +
      (isAdmin ? ' (ruta admin).' : '.') +
      ' Mostrando banner — sin auto-recarga.'
    );
    setIsUpdateDismissed(false);
  }, [applyAutomaticUpdate, isPwaInstalled, needRefresh]);

  useEffect(() => {
    window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleNetworkRestored);
    window.addEventListener('online', handleNetworkRestored);

    return () => {
      window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleNetworkRestored);
      window.removeEventListener('online', handleNetworkRestored);
    };
  }, [handleNetworkRestored]);

  // ── Prompt de instalación PWA ──────────────────────────────────────────────
  if (installPrompt) {
    return (
      <div className={styles.toast} role="dialog" aria-label="Instalar aplicación">
        <div className={styles.message}>
          <strong>¿Instalar la app?</strong>
          <span>Accede más rápido desde tu pantalla de inicio.</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={async () => {
              await installPrompt.prompt();
              localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
              setIsInstallDismissed(false);
              setInstallPrompt(null);
            }}
          >
            Instalar
          </button>
          <button
            className={styles.closeButton}
            onClick={() => {
              localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, Date.now().toString());
              setIsInstallDismissed(true);
              setInstallPrompt(null);
            }}
          >
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  // ── Primera vez listo para funcionar offline ───────────────────────────────
  if (offlineReady) {
    return (
      <div className={styles.toast} role="status">
        <div className={styles.toastIcon} aria-hidden="true"><CheckCircle2 size={22} /></div>
        <div className={styles.message}>
          <strong>¡App lista para offline!</strong>
          <span>Podrás ver el menú aunque pierdas conexión.</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.closeButton}
            onClick={() => setOfflineReady(false)}
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  // ── Nueva versión disponible sólo para PWA instalada ───────────────────────
  if (isPwaInstalled && needRefresh && !isUpdateDismissed) {
    return (
      <div
        className={styles.updateToast + ' ' + styles.toast}
        role="alertdialog"
        aria-label="Actualización de la aplicación"
        aria-live="polite"
      >
        <div className={styles.message}>
          <strong>Actualización disponible</strong>
          <span>Hay una nueva versión de la aplicación con mejoras y correcciones de rendimiento.</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={() => updateServiceWorker(true)}
          >
            Actualizar app
          </button>
          <button
            className={styles.closeButton}
            onClick={() => {
              console.log('[ReloadPrompt] Usuario pospuso la actualización.');
              setIsUpdateDismissed(true);
            }}
          >
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default ReloadPrompt;
