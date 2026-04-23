import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useUserData } from '../context/UserDataContext';
import {
  getNotificationSupportState,
  onForegroundMessage,
  requestBrowserNotificationPermission,
  requestFCMToken,
} from '../lib/firebaseConfig';
import styles from './NotificationManager.module.css';

const BellIcon = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 0 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" />
    <path d="M9 17a3 3 0 0 0 6 0" />
  </svg>
);

const CloseIcon = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
);

const NotificationManager = () => {
  const navigate = useNavigate();
  const { customer } = useUserData();
  const [notificationState, setNotificationState] = useState('default');
  const [supportMessage, setSupportMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [foregroundNotification, setForegroundNotification] = useState(null);

  const pushToast = useCallback((toast) => {
    setForegroundNotification({
      ...toast,
      key: Date.now(),
    });
  }, []);

  const syncNotificationToken = useCallback(async (customerId) => {
    try {
      const fcmToken = await requestFCMToken();

      if (!fcmToken) {
        return {
          ok: false,
          error: 'El navegador permitio notificaciones, pero no pudimos registrar este dispositivo.',
        };
      }

      const { data: existing, error: checkError } = await supabase
        .from('push_subscriptions')
        .select('id, subscription_token')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existing?.subscription_token === fcmToken) {
        return { ok: true };
      }

      const { error: upsertError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            customer_id: customerId,
            subscription_token: fcmToken,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'customer_id',
          }
        );

      if (upsertError) {
        throw upsertError;
      }

      return { ok: true };
    } catch (error) {
      console.error('[Notifications] Error sincronizando token con Supabase:', error);

      return {
        ok: false,
        error: 'No pudimos guardar la suscripcion push. Intenta de nuevo.',
      };
    }
  }, []);

  const refreshNotificationState = useCallback(async (options = {}) => {
    const { showSuccessToast = false } = options;
    const supportState = await getNotificationSupportState();

    setSupportMessage(supportState.reason || '');

    if (supportState.state !== 'granted' || !customer?.id) {
      setNotificationState(supportState.state);
      setSyncError('');
      return supportState.state;
    }

    setNotificationState('registering');

    const syncResult = await syncNotificationToken(customer.id);
    setNotificationState('granted');

    if (!syncResult.ok) {
      setSyncError(syncResult.error);
      return 'granted';
    }

    setSyncError('');

    if (showSuccessToast) {
      pushToast({
        kind: 'success',
        title: 'Notificaciones activadas',
        body: 'Te avisaremos cuando cambie el estado de tus pedidos.',
        url: '/mis-pedidos',
      });
    }

    return 'granted';
  }, [customer?.id, pushToast, syncNotificationToken]);

  useEffect(() => {
    if (!customer?.id) {
      setNotificationState('default');
      setSupportMessage('');
      setSyncError('');
      setForegroundNotification(null);
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      const supportState = await getNotificationSupportState();

      if (cancelled) {
        return;
      }

      setSupportMessage(supportState.reason || '');

      if (supportState.state !== 'granted') {
        setNotificationState(supportState.state);
        setSyncError('');
        return;
      }

      setNotificationState('registering');

      const syncResult = await syncNotificationToken(customer.id);
      if (cancelled) {
        return;
      }

      setNotificationState('granted');
      setSyncError(syncResult.ok ? '' : syncResult.error);
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        refresh().catch((error) => {
          console.error('[Notifications] Error refrescando estado desde visibilitychange:', error);
        });
      }
    };

    refresh().catch((error) => {
      console.error('[Notifications] Error refrescando estado inicial de notificaciones:', error);
    });

    window.addEventListener('focus', handleVisibilityRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleVisibilityRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [customer?.id, syncNotificationToken]);

  useEffect(() => {
    if (!customer?.id) {
      return undefined;
    }

    return onForegroundMessage((_payload, display) => {
      pushToast({
        kind: 'message',
        title: display.title,
        body: display.body,
        url: display.url,
      });
    });
  }, [customer?.id, pushToast]);

  useEffect(() => {
    if (!foregroundNotification?.key) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setForegroundNotification(null);
    }, foregroundNotification.kind === 'success' ? 4500 : 8000);

    return () => window.clearTimeout(timeoutId);
  }, [foregroundNotification]);

  const handleEnableNotifications = useCallback(async () => {
    if (!customer?.id) {
      return;
    }

    setSyncError('');

    const supportState = await getNotificationSupportState();
    setSupportMessage(supportState.reason || '');

    if (supportState.state === 'unsupported' || supportState.state === 'denied') {
      setNotificationState(supportState.state);
      return;
    }

    if (supportState.state === 'default') {
      const permission = await requestBrowserNotificationPermission();

      if (permission === 'granted') {
        await refreshNotificationState({ showSuccessToast: true });
        return;
      }

      if (permission === 'denied') {
        setNotificationState('denied');
        setSupportMessage(
          'Las notificaciones estan bloqueadas. Activalas desde la configuracion del navegador.'
        );
        return;
      }

      setNotificationState('default');
      return;
    }

    await refreshNotificationState({ showSuccessToast: true });
  }, [customer?.id, refreshNotificationState]);

  const handleRefreshStatus = useCallback(async () => {
    await refreshNotificationState();
  }, [refreshNotificationState]);

  const handleOpenNotification = useCallback(() => {
    if (!foregroundNotification?.url) {
      setForegroundNotification(null);
      return;
    }

    navigate(foregroundNotification.url);
    setForegroundNotification(null);
  }, [foregroundNotification, navigate]);

  const statusCard = useMemo(() => {
    if (!customer?.id) {
      return null;
    }

    if (notificationState === 'registering') {
      return {
        title: 'Registrando dispositivo',
        body: 'Estamos vinculando este navegador para avisarte sobre tus pedidos.',
        actionLabel: null,
        onAction: null,
      };
    }

    if (notificationState === 'unsupported') {
      return {
        title: 'Notificaciones no disponibles',
        body: supportMessage || 'Este dispositivo no puede usar notificaciones push.',
        actionLabel: 'Revisar estado',
        onAction: handleRefreshStatus,
      };
    }

    if (notificationState === 'denied') {
      return {
        title: 'Notificaciones bloqueadas',
        body: supportMessage || 'Activalas desde la configuracion del navegador para seguir recibiendo avisos.',
        actionLabel: 'Revisar estado',
        onAction: handleRefreshStatus,
      };
    }

    if (notificationState === 'granted' && syncError) {
      return {
        title: 'Permiso concedido, registro pendiente',
        body: syncError,
        actionLabel: 'Reintentar',
        onAction: handleRefreshStatus,
      };
    }

    if (notificationState === 'default') {
      return {
        title: 'Activa notificaciones de pedidos',
        body: supportMessage || 'Recibe avisos cuando tu pedido cambie de estado.',
        actionLabel: 'Activar notificaciones',
        onAction: handleEnableNotifications,
      };
    }

    return null;
  }, [
    customer?.id,
    handleEnableNotifications,
    handleRefreshStatus,
    notificationState,
    supportMessage,
    syncError,
  ]);

  if (!statusCard && !foregroundNotification) {
    return null;
  }

  return (
    <div className={styles.stack} aria-live="polite">
      {statusCard && (
        <section className={`${styles.card} ${styles.statusCard}`} role="status">
          <div className={styles.iconWrap}>
            <BellIcon className={styles.icon} />
          </div>

          <div className={styles.copy}>
            <strong>{statusCard.title}</strong>
            <span>{statusCard.body}</span>

            {statusCard.actionLabel && statusCard.onAction && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={notificationState === 'default' ? styles.primaryButton : styles.secondaryButton}
                  onClick={statusCard.onAction}
                >
                  {statusCard.actionLabel}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {foregroundNotification && (
        <section
          className={`${styles.card} ${
            foregroundNotification.kind === 'success' ? styles.successCard : styles.messageCard
          }`}
          role="status"
        >
          <div className={styles.iconWrap}>
            <BellIcon className={styles.icon} />
          </div>

          <div className={styles.copy}>
            <strong>{foregroundNotification.title}</strong>
            <span>{foregroundNotification.body}</span>

            <div className={styles.actions}>
              {foregroundNotification.url && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleOpenNotification}
                >
                  Ver pedido
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => setForegroundNotification(null)}
            aria-label="Cerrar notificacion"
          >
            <CloseIcon className={styles.dismissIcon} />
          </button>
        </section>
      )}
    </div>
  );
};

export default NotificationManager;
