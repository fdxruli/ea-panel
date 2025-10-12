// src/components/ReloadPrompt.jsx
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './ReloadPrompt.module.css';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // eslint-disable-next-line prefer-template
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

  if (offlineReady) {
    return (
      <div className={styles.toast}>
        <div className={styles.message}>
          <span>¡Aplicación lista para funcionar!</span>
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