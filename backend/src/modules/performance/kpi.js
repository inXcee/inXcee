import { getDB } from '../../shared/db/index.js'

// Değerlendirme boyutları — total_score bunların ortalamasıdır.
const REVIEW_DIMENSIONS = ['productivity', 'teamwork', 'attendance', 'attitude', 'skills', 'initiative', 'reliability', 'communication']

// Hedef tamamlama oranı: done / (done + cancelled + open + in_progress).
// Payda 0 ise 0 döner. counts: { done, cancelled, open, in_progress }
function completionRateFrom(counts) {
  const total = counts.done + counts.cancelled + counts.open + counts.in_progress
  if (total === 0) return 0
  return Math.round((counts.done / total) * 100)
}

function goalStatusCounts(db) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS c FROM performance_goals GROUP BY status
  `).all()
  const counts = { open: 0, in_progress: 0, done: 0, cancelled: 0 }
  rows.forEach(r => { if (r.status in counts) counts[r.status] = r.c })
  return counts
}

/**
 * Başlık KPI'ları. period varsayılan = içinde bulunulan yıl.
 */
export function summary(db = getDB(), period = String(new Date().getFullYear())) {
  const rev = db.prepare(`
    SELECT COUNT(*) AS reviewCount, AVG(total_score) AS avgScore
    FROM performance_reviews WHERE period = ?
  `).get(period)

  const counts = goalStatusCounts(db)
  const activeGoals = counts.open + counts.in_progress

  const pos = db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS total
    FROM positive_points WHERE created_at >= date('now', '-365 days')
  `).get()

  return {
    reviewCount: rev.reviewCount,
    avgScore: rev.avgScore != null ? Math.round(rev.avgScore * 100) / 100 : null,
    activeGoals,
    goalCompletionRate: completionRateFrom(counts),
    positivePoints: pos.total,
  }
}

/**
 * Departman başına kıyas — sadece o dönemde değerlendirilmiş personeli olan
 * departmanlar döner. Departmansız personel '(Departman yok)' altında toplanır.
 */
export function departmentComparison(db = getDB(), period = String(new Date().getFullYear())) {
  // Pozitif puan ve hedef-ilerlemesi staff başına ÖNCEDEN agregalanır; aksi halde
  // iki LEFT JOIN'in kartezyen çarpımı SUM/AVG'i çoğaltır.
  return db.prepare(`
    SELECT
      d.id AS dept_id,
      COALESCE(d.name, '(Departman yok)') AS dept_name,
      COUNT(pr.id) AS reviewed_count,
      AVG(pr.total_score) AS avg_score_raw,
      AVG(gp.avg_progress) AS avg_goal_progress_raw,
      COALESCE(SUM(pp.total_points), 0) AS positive_points
    FROM performance_reviews pr
    JOIN staff s ON s.id = pr.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      SELECT staff_id, AVG(progress) AS avg_progress
      FROM performance_goals WHERE status IN ('open','in_progress')
      GROUP BY staff_id
    ) gp ON gp.staff_id = s.id
    LEFT JOIN (
      SELECT staff_id, SUM(points) AS total_points
      FROM positive_points GROUP BY staff_id
    ) pp ON pp.staff_id = s.id
    WHERE pr.period = ?
    GROUP BY d.id
    ORDER BY avg_score_raw DESC
  `).all(period).map(r => ({
    dept_id: r.dept_id,
    dept_name: r.dept_name,
    reviewed_count: r.reviewed_count,
    avg_score: r.avg_score_raw != null ? Math.round(r.avg_score_raw * 100) / 100 : null,
    avg_goal_progress: r.avg_goal_progress_raw != null ? Math.round(r.avg_goal_progress_raw) : null,
    positive_points: r.positive_points,
  }))
}

/**
 * Hedef tamamlama özeti. onTime = done & (target_date NULL veya closed_at ≤ target_date).
 * overdue = (open|in_progress) & target_date < bugün.
 */
export function goalAchievement(db = getDB()) {
  const counts = goalStatusCounts(db)

  const onTime = db.prepare(`
    SELECT COUNT(*) AS c FROM performance_goals
    WHERE status = 'done'
      AND (target_date IS NULL OR closed_at IS NULL OR date(closed_at) <= date(target_date))
  `).get().c

  const overdue = db.prepare(`
    SELECT COUNT(*) AS c FROM performance_goals
    WHERE status IN ('open','in_progress')
      AND target_date IS NOT NULL
      AND date(target_date) < date('now')
  `).get().c

  return {
    open: counts.open,
    in_progress: counts.in_progress,
    done: counts.done,
    cancelled: counts.cancelled,
    onTime,
    overdue,
    completionRate: completionRateFrom(counts),
  }
}

/**
 * Son `limit` dönemin ortalama puanı — kronolojik artan (trend çizgisi için).
 */
export function scoreTrend(db = getDB(), limit = 8) {
  const rows = db.prepare(`
    SELECT period,
           AVG(total_score) AS avg_score_raw,
           COUNT(*) AS review_count
    FROM performance_reviews
    GROUP BY period
    ORDER BY period DESC
    LIMIT ?
  `).all(limit)
  return rows
    .map(r => ({
      period: r.period,
      avg_score: r.avg_score_raw != null ? Math.round(r.avg_score_raw * 100) / 100 : null,
      review_count: r.review_count,
    }))
    .reverse() // kronolojik artan
}

/**
 * 8 değerlendirme boyutunun dönem-geneli ortalaması.
 */
export function dimensionBreakdown(db = getDB(), period = String(new Date().getFullYear())) {
  const avgCols = REVIEW_DIMENSIONS.map(d => `AVG(${d}) AS ${d}`).join(', ')
  const row = db.prepare(`
    SELECT ${avgCols} FROM performance_reviews WHERE period = ?
  `).get(period)
  const out = {}
  REVIEW_DIMENSIONS.forEach(d => {
    out[d] = row[d] != null ? Math.round(row[d] * 100) / 100 : null
  })
  return out
}
