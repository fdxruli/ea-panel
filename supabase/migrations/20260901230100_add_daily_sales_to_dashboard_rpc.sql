-- Migration: 20260901230100_add_daily_sales_to_dashboard_rpc.sql
-- Description: Agrega series de tiempo diarias y crecimiento al RPC del dashboard
-- Author: Antigravity (ea-panel)

-- ============================================================
-- get_advanced_dashboard_stats
-- Returns a JSONB document with:
--   profitableProducts  - top products by profit (completed orders only)
--   recentOrders        - last 10 orders with customer name
--   totalRevenue        - sum of total_amount for completed orders in range
--   totalCosts          - sum of (quantity * cost) for completed orders in range
--   totalProfit         - totalRevenue - totalCosts
--   profitMargin        - (totalProfit / totalRevenue) * 100, rounded to 1 dp
--   avgOrderValue       - average order total_amount for completed orders in range
--   totalCustomers      - distinct customers who placed any order in range
--   pendingOrders       - count of orders with status = 'pendiente'
--   completedOrders     - count of orders with status = 'completado'
--   canceledOrders      - count of orders with status = 'cancelado'
--   daily_sales         - [NEW] time-series {day, revenue, orders_count} by calendar day
--   growth_percent      - [NEW] revenue growth vs prior equal-length period
-- ============================================================

CREATE OR REPLACE FUNCTION get_advanced_dashboard_stats(
    p_start_date TIMESTAMPTZ,
    p_end_date   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
    -- Duration of the requested window (used to derive the previous period)
    v_interval          INTERVAL    := p_end_date - p_start_date;

    -- Previous-period boundaries (same length, immediately before current)
    v_prev_start        TIMESTAMPTZ := p_start_date - v_interval;
    v_prev_end          TIMESTAMPTZ := p_start_date;

    -- Scalar aggregates for the current period (completed orders)
    v_total_revenue     NUMERIC := 0;
    v_total_costs       NUMERIC := 0;
    v_total_profit      NUMERIC := 0;
    v_profit_margin     NUMERIC := 0;
    v_avg_order_value   NUMERIC := 0;

    -- Order counts (all statuses, current period)
    v_total_customers   BIGINT  := 0;
    v_pending_orders    BIGINT  := 0;
    v_completed_orders  BIGINT  := 0;
    v_canceled_orders   BIGINT  := 0;

    -- Previous-period revenue for growth calculation
    v_prev_revenue      NUMERIC := 0;
    v_growth_percent    NUMERIC := 0;

    -- JSON accumulators
    v_profitable_products   JSONB := '[]'::JSONB;
    v_recent_orders         JSONB := '[]'::JSONB;
    v_daily_sales           JSONB := '[]'::JSONB;
BEGIN

    -- --------------------------------------------------------
    -- 1. Scalar aggregates — current period, completed orders
    --    Item costs are pre-aggregated per order to avoid the
    --    Cartesian explosion that a naive JOIN would cause.
    -- --------------------------------------------------------
    SELECT
        COALESCE(SUM(o.total_amount),        0),
        COALESCE(SUM(oi.item_costs),         0),
        COALESCE(AVG(o.total_amount),        0),
        COALESCE(COUNT(DISTINCT o.id),       0)
    INTO
        v_total_revenue,
        v_total_costs,
        v_avg_order_value,
        v_completed_orders
    FROM orders o
    LEFT JOIN (
        SELECT
            order_id,
            SUM(quantity * COALESCE(cost, 0)) AS item_costs
        FROM order_items
        GROUP BY order_id
    ) oi ON oi.order_id = o.id
    WHERE o.status    = 'completado'
      AND o.created_at BETWEEN p_start_date AND p_end_date;

    v_total_profit    := v_total_revenue - v_total_costs;
    v_profit_margin   := ROUND(
                            (v_total_profit / NULLIF(v_total_revenue, 0)) * 100,
                            1
                         );
    v_avg_order_value := ROUND(v_avg_order_value, 2);

    -- --------------------------------------------------------
    -- 2. Order-status counts (all statuses, current period)
    -- --------------------------------------------------------
    SELECT
        COALESCE(COUNT(*) FILTER (WHERE status = 'pendiente'),  0),
        COALESCE(COUNT(*) FILTER (WHERE status = 'cancelado'),  0),
        COALESCE(COUNT(DISTINCT customer_id),                   0)
    INTO
        v_pending_orders,
        v_canceled_orders,
        v_total_customers
    FROM orders
    WHERE created_at BETWEEN p_start_date AND p_end_date;

    -- --------------------------------------------------------
    -- 3. Previous-period revenue (completed orders only)
    --    Previous window = [p_start_date - interval, p_start_date)
    -- --------------------------------------------------------
    SELECT COALESCE(SUM(total_amount), 0)
    INTO   v_prev_revenue
    FROM   orders
    WHERE  status     = 'completado'
      AND  created_at BETWEEN v_prev_start AND v_prev_end;

    v_growth_percent := ROUND(
                            ((v_total_revenue - v_prev_revenue)
                                / NULLIF(v_prev_revenue, 0)) * 100,
                            1
                        );

    -- --------------------------------------------------------
    -- 4. Profitable products (completed orders, current period)
    --    Grouped by product; ordered by profit DESC.
    -- --------------------------------------------------------
    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'name',          p.name,
                'revenue',       ROUND(pp.revenue,    2),
                'totalCost',     ROUND(pp.total_cost, 2),
                'profit',        ROUND(pp.profit,     2),
                'marginPercent', ROUND(
                                     (pp.profit / NULLIF(pp.revenue, 0)) * 100,
                                     1
                                 ),
                'quantity',      pp.qty,
                'avgPrice',      ROUND(pp.avg_price,  2),
                'avgCost',       ROUND(pp.avg_cost,   2)
            )
            ORDER BY pp.profit DESC
        ),
        '[]'::JSONB
    )
    INTO v_profitable_products
    FROM (
        SELECT
            oi.product_id,
            SUM(oi.quantity * oi.price)                           AS revenue,
            SUM(oi.quantity * COALESCE(oi.cost, 0))         AS total_cost,
            SUM(oi.quantity * oi.price)
                - SUM(oi.quantity * COALESCE(oi.cost, 0))   AS profit,
            SUM(oi.quantity)                                       AS qty,
            AVG(oi.price)                                          AS avg_price,
            AVG(oi.cost)                                     AS avg_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status     = 'completado'
          AND o.created_at BETWEEN p_start_date AND p_end_date
        GROUP BY oi.product_id
    ) pp
    JOIN products p ON p.id = pp.product_id;

    -- --------------------------------------------------------
    -- 5. Recent orders (last 10, all statuses, with customer)
    -- --------------------------------------------------------
    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'id',           ro.id,
                'customerName', COALESCE(c.name, 'Sin cliente'),
                'totalAmount',  ROUND(COALESCE(ro.total_amount, 0), 2),
                'status',       ro.status,
                'createdAt',    ro.created_at
            )
            ORDER BY ro.created_at DESC
        ),
        '[]'::JSONB
    )
    INTO v_recent_orders
    FROM (
        SELECT id, customer_id, total_amount, status, created_at
        FROM   orders
        WHERE  created_at BETWEEN p_start_date AND p_end_date
        ORDER  BY created_at DESC
        LIMIT  10
    ) ro
    LEFT JOIN customers c ON c.id = ro.customer_id;

    -- --------------------------------------------------------
    -- 6. Daily sales time series — completed orders, current period
    --    Day is derived from created_at in America/Mexico_City
    --    local time so midnight boundaries are correct for MX.
    -- --------------------------------------------------------
    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'day',          ds.day,
                'revenue',      ROUND(ds.revenue, 2),
                'orders_count', ds.orders_count
            )
            ORDER BY ds.day ASC
        ),
        '[]'::JSONB
    )
    INTO v_daily_sales
    FROM (
        SELECT
            DATE_TRUNC('day', created_at AT TIME ZONE 'America/Mexico_City')::DATE
                                           AS day,
            COALESCE(SUM(total_amount), 0) AS revenue,
            COUNT(*)                        AS orders_count
        FROM orders
        WHERE status     = 'completado'
          AND created_at BETWEEN p_start_date AND p_end_date
        GROUP BY 1
    ) ds;

    -- --------------------------------------------------------
    -- 7. Assemble and return the final JSONB document
    -- --------------------------------------------------------
    RETURN JSONB_BUILD_OBJECT(
        'profitableProducts', v_profitable_products,
        'recentOrders',       v_recent_orders,
        'totalRevenue',       v_total_revenue,
        'totalCosts',         v_total_costs,
        'totalProfit',        v_total_profit,
        'profitMargin',       COALESCE(v_profit_margin, 0),
        'avgOrderValue',      v_avg_order_value,
        'totalCustomers',     v_total_customers,
        'pendingOrders',      v_pending_orders,
        'completedOrders',    v_completed_orders,
        'canceledOrders',     v_canceled_orders,
        'daily_sales',        v_daily_sales,
        'growth_percent',     COALESCE(v_growth_percent, 0)
    );

END;
$$;

-- ============================================================
-- Permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION get_advanced_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ)
    TO anon, authenticated, service_role;
