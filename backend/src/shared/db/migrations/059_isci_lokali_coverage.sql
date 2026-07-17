-- İşçi Lokali kapsama kuralları: 06:15 ve 15:00 vardiyalarında en az 1 kişi olmalı;
-- boşta kalırsa kadro kapsaması kırmızı uyarı verir. Zaman aralığı ile tanımlıdır
-- (isimli 06:15 shift_definition olmasa da çalışır). İsim çakışmasına karşı idempotent.

INSERT INTO shift_coverage_rules(name, work_location_id, start_time, end_time, min_staff, days_of_week, is_active)
SELECT 'İşçi Lokali — Sabah (06:15)', wl.id, '06:15', '15:00', 1, '1,2,3,4,5,6,7', 1
FROM work_locations wl
WHERE wl.name = 'Isci Lokali'
  AND NOT EXISTS (SELECT 1 FROM shift_coverage_rules r WHERE r.name = 'İşçi Lokali — Sabah (06:15)');

INSERT INTO shift_coverage_rules(name, work_location_id, start_time, end_time, min_staff, days_of_week, is_active)
SELECT 'İşçi Lokali — Akşam (15:00)', wl.id, '15:00', '23:00', 1, '1,2,3,4,5,6,7', 1
FROM work_locations wl
WHERE wl.name = 'Isci Lokali'
  AND NOT EXISTS (SELECT 1 FROM shift_coverage_rules r WHERE r.name = 'İşçi Lokali — Akşam (15:00)');
