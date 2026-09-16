import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useAlert } from '../context/AlertContext';
import {
  getNotificationSupportState,
  requestBrowserNotificationPermission,
  requestFCMToken,
} from '../lib/firebaseConfig';
import styles from './ProfileNotificationCard.module.css';

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 0 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" />
    <path d="M9 17a3 3 0 0 0 6 0" />
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function ProfileNotificationCard() {
  const { customer } = useCustomer();
  const { showAlert } = useAlert();
  const [state, setState] = useState('checking'); // 'checking' | 'granted' | 'default' | 'denied' | 'unsupported'
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const checkState = useCallback(async () => {
    try {
      const support = await getNotificationSupportState();
      setState(support.state);
      setReason(support.reason || '');
    } catch {
      setState('unsupported');
    }
  }, []);

  useEffect(() => {
    checkState();
    const handleFocus = () => {
      if (document.visibilityState === 'visible') checkState();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [checkState]);

  const handleEnable = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const permission = await requestBrowserNotificationPermission();
      if (permission === 'granted') {
        const token = await requestFCMToken();
        if (token) {
          await supabase.from('push_subscriptions').upsert(
            {
              customer_id: customer.id,
              subscription_token: token,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'customer_id' }
          );
        }
        showAlert('¡Notificaciones de pedidos activadas!');
        setState('granted');
      } else if (permission === 'denied') {
        setState('denied');
        showAlert('Las notificaciones están bloqueadas en los permisos del navegador.');
      } else {
        setState('default');
      }
    } catch (err) {
      console.error('[ProfileNotificationCard] Error:', err);
      showAlert('No se pudieron activar las notificaciones en este dispositivo.');
    } finally {
      setLoading(false);
      checkState();
    }
  };

  const renderAction = () => {
    if (state === 'granted') {
      return (
        <span className={styles.badge}>
          <CheckIcon /> Activas
        </span>
      );
    }
    if (state === 'denied') {
      return (
        <button
          type="button"
          onClick={checkState}
          className={styles.secondaryButton}
          title="Verificar si ya fueron habilitadas en la barra de direcciones"
        >
          Revisar permiso
        </button>
      );
    }
    if (state === 'unsupported') {
      return null;
    }
    return (
      <button
        type="button"
        onClick={handleEnable}
        className={styles.actionButton}
        disabled={loading}
      >
        {loading ? 'Activando...' : 'Activar'}
      </button>
    );
  };

  const getTexts = () => {
    if (state === 'granted') {
      return {
        title: 'Notificaciones de pedidos',
        subtitle: 'Recibirás avisos en tiempo real cuando tu pedido esté en camino.',
        iconClass: styles.active,
      };
    }
    if (state === 'denied') {
      return {
        title: 'Notificaciones bloqueadas',
        subtitle: 'Habilítalas en el ícono de candado o ajustes del navegador.',
        iconClass: styles.blocked,
      };
    }
    if (state === 'unsupported') {
      return {
        title: 'Notificaciones no soportadas',
        subtitle: reason || 'Este dispositivo o navegador no admite alertas push web.',
        iconClass: '',
      };
    }
    return {
      title: 'Alertas de tus pedidos',
      subtitle: 'Entérate de inmediato sobre actualizaciones y confirmaciones.',
      iconClass: '',
    };
  };

  const { title, subtitle, iconClass } = getTexts();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={`${styles.iconWrap} ${iconClass}`}>
          <BellIcon />
        </div>
        <div className={styles.textGroup}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>
      <div>{renderAction()}</div>
    </div>
  );
}
