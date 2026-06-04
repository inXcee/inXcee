import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { summary, departmentComparison, goalAchievement, scoreTrend, dimensionBreakdown } from './kpi.js'

let db, deptA, deptB, s1, s2, s3

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()

  // Deterministik olsun diye performance tablolarını temizle ve kendi verimizi kur
  db.prepare('DELETE FROM performance_reviews').run()
  db.prepare('DELETE FROM performance_goals').run()
  db.prepare('DELETE FROM positive_points').run()

  deptA = db.prepare("INSERT INTO departments(name, color_class) VALUES('KPI-Temizlik','c1')").run().lastInsertRowid
  deptB = db.prepare("INSERT INTO departments(name, color_class) VALUES('KPI-Güvenlik','c2')").run().lastInsertRowid

  s1 = db.prepare("INSERT INTO staff(full_name, department_id, is_active) VALUES('Ali', ?, 1)").run(deptA).lastInsertRowid
  s2 = db.prepare("INSERT INTO staff(full_name, department_id, is_active) VALUES('Veli', ?, 1)").run(deptA).lastInsertRowid
  s3 = db.prepare("INSERT INTO staff(full_name, department_id, is_active) VALUES('Ayşe', ?, 1)").run(deptB).lastInsertRowid

  // 2026 değerlendirmeleri — boyutlar + total_score
  const insReview = db.prepare(`INSERT INTO performance_reviews
    (staff_id, period, productivity, teamwork, attendance, attitude, skills, initiative, reliability, communication, total_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  insReview.run(s1, '2026', 4, 4, 4, 4, 4, 4, 4, 4, 4.0)
  insReview.run(s2, '2026', 3, 3, 3, 3, 3, 3, 3, 3, 3.0)
  insReview.run(s3, '2026', 5, 5, 5, 5, 5, 5, 5, 5, 5.0)
  // 2025 — trend için
  insReview.run(s1, '2025', 2, 2, 2, 2, 2, 2, 2, 2, 2.0)

  // Hedefler: done on-time, done late, open overdue, open future, cancelled
  const insGoal = db.prepare(`INSERT INTO performance_goals
    (staff_id, title, status, progress, target_date, closed_at) VALUES (?,?,?,?,?,?)`)
  insGoal.run(s1, 'Zamanında biten', 'done', 100, '2026-03-01', '2026-02-20')      // onTime
  insGoal.run(s2, 'Geç biten', 'done', 100, '2026-01-10', '2026-02-15')            // done ama geç
  insGoal.run(s3, 'Gecikmiş açık', 'open', 10, '2020-01-01', null)                 // overdue
  insGoal.run(s1, 'Gelecek hedef', 'in_progress', 50, '2999-01-01', null)          // aktif, gecikmemiş
  insGoal.run(s2, 'İptal', 'cancelled', 0, '2026-01-01', null)                     // cancelled
  insGoal.run(s3, 'İkinci aktif', 'open', 20, '2999-06-01', null)                  // s3 2. aktif hedef (join-çarpım regresyonu için)

  // Pozitif puan (son günler içinde)
  db.prepare("INSERT INTO positive_points(staff_id, reason, points) VALUES(?, 'iyi iş', 5)").run(s1)
  db.prepare("INSERT INTO positive_points(staff_id, reason, points) VALUES(?, 'yardım', 2)").run(s3)
})

describe('summary', () => {
  it('counts reviews and averages score for the given period', () => {
    const r = summary(db, '2026')
    expect(r.reviewCount).toBe(3)
    expect(r.avgScore).toBeCloseTo(4.0, 5)
  })

  it('counts active goals (open + in_progress)', () => {
    const r = summary(db, '2026')
    expect(r.activeGoals).toBe(3) // overdue open + future in_progress + s3 2. aktif
  })

  it('computes goal completion rate as done / total', () => {
    const r = summary(db, '2026')
    // 2 done / 6 toplam = %33
    expect(r.goalCompletionRate).toBe(33)
  })

  it('sums positive points', () => {
    const r = summary(db, '2026')
    expect(r.positivePoints).toBe(7)
  })

  it('returns zeros/null for a period with no reviews', () => {
    const r = summary(db, '1999')
    expect(r.reviewCount).toBe(0)
    expect(r.avgScore).toBeNull()
  })
})

describe('departmentComparison', () => {
  it('returns one row per department with reviewed staff in the period', () => {
    const rows = departmentComparison(db, '2026')
    const a = rows.find(x => x.dept_id === deptA)
    const b = rows.find(x => x.dept_id === deptB)
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a.reviewed_count).toBe(2)
    expect(a.avg_score).toBeCloseTo(3.5, 5) // (4+3)/2
    expect(b.avg_score).toBeCloseTo(5.0, 5)
  })

  it('sums positive points per department', () => {
    const rows = departmentComparison(db, '2026')
    const a = rows.find(x => x.dept_id === deptA)
    expect(a.positive_points).toBe(5) // s1=5, s2=0
  })

  it('does not inflate positive points when staff has multiple active goals (join-çarpım regresyonu)', () => {
    const rows = departmentComparison(db, '2026')
    const b = rows.find(x => x.dept_id === deptB)
    // s3'ün 2 aktif hedefi + 2 pozitif puanı var; çarpım olursa 4 görünür, doğrusu 2
    expect(b.positive_points).toBe(2)
    expect(b.reviewed_count).toBe(1) // 1 değerlendirme — hedef sayısıyla çoğalmamalı
  })
})

describe('goalAchievement', () => {
  it('counts statuses', () => {
    const r = goalAchievement(db)
    expect(r.done).toBe(2)
    expect(r.cancelled).toBe(1)
    expect(r.open).toBe(2) // gecikmiş açık + s3 2. aktif (open)
    expect(r.in_progress).toBe(1)
  })

  it('separates on-time from overdue', () => {
    const r = goalAchievement(db)
    expect(r.onTime).toBe(1)  // sadece zamanında biten
    expect(r.overdue).toBe(1) // gecikmiş açık (target_date < bugün, status open)
  })

  it('computes completion rate', () => {
    const r = goalAchievement(db)
    expect(r.completionRate).toBe(33) // 2 done / 6
  })
})

describe('scoreTrend', () => {
  it('returns periods in chronological order with average score', () => {
    const rows = scoreTrend(db)
    const periods = rows.map(r => r.period)
    expect(periods).toEqual([...periods].sort())
    const y2025 = rows.find(r => r.period === '2025')
    const y2026 = rows.find(r => r.period === '2026')
    expect(y2025.avg_score).toBeCloseTo(2.0, 5)
    expect(y2026.avg_score).toBeCloseTo(4.0, 5)
    expect(y2026.review_count).toBe(3)
  })
})

describe('dimensionBreakdown', () => {
  it('averages each of the 8 dimensions for the period', () => {
    const r = dimensionBreakdown(db, '2026')
    // productivity: (4+3+5)/3 = 4.0
    expect(r.productivity).toBeCloseTo(4.0, 5)
    expect(r.communication).toBeCloseTo(4.0, 5)
  })
})
