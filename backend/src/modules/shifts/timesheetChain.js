import { getDB } from '../../shared/db/index.js'

// Faz 7 — Puantaj açıklanabilirlik zinciri.
//
// Puantajda bir gün "çalıştı / izinli / devamsız" görünüyor ama NEDEN öyle
// göründüğü hiçbir yerde yazmıyor. İtiraz geldiğinde (bordroda eksik gün,
// fazla mesai görünmüyor) kimse zinciri geriye doğru izleyemiyor.
//
// Zincir: planlanan vardiya → giriş/çıkış kanıtı → izin/rapor → fazla mesai →
// puantaj kodu (çarpanlarıyla) → onaylayan.
//
// Eksik halka GİZLENMEZ. Kanıt yoksa "kanıt yok" yazar; kaynak hiç yoksa
// 'unavailable' der. Zinciri tam göstermenin amacı, kopuk yeri göstermek.

export function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
}

function halka(key, label, { status, detail, data = null }) {
  return { key, label, status, detail, data }
}

export function buildTimesheetChain({ staff_id, date } = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  const staffId = Number(staff_id)
  if (!Number.isFinite(staffId) || staffId <= 0) {
    throw Object.assign(new Error('Geçersiz personel'), { statusCode: 400 })
  }

  let personel = null
  try {
    personel = db.prepare('SELECT id, full_name, is_active FROM staff WHERE id = ?').get(staffId)
  } catch { /* tablo yoksa aşağıda unavailable olarak işlenir */ }
  if (!personel) throw Object.assign(new Error('Personel bulunamadı'), { statusCode: 404 })

  const links = []
  const ay = String(date).slice(0, 7)

  // ── 1. Planlanan vardiya ──────────────────────────────────────────────────
  let kayit = null
  try {
    kayit = db.prepare(`
      SELECT ss.id, ss.status, ss.shift_def_id, ss.leave_type, ss.absent_reason,
             ss.puantaj_code_id, ss.work_location_id,
             sd.name AS shift_name, sd.start_hour, sd.end_hour,
             w.name AS location_name
      FROM shift_schedule ss
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      LEFT JOIN work_locations w ON w.id = ss.work_location_id
      WHERE ss.staff_id = ? AND ss.work_date = ?
    `).get(staffId, date)
  } catch (err) {
    links.push(halka('schedule', 'Planlanan vardiya', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  if (!links.length) {
    links.push(kayit
      ? halka('schedule', 'Planlanan vardiya', {
        status: 'ok',
        detail: [
          kayit.shift_name || 'vardiya tanımsız',
          kayit.start_hour != null ? `${kayit.start_hour}-${kayit.end_hour ?? ''}` : null,
          kayit.location_name,
          `durum: ${kayit.status || '—'}`,
        ].filter(Boolean).join(' · '),
        data: { status: kayit.status, shift_name: kayit.shift_name, location: kayit.location_name },
      })
      // Kayıt yoksa gün hiç planlanmamış demektir; bu da bir cevaptır.
      : halka('schedule', 'Planlanan vardiya', {
        status: 'missing',
        detail: 'Bu güne hiç çizelge kaydı girilmemiş',
      }))
  }

  // ── 2. Giriş/çıkış kanıtı ─────────────────────────────────────────────────
  // Canlıda attendance_logs BOŞ (turnike/kart verisi akmıyor). "Kanıt yok"
  // demek ile "kaynak hiç yok" demek farklı şeyler; ikisi ayrı raporlanır.
  try {
    const toplam = db.prepare('SELECT COUNT(*) c FROM attendance_logs').get().c
    if (toplam === 0) {
      links.push(halka('evidence', 'Giriş/çıkış kanıtı', {
        status: 'unavailable',
        detail: 'Turnike/kart kaydı sisteme hiç akmıyor — bu halka doğrulanamıyor',
      }))
    } else {
      const kanit = kayit
        ? db.prepare('SELECT check_in_at, check_out_at, actual_hours FROM attendance_logs WHERE shift_schedule_id = ?').get(kayit.id)
        : null
      links.push(kanit
        ? halka('evidence', 'Giriş/çıkış kanıtı', {
          status: 'ok',
          detail: `${kanit.check_in_at || '—'} → ${kanit.check_out_at || '—'}${kanit.actual_hours ? ` · ${kanit.actual_hours} saat` : ''}`,
          data: kanit,
        })
        : halka('evidence', 'Giriş/çıkış kanıtı', {
          status: 'missing',
          detail: 'Bu gün için giriş/çıkış kaydı bulunamadı',
        }))
    }
  } catch (err) {
    links.push(halka('evidence', 'Giriş/çıkış kanıtı', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  // ── 3. İzin / rapor ───────────────────────────────────────────────────────
  try {
    const izin = db.prepare(`
      SELECT leave_type, start_date, end_date, status FROM leave_requests
      WHERE staff_id = ? AND ? BETWEEN start_date AND end_date
      ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END LIMIT 1
    `).get(staffId, date)
    links.push(izin
      ? halka('leave', 'İzin / rapor', {
        status: izin.status === 'approved' ? 'ok' : 'missing',
        detail: `${izin.leave_type || 'izin'} · ${izin.start_date} → ${izin.end_date} · ${izin.status === 'approved' ? 'onaylı' : `durum: ${izin.status}`}`,
        data: izin,
      })
      : halka('leave', 'İzin / rapor', { status: 'ok', detail: 'Bu gün için izin/rapor kaydı yok' }))
  } catch (err) {
    links.push(halka('leave', 'İzin / rapor', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  // ── 4. Fazla mesai ────────────────────────────────────────────────────────
  try {
    const mesai = db.prepare(`
      SELECT o.hours, o.reason, u.full_name AS approver
      FROM overtime_records o LEFT JOIN users u ON u.id = o.approved_by
      WHERE o.staff_id = ? AND o.work_date = ?
    `).get(staffId, date)
    links.push(mesai
      ? halka('overtime', 'Fazla mesai', {
        status: 'ok',
        detail: `${mesai.hours} saat${mesai.reason ? ` · ${mesai.reason}` : ''}${mesai.approver ? ` · onaylayan: ${mesai.approver}` : ' · onaylayan kaydı yok'}`,
        data: mesai,
      })
      : halka('overtime', 'Fazla mesai', { status: 'ok', detail: 'Bu gün için mesai kaydı yok' }))
  } catch (err) {
    links.push(halka('overtime', 'Fazla mesai', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  // ── 5. Puantaj kodu ───────────────────────────────────────────────────────
  // Kodun çarpanları bordroya doğrudan yansır; "neden bu tutar" sorusunun
  // cevabı burada.
  try {
    const kod = kayit?.puantaj_code_id
      ? db.prepare(`
        SELECT code, label, is_paid, sgk_day_factor, day_multiplier, hour_multiplier, overtime_effect
        FROM puantaj_codes WHERE id = ?
      `).get(kayit.puantaj_code_id)
      : null
    links.push(kod
      ? halka('code', 'Puantaj kodu', {
        status: 'ok',
        detail: `${kod.code} — ${kod.label} · ${kod.is_paid ? 'ücretli' : 'ücretsiz'}`
          + ` · SGK gün ${kod.sgk_day_factor ?? '—'} · gün çarpanı ${kod.day_multiplier ?? '—'}`,
        data: kod,
      })
      : halka('code', 'Puantaj kodu', {
        status: 'missing',
        detail: kayit ? 'Bu güne puantaj kodu atanmamış — bordroya nasıl yansıyacağı belirsiz' : 'Çizelge kaydı olmadığı için kod da yok',
      }))
  } catch (err) {
    links.push(halka('code', 'Puantaj kodu', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  // ── 6. Dönem onayı ────────────────────────────────────────────────────────
  try {
    const onay = db.prepare(`
      SELECT status, approved_at, dept_scope FROM puantaj_period_approvals
      WHERE period = ? ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END LIMIT 1
    `).get(ay)
    links.push(onay
      ? halka('approval', 'Dönem onayı', {
        status: onay.status === 'approved' ? 'ok' : 'missing',
        detail: `${ay} · durum: ${onay.status}${onay.approved_at ? ` · ${onay.approved_at}` : ''}`,
        data: onay,
      })
      : halka('approval', 'Dönem onayı', { status: 'missing', detail: `${ay} dönemi için onay kaydı yok` }))
  } catch (err) {
    links.push(halka('approval', 'Dönem onayı', { status: 'unavailable', detail: `Okunamadı: ${err.message}` }))
  }

  const gaps = links.filter(l => l.status !== 'ok').map(l => l.key)

  return {
    staff: { id: personel.id, full_name: personel.full_name, is_active: !!personel.is_active },
    date,
    links,
    gaps,
    // Zincir ancak tüm halkalar sağlamsa "açıklanabilir" sayılır.
    explainable: gaps.length === 0,
  }
}
