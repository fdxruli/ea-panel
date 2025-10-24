// src/components/NotificationManager.jsx
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUserData } from '../context/UserDataContext';
import { requestFCMToken, onForegroundMessage } from '../lib/firebaseConfig';

const NotificationManager = () => {
  const { customer } = useUserData();

  useEffect(() => {
    if (!customer) return;

    const setupNotifications = async () => {
      try {
        console.log('🚀 Configurando notificaciones...');

        // El service worker ya está registrado por Vite PWA
        // Solo necesitamos obtener el token FCM
        const fcmToken = await requestFCMToken();

        if (!fcmToken) {
          console.error('❌ No se obtuvo token FCM');
          return;
        }

        console.log('📱 Token FCM obtenido');

        // Guardar en Supabase
        const { data: existing, error: checkError } = await supabase
          .from('push_subscriptions')
          .select('id, subscription_token')
          .eq('customer_id', customer.id)
          .maybeSingle();

        if (checkError) {
          console.error('❌ Error verificando token:', checkError);
          return;
        }

        if (!existing || existing.subscription_token !== fcmToken) {
          const { error: upsertError } = await supabase
            .from('push_subscriptions')
            .upsert({
              customer_id: customer.id,
              subscription_token: fcmToken,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'customer_id'
            });

          if (upsertError) {
            console.error('❌ Error guardando:', upsertError);
          } else {
            console.log('✅ Token guardado');
          }
        } else {
          console.log('ℹ️ Token ya actualizado');
        }

      } catch (error) {
        console.error('❌ Error setup:', error);
      }
    };

    setupNotifications();

    // Listener para mensajes en primer plano
    onForegroundMessage((payload) => {
      new Notification(
        payload.notification?.title || 'Notificación',
        {
          body: payload.notification?.body || '',
          icon: '/pwa-192x192.png',
          data: payload.data
        }
      );
    });

  }, [customer]);

  return null;
};

export default NotificationManager;
