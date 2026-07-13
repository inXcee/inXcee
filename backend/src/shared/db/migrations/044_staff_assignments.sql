-- Phase 1: dated staff assignments and optional role/department validation.

ALTER TABLE staff_roles ADD COLUMN expected_dept_id INTEGER REFERENCES departments(id);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  role_id INTEGER REFERENCES staff_roles(id) ON DELETE SET NULL,
  work_location_id INTEGER REFERENCES work_locations(id) ON DELETE SET NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(staff_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_period
  ON staff_assignments(staff_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_dept
  ON staff_assignments(department_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_role
  ON staff_assignments(role_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_location
  ON staff_assignments(work_location_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_staff_roles_expected_dept
  ON staff_roles(expected_dept_id);

INSERT INTO staff_assignments(
  staff_id, department_id, role_id, work_location_id,
  effective_from, effective_to, note
)
SELECT
  s.id,
  s.department_id,
  s.role_id,
  NULL,
  COALESCE(NULLIF(s.hire_date, ''), '1970-01-01'),
  NULL,
  'Initial assignment'
FROM staff s
WHERE NOT EXISTS (
  SELECT 1 FROM staff_assignments sa WHERE sa.staff_id = s.id
);
