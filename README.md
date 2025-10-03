🚀 ENTRE ALAS - Sistema de Pedidos Web
Este proyecto es una aplicación web completa y moderna para la gestión de pedidos de un restaurante, desarrollada con React y Supabase. Ofrece una experiencia fluida tanto para los clientes que realizan pedidos como para los administradores que gestionan el negocio.

La plataforma se divide en dos componentes principales:

Interfaz de Cliente: Un menú digital interactivo y fácil de usar donde los clientes pueden explorar productos, personalizar sus pedidos, gestionar su perfil y realizar compras.

Panel de Administración: Una potente herramienta interna para gestionar todos los aspectos del negocio, desde pedidos en tiempo real y productos, hasta clientes y promociones.

✨ Características Principales
Para Clientes
Menú Interactivo: Visualización de productos por categorías con vista de lista o cuadrícula.

Carrito de Compras Persistente: El carrito guarda los productos localmente para no perder el pedido.

Gestión de Perfil de Usuario: Los clientes pueden registrarse con su número de WhatsApp, guardar y gestionar sus datos y direcciones de envío.

Historial de Pedidos: Visualización de pedidos activos y pasados con la opción de "Volver a Pedir".

Favoritos y Reseñas: Los clientes pueden guardar sus productos favoritos y dejar calificaciones o comentarios.

Horario Comercial en Tiempo Real: La app muestra si el negocio está abierto o cerrado, impidiendo añadir productos al carrito fuera de horario.

Tema Claro/Oscuro: Selector de tema (claro, oscuro o automático) que se guarda en las preferencias del usuario.

Proceso de Compra Integrado con WhatsApp: Al finalizar un pedido, se genera un mensaje pre-llenado para enviar por WhatsApp.

Para Administradores
Dashboard de Estadísticas: Un panel visual con tarjetas y gráficos (ingresos, total de pedidos, productos más vendidos) para un resumen rápido del negocio.

Gestión de Pedidos en Tiempo Real: Visualización de pedidos entrantes con actualizaciones instantáneas gracias a Supabase Realtime. Los administradores pueden cambiar el estado de los pedidos (pendiente, en proceso, completado, cancelado).

Administración de Catálogo: CRUD completo para productos y categorías.

Gestión de Clientes (CRM): Visualización de la información de los clientes, su historial de pedidos y direcciones.

Sistema de Permisos y Roles: Creación de administradores con roles (Admin con acceso total, Staff con permisos granulares por módulo).

Gestión de Horarios y Excepciones: Permite configurar el horario comercial semanal y añadir días festivos o fechas especiales en las que el negocio estará cerrado o tendrá un horario diferente.

Creación de Descuentos: Generación de códigos de descuento aplicables de forma global, por categoría o a productos específicos.

🛠️ Tecnologías Utilizadas
Frontend:

React.js: Biblioteca principal para la construcción de la interfaz.

Vite: Herramienta de desarrollo y empaquetado ultra-rápida.

React Router: Para la gestión de rutas en la aplicación.

React Chart.js 2: Para las gráficas del dashboard.

CSS Modules: Para estilos encapsulados por componente.

DOMPurify: Para sanitizar HTML y prevenir ataques XSS.

Backend & Base de Datos (BaaS):

Supabase: Utilizado para la base de datos PostgreSQL, autenticación, almacenamiento de imágenes y suscripciones en tiempo real (WebSockets).

Mapas:

Google Maps API: Para la selección y visualización de direcciones de entrega.

⚙️ Configuración y Puesta en Marcha
Sigue estos pasos para levantar el proyecto en tu entorno local.

Prerrequisitos
Node.js (v16 o superior)

npm o yarn

Una cuenta en Supabase para crear tu proyecto.

Pasos de Instalación
Clona el repositorio:
git clone https://github.com/tu-usuario/tu-repositorio.git
cd tu-repositorio

Instala las dependencias:
npm install

Configura las variables de entorno:
Crea un archivo .env en la raíz del proyecto, basándote en el archivo src/lib/supabaseClient.js y otros componentes.
Añade tus credenciales de Supabase y otras claves de API.
Ejemplo de .env:
Fragmento de código
# Credenciales de tu proyecto en Supabase
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyxxxxxxxx

# API Key de Google Maps (con Maps JavaScript API y Geocoding API habilitadas)
VITE_GOOGLE_MAPS_API_KEY=AIxxxxxxxx

# Número de WhatsApp del negocio para enviar los pedidos
VITE_BUSINESS_PHONE=521xxxxxxxxxx

Ejecuta el proyecto en modo de desarrollo:
npm run dev
