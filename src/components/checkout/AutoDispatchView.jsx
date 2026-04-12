/**
 * AutoDispatchView.jsx
 * Presentation component: shows the loading/spinner state when an
 * automatic guest order is being processed during component mount.
 */
import React from 'react';
import styles from '../../components/CheckoutModal.module.css';

export default function AutoDispatchView() {
  return (
    <div className={styles.autoDispatchState}>
      <div className={styles.spinner} style={{ margin: '0 auto 20px' }}></div>
      <h3>Conectando con WhatsApp...</h3>
      <p>Estamos generando tu pedido automáticamente.</p>
    </div>
  );
}
