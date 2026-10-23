import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { istanbulDate } from '../../shared/time.js'
import { validTc } from '../../shared/names.js'
import { buildStaffResolver, addStaffAlias, nameSimilarity } from './staffAliases.js'
import { RUN_SUMMARY_MAX, rosterLookupFactory } from './hrRoster.js'

// Geçerli kontrol haneli test TC'leri
const TC = { a: '10000000146', b: '10000000214', c: '10000000382', d: '10000000450', e: '10000000528' }
let mgr, sup, ids, kampId, fpuId
const auth = t => ({ Authorization: `Bearer ${t}` })
const today = istanbulDate()
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE') }

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgr = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  sup = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  const db = getDB()
  const project = (code, name) => {
    db.prepare('INSERT OR IGNORE INTO projects(code, name) VALUES(?, ?)').run(code, name)
    return db.prepare('SELECT id FROM projects WHERE name=?').get(name).id
  }
  kampId = project('KMP', 'Kamp Alanı')
  fpuId = project('FPU', 'FPU')
  const add = (name, extra = {}) => {
    const cols = ['full_name', 'is_active', ...Object.keys(extra)]
    return db.prepare(`INSERT INTO staff(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`)
      .run(name, extra.is_active ?? 1, ...Object.values(extra)).lastInsertRowid
  }
  ids = {
    ayse: add('AYŞE ROSTER', { tc_no: TC.a, hire_date: '2024-01-10', project_id: kampId }),
    ali: add('ALİ ROSTER'),                                    // boş alanlar → doldurulabilir
    berna: add('BERNA ARSLAN ROSTER'),                         // puantajda ASLAN yazılı → eşleşmez
    eski: add('ESKİ ROSTER', { is_active: 0, archive_reason: 'Ayrılmış' }),
    gidecek: add('GİDECEK ROSTER'),
    kayip: add('KAYIP ROSTER'),
    tarih: add('TARİH ROSTER', { hire_date: '2023-04-01', project_id: fpuId }),
  }
})

describe('isim kuralları', () => {
  it('TC kontrol hanesi doğrulanır', () => {
    expect(validTc(TC.a)).toBe(TC.a)
    expect(validTc('11111111111')).toBeNull()
    expect(validTc('Uw2iwiuwj')).toBeNull()
  })

  it('çözümleyici: TC > birebir > eşleştirme > aksansız; arşiv kopyası aktif kişiyi gölgelemez', () => {
    const db = getDB()
    const dup = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('ALİ ROSTER', 0)").run().lastInsertRowid
    const resolve = buildStaffResolver(db, { includeInactive: true })
    expect(resolve('herhangi ad', TC.a)).toMatchObject({ method: 'tc', staff: { id: ids.ayse } })
    expect(resolve('ali roster')).toMatchObject({ method: 'exact', staff: { id: ids.ali } })
    expect(resolve('ALI ROSTER')).toMatchObject({ method: 'fold', staff: { id: ids.ali } })
    db.prepare('DELETE FROM staff WHERE id=?').run(dup)
  })

  it('eşleştirme kuralları: kendi adı / başkasının adı / çakışma reddedilir, tekrar idempotent', () => {
    expect(() => addStaffAlias({ staffId: ids.ali, alias: 'Ali Roster' }, null)).toThrow(/kendi adı/)
    expect(() => addStaffAlias({ staffId: ids.ali, alias: 'AYŞE ROSTER' }, null)).toThrow(/başka bir personelin adı/)
    const a = addStaffAlias({ staffId: ids.ali, alias: 'ALİCAN ROSTER' }, null)
    expect(addStaffAlias({ staffId: ids.ali, alias: 'alican  roster' }, null).id).toBe(a.id)
    expect(() => addStaffAlias({ staffId: ids.kayip, alias: 'ALİCAN ROSTER' }, null)).toThrow(/başka bir personele bağlı/)
    expect(buildStaffResolver(getDB())('ALİCAN ROSTER')).toMatchObject({ method: 'alias', staff: { id: ids.ali } })
  })

  it('benzerlik: ASLAN/ARSLAN yakın, alakasız ad uzak', () => {
    expect(nameSimilarity('BERNA ASLAN', 'BERNA ARSLAN')).toBeGreaterThan(0.85)
    expect(nameSimilarity('BERNA ASLAN', 'MEHMET YILMAZ')).toBeLessThan(0.5)
  })
})

describe('İK kadro senkronu', () => {
  const roster = () => ({
    source: 'puantaj_excel', month: today.slice(0, 7), taken_at: new Date().toISOString(),
    run: { counts: { changes: 3, conflicts: 1 }, conflicts: [{ name: 'AYŞE ROSTER', cell: 'K10' }] },
    people: [
      { name: 'Ayşe Roster', tc: TC.a, position: 'Garson', hire_date: '2024-01-10', project: 'Kamp Alanı', file: 'KAMP.xlsx', row: 10 },
      { name: 'ALİ ROSTER', tc: TC.b, position: 'Aşçı', hire_date: '2025-05-05', project: 'FPU', file: 'FPU.xlsx', row: 11 },
      { name: 'BERNA ASLAN ROSTER', tc: TC.c, position: 'Garson', hire_date: '2026-02-02', project: 'Kamp Alanı' },
      { name: 'ESKİ ROSTER', tc: TC.d, position: 'Temizlik', hire_date: '2022-02-02', project: 'Kamp Alanı' },
      { name: 'GİDECEK ROSTER', position: 'Garson', hire_date: '2025-01-01', exit_date: daysAgo(2), project: 'Kamp Alanı' },
      { name: 'TARİH ROSTER', position: 'Teknik', hire_date: '2024-12-20', project: 'Kamp Alanı' },
      { name: 'YENİ KİŞİ ROSTER', tc: TC.e, position: 'Bulaşık', hire_date: '2026-10-01', project: 'FPU' },
      { name: 'ÇOKTAN AYRILMIŞ', position: 'X', hire_date: '2020-01-01', exit_date: '2026-01-01', project: 'FPU' },
    ],
  })

  it('kadro yalnız müdür/vardiya amiri gönderebilir; boş liste reddedilir', async () => {
    const tech = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
    expect((await request(app).post('/api/personnel/hr-roster').set(auth(tech)).send(roster())).status).toBe(403)
    expect((await request(app).post('/api/personnel/hr-roster').set(auth(sup)).send({ people: [] })).status).toBe(400)
  })

  it('alır, eşleştirir ve mutabakat kategorilerini doğru çıkarır', async () => {
    const res = await request(app).post('/api/personnel/hr-roster').set(auth(sup)).send(roster())
    expect(res.status).toBe(201)
    expect(res.body.people).toBe(8)
    const rec = (await request(app).get('/api/personnel/hr-roster').set(auth(sup))).body
    expect(rec.snapshot).toMatchObject({ stale: false, people_count: 8, run: { counts: { changes: 3 } } })
    expect(rec.exit_pending.map(x => x.staff_id)).toEqual([ids.gidecek])
    expect(rec.archived_present.map(x => x.staff_id)).toEqual([ids.eski])
    expect(rec.missing.map(x => x.full_name)).toEqual(expect.arrayContaining(['BERNA ARSLAN ROSTER', 'KAYIP ROSTER']))
    expect(rec.missing.map(x => x.staff_id)).not.toContain(ids.ali)
    const only = Object.fromEntries(rec.roster_only.map(r => [r.name, r]))
    expect(Object.keys(only).sort()).toEqual(['BERNA ASLAN ROSTER', 'YENİ KİŞİ ROSTER'])   // ayrılmış olan listelenmez
    expect(only['BERNA ASLAN ROSTER'].candidates[0]).toMatchObject({ staff_id: ids.berna })
    expect(rec.mismatches).toEqual([expect.objectContaining({ staff_id: ids.tarih,
      diffs: [{ field: 'hire_date', yys: '2023-04-01', roster: '2024-12-20' }, { field: 'project_id', yys: 'FPU', roster: 'Kamp Alanı' }] })])
    const ali = rec.fillable.find(f => f.staff_id === ids.ali)
    expect(ali.fields).toEqual({ tc_no: TC.b, hire_date: '2025-05-05', position: 'Aşçı', project_id: fpuId })
  })

  it('ay puantaj sayımlı büyük tur özeti olduğu gibi saklanır; yalnız sınırı aşan kırpılır', async () => {
    const people = Array.from({ length: 185 }, (_, i) => ({ name: `KİŞİ ${i} SOYADI UZUNCA`, position: 'TEMİZLİK PERSONELİ',
      codes: { N: 20, H: 4, S: 2, R: 1 }, blank: [5, 6] }))
    const projects = { 'Kamp Alanı': { people }, FPU: { people } }
    const monthStats = { '2026-09': { complete: true, projects }, '2026-10': { complete: false, projects } }
    const big = { ...roster(), run: { counts: { changes: 0 }, month_stats: monthStats } }
    expect(JSON.stringify(big.run).length).toBeGreaterThan(50000)               // eski sınırı aşan gerçekçi boyut
    expect((await request(app).post('/api/personnel/hr-roster').set(auth(sup)).send(big)).status).toBe(201)
    const run = (await request(app).get('/api/personnel/hr-roster').set(auth(sup))).body.snapshot.run
    expect(run.month_stats['2026-10'].projects['Kamp Alanı'].people).toHaveLength(185)
    const huge = { ...roster(), run: { counts: { changes: 1 }, blob: 'x'.repeat(RUN_SUMMARY_MAX) } }
    expect((await request(app).post('/api/personnel/hr-roster').set(auth(sup)).send(huge)).status).toBe(201)
    expect((await request(app).get('/api/personnel/hr-roster').set(auth(sup))).body.snapshot.run)
      .toEqual({ truncated: true, counts: { changes: 1 } })
  })

  it('farklar takip uyarısı olarak açılır; tek özet bildirim gider', async () => {
    const db = getDB()
    const alerts = db.prepare("SELECT staff_id, rule_key FROM personnel_tracking_alerts WHERE rule_key LIKE 'hr_roster_%' AND status='open'").all()
    const keys = alerts.map(a => `${a.rule_key}:${a.staff_id}`)
    expect(keys).toEqual(expect.arrayContaining([
      `hr_roster_exit_pending:${ids.gidecek}`, `hr_roster_archived_present:${ids.eski}`,
      `hr_roster_missing:${ids.kayip}`, `hr_roster_mismatch:${ids.tarih}`]))
    const notes = db.prepare("SELECT COUNT(*) c FROM notifications WHERE entity_type='hr_roster'").get().c
    const perAlert = db.prepare("SELECT COUNT(*) c FROM notifications WHERE dedup_key LIKE 'personnel-alert:%' AND entity_id IN (SELECT id FROM personnel_tracking_alerts WHERE rule_key LIKE 'hr_roster_%')").get().c
    expect(notes).toBe(2)       // müdür + vardiya amiri, kişi başı değil
    expect(perAlert).toBe(0)
  })

  it('eşleştirme eklenince ilgili farklar kendiliğinden kapanır', async () => {
    const res = await request(app).post('/api/personnel/aliases').set(auth(mgr)).send({ staff_id: ids.berna, alias: 'BERNA ASLAN ROSTER' })
    expect(res.status).toBe(201)
    const rec = (await request(app).get('/api/personnel/hr-roster').set(auth(mgr))).body
    expect(rec.roster_only.map(r => r.name)).toEqual(['YENİ KİŞİ ROSTER'])
    expect(rec.missing.map(x => x.staff_id)).not.toContain(ids.berna)
    const open = getDB().prepare("SELECT status FROM personnel_tracking_alerts WHERE staff_id=? AND rule_key='hr_roster_missing'").get(ids.berna)
    expect(open.status).toBe('resolved')
    // vardiya amiri eşleştirme ekleyemez
    expect((await request(app).post('/api/personnel/aliases').set(auth(sup)).send({ staff_id: ids.kayip, alias: 'KAYIP X' })).status).toBe(403)
  })

  it('boş alanları doldurur (yalnız müdür); dolu alana ve başkasının TC\'sine dokunmaz', async () => {
    expect((await request(app).post('/api/personnel/hr-roster/apply-fills').set(auth(sup)).send({})).status).toBe(403)
    const res = await request(app).post('/api/personnel/hr-roster/apply-fills').set(auth(mgr)).send({})
    expect(res.status).toBe(200)
    const db = getDB()
    expect(db.prepare('SELECT tc_no, hire_date, position, project_id FROM staff WHERE id=?').get(ids.ali))
      .toEqual({ tc_no: TC.b, hire_date: '2025-05-05', position: 'Aşçı', project_id: fpuId })
    expect(db.prepare('SELECT hire_date FROM staff WHERE id=?').get(ids.tarih).hire_date).toBe('2023-04-01')
    expect(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='staff_fill_from_hr_roster'").get().c).toBeGreaterThanOrEqual(1)
    // ikinci kez çalıştırmak bir şey değiştirmez
    expect((await request(app).post('/api/personnel/hr-roster/apply-fills').set(auth(mgr)).send({})).body.fields).toBe(0)
  })

  it('çizelge aktarımı için yeni kişinin İK bilgisini verir; belirsiz adda tahmin yok', () => {
    const lookup = rosterLookupFactory(getDB())
    expect(lookup('Yeni Kişi Roster')).toMatchObject({ tc_no: TC.e, position: 'Bulaşık', hire_date: '2026-10-01', project_id: fpuId })
    expect(lookup('HİÇ YOK')).toBeNull()
  })

  it('"puantajda yok" satırı son vardiya gününü gösterir', async () => {
    const db = getDB()
    const dept = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
    const def = db.prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 1').get().id
    const ins = db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status) VALUES(?,?,?,?,?)")
    ins.run(ids.kayip, dept, def, daysAgo(3), 'scheduled')
    ins.run(ids.kayip, dept, def, daysAgo(1), 'off')          // OFF / izin "çalıştı" sayılmaz
    const rec = (await request(app).get('/api/personnel/hr-roster').set(auth(mgr))).body
    expect(rec.missing.find(x => x.staff_id === ids.kayip).last_scheduled).toBe(daysAgo(3))
  })

  it('puantaj dışı işareti (yalnız müdür): kişi "puantajda yok"tan çıkar, uyarısı kapanır, işaret kaldırılabilir', async () => {
    const send = (t, body) => request(app).post('/api/personnel/hr-roster/exempt').set(auth(t)).send(body)
    expect((await send(sup, { staff_id: ids.kayip, reason: 'Taşeron' })).status).toBe(403)
    expect((await send(mgr, { staff_id: ids.kayip, reason: '  ' })).status).toBe(400)
    expect((await send(mgr, { staff_id: 999999, reason: 'Taşeron' })).status).toBe(404)
    const res = await send(mgr, { staff_id: ids.kayip, reason: 'Taşeron (yemek firması)' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ staff_id: ids.kayip, reason: 'Taşeron (yemek firması)', previous: null })

    const rec = (await request(app).get('/api/personnel/hr-roster').set(auth(mgr))).body
    expect(rec.missing.map(x => x.staff_id)).not.toContain(ids.kayip)
    expect(rec.exempt).toEqual([expect.objectContaining({ staff_id: ids.kayip, reason: 'Taşeron (yemek firması)' })])
    expect(rec.counts.exempt).toBe(1)
    const db = getDB()
    expect(db.prepare("SELECT status FROM personnel_tracking_alerts WHERE staff_id=? AND rule_key='hr_roster_missing'").get(ids.kayip).status)
      .toBe('resolved')
    expect(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='staff_hr_roster_exempt' AND target_id=?").get(ids.kayip).c).toBe(1)

    const del = await request(app).delete(`/api/personnel/hr-roster/exempt/${ids.kayip}`).set(auth(mgr))
    expect(del.status).toBe(200)
    expect(del.body.previous).toBe('Taşeron (yemek firması)')
    const again = (await request(app).get('/api/personnel/hr-roster').set(auth(mgr))).body
    expect(again.missing.map(x => x.staff_id)).toContain(ids.kayip)
    expect(again.exempt).toEqual([])
  })

  it('kadro kararları takip uyarısını beklemeden kapatır: çıkış başlatma, arşivden dönüş, kayıt düzeltme', async () => {
    const db = getDB()
    const status = (rule, id) => db.prepare(`SELECT status FROM personnel_tracking_alerts
      WHERE staff_id=? AND rule_key=? ORDER BY id DESC LIMIT 1`).get(id, rule)?.status
    expect(status('hr_roster_exit_pending', ids.gidecek)).toBe('open')
    expect(status('hr_roster_archived_present', ids.eski)).toBe('open')
    expect(status('hr_roster_mismatch', ids.tarih)).toBe('open')

    const exit = await request(app).post(`/api/personnel/${ids.gidecek}/offboarding/start`).set(auth(mgr))
      .send({ exit_date: daysAgo(2), exit_type: 'resignation', reason: 'İK puantajında çıkış' })
    expect(exit.status).toBe(201)
    expect(status('hr_roster_exit_pending', ids.gidecek)).toBe('resolved')

    const back = await request(app).post(`/api/personnel/${ids.eski}/restore`).set(auth(mgr))
      .send({ reason: 'İK puantajında çalışıyor' })
    expect(back.status).toBe(200)
    expect(status('hr_roster_archived_present', ids.eski)).toBe('resolved')

    const fix = await request(app).put(`/api/shifts/staff/${ids.tarih}`).set(auth(mgr))
      .send({ hire_date: '2024-12-20', project_id: kampId })
    expect(fix.status).toBe(200)
    expect(status('hr_roster_mismatch', ids.tarih)).toBe('resolved')
  })

  it('14 günden eski görüntü bayattır: bulgu ve uyarı üretmez, doldurma reddedilir', async () => {
    const db = getDB()
    db.prepare("UPDATE hr_roster_snapshots SET received_at=datetime('now','-15 days')").run()
    const rec = (await request(app).get('/api/personnel/hr-roster').set(auth(mgr))).body
    expect(rec.snapshot.stale).toBe(true)
    expect(rec.missing.map(x => x.staff_id)).toContain(ids.kayip)   // panel yine gösterir (bayat uyarısıyla)
    expect(rosterLookupFactory(db)('Yeni Kişi Roster')).toBeNull()
    expect((await request(app).post('/api/personnel/hr-roster/apply-fills').set(auth(mgr)).send({})).status).toBe(409)
    await request(app).get('/api/personnel/tracking/overview').set(auth(mgr))   // değerlendirmeyi tetikler
    const open = db.prepare("SELECT COUNT(*) c FROM personnel_tracking_alerts WHERE rule_key LIKE 'hr_roster_%' AND status='open'").get().c
    expect(open).toBe(0)
  })
})

describe('PC ajanı hata bildirimi (POST /hr-roster/agent-error)', () => {
  // Ajan düşünce (ör. Excel taşındı/silindi) nedeni yalnız PC'deki günlüğe yazılıyordu: 18–23 Eki arası 6 gün
  // puantaj Excel'i güncellenmedi, Hermes "bilgisayar kapalı olabilir" diye tahmin yürüttü. Artık hata kaydına
  // düşer (source=backend → Hermes server_watch Telegram'a taşır) ve müdüre bildirim açar.
  it('ajanın hatası ajan adıyla backend hata kaydına yazılır', async () => {
    const res = await request(app).post('/api/personnel/hr-roster/agent-error').set(auth(sup))
      .send({ message: 'Excel bulunamadı: KAMP ALANI 2026 PUANTAJI-3.xlsx', host: 'OFIS-PC' })
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT source, severity, message, user_id FROM error_log WHERE id=?').get(res.body.id)
    expect(row).toMatchObject({ source: 'backend', severity: 'error', message: 'Puantaj ajanı: Excel bulunamadı: KAMP ALANI 2026 PUANTAJI-3.xlsx' })
    expect(row.user_id).toBeTruthy()
  })

  it('oturumsuz ya da mesajsız istek reddedilir', async () => {
    expect((await request(app).post('/api/personnel/hr-roster/agent-error').send({ message: 'x' })).status).toBe(401)
    expect((await request(app).post('/api/personnel/hr-roster/agent-error').set(auth(sup)).send({ message: '  ' })).status).toBe(400)
  })
})
