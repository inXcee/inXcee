import { getDB } from '../../shared/db/index.js'

export function insertSurvey(personnelId, data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO satisfaction_surveys
      (personnel_id, room_score, cleaning_score, food_score, laundry_score, overall_score, comment)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    personnelId || null,
    data.room_score ?? null,
    data.cleaning_score ?? null,
    data.food_score ?? null,
    data.laundry_score ?? null,
    data.overall_score ?? null,
    data.comment || null,
  )
  return r.lastInsertRowid
}

export function listSurveys({ limit = 200 } = {}) {
  const db = getDB()
  return db.prepare(`
    SELECT s.*, p.full_name AS personnel_name, p.company
    FROM satisfaction_surveys s
    LEFT JOIN personnel p ON p.id=s.personnel_id
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(limit)
}

export function getSurveyStats({ days = 30 } = {}) {
  const db = getDB()
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      ROUND(AVG(room_score), 2) AS avg_room,
      ROUND(AVG(cleaning_score), 2) AS avg_cleaning,
      ROUND(AVG(food_score), 2) AS avg_food,
      ROUND(AVG(laundry_score), 2) AS avg_laundry,
      ROUND(AVG(overall_score), 2) AS avg_overall
    FROM satisfaction_surveys
    WHERE created_at >= datetime('now', '-' || ? || ' days')
  `).get(days)
}

export function getSurveyTrend({ days = 30 } = {}) {
  const db = getDB()
  return db.prepare(`
    SELECT date(created_at) AS day,
      COUNT(*) AS n,
      ROUND(AVG(overall_score), 2) AS avg_overall
    FROM satisfaction_surveys
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY day
    ORDER BY day
  `).all(days)
}
