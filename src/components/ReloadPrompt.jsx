// src/components/ReloadPrompt.jsx (MODIFICADO)
import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './ReloadPrompt.module.css';

function ReloadPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);

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
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    const result = await installPrompt.prompt();
    console.log(`Install prompt result: ${result.outcome}`);
    setInstallPrompt(null); // El prompt solo se puede usar una vez
  };

  if (installPrompt) {
    return (
      <div className={styles.toast}>
        <div className={styles.message}>
          <span>¿Quieres instalar esta aplicación en tu dispositivo?</span>
        </div>
        <button className={styles.actionButton} onClick={handleInstall}>Instalar</button>
        <button className={styles.closeButton} onClick={() => setInstallPrompt(null)}>Ahora no</button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className={styles.toast}>
        <div className={styles.message}>
          <span>¡Aplicación lista para funcionar sin conexión!</span>
        </div>
        <button className={styles.closeButton} onClick={() => close()}>Cerrar</button>
      </div>
    );
  }

  if (needRefresh) {
    return (
      <div className={styles.toast}>
        <div className={styles.message}>
          <span>Hay una nueva versión disponible, ¡recarga para actualizar!</span>
        </div>
        <button className={styles.actionButton} onClick={() => updateServiceWorker(true)}>Recargar</button>
        <button className={styles.closeButton} onClick={() => close()}>Cerrar</button>
      </div>
    );
  }

  return null;
}

export default ReloadPrompt;