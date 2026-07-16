-- Unified staff dossier foundation: canonical staff/personnel link, documents,
-- follow-ups and role-aware note metadata.

CREATE TABLE IF NOT EXISTS staff_personnel_links (
  staff_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  personnel_id INTEGER NOT NULL UNIQUE REFERENCES personnel(id) ON DELETE CASCADE,
  link_method TEXT NOT NULL DEFAULT 'tc_unique'
    CHECK(link_method IN ('tc_unique','manual')),
  link_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(link_status IN ('confirmed','review_required')),
  linked_by INTEGER REFERENCES users(id),
  linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only unambiguous, exact TC matches are linked automatically. Duplicate staff
-- TC values remain unlinked so the dossier API can expose a data-quality warning.
INSERT OR IGNORE INTO staff_personnel_links(staff_id, personnel_id, link_method, link_status)
SELECT s.id, p.id, 'tc_unique', 'confirmed'
FROM staff s
JOIN personnel p ON trim(p.tc_no) = trim(s.tc_no)
WHERE s.tc_no IS NOT NULL
  AND trim(s.tc_no) <> ''
  AND (
    SELECT COUNT(*)
    FROM staff sx
    WHERE sx.tc_no IS NOT NULL AND trim(sx.tc_no) = trim(s.tc_no)
  ) = 1
  AND (
    SELECT COUNT(*)
    FROM personnel px
    WHERE px.tc_no IS NOT NULL AND trim(px.tc_no) = trim(p.tc_no)
  ) = 1;

CREATE INDEX IF NOT EXISTS idx_staff_personnel_links_personnel
  ON staff_personnel_links(personnel_id);

ALTER TABLE documents ADD COLUMN staff_id INTEGER REFERENCES staff(id);
ALTER TABLE documents ADD COLUMN document_kind TEXT NOT NULL DEFAULT 'other'
  CHECK(document_kind IN (
    'identity','contract','social_security','health_report','certificate',
    'training','kvkk','bank','payroll','discipline','work_accident','other'
  ));
ALTER TABLE documents ADD COLUMN document_no TEXT;
ALTER TABLE documents ADD COLUMN issued_on TEXT;
ALTER TABLE documents ADD COLUMN expires_on TEXT;
ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'operational'
  CHECK(visibility IN ('operational','sensitive'));
ALTER TABLE documents ADD COLUMN version_group TEXT;
ALTER TABLE documents ADD COLUMN archived_at DATETIME;

-- Backfill legacy personnel-linked documents only when related_id points to the
-- dorm personnel table and that record has one confirmed staff link.
UPDATE documents
SET staff_id = (
  SELECT spl.staff_id
  FROM staff_personnel_links spl
  WHERE spl.personnel_id = documents.related_id
)
WHERE staff_id IS NULL
  AND related_type = 'personnel'
  AND related_id IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM staff_personnel_links spl
    WHERE spl.personnel_id = documents.related_id
  ) = 1;

UPDATE documents
SET version_group = 'legacy-' || id
WHERE version_group IS NULL OR trim(version_group) = '';

CREATE INDEX IF NOT EXISTS idx_documents_staff_active
  ON documents(staff_id, archived_at, expires_on, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_staff_kind
  ON documents(staff_id, document_kind, visibility);
CREATE INDEX IF NOT EXISTS idx_documents_version_group
  ON documents(version_group, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS staff_document_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_kind TEXT NOT NULL CHECK(document_kind IN (
    'identity','contract','social_security','health_report','certificate',
    'training','kvkk','bank','payroll','discipline','work_accident','other'
  )),
  display_name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES staff_roles(id) ON DELETE CASCADE,
  requires_expiry INTEGER NOT NULL DEFAULT 0 CHECK(requires_expiry IN (0,1)),
  visibility TEXT NOT NULL DEFAULT 'operational'
    CHECK(visibility IN ('operational','sensitive')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_document_requirements_scope
  ON staff_document_requirements(
    document_kind,
    IFNULL(department_id, -1),
    IFNULL(role_id, -1)
  );
CREATE INDEX IF NOT EXISTS idx_staff_document_requirements_active
  ON staff_document_requirements(is_active, department_id, role_id);

INSERT OR IGNORE INTO staff_document_requirements(
  document_kind, display_name, requires_expiry, visibility
) VALUES
  ('identity', 'Kimlik belgesi', 0, 'sensitive'),
  ('contract', 'İş sözleşmesi', 1, 'sensitive'),
  ('social_security', 'SGK işe giriş bildirgesi', 0, 'sensitive'),
  ('health_report', 'Sağlık raporu', 1, 'sensitive'),
  ('kvkk', 'KVKK aydınlatma/onay formu', 0, 'sensitive'),
  ('bank', 'Banka/IBAN belgesi', 0, 'sensitive'),
  ('training', 'İş güvenliği eğitimi', 1, 'operational');

CREATE TABLE IF NOT EXISTS staff_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK(category IN (
      'general','document','attendance','performance','safety',
      'equipment','onboarding','offboarding','transport','dormitory'
    )),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('low','medium','high','critical')),
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at DATETIME,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','done','cancelled')),
  completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at DATETIME,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done')
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_followups_staff_status
  ON staff_followups(staff_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_staff_followups_assignee
  ON staff_followups(assigned_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_staff_followups_overdue
  ON staff_followups(status, due_at)
  WHERE status = 'open' AND due_at IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_staff_followups_updated_at
AFTER UPDATE ON staff_followups
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE staff_followups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

ALTER TABLE staff_notes ADD COLUMN category TEXT NOT NULL DEFAULT 'general'
  CHECK(category IN (
    'general','document','attendance','performance','safety',
    'equipment','onboarding','offboarding','transport','dormitory'
  ));
ALTER TABLE staff_notes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'operational'
  CHECK(visibility IN ('operational','sensitive'));
ALTER TABLE staff_notes ADD COLUMN updated_at DATETIME;
ALTER TABLE staff_notes ADD COLUMN archived_at DATETIME;

UPDATE staff_notes
SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_staff_notes_updated_at_insert
AFTER INSERT ON staff_notes
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE staff_notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_staff_notes_updated_at_update
AFTER UPDATE ON staff_notes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE staff_notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_staff_notes_dossier
  ON staff_notes(staff_id, archived_at, pinned DESC, created_at DESC);
