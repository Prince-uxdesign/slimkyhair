-- ============================================================================
-- Migration: 20260928120000_hair_tools_inventory.sql
-- Milestone: Hair Tools & Accessories (physical products)
--
-- Registers stock for the new hair-tools SKUs (prod-17 .. prod-25). Each tool
-- is sold per age group, so every Kids / Teens / Adults variant is its own
-- SKU. deduct_order_inventory() rejects orders for SKUs missing from this
-- table, so these rows must exist before the products can be bought.
--
-- DO NOTHING on conflict: re-running never resets stock an admin has changed.
-- ============================================================================

INSERT INTO public.inventory (sku, product_id, variant_id, stock, availability) VALUES
  ('SLM-BON-KID', 'prod-17', 'SLM-BON-KID', 30, 'In Stock'),
  ('SLM-BON-TEN', 'prod-17', 'SLM-BON-TEN', 26, 'In Stock'),
  ('SLM-BON-ADL', 'prod-17', 'SLM-BON-ADL', 40, 'In Stock'),
  ('SLM-CMB-KID', 'prod-18', 'SLM-CMB-KID', 45, 'In Stock'),
  ('SLM-CMB-TEN', 'prod-18', 'SLM-CMB-TEN', 38, 'In Stock'),
  ('SLM-CMB-ADL', 'prod-18', 'SLM-CMB-ADL', 50, 'In Stock'),
  ('SLM-BRS-KID', 'prod-19', 'SLM-BRS-KID', 22, 'In Stock'),
  ('SLM-BRS-TEN', 'prod-19', 'SLM-BRS-TEN', 20, 'In Stock'),
  ('SLM-BRS-ADL', 'prod-19', 'SLM-BRS-ADL', 28, 'In Stock'),
  ('SLM-HOT-TEN', 'prod-20', 'SLM-HOT-TEN', 12, 'In Stock'),
  ('SLM-HOT-ADL', 'prod-20', 'SLM-HOT-ADL', 15, 'In Stock'),
  ('SLM-PRT-KID', 'prod-21', 'SLM-PRT-KID', 40, 'In Stock'),
  ('SLM-PRT-TEN', 'prod-21', 'SLM-PRT-TEN', 35, 'In Stock'),
  ('SLM-PRT-ADL', 'prod-21', 'SLM-PRT-ADL', 48, 'In Stock'),
  ('SLM-EBR-KID', 'prod-22', 'SLM-EBR-KID', 34, 'In Stock'),
  ('SLM-EBR-TEN', 'prod-22', 'SLM-EBR-TEN', 30, 'In Stock'),
  ('SLM-EBR-ADL', 'prod-22', 'SLM-EBR-ADL', 42, 'In Stock'),
  ('SLM-TWL-KID', 'prod-23', 'SLM-TWL-KID', 25, 'In Stock'),
  ('SLM-TWL-TEN', 'prod-23', 'SLM-TWL-TEN', 22, 'In Stock'),
  ('SLM-TWL-ADL', 'prod-23', 'SLM-TWL-ADL', 30, 'In Stock'),
  ('SLM-SCR-KID', 'prod-24', 'SLM-SCR-KID', 36, 'In Stock'),
  ('SLM-SCR-TEN', 'prod-24', 'SLM-SCR-TEN', 32, 'In Stock'),
  ('SLM-SCR-ADL', 'prod-24', 'SLM-SCR-ADL', 40, 'In Stock'),
  ('SLM-PIL-KID', 'prod-25', 'SLM-PIL-KID', 18, 'In Stock'),
  ('SLM-PIL-TEN', 'prod-25', 'SLM-PIL-TEN', 16, 'In Stock'),
  ('SLM-PIL-ADL', 'prod-25', 'SLM-PIL-ADL', 24, 'In Stock')
ON CONFLICT (sku) DO NOTHING;
