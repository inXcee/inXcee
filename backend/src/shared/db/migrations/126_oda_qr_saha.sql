-- Oda QR'ı ile saha takibi (24 Eki 2026, docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md).
-- Temizlikçi kapıdaki QR'ı okutur; okutma location_portal_events'e event_type='field_scan' (actor_mode='worker')
-- olarak yazılır ve 60 dk içindeki "temizlendi / temizlenemedi" işaretini QR ile doğrulanmış yapar.
--   cleaning_tasks.verified_scan_event_id   işareti doğrulayan okutma (verified_by_qr zaten var).
--   location_qr_deployments.*_by_staff_id   etiketi sahadan (kiosk, users kaydı yok) asan / doğrulayan personel.
--   location_qr_verify_mismatches.reported_by_staff_id   yanlış kapıyı sahadan bulan personel.
--   saha_qr_enforcement   'off' (varsayılan) | 'verified_labels': açıkken etiketi doğrulanmış kapıda okutmasız
--                          işaret reddedilir. Etiket kapıda değilken kimse engellenmez.
ALTER TABLE cleaning_tasks ADD COLUMN verified_scan_event_id INTEGER REFERENCES location_portal_events(id);

ALTER TABLE location_qr_deployments ADD COLUMN installed_by_staff_id INTEGER REFERENCES staff(id);
ALTER TABLE location_qr_deployments ADD COLUMN verified_by_staff_id INTEGER REFERENCES staff(id);
ALTER TABLE location_qr_verify_mismatches ADD COLUMN reported_by_staff_id INTEGER REFERENCES staff(id);

CREATE INDEX IF NOT EXISTS ix_location_portal_events_staff_scan
  ON location_portal_events(actor_staff_id, event_type, created_at);

INSERT OR IGNORE INTO system_settings(key, value) VALUES('saha_qr_enforcement', 'off');
