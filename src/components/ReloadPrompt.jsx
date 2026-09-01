// src/components/ReloadPrompt.jsx
// PWA install prompt: se "pospone" con localStorage para no molestar
// en cada recarga. Se vuelve a mostrar después de 7 días.
//
// La actualización del SW es SIEMPRE una decisión explícita del usuario.
// Nunca se dispara una recarga automática al recuperar la conexión.

import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import styles from './ReloadPrompt.module.css';

const INSTALL_PROMPT_DISMISSED_KEY = 'pwa-install-dismissed_at';
const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function ReloadPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallDismissed, setIsInstallDismissed] = useState(false);

  // Capturar el evento de instalación PWA (añadir a pantalla de inicio)
  useEffect(() => {
    // Verificar si el usuario pospuso el prompt recientemente
    const dismissedAt = localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < INSTALL_PROMPT_COOLDOWN_MS) {
        setIsInstallDismissed(true);
        return; // No mostrar durante el cooldown
      }
      // Cooldown expirado, limpiar
      localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      // Solo guardar el prompt si no está en cooldown
      if (!isInstallDismissed) {
        setInstallPrompt(e);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isInstallDismissed]);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh:  [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[ReloadPrompt] SW registrado:', r);
    },
    onRegisterError(error) {
      console.error('[ReloadPrompt] Error al registrar SW:', error);
    },
  });

  // Estado de sesión: el usuario eligió posponer la actualización
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);

  // ── Visibilidad del toast de actualización al recuperar conexión ───────────
  // Si el SW detectó una nueva versión (needRefresh=true) y el usuario
  // recupera la conexión, únicamente nos aseguramos de que el toast sea
  // visible (resetando el dismiss de sesión). NUNCA se dispara una recarga
  // automática — la decisión es siempre del usuario.
  const handleNetworkRestored = useCallback(() => {
    if (needRefresh) {
      const isAdmin = window.location.pathname.startsWith('/admin');
      console.log(
        `[ReloadPrompt] Conexión restaurada + update pendiente${isAdmin ? ' (ruta admin)' : ''}. ` +
        'Mostrando toast — sin auto-recarga.'
      );
      // Re-mostrar el toast si el usuario lo había pospuesto en esta sesión
      setIsUpdateDismissed(false);
    }
  }, [needRefresh]);

  useEffect(() => {
    window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleNetworkRestored);
    return () => {
      window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleNetworkRestored);
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
        <div className={styles.toastIcon} aria-hidden="true">✅</div>
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

  // ── Nueva versión disponible ─────────────────────────────────────────────
  // El usuario puede posponer con "Ahora no" (oculta el toast en la sesión).
  // La actualización SOLO se aplica cuando el usuario pulsa "Actualizar app".
  if (needRefresh && !isUpdateDismissed) {
    return (
      <div
        className={`${styles.toast} ${styles.updateToast}`}
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