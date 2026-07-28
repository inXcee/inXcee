-- Ayni sablonun ayni gun/yone iki aktif sefer uretmesini engeller.
CREATE UNIQUE INDEX idx_transport_trips_template_date_active
  ON transport_trips(template_id, work_date, direction)
  WHERE template_id IS NOT NULL AND status <> 'cancelled';

CREATE INDEX idx_transport_templates_active_dates
  ON transport_trip_templates(is_active, valid_from, valid_to);

