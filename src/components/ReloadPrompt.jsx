import React, { useState, useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import styles from './ReloadPrompt.module.css';

function ReloadPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);

  // Capturar el evento de instalación PWA (añadir a pantalla de inicio)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[ReloadPrompt] SW registrado:', r);
    },
    onRegisterError(error) {
      console.error('[ReloadPrompt] Error al registrar SW:', error);
    },
  });

  // ── Auto-actualizar cuando el usuario vuelve a tener conexión ──────────────
  // Si el SW ya detectó una nueva versión (needRefresh=true) y el usuario
  // recupera la conexión, aplicamos la actualización automáticamente.
  // Esto previene que el usuario se quede atascado en caché vieja indefinidamente
  // después de una sesión offline.
  const handleNetworkRestored = useCallback(() => {
    if (needRefresh) {
      console.log('[ReloadPrompt] Conexión restaurada + update pendiente → aplicando SW.');
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

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
        <div className={styles.toastIcon} aria-hidden="true">📲</div>
        <div className={styles.message}>
          <strong>¿Instalar la app?</strong>
          <span>Accede más rápido desde tu pantalla de inicio.</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={async () => {
              await installPrompt.prompt();
              setInstallPrompt(null);
            }}
          >
            Instalar
          </button>
          <button
            className={styles.closeButton}
            onClick={() => setInstallPrompt(null)}
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
  // ⚠️  SIN botón "Cerrar" — el usuario DEBE actualizar para evitar
  // quedarse atascado en una versión zombie del caché.
  if (needRefresh) {
    return (
      <div className={`${styles.toast} ${styles.updateToast}`} role="alertdialog">
        <div className={styles.message}>
          <strong>Nueva versión disponible</strong>
        </div>
        <button className={styles.actionButton} onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
      </div>
    );
  }

  return null;
}

export default ReloadPrompt;