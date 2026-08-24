-- Executable SQL regression tests for customer_merge.
-- Run in a transaction and ROLLBACK when testing the valid merge path.

-- Invalid A=B must fail.
DO $$ BEGIN
  BEGIN
    PERFORM public.customer_merge('a90929ea-fbbc-4e6f-8663-40ddcfe70068','a90929ea-fbbc-4e6f-8663-40ddcfe70068');
    RAISE EXCEPTION 'expected A=B rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected A=B rejection' THEN RAISE; END IF;
  END;
END $$;

-- Different phones must fail.
DO $$ BEGIN
  BEGIN
    PERFORM public.customer_merge('a90929ea-fbbc-4e6f-8663-40ddcfe70068','157cb4cc-cc4f-48ae-8c12-ca5ec6c68b91');
    RAISE EXCEPTION 'expected different-phone rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected different-phone rejection' THEN RAISE; END IF;
  END;
END $$;

-- Missing A/B must fail.
DO $$ BEGIN
  BEGIN
    PERFORM public.customer_merge('00000000-0000-0000-0000-000000000001','a6f107eb-9c58-4a7f-8349-dd2479fbff5e');
    RAISE EXCEPTION 'expected missing-A rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected missing-A rejection' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.customer_merge('a90929ea-fbbc-4e6f-8663-40ddcfe70068','00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'expected missing-B rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected missing-B rejection' THEN RAISE; END IF;
  END;
END $$;

-- Full valid-path test. Wrap in BEGIN/ROLLBACK to verify that every dependency can move and
-- that the operation remains atomic without modifying persistent test data.
BEGIN;
SELECT public.customer_merge('ea6ccbc3-6c5e-4cf1-811b-e9d276172a4f','f843b3b2-f459-4a79-aca2-0664d44dba8c');
SELECT count(*) = 0 AS no_b_orders FROM orders WHERE customer_id='f843b3b2-f459-4a79-aca2-0664d44dba8c';
SELECT count(*) = 0 AS no_b_addresses FROM customer_addresses WHERE customer_id='f843b3b2-f459-4a79-aca2-0664d44dba8c';
SELECT count(*) = 1 AS ruly_push_preserved FROM push_subscriptions WHERE id=124 AND customer_id='ea6ccbc3-6c5e-4cf1-811b-e9d276172a4f';
SELECT count(*) = 0 AS no_b_special_prices FROM special_prices WHERE 'f843b3b2-f459-4a79-aca2-0664d44dba8c'::uuid = any(target_customer_ids);
SELECT count(*) = 0 AS no_b_customer FROM customers WHERE id='f843b3b2-f459-4a79-aca2-0664d44dba8c';
ROLLBACK;
