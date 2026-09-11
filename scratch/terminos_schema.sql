-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  role USER-DEFINED DEFAULT 'staff'::admin_role,
  created_at timestamp with time zone DEFAULT now(),
  permissions jsonb DEFAULT '{"dashboard": true}'::jsonb,
  CONSTRAINT admins_pkey PRIMARY KEY (id),
  CONSTRAINT fk_admins_auth_users FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.business_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  start_date date NOT NULL UNIQUE,
  is_closed boolean DEFAULT true,
  open_time time without time zone,
  close_time time without time zone,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  end_date date,
  CONSTRAINT business_exceptions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.business_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time without time zone NOT NULL,
  close_time time without time zone NOT NULL,
  is_closed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT business_hours_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  label character varying NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  address text,
  address_reference text,
  created_at timestamp with time zone DEFAULT now(),
  is_default boolean DEFAULT false,
  CONSTRAINT customer_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customer_discount_usage (
  customer_id uuid NOT NULL,
  discount_id uuid NOT NULL,
  used_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_discount_usage_pkey PRIMARY KEY (customer_id, discount_id),
  CONSTRAINT customer_discount_usage_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_discount_usage_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id)
);
CREATE TABLE public.customer_favorites (
  customer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_favorites_pkey PRIMARY KEY (customer_id, product_id),
  CONSTRAINT customer_favorites_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.customer_reward_claims (
  customer_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  claimed_at timestamp with time zone DEFAULT now(),
  generated_code text NOT NULL,
  CONSTRAINT customer_reward_claims_pkey PRIMARY KEY (customer_id, reward_id),
  CONSTRAINT customer_reward_claims_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_reward_claims_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id)
);
CREATE TABLE public.customer_terms_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  terms_version_id uuid NOT NULL,
  accepted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_terms_acceptances_pkey PRIMARY KEY (id),
  CONSTRAINT customer_terms_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_terms_acceptances_terms_version_id_fkey FOREIGN KEY (terms_version_id) REFERENCES public.terms_and_conditions(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  phone character varying NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  referral_code character varying UNIQUE,
  referrer_id uuid,
  referral_count integer DEFAULT 0,
  has_made_first_purchase boolean DEFAULT false,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code character varying NOT NULL UNIQUE,
  type USER-DEFINED NOT NULL,
  value numeric NOT NULL CHECK (value >= 0::numeric),
  target_id uuid,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  is_single_use boolean DEFAULT false,
  requires_referred_status boolean DEFAULT false,
  specific_customer_id uuid,
  CONSTRAINT discounts_pkey PRIMARY KEY (id),
  CONSTRAINT discounts_specific_customer_id_fkey FOREIGN KEY (specific_customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  price numeric NOT NULL CHECK (price >= 0::numeric),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0::numeric),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_code character varying NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  status USER-DEFINED DEFAULT 'pendiente'::order_status,
  total_amount numeric NOT NULL CHECK (total_amount >= 0::numeric),
  discount_code character varying,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  scheduled_for timestamp with time zone,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT orders_discount_code_fkey FOREIGN KEY (discount_code) REFERENCES public.discounts(code)
);
CREATE TABLE public.product_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_images_pkey PRIMARY KEY (id),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT product_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  cost numeric NOT NULL CHECK (cost >= 0::numeric),
  image_url text,
  category_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  customer_id uuid NOT NULL UNIQUE,
  subscription_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.referral_levels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  min_referrals integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT referral_levels_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  level_id uuid,
  description text NOT NULL,
  type character varying,
  reward_code character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rewards_pkey PRIMARY KEY (id),
  CONSTRAINT rewards_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.referral_levels(id)
);
CREATE TABLE public.settings (
  key text NOT NULL,
  value jsonb,
  description text,
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.special_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid,
  category_id uuid,
  override_price numeric NOT NULL CHECK (override_price >= 0::numeric),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  target_customer_ids ARRAY,
  CONSTRAINT special_prices_pkey PRIMARY KEY (id),
  CONSTRAINT special_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT special_prices_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.terms_and_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  content text NOT NULL,
  published_at timestamp with time zone DEFAULT now(),
  CONSTRAINT terms_and_conditions_pkey PRIMARY KEY (id)
);
