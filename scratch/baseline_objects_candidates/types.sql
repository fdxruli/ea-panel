-- Tipos Enums base
CREATE TYPE public.order_status AS ENUM (
    'pendiente',
    'confirmado',
    'en_preparacion',
    'listo_para_entregar',
    'completado',
    'cancelado'
);

CREATE TYPE public.discount_type AS ENUM (
    'general',
    'product',
    'category'
);

CREATE TYPE public.admin_role AS ENUM (
    'superadmin',
    'admin',
    'staff'
);

-- Tipo Compuesto base
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);
