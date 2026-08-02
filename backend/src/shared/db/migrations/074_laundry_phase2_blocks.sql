-- Faz 2 A/B/C bloklarında sahadaki düzensiz oda numaraları 1-80 aralığında
-- kullanılabilir. Odalar DB'de geçerli tutulur; kiosk bunları grid olarak çizmez.
WITH RECURSIVE room_numbers(room_no) AS (
  SELECT 1
  UNION ALL
  SELECT room_no + 1 FROM room_numbers WHERE room_no < 80
), phase2_blocks(block) AS (
  VALUES ('F2A'), ('F2B'), ('F2C')
)
INSERT OR IGNORE INTO rooms(block, floor, room_no, capacity, active_beds, status)
SELECT block, 1, CAST(room_no AS TEXT), 6, 6, 'active'
FROM phase2_blocks CROSS JOIN room_numbers;

-- Faz 2 blokları ilk kurulumda standarttır: ütü kapalı, giriş/teslim imzası
-- zorunlu. Yetkili kullanıcı daha sonra blok bazında premium yapabilir.
INSERT OR IGNORE INTO laundry_block_config(block, is_premium, updated_at)
VALUES
  ('F2A', 0, datetime('now')),
  ('F2B', 0, datetime('now')),
  ('F2C', 0, datetime('now'));
