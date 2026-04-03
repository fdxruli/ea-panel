import { supabase } from './supabaseClient';

const CLIENT_BASIC_PRODUCT_FIELDS = `
  id,
  name,
  description,
  price,
  image_url,
  category_id,
  is_active
`;

const ADMIN_BASIC_PRODUCT_FIELDS = `
  id,
  name,
  description,
  price,
  cost,
  image_url,
  category_id,
  is_active
`;

const buildBasicProductsQuery = ({ activeOnly = false, includeCost = false } = {}) => {
  let query = supabase
    .from('products')
    .select(includeCost ? ADMIN_BASIC_PRODUCT_FIELDS : CLIENT_BASIC_PRODUCT_FIELDS)
    .order('name');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  return query;
};

export const fetchAdminBasicProducts = () =>
  buildBasicProductsQuery({ includeCost: true });

export const fetchClientBasicProducts = () =>
  buildBasicProductsQuery({ activeOnly: true });
