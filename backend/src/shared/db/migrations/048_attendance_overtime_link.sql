-- Link card/kiosk overtime candidates to the request created from the exception.

ALTER TABLE attendance_exceptions
  ADD COLUMN overtime_request_id INTEGER REFERENCES overtime_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_exception_overtime_request
  ON attendance_exceptions(overtime_request_id)
  WHERE overtime_request_id IS NOT NULL;
