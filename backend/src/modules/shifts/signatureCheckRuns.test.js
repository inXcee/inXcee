import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { checkSignatureSheet } from './signatureCheck.js'
import { buildSignatureCoverage, cellStatus, recordSignatureCheck } from './signatureCheckRuns.js'

// Geçmişte sabit iki gün: "gelmedi" durumunu bugünden bağımsız test etmek için.
const G1 = '2026-09-07'
const G2 = '2026-09-08'
let token
let housekeeperToken
let teknik
let mutfak
const id = {}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
  token = await login('mudur')
  housekeeperToken = await login('meydanci')
  const db = getDB()
  const dept = name => Number(db.prepare("INSERT INTO departments(name, color_class) VALUES(?, 'blue')").run(name).lastInsertRowid)
  teknik = dept('Takip Teknik')
  mutfak = dept('Takip Mutfak')
  const staff = (name, d) => Number(db.prepare('INSERT INTO staff(full_name, department_id, is_active) VALUES(?, ?, 1)').run(name, d).lastInsertRowid)
  const plan = (s, date, status = 'scheduled') =>
    db.prepare('INSERT INTO shift_schedule(staff_id, dept_id, work_date, status) VALUES(?, ?, ?, ?)').run(s, null, date, status)
  id.t1 = staff('Takip Teknikçi Bir', teknik); plan(id.t1, G1); plan(id.t1, G2)
  id.t2 = staff('Takip Teknikçi İki', teknik); plan(id.t2, G1); plan(id.t2, G2, 'off')
  id.m1 = staff('Takip Aşçı', mutfak); plan(id.m1, G1); plan(id.m1, G2)
})

describe('cellStatus', () => {
  it('kayıt varsa uyarıya göre, yoksa güne göre', () => {
    expect(cellStatus({ planned: 3, run: { warnings: 0, unmatched: 0, not_on_sheet: 0 }, date: G1, today: G2 })).toBe('clean')
    expect(cellStatus({ planned: 3, run: { warnings: 0, unmatched: 1, not_on_sheet: 0 }, date: G1, today: G2 })).toBe('warn')
    expect(cellStatus({ planned: 3, run: null, date: G1, today: G2 })).toBe('missing')
    expect(cellStatus({ planned: 3, run: null, date: G2, today: G2 })).toBe('pending')
    expect(cellStatus({ planned: 0, run: null, date: G1, today: G2 })).toBe('not_needed')
  })
})

describe('recordSignatureCheck + buildSignatureCoverage', () => {
  it('karışık bölümlü föyü gün × bölüm parçalarına böler; kapsama en son kaydı kullanır', () => {
    const db = getDB()
    // Föyde iki bölüm karışık + bir eşleşmeyen satır; bölüm seçilmedi.
    const r1 = checkSignatureSheet({ rows: [
      { name: 'Takip Teknikçi Bir', date: G1, mark: 'signed' },
      { name: 'Takip Teknikçi İki', date: G1, mark: 'blank' },       // eksik imza → uyarı
      { name: 'Takip Aşçı', date: G1, mark: 'signed' },
      { name: 'Olmayan Takipçi', date: G1, mark: 'signed' },
    ] })
    const saved = recordSignatureCheck(r1, { source: 'telegram', userId: 1 })
    expect(saved.parts).toBe(3) // teknik, mutfak, bölümsüz (eşleşmeyen)
    const parts = db.prepare('SELECT * FROM signature_check_runs WHERE batch_id = ? ORDER BY department_id').all(saved.batch_id)
    expect(parts.find(p => p.department_id === null)).toMatchObject({ unmatched: 1, rows_count: 1 })
    expect(parts.find(p => p.department_id === teknik)).toMatchObject({ warnings: 1, missing_signature: 1, signed_ok: 1, source: 'telegram' })
    expect(JSON.parse(parts.find(p => p.department_id === teknik).findings_json)[0]).toMatchObject({ kind: 'warn', name: 'Takip Teknikçi İki' })

    let cov = buildSignatureCoverage({ from: G1, to: G2 })
    const cell = (dept, d) => cov.departments.find(x => x.id === dept).cells[d]
    expect(cell(teknik, G1)).toMatchObject({ status: 'warn', planned: 2, missing_signature: 1 })
    expect(cell(mutfak, G1)).toMatchObject({ status: 'clean', planned: 1 })
    expect(cell(teknik, G2).status).toBe('missing')   // geçmiş gün, kontrol yok
    expect(cov.departments.some(d => d.id === null)).toBe(false) // bölümsüz parça tabloya girmez

    // Teknik G1 yeniden kontrol edildi, artık temiz → en son kayıt geçerli.
    recordSignatureCheck(checkSignatureSheet({ rows: [
      { name: 'Takip Teknikçi Bir', date: G1, mark: 'signed' },
      { name: 'Takip Teknikçi İki', date: G1, mark: 'signed' },
    ], department_id: teknik }), { department_id: teknik })
    cov = buildSignatureCoverage({ from: G1, to: G2 })
    expect(cell(teknik, G1).status).toBe('clean')
    expect(cov.summary).toMatchObject({ checked: 2, clean: 2, warn: 0 })
    expect(cov.summary.missing).toBeGreaterThanOrEqual(2) // G2: teknik + mutfak
  })

  it('bölüm seçilip föyde o bölümden kimse çıkmasa da kontrol izi kalır', () => {
    const r = checkSignatureSheet({ rows: [{ name: 'Hiç Yok Biri', date: G2, mark: 'signed' }], department_id: mutfak })
    recordSignatureCheck(r, { department_id: mutfak })
    const c = buildSignatureCoverage({ from: G2, to: G2 }).departments.find(d => d.id === mutfak).cells[G2]
    expect(c).toMatchObject({ status: 'warn', unmatched: 1 })
  })
})

describe('API', () => {
  it('save:true kaydeder ve batch döner; save yoksa kaydetmez', async () => {
    const db = getDB()
    const count = () => db.prepare('SELECT COUNT(*) c FROM signature_check_runs').get().c
    const before = count()
    const send = body => request(app).post('/api/shifts/schedule/signature-check').set('Authorization', `Bearer ${token}`).send(body)
    const plain = await send({ rows: [{ name: 'Takip Aşçı', date: G2, mark: 'signed' }] })
    expect(plain.status).toBe(200)
    expect(plain.body.saved).toBeUndefined()
    expect(count()).toBe(before)
    const kayit = await send({ rows: [{ name: 'Takip Aşçı', date: G2, mark: 'signed' }], save: true, source: 'telegram' })
    expect(kayit.body.saved).toMatchObject({ parts: 1 })
    expect(count()).toBe(before + 1)
  })

  it('kapsama ucu: doğrulama, 31 gün sınırı ve yetki', async () => {
    const get = (q, t = token) => request(app).get(`/api/shifts/schedule/signature-check/coverage${q}`).set('Authorization', `Bearer ${t}`)
    const ok = await get(`?from=${G1}&to=${G2}`)
    expect(ok.status).toBe(200)
    expect(ok.body.days).toEqual([G1, G2])
    expect((await get('?from=2026-09-08&to=2026-09-07')).status).toBe(400)
    expect((await get('?from=2026-08-01&to=2026-09-08')).status).toBe(400)
    expect((await get(`?from=${G1}&to=${G2}`, housekeeperToken)).status).toBe(403)
  })
})
