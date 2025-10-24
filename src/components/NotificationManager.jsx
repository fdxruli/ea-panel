// ea-panel-main - copia/src/components/NotificationManager.jsx

import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUserData } from '../context/UserDataContext';

// La función urlBase64ToUint8Array no cambia
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NotificationManager = () => {
  const { customer } = useUserData();

  useEffect(() => {
    // Solo proceder si tenemos un cliente y el navegador soporta notificaciones push
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !customer) {
      return;
    }

    const subscribeUser = async () => {
      try {
        const swRegistration = await navigator.serviceWorker.ready;
        let subscription = await swRegistration.pushManager.getSubscription();

        if (subscription === null) {
          console.log('No subscription found, creating a new one...');
          const applicationServerKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY);
          subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey, // Asegúrate de que se usa aquí
          });
          console.log('New subscription created:', subscription.toJSON());
        } else {
          console.log('Existing subscription found:', subscription.toJSON());
        }

        if (subscription) {
          console.log(`Checking if subscription for endpoint exists for customer ${customer.id}...`);
          const { data, error } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('customer_id', customer.id)
            .eq('subscription_token->>endpoint', subscription.toJSON().endpoint)
            .maybeSingle();

          if (error) {
            console.error('Error checking for existing subscription:', error);
            return;
          }

          if (!data) {
            console.log('Subscription not found in DB. Saving now...');
            const { error: insertError } = await supabase.from('push_subscriptions').insert({
              customer_id: customer.id,
              subscription_token: subscription.toJSON(),
            });

            if (insertError) {
              console.error('Failed to save subscription:', insertError);
            } else {
              console.log('✅ Push subscription successfully saved to DB.');
            }
          } else {
            console.log('Subscription already exists in DB. No action needed.');
          }
        }
      } catch (error) {
        console.error('Failed to subscribe the user: ', error);
      }
    };

    if (Notification.permission === 'granted') {
      console.log('Permission already granted. Proceeding to subscribe.');
      subscribeUser();
    } else if (Notification.permission !== 'denied') {
      console.log('Requesting notification permission...');
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('Notification permission granted.');
          subscribeUser();
        } else {
          console.warn('Notification permission denied.');
        }
      });
    }
  }, [customer]); // Se ejecuta cada vez que el objeto `customer` cambia

  return null;
};

export default NotificationManager;