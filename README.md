# Entre Alas - Panel de Pedidos y Administración 🍽️ wings 🍔

Este proyecto es una aplicación web PWA (Progressive Web App) completa construida con **React** y **Vite**, utilizando **Supabase** como backend. Sirve como un panel tanto para clientes como para administradores de un negocio de comida (presumiblemente "Entre Alas", especializado en alitas).

**Características Principales:**

**Para Clientes:**

* **Menú Interactivo:** Explora productos, filtra por categorías y visualiza detalles (imágenes, descripciones, precios).
* **Carrito de Compras:** Añade productos, ajusta cantidades y aplica códigos de descuento.
* **Proceso de Pedido:** Realiza pedidos seleccionando direcciones guardadas o temporales, con opción de programar la entrega. Integración con WhatsApp para confirmar el pedido.
* **Gestión de Perfil:** Crea/actualiza información de usuario, gestiona direcciones de entrega y preferencias de tema (claro/oscuro/sistema).
* **Historial de Pedidos:** Visualiza pedidos activos y pasados, con opción de editar (si está pendiente) o solicitar cancelación.
* **Actividad y Recompensas:** Revisa productos favoritos, gestiona reseñas y sigue el progreso en un sistema de referidos por niveles con recompensas.
* **Autenticación:** Inicio de sesión simplificado mediante número de WhatsApp.
* **PWA:** Instalable en dispositivos, con notificaciones push para actualizaciones de pedidos y funcionamiento offline básico.
* **Mapa Interactivo:** Selección de ubicación precisa para entrega usando Google Maps.

**Para Administradores:**

* **Dashboard:** Resumen visual de estadísticas clave (ingresos, pedidos, clientes).
* **Gestión de Pedidos:** Visualiza, filtra y actualiza el estado de los pedidos (pendiente, en proceso, en envío, completado, cancelado). Edita pedidos activos.
* **Creación Manual de Pedidos:** Permite a los administradores crear pedidos para clientes existentes o nuevos.
* **Gestión de Productos:** Crea, edita, activa/desactiva productos y categorías. Gestiona imágenes múltiples por producto con compresión automática.
* **Gestión de Clientes:** Visualiza información de clientes, historial de pedidos y direcciones.
* **Gestión de Horarios:** Define horarios de apertura semanales y excepciones (días festivos).
* **Gestión de Descuentos:** Crea y administra códigos de descuento (globales, por categoría, por producto, de un solo uso, para referidos).
* **Precios Especiales:** Configura precios diferenciados por producto o categoría, con fechas de vigencia y opción de aplicarlos a clientes específicos.
* **Sistema de Referidos:** Gestiona niveles de referidos, recompensas asociadas y edita el contador de referidos de los clientes.
* **Gestión de Administradores:** Crea nuevos administradores con roles (admin/staff) y permisos granulares por sección.
* **Términos y Condiciones:** Administra diferentes versiones de los términos y condiciones.
* **Autenticación Segura:** Login con email/contraseña para administradores. Rutas protegidas.

## 🛠️ Tecnologías Utilizadas

* **Frontend:** React 19, Vite, React Router DOM, React Helmet Async
* **Backend:** Supabase (Base de datos PostgreSQL, Autenticación, Storage, Edge Functions)
* **Mapas:** React Leaflet / @react-google-maps/api (Parece haber una mezcla o transición, revisar dependencias)
* **Estilos:** CSS Modules, CSS Variables (temas claro/oscuro)
* **Estado Global:** React Context API
* **Gráficos:** Chart.js, react-chartjs-2
* **PWA:** vite-plugin-pwa, Workbox
* **Otros:** DOMPurify (sanitización), browser-image-compression (compresión de imágenes), qrcode.react (generación de QR)


## 🚀 Instalación y Uso

1.  **Clonar el repositorio:**
    git clone https://github.com/fdxruli/ea-panel.git

2.  **Instalar dependencias:**
    npm install
    # o
    yarn install
    # o
    pnpm install

3.  **Configurar variables de entorno:**
    * Crea un archivo `.env` en la raíz del proyecto.
    * Añade las claves de tu proyecto Supabase y Google Maps API basándote en el archivo `.env` proporcionado. 
    VITE_SUPABASE_URL=TU_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
    VITE_GOOGLE_MAPS_API_KEY=TU_GOOGLE_MAPS_KEY
    VITE_BUSINESS_PHONE=NUMERO_WHATSAPP_NEGOCIO
    VITE_SUPER_ADMIN_EMAIL="EMAIL_DEL_SUPER_ADMIN"
    VITE_VAPID_PUBLIC_KEY="TU_VAPID_PUBLIC_KEY" # Para notificaciones push

4.  **Configurar Supabase:**
    * Asegúrate de tener las tablas (`customers`, `products`, `orders`, `categories`, `discounts`, etc.) y funciones RPC (`get_business_status`, `increment_referral_count`, etc.) creadas en tu proyecto Supabase según se utilizan en el código.
    * Configura el webhook para la Edge Function `send-order-notification` si deseas notificaciones push.
5.  **Iniciar el servidor de desarrollo:**
    npm run dev
    # o
    yarn dev
    # o
    pnpm dev
6.  Abre tu navegador en `http://localhost:5173` (o el puerto que indique Vite).

---

## 🏗️ Build para Producción

npm run build
# o
yarn build
# o
pnpm build