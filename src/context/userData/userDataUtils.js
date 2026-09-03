export const EMPTY_PROFILE_DATA = {
    customer: null,
    addresses: [],
};

export const EMPTY_ORDERS = [];

export const isValidCustomer = (customer, canonicalCustomerId) => (
    !!customer?.id &&
    !!canonicalCustomerId &&
    customer.id === canonicalCustomerId
);

export const areValidOrders = (orders, canonicalCustomerId) => (
    Array.isArray(orders) &&
    orders.every(order => order?.customer_id === canonicalCustomerId)
);

export const isNetworkError = (error) => (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed|fetch|timeout/i.test(error?.message || '')
);

export const isOrdersRoute = (pathname) => (
    pathname === '/mis-pedidos' || pathname.startsWith('/mis-pedidos/')
);
