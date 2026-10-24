import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { AKSIYON, setCardSetting } from './cardScan.js'
import { deliverRoom, intakeBags, ledgerOverview, markRoomReady, undoLedger } from './field-ledger.js'
import { markReadyFromLedgerService } from './ledger.js'

// Saha ekranı çamaşır defteri (spec: docs/superpowers/specs/2026-10-23-saha-ekrani-design.md §5, §10):
// her laundry_items satırı bir torba; alım → hazır → teslim oda bazında; geri alma yalnız kendi, 24 saat.
let db, workerId, otherWorkerId
const rooms = {}
const errorOf = fn => { try { fn() } catch (e) { return e } return null }
const item = id => db.prepare('SELECT * FROM laundry_items WHERE id=?').get(id)
const statuses = ids => ids.map(id => item(id)?.status ?? null)

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('FL', 1, ?, 6, 6)`)
  for (const no of ['101', '102', '103', '104', '105', '106', '201', '202', '203']) rooms[no] = Number(room.run(no).lastInsertRowid)
  const laundry = db.prepare("SELECT id FROM departments WHERE name='Çamaşırhane'").get().id
  const staff = db.prepare('INSERT INTO staff(full_name, is_active, department_id) VALUES(?, 1, ?)')
  workerId = Number(staff.run('Çamaşır Test', laundry).lastInsertRowid)
  otherWorkerId = Number(staff.run('Çamaşır Diğer', laundry).lastInsertRowid)
})

describe('çamaşır alımı (intakeBags)', () => {
  let ids

  it('3 torba = 3 satır: her biri 1 parça, defter notu, sistem kullanıcısı adına, gerçek kişi ve istemci anahtarı', () => {
    const res = intakeBags({ roomId: rooms['101'], bags: 3, ironing: true, urgent: false, note: 'mavi poşet', clientRequestId: 'saha-abc12345', workerId })
    expect(res.already).toBe(false)
    expect(res.ids).toHaveLength(3)
    ids = res.ids
    const systemUser = db.prepare("SELECT id FROM users WHERE username='avs_kiosk_system'").get().id
    const rows = db.prepare(`
      SELECT room_id, status, item_count, notes, needs_ironing, urgent, created_by, last_modified_worker_id,
             client_request_id, tracking_mode
      FROM laundry_items WHERE id IN (?, ?, ?) ORDER BY id
    `).all(...ids)
    const row = n => ({
      room_id: rooms['101'], status: 'dirty', item_count: 1, notes: 'Defter (Saha ekranı) · parça sayısı yazılmadı · mavi poşet',
      needs_ironing: 1, urgent: 0, created_by: systemUser, last_modified_worker_id: workerId,
      client_request_id: `saha-abc12345#${n}`, tracking_mode: 'legacy',
    })
    expect(rows).toEqual([row(1), row(2), row(3)])
    expect(db.prepare("SELECT notes, worker_id FROM laundry_history WHERE item_id=? AND to_status='dirty'").get(ids[0]))
      .toEqual({ notes: 'Saha ekranı · Çamaşır Test', worker_id: workerId })
  })

  it('aynı istemci anahtarı ikinci kez gelirse yeni torba açılmaz (already)', () => {
    const again = intakeBags({ roomId: rooms['101'], bags: 3, ironing: true, urgent: false, clientRequestId: 'saha-abc12345', workerId })
    expect(again).toEqual({ ids, already: true })
    expect(db.prepare('SELECT COUNT(*) n FROM laundry_items WHERE room_id=?').get(rooms['101']).n).toBe(3)
  })

  it('kart okutma zorunluyken alım "Saha ekranı" gerekçesiyle geçer ve okutma kaydı personelle düşer', () => {
    setCardSetting(AKSIYON.INTAKE, true)
    try {
      const { ids: cardIds } = intakeBags({ roomId: rooms['102'], bags: 1, ironing: false, urgent: true, clientRequestId: 'saha-card0001', workerId })
      expect(db.prepare('SELECT action, result, override_reason, operator_worker_id, room_id FROM laundry_card_scans WHERE item_id=?').get(cardIds[0]))
        .toEqual({ action: 'intake', result: 'override', override_reason: 'Saha ekranı', operator_worker_id: workerId, room_id: rooms['102'] })
      expect(item(cardIds[0]).urgent).toBe(1)
    } finally {
      setCardSetting(AKSIYON.INTAKE, false)
    }
  })

  it('torba sayısı 1–20 dışında, anahtarsız istek 400; olmayan oda 404 — hiçbir satır açılmaz', () => {
    const before = db.prepare('SELECT COUNT(*) n FROM laundry_items').get().n
    for (const bags of [0, 21, 2.5]) {
      expect(errorOf(() => intakeBags({ roomId: rooms['103'], bags, clientRequestId: `saha-bad${bags}x`, workerId })))
        .toMatchObject({ statusCode: 400 })
    }
    expect(errorOf(() => intakeBags({ roomId: rooms['103'], bags: 1, clientRequestId: '', workerId }))).toMatchObject({ statusCode: 400 })
    expect(errorOf(() => intakeBags({ roomId: 999999, bags: 1, clientRequestId: 'saha-noroom1', workerId }))).toMatchObject({ statusCode: 404 })
    expect(db.prepare('SELECT COUNT(*) n FROM laundry_items').get().n).toBe(before)
  })
})

describe('hazır → teslim → geri al (oda bazında)', () => {
  let ids, individual, neighbour

  beforeAll(() => {
    ids = intakeBags({ roomId: rooms['104'], bags: 2, ironing: false, urgent: false, clientRequestId: 'saha-flow0001', workerId }).ids
    // tekil kıyafet takipli torba bu akışa girmez; komşu odanın torbası etkilenmez
    individual = Number(db.prepare(`INSERT INTO laundry_items(room_id, status, item_count, tracking_mode, created_by)
      VALUES(?, 'dirty', 4, 'individual', 1)`).run(rooms['104']).lastInsertRowid)
    neighbour = intakeBags({ roomId: rooms['103'], bags: 1, clientRequestId: 'saha-flow0002', workerId }).ids
  })

  it('hazır: yalnız o odanın yıkamadaki, tekil takipte olmayan torbaları rafa alınır', () => {
    expect(markRoomReady({ roomId: rooms['104'], workerId: otherWorkerId })).toEqual({ ids })
    expect(statuses(ids)).toEqual(['ready', 'ready'])
    expect(statuses([individual, ...neighbour])).toEqual(['dirty', 'dirty'])
    expect(item(ids[0]).last_modified_worker_id).toBe(otherWorkerId)
    expect(errorOf(() => markRoomReady({ roomId: rooms['202'], workerId }))).toMatchObject({ statusCode: 404 })
  })

  it('teslim: yalnız hazır torbalar teslim edilir, teslim alan adı yazılır; ad yoksa "Odaya bırakıldı"', () => {
    expect(deliverRoom({ roomId: rooms['104'], name: ' Ali Veli ', workerId: otherWorkerId })).toEqual({ ids })
    expect(ids.map(id => [item(id).status, item(id).delivered_name])).toEqual([['delivered', 'Ali Veli'], ['delivered', 'Ali Veli']])
    expect(db.prepare('SELECT delivered_to, delivered_by_worker_id AS w FROM laundry_deliveries WHERE item_id=?').get(ids[0]))
      .toEqual({ delivered_to: 'Ali Veli', w: otherWorkerId })
    expect(item(individual).status).toBe('dirty')
    expect(errorOf(() => deliverRoom({ roomId: rooms['103'], name: 'X', workerId }))).toMatchObject({ statusCode: 404 })

    markRoomReady({ roomId: rooms['103'], workerId })
    deliverRoom({ roomId: rooms['103'], workerId })
    expect(item(neighbour[0]).delivered_name).toBe('Odaya bırakıldı')
  })

  it('geri al yalnız son adımı yapan kişide: başkası 403, adım uyuşmazsa 409', () => {
    expect(errorOf(() => undoLedger({ action: 'deliver', ids, workerId }))).toMatchObject({ statusCode: 403 })
    expect(errorOf(() => undoLedger({ action: 'ready', ids, workerId: otherWorkerId }))).toMatchObject({ statusCode: 409 })
    expect(statuses(ids)).toEqual(['delivered', 'delivered'])
  })

  it('geri al: teslim → hazır, hazır → yıkamada (adımı yapan kişi)', () => {
    expect(undoLedger({ action: 'deliver', ids, workerId: otherWorkerId })).toEqual({ undone: 2 })
    expect(statuses(ids)).toEqual(['ready', 'ready'])
    expect(item(ids[0]).delivered_name).toBeNull()
    expect(undoLedger({ action: 'ready', ids, workerId: otherWorkerId })).toEqual({ undone: 2 })
    expect(statuses(ids)).toEqual(['dirty', 'dirty'])
  })

  it('alımı yalnız açan kişi, torbaya kimse dokunmadıysa geri alır (torba silinir)', () => {
    // ids'i workerId açtı ama hazır/teslim başkasınca yapılıp geri alındı → açan bile silemez
    expect(errorOf(() => undoLedger({ action: 'intake', ids, workerId }))).toMatchObject({ statusCode: 403 })
    expect(statuses(ids)).toEqual(['dirty', 'dirty'])
    const own = intakeBags({ roomId: rooms['105'], bags: 1, clientRequestId: 'saha-flow0003', workerId }).ids
    expect(undoLedger({ action: 'intake', ids: own, workerId })).toEqual({ undone: 1 })
    expect(statuses(own)).toEqual([null])
  })

  it('başkasının açtığı torba "hazır → geri al hazır → geri al alım" zinciriyle silinemez', () => {
    const theirs = intakeBags({ roomId: rooms['106'], bags: 1, clientRequestId: 'saha-flow0004', workerId: otherWorkerId }).ids
    markRoomReady({ roomId: rooms['106'], workerId })
    expect(undoLedger({ action: 'ready', ids: theirs, workerId })).toEqual({ undone: 1 })
    expect(errorOf(() => undoLedger({ action: 'intake', ids: theirs, workerId }))).toMatchObject({ statusCode: 403 })
    expect(statuses(theirs)).toEqual(['dirty'])
  })

  it('masadan (web/Hermes) yapılan adımı saha personeli geri alamaz', () => {
    const [bag] = intakeBags({ roomId: rooms['106'], bags: 1, clientRequestId: 'saha-flow0005', workerId }).ids
    const deskUser = db.prepare("SELECT id FROM users WHERE username='camasir'").get().id
    markReadyFromLedgerService(bag, {}, deskUser)
    expect(errorOf(() => undoLedger({ action: 'ready', ids: [bag], workerId }))).toMatchObject({ statusCode: 403 })
    expect(statuses([bag])).toEqual(['ready'])
  })

  it('24 saatten eski adım sahada geri alınamaz (403); geçersiz istek 400', () => {
    db.prepare("UPDATE laundry_history SET created_at=datetime('now','-2 day') WHERE item_id=?").run(neighbour[0])
    expect(errorOf(() => undoLedger({ action: 'deliver', ids: neighbour, workerId }))).toMatchObject({ statusCode: 403 })
    expect(errorOf(() => undoLedger({ action: 'sil', ids: neighbour, workerId }))).toMatchObject({ statusCode: 400 })
    expect(errorOf(() => undoLedger({ action: 'deliver', ids: [], workerId }))).toMatchObject({ statusCode: 400 })
  })
})

describe('defter görünümü (ledgerOverview)', () => {
  it('oda bazında gruplar: yıkamada · hazır · bugün teslim; tekil takipli torba sayılmaz', () => {
    intakeBags({ roomId: rooms['201'], bags: 2, ironing: true, urgent: true, clientRequestId: 'saha-view0001', workerId })
    db.prepare(`INSERT INTO laundry_items(room_id, status, item_count, tracking_mode, created_by) VALUES(?, 'dirty', 3, 'individual', 1)`)
      .run(rooms['201'])
    intakeBags({ roomId: rooms['202'], bags: 1, clientRequestId: 'saha-view0002', workerId })
    markRoomReady({ roomId: rooms['202'], workerId })
    intakeBags({ roomId: rooms['203'], bags: 1, clientRequestId: 'saha-view0003', workerId })
    markRoomReady({ roomId: rooms['203'], workerId })
    deliverRoom({ roomId: rooms['203'], name: 'Ayşe', workerId })

    const view = ledgerOverview()
    const group = (list, no) => view[list].find(g => g.room_id === rooms[no])
    expect(group('open', '201')).toMatchObject({ block: 'FL', room_no: '201', bags: 2, ironing: 2, urgent: 2 })
    expect(group('open', '201').ids).toHaveLength(2)
    expect(group('open', '201').since).toBeTruthy()
    expect(group('ready', '202')).toMatchObject({ room_no: '202', bags: 1, ironing: 0, urgent: 0 })
    expect(group('delivered_today', '203')).toMatchObject({ room_no: '203', bags: 1 })
    expect(group('open', '202')).toBeUndefined()
    expect(group('ready', '203')).toBeUndefined()
  })
})

// Sakinin oda QR'ından çamaşır alma talebi sahaya düşer (spec 2026-10-24-oda-qr-saha §Hedefler 6). Talep teslim değildir:
// torba sahada alınınca talep 'collected' olur ve ilk torbaya bağlanır; alım geri alınırsa talep geri açılır.
describe('sakinin çamaşır talebi (oda QR portalı)', () => {
  const fr = {}
  const systemUser = () => db.prepare("SELECT id FROM users WHERE username='avs_kiosk_system'").get().id
  const ask = no => Number(db.prepare(`
    INSERT INTO laundry_pickup_requests(service_location_id, room_id, note, request_count)
    VALUES((SELECT id FROM service_locations WHERE room_id=?), ?, 'Kapının önünde', 1)
  `).run(fr[no], fr[no]).lastInsertRowid)
  const requestRow = id => db.prepare('SELECT * FROM laundry_pickup_requests WHERE id=?').get(id)

  beforeAll(() => {
    const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('FR', 1, ?, 6, 6)`)
    for (const no of ['101', '102', '103']) fr[no] = Number(room.run(no).lastInsertRowid)
  })

  it('açık talep defterde oda bazında; sakin adı yok; blok kuralına uyar', () => {
    const id = ask('101')
    const found = ledgerOverview().requests.find(r => r.id === id)
    expect(found).toMatchObject({ room_id: fr['101'], block: 'FR', room_no: '101', note: 'Kapının önünde', request_count: 1 })
    expect(found.created_at).toBeTruthy()
    expect(found).not.toHaveProperty('resident_name')
    expect(ledgerOverview(undefined, { block: 'M2' }).requests.some(r => r.id === id)).toBe(false)
  })

  it('alım talebi kapatır ve ilk torbaya bağlar; talepsiz odada kapanan yok', () => {
    const id = ledgerOverview().requests.find(r => r.room_id === fr['101']).id
    const res = intakeBags({ roomId: fr['101'], bags: 2, clientRequestId: 'saha-talep0001', workerId })
    expect(res.request_closed).toBe(id)
    expect(requestRow(id)).toMatchObject({ status: 'collected', laundry_item_id: res.ids[0], collected_by: systemUser() })
    expect(requestRow(id).collected_at).toBeTruthy()
    expect(ledgerOverview().requests.some(r => r.id === id)).toBe(false)
    expect(intakeBags({ roomId: fr['103'], bags: 1, clientRequestId: 'saha-talep0003', workerId }).request_closed).toBeNull()
  })

  it('alım geri alınınca talep yeniden açılır; torbalar silinir', () => {
    const ids = db.prepare("SELECT id FROM laundry_items WHERE substr(client_request_id, 1, 15)='saha-talep0001#' ORDER BY id").all().map(r => r.id)
    const id = db.prepare('SELECT id FROM laundry_pickup_requests WHERE laundry_item_id=?').get(ids[0]).id
    expect(undoLedger({ action: 'intake', ids, workerId })).toEqual({ undone: 2 })
    expect(requestRow(id)).toMatchObject({ status: 'open', laundry_item_id: null, collected_at: null, collected_by: null })
    expect(ids.map(item)).toEqual([undefined, undefined])
  })

  it('yeni talep açıkken geri alma eskiyi iptal eder, yenisi açık kalır', () => {
    const first = ask('102')
    const { ids } = intakeBags({ roomId: fr['102'], bags: 1, clientRequestId: 'saha-talep0002', workerId })
    const second = ask('102')
    undoLedger({ action: 'intake', ids, workerId })
    expect(requestRow(first)).toMatchObject({ status: 'cancelled', laundry_item_id: null })
    expect(requestRow(first).cancelled_reason).toBeTruthy()
    expect(requestRow(second)).toMatchObject({ status: 'open' })
  })
})
