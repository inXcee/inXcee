ALTER TABLE cleaning_task_photos
  ADD COLUMN uploaded_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cleaning_task_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE RESTRICT,
  reviewer_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  identity_mode TEXT NOT NULL CHECK(identity_mode IN ('anonymous','resident_pin')),
  outcome TEXT NOT NULL CHECK(outcome IN ('approved','issue')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  followup_task_id INTEGER UNIQUE REFERENCES cleaning_tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(outcome != 'issue' OR (comment IS NOT NULL AND length(trim(comment)) >= 3))
);

CREATE INDEX IF NOT EXISTS ix_cleaning_task_reviews_location_date
  ON cleaning_task_reviews(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_cleaning_task_photos_staff
  ON cleaning_task_photos(uploaded_by_staff_id, uploaded_at DESC)
  WHERE uploaded_by_staff_id IS NOT NULL;
