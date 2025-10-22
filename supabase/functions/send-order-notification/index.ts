// supabase/functions/send-order-notification/index.ts (Versión Mejorada)

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Obteniendo las variables de entorno de forma explícita
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// IMPORTANTE: Para webhooks, es más seguro usar la anon key y pasar un token de servicio en la cabecera,
// pero para depuración, la service_role_key es más directa si está configurada en los secrets del proyecto.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Verificación inicial de variables
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  // No podemos continuar si faltan las claves
  Deno.exit(1);
}

webpush.setVapidDetails(
  'mailto:contacto.entrealas@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

console.log("Edge function initialized.");

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Received payload:", JSON.stringify(payload, null, 2));

    const order = payload.record;
    const oldOrder = payload.old_record;

    if (!order || !order.customer_id) {
      throw new Error("Invalid order data in payload.");
    }

    // Solo notificar si el estado realmente cambió
    if (oldOrder && order.status === oldOrder.status) {
      console.log(`Status for order ${order.order_code} did not change. Skipping.`);
      return new Response('Status did not change', { status: 200 });
    }

    console.log(`Order ${order.order_code} status changed to ${order.status}. Searching for subscriptions for customer ${order.customer_id}.`);

    // Crear un cliente de Supabase específico para esta solicitud
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription_token')
      .eq('customer_id', order.customer_id);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.warn(`No push subscriptions found for customer: ${order.customer_id}`);
      return new Response('No subscriptions found', { status: 200 });
    }

    console.log(`Found ${subscriptions.length} subscription(s).`);

    const statusMessages = {
      en_proceso: 'Tu pedido está en proceso.',
      en_envio: '¡Tu pedido ya va en camino!',
      completado: 'Tu pedido ha sido completado. ¡Gracias por tu compra!',
      cancelado: 'Tu pedido ha sido cancelado.',
    };

    const notificationPayload = JSON.stringify({
      title: `Actualización de pedido #${order.order_code}`,
      body: statusMessages[order.status] || `Estado: ${order.status}`,
      url: '/mis-pedidos'
    });

    const sendPromises = subscriptions.map(({ subscription_token }) => {
      console.log('Sending notification to endpoint:', subscription_token.endpoint);
      return webpush.sendNotification(subscription_token, notificationPayload)
        .catch(async (error) => {
          console.error('Error sending notification:', error.body);
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('Subscription expired or invalid. Deleting from DB.');
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('subscription_token', subscription_token);
          }
        });
    });

    await Promise.all(sendPromises);

    console.log("Push notifications sent successfully.");
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in Edge Function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});