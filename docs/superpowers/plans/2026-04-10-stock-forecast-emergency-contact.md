# Stok Tüketim Tahmini + Acil İletişim Kişisi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envanter sayfasına 14 günlük tüketim hızına dayalı "kaç gün kaldı" tahmini ekle; personel kaydına acil iletişim kişisi alanları ekle.

**Architecture:** İki bağımsız özellik — (A) inventory modülüne `getForecast()` query + service + route eklenir, frontend KPI + badge ile gösterir; (B) `personnel` tablosuna migration ile 2 kolon eklenir, checkin/capacity/checkout sayfalarına yansıtılır.

**Tech Stack:** Node.js/Express, better-sqlite3, React, @tanstack/react-query, vitest/supertest

---

## Dosya Haritası

**Değiştirilecek (A — Stok):**
- `backend/src/modules/inventory/queries.js` — `getForecast()` eklenir
- `backend/src/modules/inventory/service.js` — `getForecast()` servisi + bildirim
- `backend/src/modules/inventory/routes.js` — `GET /forecast` route
- `backend/src/modules/inventory/inventory.test.js` — forecast testleri
- `frontend/src/modules/inventory/InventoryPage.jsx` — KPI kartı + item badge

**Değiştirilecek (B — Acil):**
- `backend/src/shared/db/index.js` — migration
- `backend/src/modules/checkin/queries.js` — `insertPersonnel` güncellenir
- `backend/src/modules/capacity/queries.js` — `getRoomPersonnel` güncellenir
- `backend/src/modules/checkout/queries.js` — `getCheckoutPreview` güncellenir
- `frontend/src/modules/checkin/CheckinPage.jsx` — kayıt formu
- `frontend/src/modules/capacity/RoomCard.jsx` — personel detayı
- `frontend/src/modules/checkout/CheckoutPage.jsx` — özet paneli

---

## BÖLÜM A — Stok Tüketim Tahmini

### Task 1: getForecast() query

**Files:**
- Modify: `backend/src/modules/inventory/queries.js`

- [ ] **Step 1: Fonksiyonu queries.js sonuna ekle**

Dosyanın sonuna ekle:

```js
export function getForecast() {
  const db = getDB()
  return db.prepare(`
    SELECT
      i.id,
      i.item_name,
      i.quantity,
      i.unit,
      i.category,
      ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4) as daily_avg,
      CASE
        WHEN ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4) > 0
        THEN ROUND(i.quantity / (ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4)), 1)
        ELSE NULL
      END as days_left
    FROM inventory i
    LEFT JOIN stock_movements sm ON sm.item_id = i.id
      AND sm.created_at >= datetime('now', '-14 days')
    GROUP BY i.id
    HAVING daily_avg > 0 AND days_left <= 7
    ORDER BY days_left ASC
  `).all()
}
```

- [ ] **Step 2: Commit**

```bash
cd backend
git add src/modules/inventory/queries.js
git commit -m "feat: getForecast query — 14 günlük tüketim tahmini"
```

---

### Task 2: getForecast() service + bildirim

**Files:**
- Modify: `backend/src/modules/inventory/service.js`

- [ ] **Step 1: getForecast fonksiyonunu service.js'e ekle**

`service.js` dosyasında, `getStats()` fonksiyonundan sonra ekle:

```js
export function getForecast(userId) {
  const db = getDB()
  const items = queries.getForecast()

  // severity ekle
  const result = items.map(item => ({
    ...item,
    severity: item.days_left <= 3 ? 'critical' : 'warning',
  }))

  // 24 saatte bir bildirim gönder
  if (result.length > 0 && userId) {
    const recent = db.prepare(`
      SELECT id FROM audit_log
      WHERE action='inventory_forecast_notify'
        AND created_at >= datetime('now', '-24 hours')
      LIMIT 1
    `).get()

    if (!recent) {
      const criticals = result.filter(i => i.severity === 'critical')
      const warnings = result.filter(i => i.severity === 'warning')

      let msg = 'Stok tükenme uyarısı: '
      if (criticals.length > 0) {
        msg += `${criticals.length} ürün 3 gün içinde biter (${criticals.map(i => i.item_name).join(', ')})`
      }
      if (warnings.length > 0) {
        msg += `${criticals.length > 0 ? '; ' : ''}${warnings.length} ürün 7 gün içinde biter`
      }

      createNotification({
        message: msg,
        type: criticals.length > 0 ? 'critical' : 'warning',
        module: 'inventory',
        target_role: 'campus_manager',
      })

      db.prepare(
        "INSERT INTO audit_log(user_id, action, module, detail) VALUES(?,?,?,?)"
      ).run(userId, 'inventory_forecast_notify', 'inventory', `${result.length} urun`)
    }
  }

  return result
}
```

`service.js` dosyasının başında `getDB` importunu kontrol et — yoksa ekle:

```js
import { getDB } from '../../shared/db/index.js'
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/inventory/service.js
git commit -m "feat: getForecast service — tüketim tahmini + bildirim debounce"
```

---

### Task 3: GET /forecast route + testler

**Files:**
- Modify: `backend/src/modules/inventory/routes.js`
- Modify: `backend/src/modules/inventory/inventory.test.js`

- [ ] **Step 1: /forecast testini yaz**

`inventory.test.js` içinde en sona ekle:

```js
describe('Inventory Forecast', () => {
  it('returns empty array when no out movements', async () => {
    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // seed'de son 14 günde out hareketi olmayan item'lar dahil edilmemeli
    res.body.forEach(item => {
      expect(item.daily_avg).toBeGreaterThan(0)
      expect(item.days_left).toBeLessThanOrEqual(7)
    })
  })

  it('calculates severity correctly', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    // Yeni item oluştur, düşük stok + son 14 günde out hareketi ekle
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('Forecast Test',5,'litre','laundry',1)"
    ).run()
    const itemId = item.lastInsertRowid
    const user = db.prepare("SELECT id FROM users LIMIT 1").get()
    // 14 günde toplamda 28 litre çıkış → daily_avg = 2, days_left = 2.5
    db.prepare(
      "INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at) VALUES(?,?,?,?,?,?,datetime('now','-3 days'))"
    ).run(itemId, 'out', -28, 5, 'test', user.id)

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeTruthy()
    expect(found.severity).toBe('critical')
    expect(found.days_left).toBeLessThanOrEqual(3)
  })

  it('excludes items with no out movements', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('No Movement',100,'adet','general',0)"
    ).run()
    const itemId = item.lastInsertRowid

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeUndefined()
  })

  it('excludes items with days_left > 7', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const user = db.prepare("SELECT id FROM users LIMIT 1").get()
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('Uzun Omurlu',100,'adet','general',0)"
    ).run()
    const itemId = item.lastInsertRowid
    // 14 günde 7 çıkış → daily_avg=0.5, days_left=200 → dahil edilmemeli
    db.prepare(
      "INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at) VALUES(?,?,?,?,?,?,datetime('now','-1 days'))"
    ).run(itemId, 'out', -7, 93, 'test', user.id)

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeUndefined()
  })
})
```

- [ ] **Step 2: Testlerin fail ettiğini doğrula**

```bash
cd backend && npx vitest run src/modules/inventory/inventory.test.js
```

Beklenen: forecast testleri FAIL (route yok)

- [ ] **Step 3: /forecast route'unu routes.js'e ekle**

`routes.js` içinde `GET /stats` route'undan **sonra**, `GET /` route'undan **önce** ekle (`:id` çakışmasını önlemek için):

```js
// ── Forecast ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/forecast', ...mgrAccess, (req, res) => {
  try { res.json(service.getForecast(req.user.id)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 4: Testleri çalıştır — hepsi geçmeli**

```bash
npx vitest run src/modules/inventory/inventory.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/inventory/routes.js src/modules/inventory/inventory.test.js
git commit -m "feat: GET /inventory/forecast endpoint + testler"
```

---

### Task 4: Frontend — InventoryPage forecast KPI + badge

**Files:**
- Modify: `frontend/src/modules/inventory/InventoryPage.jsx`

- [ ] **Step 1: Forecast query ekle**

`InventoryPage.jsx` içinde mevcut queryler (stats query gibi) arasına ekle:

```js
const { data: forecast = [] } = useQuery({
  queryKey: ['inventory-forecast'],
  queryFn: () => api.get('/inventory/forecast').then(r => r.data),
  refetchInterval: 5 * 60 * 1000, // 5 dakikada bir
})
```

- [ ] **Step 2: KPI kartını ekle**

`KPIRow` bileşenindeki `kpis` array'ine yeni kart ekle. Mevcut 6 kartın sonuna:

```js
{
  label: 'TÜKENME YAKLAŞAN',
  val: forecast.length,
  color: forecast.some(i => i.severity === 'critical') ? 'var(--red)' : forecast.length > 0 ? 'var(--amber)' : 'var(--green)',
  icon: '⌛',
  gradient: forecast.some(i => i.severity === 'critical')
    ? 'linear-gradient(135deg, rgba(231,76,60,.06), rgba(231,76,60,.02))'
    : forecast.length > 0
    ? 'linear-gradient(135deg, rgba(240,165,0,.06), rgba(240,165,0,.02))'
    : 'linear-gradient(135deg, rgba(39,201,106,.06), rgba(39,201,106,.02))',
},
```

`KPIRow`'un `forecast` prop'u alması için: `KPIRow` bileşeni şu an `stats` alıyor ama forecast bağımsız bir query. `KPIRow` yerine forecast KPI'ını direkt `KPIRow` dışında ayrı küçük kart olarak ekle — stok listesinin hemen üstünde, `KPIRow` altında:

```jsx
{forecast.length > 0 && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
    background: forecast.some(i => i.severity === 'critical')
      ? 'rgba(231,76,60,.08)' : 'rgba(240,165,0,.08)',
    border: `1px solid ${forecast.some(i => i.severity === 'critical')
      ? 'rgba(231,76,60,.25)' : 'rgba(240,165,0,.25)'}`,
  }}>
    <span style={{ fontSize: '16px' }}>⌛</span>
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '3px' }}>
        TÜKENME YAKLAŞAN
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: forecast.some(i => i.severity === 'critical') ? 'var(--red)' : 'var(--amber)' }}>
        {forecast.filter(i => i.severity === 'critical').length > 0 && (
          <span style={{ marginRight: '10px' }}>
            🔴 {forecast.filter(i => i.severity === 'critical').length} ürün ≤3 gün:{' '}
            {forecast.filter(i => i.severity === 'critical').map(i => `${i.item_name} (~${i.days_left}g)`).join(', ')}
          </span>
        )}
        {forecast.filter(i => i.severity === 'warning').length > 0 && (
          <span>
            🟡 {forecast.filter(i => i.severity === 'warning').length} ürün ≤7 gün
          </span>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Item listesinde days_left badge ekle**

Stok listesinde her item render edilirken `item_name`'in yanına badge ekle. Mevcut item listesi `getAllItems`'ten geliyor, forecast ayrı. Badge için item ID'sine göre forecast'tan eşleştir:

`InventoryPage.jsx` içinde `useMemo` ile bir map oluştur:

```js
const forecastMap = useMemo(() => {
  const m = {}
  forecast.forEach(f => { m[f.id] = f })
  return m
}, [forecast])
```

Ardından stok listesinde item satırında item_name render edilen yerde (her modülde farklı ama genellikle bir `<span>` veya `<div>`), item_name'den sonra badge ekle:

```jsx
{forecastMap[item.id] && (
  <span style={{
    marginLeft: '8px',
    fontFamily: 'var(--mono)',
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    background: forecastMap[item.id].severity === 'critical'
      ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.15)',
    color: forecastMap[item.id].severity === 'critical'
      ? 'var(--red)' : 'var(--amber)',
    border: `1px solid ${forecastMap[item.id].severity === 'critical'
      ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.3)'}`,
  }}>
    ~{forecastMap[item.id].days_left}g
  </span>
)}
```

- [ ] **Step 4: Dev sunucusunu başlat, envanter sayfasını kontrol et**

```bash
cd .. && npm run dev
```

Tarayıcıda `http://localhost:5173` → Envanter sayfasına git. Out hareketi olan ürünlerde badge görünmeli.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/inventory/InventoryPage.jsx
git commit -m "feat: envanter tüketim tahmini — forecast banner + item badge"
```

---

## BÖLÜM B — Acil İletişim Kişisi

### Task 5: DB migration

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Migration satırlarını ekle**

`index.js` içinde mevcut migration try/catch bloklarının sonuna (laundry_items satırlarından önce, herhangi bir boş satırdan sonra) ekle:

```js
try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_name TEXT') } catch(_) {}
try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_phone TEXT') } catch(_) {}
```

- [ ] **Step 2: Migration'ı doğrula**

```bash
cd backend && node -e "
import('./src/shared/db/index.js').then(m => {
  m.initDB()
  const db = m.getDB()
  const cols = db.prepare('PRAGMA table_info(personnel)').all().map(c => c.name)
  console.log('emergency_name:', cols.includes('emergency_name'))
  console.log('emergency_phone:', cols.includes('emergency_phone'))
})"
```

Beklenen çıktı:
```
emergency_name: true
emergency_phone: true
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/db/index.js
git commit -m "feat: personnel tablosuna emergency_name + emergency_phone migration"
```

---

### Task 6: Backend — checkin/capacity/checkout queries güncelleme

**Files:**
- Modify: `backend/src/modules/checkin/queries.js`
- Modify: `backend/src/modules/capacity/queries.js`
- Modify: `backend/src/modules/checkout/queries.js`

- [ ] **Step 1: checkin/queries.js — insertPersonnel güncelle**

`insertPersonnel` fonksiyonunda `row` nesnesine 2 alan ekle:

```js
export function insertPersonnel(data) {
  const db = getDB()
  const row = {
    tc_no: data.tc_no ?? null,
    passport_no: data.passport_no ?? null,
    full_name: data.full_name,
    company: data.company ?? null,
    hometown: data.hometown ?? null,
    phone_number: data.phone_number ?? null,
    job_title: data.job_title ?? null,
    preferred_block: data.preferred_block ?? null,
    emergency_name: data.emergency_name ?? null,
    emergency_phone: data.emergency_phone ?? null,
  }
  const r = db.prepare(`
    INSERT INTO personnel(tc_no,passport_no,full_name,company,hometown,phone_number,job_title,preferred_block,emergency_name,emergency_phone,check_in_date)
    VALUES(@tc_no,@passport_no,@full_name,@company,@hometown,@phone_number,@job_title,@preferred_block,@emergency_name,@emergency_phone,datetime('now'))
  `).run(row)
  return r.lastInsertRowid
}
```

- [ ] **Step 2: capacity/queries.js — getRoomPersonnel güncelle**

`getRoomPersonnel` içindeki SELECT'e `p.emergency_name, p.emergency_phone` ekle:

```js
export function getRoomPersonnel(roomId) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.phone_number, p.photo_url,
      p.emergency_name, p.emergency_phone,
      ra.bed_no, ra.assigned_at,
      COALESCE(s.shift_type, 'day') as shift_type
    FROM room_assignments ra
    JOIN personnel p ON p.id=ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE ra.room_id=? AND ra.check_out_at IS NULL
    ORDER BY ra.bed_no
  `).all(roomId)
}
```

- [ ] **Step 3: checkout/queries.js — getCheckoutPreview güncelle**

`getCheckoutPreview` içindeki `person` sorgusuna `p.emergency_name, p.emergency_phone` ekle:

```js
const person = db.prepare(`
  SELECT p.*, p.emergency_name, p.emergency_phone,
    ra.room_id, r.block, r.floor, r.room_no, ra.bed_no,
    COALESCE(s.shift_type, 'day') as shift_type
  FROM personnel p
  LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
  LEFT JOIN rooms r ON r.id=ra.room_id
  LEFT JOIN shifts s ON s.personnel_id=p.id
  WHERE p.id=?
`).get(personnelId)
```

Not: `p.*` zaten tüm kolonları alır, ama `p.emergency_name, p.emergency_phone` explicit yazarak okunabilirlik sağlanır.

- [ ] **Step 4: Checkin testini çalıştır**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/checkin/queries.js src/modules/capacity/queries.js src/modules/checkout/queries.js
git commit -m "feat: emergency_name/phone — checkin insert + capacity/checkout queries"
```

---

### Task 7: Frontend — CheckinPage kayıt formu

**Files:**
- Modify: `frontend/src/modules/checkin/CheckinPage.jsx`

- [ ] **Step 1: Form state'e emergency alanları ekle**

`CheckinPage.jsx` içinde kayıt formu state'ini yöneten yerde (genellikle `form` veya `registerData` state), emergency alanlarını ekle. Kayıt formunun state'ini ara ve `emergency_name: ''`, `emergency_phone: ''` ekle.

Checkin formunun kayıt adımında (`step === 1` veya `register` adımında), mevcut `phone_number` input'undan sonra yeni bölüm ekle:

```jsx
{/* Acil İletişim — isteğe bağlı */}
<div style={{
  marginTop: '16px', padding: '12px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--surface2)',
}}>
  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '10px' }}>
    ACİL İLETİŞİM — İSTEĞE BAĞLI
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
    <div>
      <label className="form-label">Acil Kişi Adı</label>
      <input
        className="form-input"
        value={form.emergency_name || ''}
        onChange={e => setForm(f => ({ ...f, emergency_name: e.target.value }))}
        placeholder="Eş, anne/baba..."
      />
    </div>
    <div>
      <label className="form-label">Acil Kişi Telefonu</label>
      <input
        className="form-input"
        value={form.emergency_phone || ''}
        onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))}
        placeholder="05xx xxx xx xx"
      />
    </div>
  </div>
</div>
```

Not: `form` yerine kullanılan state adı farklı olabilir (`registerData`, `newPerson`, vb.). Dosyayı okuyup doğru state adını kullan. `setForm` yerine de kullanılan setter'ı kullan.

- [ ] **Step 2: Kayıt isteğine alanları dahil et**

Kayıt mutation'ında `api.post('/checkin/register', ...)` çağrısına `emergency_name` ve `emergency_phone`'u ekle. Zaten `...form` veya tam form nesnesi gönderiliyorsa otomatik dahil olur — kontrol et.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/checkin/CheckinPage.jsx
git commit -m "feat: checkin formu — acil iletişim kişisi alanları"
```

---

### Task 8: Frontend — RoomCard + CheckoutPage acil bilgi görüntüleme

**Files:**
- Modify: `frontend/src/modules/capacity/RoomCard.jsx`
- Modify: `frontend/src/modules/checkout/CheckoutPage.jsx`

- [ ] **Step 1: RoomCard — personel listesine acil bilgi ekle**

`RoomCard.jsx` içinde personel listesini render eden bölümde (`personnel.map(p => ...)`), her personel satırına acil bilgiyi ekle:

```jsx
{personnel.map(p => (
  <div key={p.id} className="text-xs text-slate-300 flex flex-col gap-0.5">
    <div className="flex items-center gap-2">
      <span className="font-mono text-slate-500">Yatak {p.bed_no}</span>
      <span>{p.full_name}</span>
      {p.company && <span className="text-slate-500">{p.company}</span>}
    </div>
    {(p.emergency_name || p.emergency_phone) && (
      <div className="font-mono text-slate-600 text-xs pl-10">
        🆘 {p.emergency_name || '—'}{p.emergency_phone ? ` · ${p.emergency_phone}` : ''}
      </div>
    )}
  </div>
))}
```

- [ ] **Step 2: CheckoutPage — özet adımında acil bilgi göster**

`CheckoutPage.jsx` içinde `step === 2` özet bölümünde, "Person info" div'inde `InfoRow` satırlarına 2 satır ekle:

```jsx
{preview.person.emergency_name && (
  <InfoRow label="ACİL KİŞİ" value={preview.person.emergency_name} />
)}
{preview.person.emergency_phone && (
  <InfoRow label="ACİL TEL" value={preview.person.emergency_phone} />
)}
```

Bu satırları mevcut `InfoRow label="VARDIYA"` satırından sonra ekle.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/capacity/RoomCard.jsx frontend/src/modules/checkout/CheckoutPage.jsx
git commit -m "feat: acil iletişim kişisi — capacity kart + checkout özet"
```

---

### Task 9: Tüm testleri çalıştır + son kontrol

- [ ] **Step 1: Tüm backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS, hata yok

- [ ] **Step 2: Dev ortamını başlat ve manuel kontrol yap**

```bash
cd .. && npm run dev
```

Kontrol listesi:
- [ ] Envanter sayfası → out hareketi olan ürünlerde badge görünüyor
- [ ] Envanter sayfası → forecast banner var (veri varsa)
- [ ] Checkin → Kayıt adımında "Acil İletişim" bölümü görünüyor
- [ ] Capacity → Oda kartı açıldığında personelde acil bilgi (kayıtlıysa) görünüyor
- [ ] Checkout → Özet adımında acil kişi bilgisi görünüyor

- [ ] **Step 3: Final commit**

```bash
cd backend && git add -A && git commit -m "chore: stok tüketim tahmini + acil iletişim kişisi — tamamlandı"
```
