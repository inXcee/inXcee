// Aylık puantaj dışa aktarımı — masaüstündeki puantaj Excel'ini güncelleyen PC ajanı için.
// Excel'in kendi kod sözlüğü YYS'ninkinden farklıdır (ör. Excel'de S = yıllık izin, Y = YARIM gün;
// YYS'de Yİ = yıllık izin, Y = devamsız). Eşleme bu yüzden kod harfine değil durum/izin türüne göre yapılır.
//
// Kural: yalnız YYS'de kayıtlı GERÇEK bilgi yazılır. "scheduled" (planlı) gün fiilî devam değildir →
// excel_code null (ajan hücreye dokunmaz). Excel karşılığı belirsiz izinler (alacak, ücretsiz) de null
// döner ve `manual` ile işaretlenir: ajan raporda "elle işle" diye listeler.
import { getDB } from '../../shared/db/index.js'

export const EXCEL_CODE_RULES = [
  { status: 'worked', code: 'N' },
  { status: 'overtime', code: 'N' },
  { status: 'off', code: 'H' },
  { status: 'absent', code: 'E' },
  { status: 'on_leave', leave_type: 'annual', code: 'S' },
  { status: 'on_leave', leave_type: 'sick', code: 'R' },
  { status: 'on_leave', leave_type: 'other', code: 'İ' },
]
const MANUAL_LEAVES = new Set(['owed', 'unpaid'])

export function excelCodeFor(status, leaveType) {
  if (status === 'on_leave') {
    if (MANUAL_LEAVES.has(leaveType)) return { code: null, manual: true }
    const rule = EXCEL_CODE_RULES.find(r => r.status === 'on_leave' && r.leave_type === leaveType)
    return { code: rule?.code ?? null, manual: !rule }
  }
  const rule = EXCEL_CODE_RULES.find(r => r.status === status && !r.leave_type)
  return { code: rule?.code ?? null, manual: false }
}

export function puantajExport(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    throw Object.assign(new Error('month YYYY-AA olmalı'), { statusCode: 400 })
  }
  const db = getDB()
  const from = `${month}-01`
  const to = `${month}-31`
  const rows = db.prepare(`
    SELECT ss.staff_id, ss.work_date, ss.status, ss.leave_type,
      s.full_name, s.tc_no, s.is_active, p.name AS project_name, d.name AS dept_name
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN projects p ON p.id = s.project_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    WHERE ss.work_date BETWEEN ? AND ?
    ORDER BY s.full_name, ss.work_date
  `).all(from, to)
  const byStaff = new Map()
  for (const r of rows) {
    if (!byStaff.has(r.staff_id)) {
      byStaff.set(r.staff_id, {
        staff_id: r.staff_id, full_name: r.full_name, tc_no: r.tc_no || null,
        project: r.project_name || null, department: r.dept_name || null, is_active: !!r.is_active, days: {},
      })
    }
    const { code, manual } = excelCodeFor(r.status, r.leave_type)
    byStaff.get(r.staff_id).days[r.work_date] = {
      status: r.status, leave_type: r.leave_type || null, excel_code: code, ...(manual ? { manual: true } : {}),
    }
  }
  return { month, generated_at: new Date().toISOString(), rules: EXCEL_CODE_RULES, staff: [...byStaff.values()] }
}
