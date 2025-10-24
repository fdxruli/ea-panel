// supabase/functions/send-order-notification/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import admin from 'npm:firebase-admin@^12.0.0';

// === 1️⃣ Variables de entorno ===
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('❌ Missing environment variables.');
  Deno.exit(1);
}

try {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialized successfully.');
} catch (e) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', e.message);
  Deno.exit(1);
}

// Helper: Validar formato de FCM Token
function isValidFCMToken(token: string): boolean {
  return typeof token === 'string' &&
    token.length > 100 &&
    /^[a-zA-Z0-9_-]+$/.test(token);
}

// Helper: Extraer FCM Token del endpoint
function extractFCMToken(subscriptionRecord: any): string | null {
  try {
    if (!subscriptionRecord?.endpoint) {
      console.warn('⚠️ No endpoint found in subscription record');
      return null;
    }

    const endpoint = subscriptionRecord.endpoint;

    // Para endpoints de FCM: https://fcm.googleapis.com/fcm/send/{token}
    const fcmMatch = endpoint.match(/\/fcm\/send\/([^\/]+)$/);
    if (fcmMatch) {
      return fcmMatch[1];
    }

    // Fallback: última parte de la URL
    const parts = endpoint.split('/');
    const token = parts[parts.length - 1];

    return token || null;
  } catch (error) {
    console.error('❌ Error extracting FCM token:', error.message);
    return null;
  }
}

// Helper: Eliminar suscripción inválida
async function deleteInvalidSubscription(supabaseClient: any, subscriptionId: string) {
  console.warn(`🗑️ Deleting invalid subscription ID: ${subscriptionId}`);

  const { error } = await supabaseClient
    .from('push_subscriptions')
    .delete()
    .eq('id', subscriptionId);

  if (error) {
    console.error(`❌ Failed to delete subscription:`, error.message);
  } else {
    console.log(`✅ Successfully deleted subscription ${subscriptionId}`);
  }
}

// === 2️⃣ Función principal ===
Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log('📦 Received payload:', JSON.stringify(payload, null, 2));

    const order = payload.record;
    const oldOrder = payload.old_record;

    // Validaciones
    if (!order?.customer_id) {
      throw new Error('Invalid order data: missing customer_id');
    }

    if (!order.status) {
      throw new Error('Invalid order data: missing status');
    }

    // Verificar si el estado cambió
    if (oldOrder?.status === order.status) {
      console.log(`ℹ️ Order ${order.order_code} status unchanged. Skipping.`);
      return new Response('Status did not change', { status: 200 });
    }

    console.log(`🔔 Order ${order.order_code} → ${order.status}. Fetching subscriptions...`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, subscription_token')
      .eq('customer_id', order.customer_id);

    if (error) throw error;

    if (!subscriptions?.length) {
      console.warn(`⚠️ No subscriptions for customer: ${order.customer_id}`);
      return new Response('No subscriptions found', { status: 200 });
    }

    console.log(`✅ Found ${subscriptions.length} subscription(s)`);

    // Mensajes de notificación
    const statusMessages: Record<string, string> = {
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
      url: '/mis-pedidos',
      orderId: order.id?.toString() || '',
      orderCode: order.order_code || '',
      status: order.status
    };

    // === 3️⃣ Enviar notificaciones ===
    // En tu Edge Function - cambiar esta parte:

    const sendPromises = subscriptions.map(async ({ subscription_token }) => {
      // ✅ subscription_token ahora es un string directo (token FCM)
      const fcmToken = subscription_token;

      console.log('📤 Enviando a token:', fcmToken.substring(0, 20) + '...');

      const message = {
        notification: notificationData,
        data: dataPayload,
        token: fcmToken // ✅ Usar directamente
      };

      try {
        const response = await admin.messaging().send(message);
        console.log(`✅ Enviado correctamente:`, response);
      } catch (error) {
        console.error(`❌ Error:`, error.code);

        // Eliminar tokens inválidos
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('subscription_token', fcmToken);
        }
      }
    });

    const results = await Promise.allSettled(sendPromises);

    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - successful;

    console.log(`✅ Notifications sent: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed: failed,
        total: results.length
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('💥 General Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});