-- Kiosk teslimleri c9e8a38 oncesinde laundry_deliveries'e yazilmiyordu
-- (deliverItemService bypass). Teslim edilmis ama deliveries kaydi olmayan
-- torbalar geriye donuk doldurulur — hub "Bugun Teslim" / oda gecmisi teslim
-- suresi istatistikleri gecmis icin de dogru sayar.
INSERT INTO laundry_deliveries(item_id, delivered_to, signature_data, delivered_by, delivered_at)
SELECT li.id,
       COALESCE(NULLIF(TRIM(li.delivered_name), ''), 'Bilinmiyor (backfill)'),
       li.occupant_signature,
       NULL,
       COALESCE(li.updated_at, li.created_at)
FROM laundry_items li
WHERE li.status = 'delivered'
  AND NOT EXISTS (SELECT 1 FROM laundry_deliveries ld WHERE ld.item_id = li.id);
