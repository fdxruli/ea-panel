// supabase/functions/send-order-notification/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
// === 1️⃣ Variables de entorno ===
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY'); // 🔥 NUEVA CLAVE
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FCM_SERVER_KEY) {
  console.error('❌ Missing environment variables.');
  Deno.exit(1);
}
console.log('🚀 Edge Function initialized: send-order-notification');
// === Función para eliminar suscripción inválida ===
async function deleteInvalidSubscription(supabase, endpoint) {
  console.warn(`🗑️ Deleting invalid subscription with endpoint: ${endpoint}`);
  const { error: deleteError } = await supabase.from('push_subscriptions').delete().eq('subscription_token->>endpoint', endpoint); // Usar el endpoint completo para asegurar unicidad
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
    // Solo notificar si el estado cambió realmente
    if (oldOrder && order.status === oldOrder.status) {
      console.log(`ℹ️ Order ${order.order_code} status did not change. Skipping.`);
      return new Response('Status did not change', {
        status: 200
      });
    }
    console.log(`🔔 Order ${order.order_code} status changed to ${order.status}. Fetching subscriptions...`);
    // Crear cliente Supabase dentro del handler
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('subscription_token') // Solo necesitamos el token
    .eq('customer_id', order.customer_id);
    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      console.warn(`⚠️ No push subscriptions found for customer: ${order.customer_id}`);
      return new Response('No subscriptions found', {
        status: 200
      });
    }
    console.log(`✅ Found ${subscriptions.length} subscription(s). Sending via FCM...`);
    // Mensajes según estado
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
      url: '/mis-pedidos' // URL a abrir al hacer clic
    };
    // === 3️⃣ Enviar notificaciones y manejar errores ===
    const sendPromises = subscriptions.map(async ({ subscription_token })=>{
      const endpoint = subscription_token?.endpoint; // Safely access endpoint
      const fcmToken = subscription_token?.keys?.auth; // O usa el campo correcto donde guardas el token si es diferente
      if (!endpoint || !fcmToken) {
        console.warn('⚠️ Invalid subscription object:', subscription_token);
        return; // Skip this subscription
      }
      try {
        const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${FCM_SERVER_KEY}`
          },
          body: JSON.stringify({
            to: fcmToken,
            notification: notificationData,
            data: dataPayload // Envía datos adicionales aquí
          })
        });
        // --- 👇 MANEJO DE RESPUESTA DE FCM ---
        if (!fcmResponse.ok) {
          // Si la respuesta NO fue exitosa (ej. 404, 410, etc.)
          const status = fcmResponse.status;
          const responseText = await fcmResponse.text(); // Leer el cuerpo para logs
          console.error(`❌ FCM error for token ${fcmToken} (Endpoint: ${endpoint}) - Status: ${status}, Response: ${responseText}`);
          // Si el error es 404 (Not Found) o 410 (Gone), el token es inválido
          if (status === 404 || status === 410) {
            await deleteInvalidSubscription(supabase, endpoint);
          }
        } else {
          // Si la respuesta fue exitosa (ej. 200 OK)
          const responseJson = await fcmResponse.json(); // FCM suele devolver JSON en éxito
          console.log(`📨 FCM success for ${fcmToken} (Endpoint: ${endpoint}):`, JSON.stringify(responseJson));
        }
      // --- 👆 FIN MANEJO DE RESPUESTA ---
      } catch (fetchError) {
        // Error al intentar contactar FCM (problema de red, etc.)
        console.error(`💥 Network or fetch error sending to ${endpoint}:`, fetchError.message);
      }
    });
    await Promise.all(sendPromises); // Esperar a que todos los envíos terminen
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
