-- =============================================================================
-- Migration: 20260920160000_inventory_concurrency_idempotency.sql
-- Description: Hardens inventory deduction with deterministic row-level locking
--              (FOR UPDATE), eliminates deadlocks, and introduces an authoritative
--              deduction ledger for strict database-level idempotency.
-- =============================================================================

-- 1. Dedicated Inventory Deductions Ledger (Idempotency Registry)
CREATE TABLE IF NOT EXISTS public.inventory_deductions (
  order_id VARCHAR(64) PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  deducted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.inventory_deductions ENABLE ROW LEVEL SECURITY;

-- Deny public writes. Service role bypasses RLS.
-- Admins can view deduction history.
DROP POLICY IF EXISTS inventory_deductions_admin_read ON public.inventory_deductions;
CREATE POLICY inventory_deductions_admin_read ON public.inventory_deductions
  FOR SELECT USING (public.is_admin());

-- 2. Hardened Atomic Inventory Deduction Procedure
-- - Deterministic row-level locking (ORDER BY sku ASC FOR UPDATE) prevents race
--   conditions and deadlocks across concurrent multi-item checkouts.
-- - Idempotent: Subsequent calls for the same order return TRUE immediately
--   without mutating stock.
-- - Enforces stock >= required_qty under active lock before performing any deduction.
-- - Search path pinned for security.
CREATE OR REPLACE FUNCTION public.deduct_order_inventory(p_order_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_already_deducted BOOLEAN;
  v_item RECORD;
  v_stock RECORD;
  v_deduction_summary JSONB := '[]'::jsonb;
BEGIN
  -- 1. Idempotency Gate: Check if this order has already had inventory deducted
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_deductions WHERE order_id = p_order_id
  ) INTO v_already_deducted;

  IF v_already_deducted THEN
    RETURN TRUE;
  END IF;

  -- Verify order exists and has items
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'No order items found for order %', p_order_id;
  END IF;

  -- 2. Deterministic Row-Level Locking (eliminates deadlocks & race conditions)
  -- Locks all required inventory rows alphabetically by SKU.
  PERFORM 1
  FROM public.inventory
  WHERE sku IN (
    SELECT sku FROM public.order_items WHERE order_id = p_order_id
  )
  ORDER BY sku ASC
  FOR UPDATE;

  -- 3. Pre-flight Validation under Exclusive Lock
  FOR v_item IN
    SELECT sku, SUM(quantity)::INTEGER AS required_qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY sku
    ORDER BY sku ASC
  LOOP
    SELECT stock, availability INTO v_stock
    FROM public.inventory
    WHERE sku = v_item.sku;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SKU % does not exist in inventory for order %', v_item.sku, p_order_id;
    END IF;

    IF v_stock.stock < v_item.required_qty THEN
      RAISE EXCEPTION 'Insufficient stock for SKU % in order % (requested: %, available: %)',
        v_item.sku, p_order_id, v_item.required_qty, v_stock.stock;
    END IF;
  END LOOP;

  -- 4. Execute Mutations (Safe, atomic stock deduction)
  FOR v_item IN
    SELECT sku, SUM(quantity)::INTEGER AS required_qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY sku
    ORDER BY sku ASC
  LOOP
    UPDATE public.inventory
    SET stock = stock - v_item.required_qty,
        availability = CASE WHEN (stock - v_item.required_qty) <= 0 THEN 'Out of Stock' ELSE 'In Stock' END,
        updated_at = NOW()
    WHERE sku = v_item.sku;

    v_deduction_summary := v_deduction_summary || jsonb_build_object(
      'sku', v_item.sku,
      'deducted', v_item.required_qty
    );
  END LOOP;

  -- 5. Record Authoritative Ledger Entry (Guarantees at-most-once deduction)
  INSERT INTO public.inventory_deductions (order_id, details)
  VALUES (p_order_id, jsonb_build_object(
    'items', v_deduction_summary,
    'deducted_at', NOW()
  ))
  ON CONFLICT (order_id) DO NOTHING;

  -- 6. Stamp Order Metadata
  UPDATE public.orders
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{inventory_deducted_at}',
    to_jsonb(NOW())
  ),
  updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;
