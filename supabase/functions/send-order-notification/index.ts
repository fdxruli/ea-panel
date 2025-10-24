// supabase/functions/send-order-notification/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import admin from 'npm:firebase-admin@^12.0.0';
// === 1️⃣ Variables de entorno ===
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('❌ Missing environment variables. Make sure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and FIREBASE_SERVICE_ACCOUNT_JSON are set.');
  Deno.exit(1);
}
try {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialized successfully.');
} catch (e) {
  console.error('❌ Failed to parse or initialize Firebase Admin SDK:', e.message);
  Deno.exit(1);
}
console.log('🚀 Edge Function initialized: send-order-notification');
async function deleteInvalidSubscription(supabaseClient, endpoint) {
  console.warn(`🗑️ Deleting invalid subscription with endpoint: ${endpoint}`);
  const { error: deleteError } = await supabaseClient.from('push_subscriptions').delete().eq('subscription_token->>endpoint', endpoint);
  if (deleteError) {
    console.error(`❌ Failed to delete subscription ${endpoint}:`, deleteError.message);
  } else {
    console.log(`✅ Successfully deleted subscription ${endpoint}.`);
  }
}
// === 2️⃣ Función principal ===
Deno.serve(async (req)=>{
  try {
    const payload = await req.json();
    console.log('📦 Received payload:', JSON.stringify(payload, null, 2));
    const order = payload.record;
    const oldOrder = payload.old_record;
    if (!order || !order.customer_id) {
      throw new Error('Invalid order data in payload.');
    }
    if (oldOrder && order.status === oldOrder.status) {
      console.log(`ℹ️ Order ${order.order_code} status did not change. Skipping.`);
      return new Response('Status did not change', {
        status: 200
      });
    }
    console.log(`🔔 Order ${order.order_code} status changed to ${order.status}. Fetching subscriptions...`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('subscription_token').eq('customer_id', order.customer_id);
    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      console.warn(`⚠️ No push subscriptions found for customer: ${order.customer_id}`);
      return new Response('No subscriptions found', {
        status: 200
      });
    }
    console.log(`✅ Found ${subscriptions.length} subscription(s). Sending via FCM...`);
    const statusMessages = {
      en_proceso: 'Tu pedido está en proceso.',
      en_envio: '¡Tu pedido ya va en camino!',
      completado: 'Tu pedido ha sido completado. ¡Gracias por tu compra!',
      cancelado: 'Tu pedido ha sido cancelado.'
    };
    const notificationData = {
      title: `Actualización de pedido #${order.order_code}`,
      body: statusMessages[order.status] || `Estado: ${order.status}`
    };
    const dataPayload = {
      url: '/mis-pedidos'
    };
    // === 3️⃣ Enviar notificaciones y manejar errores ===
    const sendPromises = subscriptions.map(async ({ subscription_token: subscriptionRecord })=>{
      console.log('DEBUG: subscriptionRecord raw from DB:', JSON.stringify(subscriptionRecord, null, 2));
      let fcmToken;
      let endpoint; // Mantener el endpoint para la eliminación
      if (typeof subscriptionRecord === 'object' && subscriptionRecord !== null && subscriptionRecord.endpoint) {
        endpoint = subscriptionRecord.endpoint; // Guarda el endpoint
        // Extraer el token FCM del endpoint
        const parts = endpoint.split('/');
        fcmToken = parts[parts.length - 1]; // La última parte es el token FCM
      }
      console.log('DEBUG: Extracted FCM Token:', fcmToken);
      console.log('DEBUG: Type of Extracted FCM Token:', typeof fcmToken);
      if (!fcmToken || typeof fcmToken !== 'string') {
        console.warn('⚠️ Could not extract a valid FCM Token from PushSubscription. Skipping this subscription.', subscriptionRecord);
        return;
      }
      const message = {
        notification: notificationData,
        data: dataPayload,
        token: fcmToken
      };
      try {
        const response = await admin.messaging().send(message);
        console.log(`📨 FCM success for token ${fcmToken}:`, JSON.stringify(response));
      } catch (error) {
        console.error(`❌ Error sending FCM message to token ${fcmToken}:`, error.message);
        if (error.code === 'messaging/invalid-argument' || error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/not-found') {
          console.warn(`🗑️ FCM Token inválido o no registrado. Eliminando suscripción para endpoint: ${endpoint}`);
          await deleteInvalidSubscription(supabase, endpoint);
        } else {
          console.error(`💥 Otro error inesperado del Admin SDK al enviar FCM:`, error);
        }
      }
    });
    await Promise.all(sendPromises);
    console.log('✅ Push notification sending process completed.');
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('💥 General Error in Edge Function:', error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
