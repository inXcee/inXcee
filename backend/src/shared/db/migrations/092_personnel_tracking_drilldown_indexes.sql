-- Etkileşimli personel takip merkezi detay sorgularını hızlandıran bileşik indeksler.

CREATE INDEX IF NOT EXISTS idx_leave_requests_tracking_period
  ON leave_requests(status, start_date, end_date, staff_id, leave_type);

CREATE INDEX IF NOT EXISTS idx_overtime_records_tracking_period
  ON overtime_records(work_date, staff_id);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_tracking_period
  ON overtime_requests(status, work_date, staff_id);

