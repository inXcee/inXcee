-- Faz 6: Günlük Operasyon Merkezi — devir teslim notu.
--
-- Vardiya amiri gün içinde olanları (kim gelmedi, kim yerine çağrıldı, hangi
-- nokta boş kaldı) bir sonraki amire sözlü aktarıyor; sistemde iz kalmıyor.
-- Ertesi gün "dün ne oldu" sorusunun cevabı kimsede yok.
--
-- staff_notes personel bazlıdır, günlük operasyon notu değildir; bu yüzden
-- ayrı tablo.

CREATE TABLE IF NOT EXISTS shift_handover_notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  work_date    TEXT NOT NULL,
  shift_def_id INTEGER REFERENCES shift_definitions(id),
  note         TEXT NOT NULL,
  author_id    INTEGER REFERENCES users(id),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shift_handover_notes_date
  ON shift_handover_notes(work_date DESC);
