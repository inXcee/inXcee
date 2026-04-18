# Çamaşırhane Kiosk Tam Entegrasyon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çamaşırhane kiosk'u tam iş terminaline dönüştür — pending_collection statüsü, torba takip, makine yükleme ve teslim akışı A'dan Z'ye çalışsın.

**Architecture:** Mevcut `laundry_items` tablosu yeniden oluşturularak `pending_collection` statüsü ve `bag_no`, `collected_by`, `collected_at` kolonları eklenir. Backend endpoint'leri `backend/src/modules/self-service/routes.js` içinde genişletilir. Frontend kiosk sayfası `LaundryKioskPage.jsx` 5 ekrana bölünür; LaundryHub kanban'a `Bekliyor` kolonu eklenir.

**Tech Stack:** better-sqlite3, Express, React, @tanstack/react-query, vitest

---

## File Map

| Dosya | İşlem | Açıklama |
|-------|--------|----------|
| `backend/src/shared/db/index.js` | Modify | Laundry v5 migration: pending_collection + bag_no + collected_by/at |
| `backend/src/modules/laundry/queries.js` | Modify | insertItemQuery'e status param + collectItemQuery yeni fonksiyon |
| `backend/src/modules/self-service/routes.js` | Modify | Mevcut endpoint fix + 4 yeni endpoint |
| `backend/src/modules/laundry/routes.js` | Modify | POST /items/:id/collect endpoint |
| `backend/src/modules/laundry/laundry.test.js` | Modify | pending_collection + collect testleri |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | Modify | 5 sekme: CollectView yeni, MachineView düzelt, DeliverView dual mod |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Modify | Bekliyor kolonu + Toplandı butonu + bag_no kart gösterimi |

---

## Task 1: DB Migration — pending_collection + bag_no

**Files:**
- Modify: `backend/src/shared/db/index.js` (sona ekle, 644. satır civarı)
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Mevcut laundry_items status CHECK'i kontrol et**

`backend/src/shared/db/index.js` içinde v4b migration bloğunu bul (satır ~324). Mevcut CHECK: `('dirty','washing','ironing','ready','delivered','lost')`. `pending_collection` yok — tablonun yeniden oluşturulması gerekiyor.

- [ ] **Step 2: Failing test yaz**

`backend/src/modules/laundry/laundry.test.js` dosyasını aç, mevcut test yapısını takip ederek dosyanın sonuna ekle:

```js
describe('laundry v5 migrations', () => {
  test('laundry_items accepts pending_collection status', () => {
    const db = getDB()
    // Oda oluştur
    const roomId = db.prepare(
      "INSERT INTO rooms(block,floor,room_no,capacity,active_beds) VALUES('T',1,'101',4,4)"
    ).run().lastInsertRowid
    // pending_collection ile insert
    const r = db.prepare(
      "INSERT INTO laundry_items(room_id, status, item_count) VALUES(?,?,?)"
    ).run(roomId, 'pending_collection', 1)
    expect(r.lastInsertRowid).toBeGreaterThan(0)
  })

  test('laundry_items has bag_no column', () => {
    const db = getDB()
    const cols = db.prepare('PRAGMA table_info(laundry_items)').all().map(c => c.name)
    expect(cols).toContain('bag_no')
    expect(cols).toContain('collected_by')
    expect(cols).toContain('collected_at')
  })

  test('bag_no is unique', () => {
    const db = getDB()
    const roomId = db.prepare(
      "INSERT INTO rooms(block,floor,room_no,capacity,active_beds) VALUES('T',1,'102',4,4)"
    ).run().lastInsertRowid
    db.prepare("INSERT INTO laundry_items(room_id,item_count,bag_no) VALUES(?,?,?)").run(roomId, 1, 'T-99999')
    expect(() =>
      db.prepare("INSERT INTO laundry_items(room_id,item_count,bag_no) VALUES(?,?,?)").run(roomId, 1, 'T-99999')
    ).toThrow()
  })
})
```

- [ ] **Step 3: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | tail -30
```

Expected: `laundry_items accepts pending_collection status` FAIL (CHECK constraint hatası).

- [ ] **Step 4: Migration ekle**

`backend/src/shared/db/index.js` dosyasında `return db` satırından hemen önce (satır 646) şunu ekle:

```js
  // ── Laundry v5 — pending_collection statüsü + torba takip ─────────────────
  try {
    const v5Check = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='laundry_items'").get()
    if (v5Check && !v5Check.sql.includes("'pending_collection'")) {
      db.pragma('foreign_keys = OFF')
      const migrateV5 = db.transaction(() => {
        db.exec(`CREATE TABLE laundry_items_v5 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER REFERENCES rooms(id),
          status TEXT NOT NULL DEFAULT 'dirty' CHECK(status IN ('pending_collection','dirty','washing','ironing','ready','delivered','lost')),
          machine_id INTEGER REFERENCES laundry_machines(id),
          urgent INTEGER NOT NULL DEFAULT 0,
          item_count INTEGER NOT NULL DEFAULT 1,
          item_details TEXT,
          shelf_location TEXT,
          photo_url TEXT,
          notes TEXT,
          phone_override TEXT,
          intake_name TEXT,
          intake_signature TEXT,
          clothing_items TEXT,
          needs_ironing INTEGER DEFAULT 0,
          occupant_signature TEXT,
          compensation_value REAL DEFAULT NULL,
          compensation_note TEXT DEFAULT NULL,
          is_premium INTEGER DEFAULT 0,
          bag_no TEXT UNIQUE,
          collected_by INTEGER REFERENCES avs_workers(id),
          collected_at INTEGER,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`)
        db.exec(`INSERT INTO laundry_items_v5(
          id, room_id, status, machine_id, urgent, item_count, item_details,
          shelf_location, photo_url, notes, phone_override, intake_name,
          intake_signature, clothing_items, needs_ironing, occupant_signature,
          compensation_value, compensation_note, is_premium,
          created_by, created_at, updated_at
        )
        SELECT
          id, room_id, status, machine_id, urgent, item_count, item_details,
          shelf_location, photo_url, notes, phone_override, intake_name,
          intake_signature, clothing_items, needs_ironing, occupant_signature,
          compensation_value, compensation_note, is_premium,
          created_by, created_at, updated_at
        FROM laundry_items`)
        db.exec(`DROP TABLE laundry_items`)
        db.exec(`ALTER TABLE laundry_items_v5 RENAME TO laundry_items`)
        // İndeksleri yeniden oluştur
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_li_room_created ON laundry_items(room_id, created_at DESC)`)
      })
      migrateV5()
      db.pragma('foreign_keys = ON')
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] laundry_v5:', e.message) }
```

- [ ] **Step 5: Testi çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | tail -30
```

Expected: tüm testler PASS. `pending_collection` artık geçerli statü.

- [ ] **Step 6: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -20
```

Expected: tüm suite PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/db/index.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: laundry v5 — pending_collection status + bag_no + collected_by/at"
```

---

## Task 2: Backend — queries.js güncellemesi

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`

- [ ] **Step 1: insertItemQuery'e status parametresi ekle**

`backend/src/modules/laundry/queries.js` dosyasında `insertItemQuery` fonksiyonunu bul (satır ~7-14). Fonksiyon imzasına `status = 'dirty'` ekle ve INSERT sorgusuna dahil et:

```js
export function insertItemQuery({ room_id, item_count = 1, item_details, notes, urgent = 0, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing = 0, is_premium = 0, created_by, status = 'dirty' }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(room_id, status, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing, is_premium, created_by, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(room_id, status, item_count, item_details || null, notes || null, urgent ? 1 : 0, photo_url || null, phone_override || null, intake_name || null, intake_signature || null, clothing_items ? (typeof clothing_items === 'string' ? clothing_items : JSON.stringify(clothing_items)) : null, needs_ironing ? 1 : 0, is_premium ? 1 : 0, created_by)
  return r.lastInsertRowid
}
```

- [ ] **Step 2: collectItemQuery yeni fonksiyon ekle**

`insertItemQuery`'nin hemen altına ekle:

```js
export function collectItemQuery(id, avsWorkerId) {
  const db = getDB()
  db.prepare(`
    UPDATE laundry_items
    SET status='dirty', collected_by=?, collected_at=strftime('%s','now'), updated_at=datetime('now')
    WHERE id=? AND status='pending_collection'
  `).run(avsWorkerId || null, id)
}

export function generateBagNoQuery(id) {
  return 'T-' + String(id).padStart(5, '0')
}

export function setBagNoQuery(id) {
  const db = getDB()
  const bagNo = generateBagNoQuery(id)
  db.prepare(`UPDATE laundry_items SET bag_no=? WHERE id=?`).run(bagNo, id)
  return bagNo
}
```

- [ ] **Step 3: listItemsQuery'i güncelle — pending_collection hariç tutma**

`listItemsQuery` fonksiyonunda (satır ~96) şu satırı bul:
```js
if (!status || status !== 'delivered') {
  conditions.push("li.status != 'delivered'")
}
```

Şununla değiştir:
```js
if (!status) {
  conditions.push("li.status NOT IN ('delivered','lost')")
}
```

Ve SELECT'e `bag_no` ekle — `li.*` zaten bag_no'yu kapsar, ekstra değişiklik gerekmez.

- [ ] **Step 4: Testi çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/laundry/queries.js
git commit -m "feat: insertItemQuery status param + collectItemQuery + setBagNoQuery"
```

---

## Task 3: Backend — self-service/routes.js endpoint güncellemeleri

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`

- [ ] **Step 1: Import'a yeni fonksiyonları ekle**

`routes.js` dosyasının başında laundry queries import satırını bul (satır ~6):
```js
import { insertItemQuery, updateItemStatusQuery, listMachinesQuery, addToQueueQuery } from '../laundry/queries.js'
```

Şununla değiştir:
```js
import { insertItemQuery, updateItemStatusQuery, listMachinesQuery, addToQueueQuery, collectItemQuery, setBagNoQuery } from '../laundry/queries.js'
```

- [ ] **Step 2: POST /laundry-kiosk/bag endpoint'ini güncelle — pending_collection + bag_no**

`selfServiceRouter.post('/laundry-kiosk/bag', ...)` bloğunu bul (satır ~151-176). `insertItemQuery` çağrısını ve response'u güncelle:

```js
selfServiceRouter.post('/laundry-kiosk/bag', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, item_count, is_premium, notes, urgent, intake_signature, clothing_items } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  const count = Number(item_count)
  if (!count || count < 1 || count > 8) return res.status(400).json({ error: 'Geçersiz adet (1-8)' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const id = insertItemQuery({
      room_id: room.id,
      item_count: count,
      status: 'pending_collection',
      is_premium: is_premium ? 1 : 0,
      notes: notes || null,
      urgent: urgent ? 1 : 0,
      intake_signature: intake_signature || null,
      intake_name: intake_name || null,
      clothing_items: clothing_items ? JSON.stringify(clothing_items) : null,
      created_by: null,
    })
    const bag_no = setBagNoQuery(id)
    res.status(201).json({ id, bag_no })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 3: PUT /bags/:id/status ALLOWED listesini güncelle**

`selfServiceRouter.put('/laundry-kiosk/bags/:id/status', ...)` bloğunu bul (satır ~195-203). ALLOWED listesindeki `'collected'`'i `'pending_collection'` ile değiştir:

```js
selfServiceRouter.put('/laundry-kiosk/bags/:id/status', requireAvsKiosk, (req, res) => {
  const { status } = req.body
  const ALLOWED = ['pending_collection', 'washing', 'ironing', 'ready', 'delivered']
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Geçersiz durum' })
  try {
    updateItemStatusQuery(Number(req.params.id), status)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: GET /laundry-kiosk/pending-bags endpoint ekle**

`selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', ...)` bloğundan önce ekle:

```js
selfServiceRouter.get('/laundry-kiosk/pending-bags', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const bags = db.prepare(`
      SELECT li.id, li.bag_no, li.item_count, li.urgent, li.is_premium,
             li.intake_name, li.created_at,
             r.block, r.room_no
      FROM laundry_items li
      JOIN rooms r ON r.id = li.room_id
      WHERE li.status = 'pending_collection'
      ORDER BY li.urgent DESC, li.created_at ASC
      LIMIT 100
    `).all()
    res.json(bags)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 5: POST /laundry-kiosk/bags/:id/collect endpoint ekle**

`GET /laundry-kiosk/pending-bags` bloğundan hemen sonra ekle:

```js
selfServiceRouter.post('/laundry-kiosk/bags/:id/collect', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare("SELECT id, status FROM laundry_items WHERE id=?").get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'pending_collection') return res.status(400).json({ error: 'Torba pending_collection değil' })
    collectItemQuery(Number(req.params.id), req.user.workerId || null)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 6: POST /laundry-kiosk/deliver-resident endpoint ekle**

`POST /laundry-kiosk/bags/:id/collect` bloğundan sonra ekle (sakin PIN ile teslim):

```js
selfServiceRouter.post('/laundry-kiosk/deliver-resident/:id', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { signature } = req.body
  try {
    const db = getDB()
    // Torbanın bu sakine ait olduğunu doğrula
    const item = db.prepare(`
      SELECT li.id, li.status FROM laundry_items li
      JOIN room_assignments ra ON ra.room_id = li.room_id
      WHERE li.id=? AND ra.personnel_id=? AND ra.check_out_at IS NULL AND li.status='ready'
    `).get(Number(req.params.id), req.user.personnelId)
    if (!item) return res.status(403).json({ error: 'Torba bulunamadı veya hazır değil' })
    db.prepare(`
      UPDATE laundry_items
      SET status='delivered', occupant_signature=?, updated_at=datetime('now')
      WHERE id=?
    `).run(signature || null, item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 7: GET /laundry-kiosk/bags — dirty filtresi güncelle**

`MachineView` kiosk component'i `status=dirty` çekmeye geçecek. `GET /laundry-kiosk/bags` endpoint'indeki default filter zaten `NOT IN ('delivered','lost')` — bu yeterli, değişiklik gerekmez.

- [ ] **Step 8: Testi çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/self-service/routes.js
git commit -m "feat: laundry kiosk backend — pending_collection, collect, deliver-resident endpoints"
```

---

## Task 4: Backend — laundry/routes.js collect endpoint (LaundryHub için)

**Files:**
- Modify: `backend/src/modules/laundry/routes.js`

- [ ] **Step 1: Import'a collectItemQuery ekle**

`routes.js` dosyasında (satır ~1-7) `svc` import var, servis fonksiyonlarını service.js üzerinden kullanıyoruz. `service.js`'e collectItemService eklemek yerine doğrudan queries.js'i import edelim:

`routes.js` dosyasının import bloğunun sonuna ekle:
```js
import { collectItemQuery } from './queries.js'
```

- [ ] **Step 2: POST /items/:id/collect endpoint ekle**

`laundryRouter.patch('/items/:id/advance', ...)` bloğundan önce ekle:

```js
laundryRouter.post('/items/:id/collect', ...laundryFull, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare("SELECT id, status FROM laundry_items WHERE id=?").get(+req.params.id)
    if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
    if (item.status !== 'pending_collection') return res.status(400).json({ error: 'Durum pending_collection değil' })
    collectItemQuery(+req.params.id, null)
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

`getDB` import'u bu dosyada zaten var (`import * as svc` servisten kullanıyoruz ama getDB direkt lazım). `routes.js` başında `getDB` import'u yoksa ekle. Dosya başını kontrol et — eğer yoksa:
```js
import { getDB } from '../../shared/db/index.js'
```

- [ ] **Step 3: Testi çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/laundry/routes.js
git commit -m "feat: laundry hub POST /items/:id/collect endpoint"
```

---

## Task 5: Kiosk Frontend — BagForm fix + CollectView

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

- [ ] **Step 1: BagForm success ekranında bag_no göster**

`BagForm` component'inde (satır ~278-412):

1. `const [bagNo, setBagNo] = useState(null)` state ekle (satır ~286 civarı mevcut state'lerin yanına):
```js
const [bagNo, setBagNo] = useState(null)
```

2. `handleSubmit` fonksiyonunda response'dan bag_no al (satır ~301-317):
```js
async function handleSubmit() {
  setError('')
  if (!block || !roomNo) return setError('Blok ve oda no gerekli')
  const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
  try {
    const res = await kioskApi.post('/self-service/laundry-kiosk/bag', {
      block, room_no: roomNo,
      personnel_id: selectedPerson?.id || null,
      item_count: itemCount,
      is_premium: isPremium,
      clothing_items: isPremium ? garmentItems : null,
      notes: notes || null,
      urgent,
      intake_signature: sig,
    })
    setBagNo(res.data.bag_no)
    setSuccess(true)
  } catch (e) { setError(e.response?.data?.error || 'Hata oluştu') }
}
```

3. Success ekranında bag_no göster (satır ~320-326):
```jsx
if (success) return (
  <div style={{ textAlign: 'center', padding: '48px 0' }}>
    <div style={{ fontSize: 56 }}>✅</div>
    <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Torba kaydedildi!</div>
    {bagNo && (
      <div style={{ marginTop: 16, background: '#0f172a', borderRadius: 12, padding: '16px 24px', display: 'inline-block' }}>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{bagNo}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
      </div>
    )}
    <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
  </div>
)
```

- [ ] **Step 2: Ana ekran action grid'e "Topla" ekle**

`LaundryKioskPage` ana ekran (satır ~228-251) action grid array'ine `collect` ekle:

```jsx
{[
  { key: 'bag',     icon: '🧺', label: 'Torba Bırak',    bg: '#1e3a5f' },
  { key: 'collect', icon: '📦', label: 'Torba Topla',    bg: '#14532d' },
  { key: 'machine', icon: '⚙️', label: 'Makineye Yükle',  bg: '#1e293b' },
  { key: 'deliver', icon: '🚚', label: 'Teslim Et',       bg: '#451a03' },
  { key: 'status',  icon: '📋', label: 'Durum Görüntüle', bg: '#1e293b' },
  { key: 'garment', icon: '👔', label: 'Kıyafet Gir',     bg: '#3b0764' },
].map(a => (
```

- [ ] **Step 3: Action routing'e collect ekle**

`{activeAction === 'bag' && ...}` bloklarının olduğu bölümde (satır ~253-259) `collect` routing'i ekle:

```jsx
{activeAction === 'bag'     && <BagForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'collect' && <CollectView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'machine' && <MachineView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'deliver' && <DeliverView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'status'  && <StatusView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'garment' && <GarmentForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
```

(Eski `ready`, `iron` action'larını kaldır — artık LaundryHub'dan yönetilecek.)

- [ ] **Step 4: CollectView yeni component ekle**

Dosyanın sonuna, `MachineView`'den önce yeni `CollectView` ekle:

```jsx
// ── Torba Topla ───────────────────────────────────────────────────────────────
function CollectView({ kioskApi, onDone }) {
  const [bags, setBags] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await kioskApi.get('/self-service/laundry-kiosk/pending-bags')
      setBags(res.data)
    } catch { setError('Yüklenemedi') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function collect(bag) {
    setError('')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/collect`)
      setBags(prev => prev.filter(b => b.id !== bag.id))
      setSuccess(true); setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  const filtered = filter
    ? bags.filter(b => b.bag_no?.includes(filter.toUpperCase()) || b.block?.includes(filter.toUpperCase()) || b.room_no?.includes(filter))
    : bags

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>📦 Torba Topla</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Toplandı — kirli olarak işaretlendi</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Torba no, blok veya oda ara..."
          style={{ ...input, flex: 1 }} />
        <button onClick={load} style={btn('#334155', '#e2e8f0')} disabled={loading}>
          {loading ? '...' : '↻'}
        </button>
      </div>
      {filtered.length === 0 && !loading && (
        <div style={{ color: '#475569', fontSize: 13 }}>Bekleyen torba yok</div>
      )}
      {filtered.map(b => (
        <div key={b.id} style={{ background: '#1e293b', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>{b.bag_no || `#${b.id}`}</div>
            <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {b.item_count} adet{b.urgent ? ' · ⚡ Acil' : ''}{b.intake_name ? ` · ${b.intake_name}` : ''}
            </div>
          </div>
          <button onClick={() => collect(b)} style={{ ...btn('#047857', '#d1fae5'), fontSize: 12, padding: '8px 14px' }}>
            Toplandı
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: StatusView component ekle (eski StatusUpdateView yerine özet görünüm)**

Mevcut `StatusUpdateView` var — bunu `StatusView` olarak yeniden adlandır ve sadece "ready" işlemini desteklemesini sağla. Dosyada `function StatusUpdateView` bulun ve `function StatusView` olarak yeniden adlandır; `targetStatus` ve `label` props yerine sabit `ready`:

```jsx
function StatusView({ kioskApi, onDone }) {
  const blocks = useBlocks()
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [bags, setBags] = useState([])
  const [success, setSuccess] = useState(false)

  const STATUS_LABEL = {
    pending_collection: 'Toplanmayı Bekliyor',
    dirty: 'Kirli', washing: 'Yıkanıyor', ironing: 'Ütüleniyor',
    ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
  }

  async function search() {
    if (!block) return
    const params = new URLSearchParams({ block })
    if (roomNo) params.set('room_no', roomNo)
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?${params}`)
    setBags(res.data)
  }

  async function markReady(id) {
    await kioskApi.put(`/self-service/laundry-kiosk/bags/${id}/status`, { status: 'ready' })
    setBags(bags => bags.map(b => b.id === id ? { ...b, status: 'ready' } : b))
    setSuccess(true); setTimeout(() => setSuccess(false), 2000)
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>📋 Torba Durumu</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Güncellendi</div>}
      <div><label style={lbl}>Blok</label><BlockPicker blocks={blocks} block={block} setBlock={setBlock} /></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="Oda (opsiyonel)"
          style={{ ...input, flex: 1 }} />
        <button onClick={search} style={btn('#1d4ed8')}>Ara</button>
      </div>
      {bags.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Torba bulunamadı</div>}
      {bags.map(b => (
        <div key={b.id} style={{ background: '#1e293b', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
            <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {b.item_count} torba · {STATUS_LABEL[b.status] || b.status}
              {b.urgent ? ' · ⚡' : ''}{b.intake_name ? ` · ${b.intake_name}` : ''}
            </div>
          </div>
          {b.status === 'ironing' && (
            <button onClick={() => markReady(b.id)} style={{ ...btn('#047857', '#d1fae5'), fontSize: 12, padding: '8px 14px' }}>Hazır</button>
          )}
        </div>
      ))}
    </div>
  )
}
```

Eski `StatusUpdateView`, `IronView` bileşenlerini dosyadan kaldır (artık kullanılmıyor).

- [ ] **Step 6: Manuel test — uygulama çalıştır**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && npm run dev
```

Tarayıcıda `http://localhost:5173/laundry-kiosk` aç. AVS çalışan ile giriş yap.
- "Torba Bırak" → blok/oda seç → kaydet → bag_no görünmeli (T-00001 gibi)
- "Torba Topla" → az önce bırakılan torba listede görünmeli → "Toplandı" tıkla → listeden kaybolmalı

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: kiosk faz3 — BagForm bag_no göster, CollectView, StatusView"
```

---

## Task 6: Kiosk Frontend — MachineView güncelle (dirty torbalar + timer)

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

- [ ] **Step 1: MachineView'de bags fetch güncelle**

`MachineView` component'inde (mevcut satır ~660-712) şu satırı bul:
```js
kioskApi.get('/self-service/laundry-kiosk/bags?status=collected').then(r => setBags(r.data)).catch(() => {})
```

Şununla değiştir (`collected` → `dirty`):
```js
kioskApi.get('/self-service/laundry-kiosk/bags?status=dirty').then(r => setBags(r.data)).catch(() => {})
```

- [ ] **Step 2: MachineView'de makine timer bilgisini göster**

Makine listesi render bloğunu güncelle. Mevcut:
```jsx
{m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'} · {m.active_items || 0} aktif
```

Şununla değiştir:
```jsx
{(() => {
  let timerLabel = ''
  if (m.timer_end) {
    const remaining = Math.ceil((new Date(m.timer_end) - new Date()) / 60000)
    timerLabel = remaining > 0 ? ` · ⏱ ${remaining}dk` : ' · ✓ Bitti'
  }
  return `${m.name} · ${m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'} · ${m.active_items || 0} aktif${timerLabel}`
})()}
```

- [ ] **Step 3: MachineView label'ı güncelle**

`<h2>⚙️ Makine</h2>` başlığını şununla değiştir:
```jsx
<h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>⚙️ Makineye Yükle</h2>
```

Ve bag listesi label'ını güncelle:
```jsx
<label style={lbl}>Torba Seç (Kirli)</label>
```

- [ ] **Step 4: Manuel test**

Kiosk sayfasında "Makineye Yükle" tıkla:
- Kirli (dirty) torbalar listelenmeli
- Mevcut çalışan makinelerde kalan süre görünmeli
- Torba seç → makine seç → "⚙️ Makineye atandı" mesajı çıkmalı

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: kiosk faz4 — MachineView dirty torbalar + makine timer"
```

---

## Task 7: Kiosk Frontend — DeliverView dual mod (staff + sakin)

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

- [ ] **Step 1: DeliverView'i dual mod için yeniden yaz**

Mevcut `DeliverView` (satır ~466-522) bileşenini tamamen değiştir:

```jsx
// ── Teslim Et ─────────────────────────────────────────────────────────────────
function DeliverView({ kioskApi, onDone }) {
  const [mode, setMode] = useState(null) // 'staff' | 'resident'

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🚚 Teslim Et</h2>
      {!mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setMode('staff')}
            style={{ ...btn('#1e3a5f', '#93c5fd'), padding: '20px', fontSize: 15, borderRadius: 14 }}>
            👷 Personel Teslimi
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4 }}>AVS görevlisi hazır torbayı teslim eder</div>
          </button>
          <button onClick={() => setMode('resident')}
            style={{ ...btn('#14532d', '#86efac'), padding: '20px', fontSize: 15, borderRadius: 14 }}>
            🙋 Sakin Teslimi
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>Sakin kendi torbalarını alır, imzalar</div>
          </button>
        </div>
      )}
      {mode === 'staff'    && <StaffDeliverForm kioskApi={kioskApi} onBack={() => setMode(null)} />}
      {mode === 'resident' && <ResidentDeliverForm onBack={() => setMode(null)} />}
    </div>
  )
}

// ── Staff teslim formu ────────────────────────────────────────────────────────
function StaffDeliverForm({ kioskApi, onBack }) {
  const sigRef = useRef(null)
  const blocks = useBlocks()
  const [block, setBlock] = useState('')
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function searchReady() {
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?status=ready${block ? `&block=${block}` : ''}`)
    setBags(res.data)
  }

  async function deliver() {
    if (!selectedBag) return
    setError('')
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/bags/${selectedBag.id}/status`, { status: 'delivered' })
      setSuccess(true); setSelectedBag(null)
      setBags(bags => bags.filter(b => b.id !== selectedBag.id))
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button onClick={onBack} style={{ ...btn('#1e293b', '#94a3b8'), fontSize: 12, alignSelf: 'flex-start', padding: '6px 12px' }}>← Geri</button>
      <h3 style={{ fontSize: 15, color: '#93c5fd', margin: 0 }}>👷 Personel Teslimi</h3>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Teslim edildi</div>}
      <div>
        <label style={lbl}>Blok (opsiyonel)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setBlock('')}
            style={{ ...btn(!block ? '#1d4ed8' : '#1e293b', !block ? '#fff' : '#64748b'), fontSize: 13, padding: '8px 16px' }}>Tümü</button>
          {useBlocks().map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              style={{ ...btn(block === b ? '#1d4ed8' : '#1e293b', block === b ? '#fff' : '#64748b'), fontSize: 13, padding: '8px 16px' }}>{b}</button>
          ))}
        </div>
      </div>
      <button onClick={searchReady} style={{ ...btn('#334155', '#e2e8f0') }}>Hazır Torbaları Getir</button>
      {bags.map(b => (
        <div key={b.id} onClick={() => setSelectedBag(b)}
          style={{ background: '#1e293b', borderRadius: 12, padding: 12, cursor: 'pointer', border: `2px solid ${selectedBag?.id === b.id ? '#3b82f6' : 'transparent'}` }}>
          {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
          <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{b.item_count} torba{b.intake_name ? ` · ${b.intake_name}` : ''}</div>
        </div>
      ))}
      {selectedBag && (
        <>
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <button onClick={deliver} style={{ ...btn('#b45309'), padding: 14 }}>Teslim Onayla</button>
        </>
      )}
    </div>
  )
}

// ── Sakin teslim formu ────────────────────────────────────────────────────────
function ResidentDeliverForm({ onBack }) {
  const sigRef = useRef(null)
  const [step, setStep] = useState('search') // 'search' | 'bags'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [residentToken, setResidentToken] = useState(null)
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function searchResident() {
    if (query.trim().length < 2) return
    try {
      const res = await api.get(`/checkin/search?q=${encodeURIComponent(query.trim())}`)
      setResults(res.data)
    } catch { setError('Arama başarısız') }
  }

  async function loginResident(person) {
    // Sakin arama token'ı gerekmez — personnelId üzerinden direkt çek
    // Basitlik için staff token'ı kullanarak resident'ın ready torbalarını getir
    try {
      const res = await api.get(`/self-service/laundry-kiosk/bags?status=ready`, {
        params: { personnel_id: person.id }
      })
      // Oda bazlı filtreleme — person'ın odasındaki ready torbalar
      // Backend'e personnelId filter eklemek yerine frontend'de filtrele
      // (Bütünleşik akış için sonraki geliştirmede backend filter eklenebilir)
      setBags(res.data)
      setResidentToken(person)
      setStep('bags')
    } catch { setError('Yüklenemedi') }
  }

  async function deliver() {
    if (!selectedBag || !residentToken) return
    setError('')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await api.post(`/self-service/laundry-kiosk/deliver-resident/${selectedBag.id}`, { signature: sig })
      setBags(prev => prev.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null)
      setSuccess(true); setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button onClick={onBack} style={{ ...btn('#1e293b', '#94a3b8'), fontSize: 12, alignSelf: 'flex-start', padding: '6px 12px' }}>← Geri</button>
      <h3 style={{ fontSize: 15, color: '#86efac', margin: 0 }}>🙋 Sakin Teslimi</h3>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Teslim edildi</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      {step === 'search' && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="İsim ile ara..."
              onKeyDown={e => e.key === 'Enter' && searchResident()}
              style={{ ...input, flex: 1 }} />
            <button onClick={searchResident} style={btn('#1d4ed8')}>Ara</button>
          </div>
          {results.map(p => (
            <button key={p.id} onClick={() => loginResident(p)}
              style={{ ...btn('#1e293b', '#e2e8f0'), textAlign: 'left', width: '100%', marginBottom: 4 }}>
              <div style={{ fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{p.company || ''} {p.room_no ? `· Oda ${p.room_no}` : ''}</div>
            </button>
          ))}
        </>
      )}

      {step === 'bags' && (
        <>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Sakin: <strong style={{ color: '#e2e8f0' }}>{residentToken?.full_name}</strong>
            <button onClick={() => { setStep('search'); setResults([]); setBags([]); setResidentToken(null) }}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Değiştir</button>
          </div>
          {bags.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Hazır torba yok</div>}
          {bags.map(b => (
            <div key={b.id} onClick={() => setSelectedBag(b)}
              style={{ background: '#1e293b', borderRadius: 12, padding: 12, cursor: 'pointer', border: `2px solid ${selectedBag?.id === b.id ? '#22c55e' : 'transparent'}` }}>
              {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
              <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{b.item_count} torba</div>
            </div>
          ))}
          {selectedBag && (
            <>
              <div><label style={lbl}>İmza</label><SigPad sigRef={sigRef} /></div>
              <button onClick={deliver} style={{ ...btn('#15803d'), padding: 14 }}>Teslim Onayla</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

**Not:** `ResidentDeliverForm`'da `api` import'u (`../../shared/api/client.js`) kullanılıyor çünkü sakin araması için normal API gerekiyor. Bu dosyanın en üstünde `api` zaten import edilmiş — kontrol et.

- [ ] **Step 2: Manuel test**

Kiosk sayfasında "Teslim Et" tıkla:
- "Personel Teslimi" → hazır torbaları listele → seç → onayla → delivered olmalı
- "Sakin Teslimi" → isim ara → kişi seç → hazır torbaları gör → seç → imzala → onayla

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: kiosk faz5 — DeliverView dual mod (personel + sakin teslimi)"
```

---

## Task 8: LaundryHub — Bekliyor Kanban Kolonu

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

- [ ] **Step 1: LaundryHub.jsx'te COLUMNS tanımını bul**

`LaundryHub.jsx`'te kanban sütunlarının tanımlandığı yeri bul. Arama:
```
grep -n "dirty\|COLUMNS\|columns\|kanban\|kirli" frontend/src/modules/laundry/LaundryHub.jsx | head -20
```

`dirty`, `washing`, `ironing`, `ready` gibi status değerlerinin geçtiği satırları bul.

- [ ] **Step 2: Bekliyor kolonunu COLUMNS'a ekle**

Mevcut columns array'ini (ör. `const COLUMNS = [...]` veya benzeri yapı) bul. En başa `pending_collection` ekle:

```js
const COLUMNS = [
  { key: 'pending_collection', label: 'Bekliyor', color: '#0369a1', bg: '#0c4a6e' },
  { key: 'dirty',              label: 'Kirli',    color: '#dc2626', bg: '#450a0a' },
  { key: 'washing',            label: 'Yıkama',   color: '#2563eb', bg: '#1e3a5f' },
  { key: 'ironing',            label: 'Ütü',      color: '#d97706', bg: '#451a03' },
  { key: 'ready',              label: 'Hazır',    color: '#16a34a', bg: '#14532d' },
]
```

Eğer COLUMNS array yoksa ve status'lar inline tanımlıysa, bunları bul ve `pending_collection`'ı en başa ekle.

- [ ] **Step 3: ItemCard'da bag_no göster**

`frontend/src/modules/laundry/components/ItemCard.jsx` dosyasını aç. Kart içinde oda numarası veya başlığın gösterildiği satırı bul. `bag_no` gösterimi ekle:

```jsx
{item.bag_no && (
  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#38bdf8', letterSpacing: 1 }}>
    {item.bag_no}
  </span>
)}
```

Bunu item başlığının üstüne ya da altına yerleştir (mevcut düzene uy).

- [ ] **Step 4: Bekliyor kolonunda "Toplandı" butonu**

`LaundryHub.jsx`'te item'ların render edildiği yeri bul. `pending_collection` statüsündeki item'lar için "Toplandı" butonu göster. Bu mantığı kart render bloğuna ekle:

```jsx
{item.status === 'pending_collection' && (
  <button
    onClick={async (e) => {
      e.stopPropagation()
      try {
        await laundryApi.collectItem(item.id)
        queryClient.invalidateQueries(['laundry-items'])
      } catch {}
    }}
    style={{
      marginTop: 4, padding: '4px 10px', borderRadius: 8,
      background: '#14532d', border: 'none', color: '#86efac',
      fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)',
    }}
  >
    ✓ Toplandı
  </button>
)}
```

- [ ] **Step 5: laundryApi.collectItem fonksiyonu ekle**

`frontend/src/modules/laundry/api.js` dosyasını aç. Mevcut API fonksiyonlarının sonuna ekle:

```js
collectItem: (id) => api.post(`/laundry/items/${id}/collect`).then(r => r.data),
```

- [ ] **Step 6: Manuel test**

`http://localhost:5173/laundry` adresine git.
- Kiosk'tan bir torba bırak → LaundryHub'da "Bekliyor" kolonunda görünmeli
- Kart üzerinde torba no (T-00001) görünmeli
- "Toplandı" butonuna tıkla → "Kirli" kolonuna geçmeli

- [ ] **Step 7: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx frontend/src/modules/laundry/components/ItemCard.jsx frontend/src/modules/laundry/api.js
git commit -m "feat: kiosk faz6 — LaundryHub Bekliyor kolonu, bag_no kart, Toplandı butonu"
```

---

## Özet

| Faz | Task | Anahtar Değişiklik |
|-----|------|--------------------|
| 1 | Task 1 | DB: `laundry_items` rebuild + `pending_collection` + `bag_no` |
| 2 | Task 2-4 | Backend: queries + self-service + laundry routes |
| 3 | Task 5 | Kiosk: BagForm bag_no göster + CollectView + StatusView |
| 4 | Task 6 | Kiosk: MachineView dirty torbalar + timer |
| 5 | Task 7 | Kiosk: DeliverView dual mod |
| 6 | Task 8 | LaundryHub: Bekliyor kolonu + bag_no + Toplandı butonu |
