# Dalga A: Çamaşırhane Hızlı Kazanımlar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 özellik: (1) SLA öncesi uyarı banner, (2) makine tamamlanma bildirimi odaları içersin + MM:SS zamanlayıcı, (3) kanban ready kolonunda blok bazlı toplu seçim.

**Architecture:** Backend'de `laundry_sla_config`'e tek sütun eklenir, `sla.js`'de 2 fonksiyon güncellenir, cron 2 ayrı schedule'a bölünür. Frontend'de `SlaAlert`, `MachineStrip`, `KanbanCol` ve `LaundryHub` güncellenir — yeni dosya yok.

**Tech Stack:** React 18, @tanstack/react-query, Express.js, SQLite (better-sqlite3), Vitest, node-cron

---

## File Map

| Dosya | Eylem | Ne Değişir |
|-------|-------|-----------|
| `backend/src/shared/db/index.js` | Modify | `pre_warning_hours` sütun migration |
| `backend/src/modules/laundry/queries.js` | Modify | `getSlaPreWarningsQuery()` ekle |
| `backend/src/modules/laundry/service.js` | Modify | `getSlaPreWarningsService` export |
| `backend/src/modules/laundry/routes.js` | Modify | `GET /sla/pre-warnings` route |
| `backend/src/modules/laundry/sla.js` | Modify | `checkSlaPreWarnings()` + `checkMachineTimers()` güncelle |
| `backend/src/shared/cron/index.js` | Modify | `*/1` makine cron + `*/15`'e pre-warning ekle |
| `backend/src/modules/laundry/laundry.test.js` | Modify | 4 yeni test |
| `frontend/src/modules/laundry/api.js` | Modify | `getSlaPreWarnings` ekle |
| `frontend/src/modules/laundry/components/SlaAlert.jsx` | Modify | `preWarnings` prop + amber banner |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Modify | pre-warnings fetch + KanbanCol props + `selectBlock` |
| `frontend/src/modules/laundry/components/MachineStrip.jsx` | Modify | `secondsLeft` hesabı + MM:SS format |

---

## Task 1: Backend — `pre_warning_hours` migration + `getSlaPreWarningsQuery`

**Files:**
- Modify: `backend/src/shared/db/index.js` (~satır 383)
- Modify: `backend/src/modules/laundry/queries.js` (~satır 456, `getSlaViolationsQuery`'nin hemen ardı)
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Mevcut testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: tüm testler PASS

- [ ] **Step 2: Başarısız test yaz**

`laundry.test.js` içinde `describe('SLA engine', ...)` bloğunu bul (satır ~476). Bloğun içine en sona ekle:

```js
it('getSlaPreWarningsQuery — SLA yaklaşan öğeyi döner', async () => {
  const { getSlaPreWarningsQuery } = await import('./queries.js')
  const { insertItemQuery } = await import('./queries.js')
  const db = getDB()
  // dirty için warning_hours=24, pre_warning_hours=2 (default)
  // 23 saat önce oluşturulmuş item → 24-23=1 saat kaldı → pre_warning penceresinde
  const id = insertItemQuery({ room_id: roomId, item_count: 1 })
  db.prepare("UPDATE laundry_items SET updated_at=datetime('now','-23 hours') WHERE id=?").run(id)
  const result = getSlaPreWarningsQuery()
  expect(result.some(v => v.id === id)).toBe(true)
  // Henüz gerçek ihlal değil
  const { getSlaViolationsQuery } = await import('./queries.js')
  const violations = getSlaViolationsQuery()
  expect(violations.some(v => v.id === id)).toBe(false)
})
```

- [ ] **Step 3: Testi çalıştır — başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | grep -E "FAIL|getSlaPreWarnings"
```

Expected: FAIL — `getSlaPreWarningsQuery is not a function`

- [ ] **Step 4: DB migration ekle**

`backend/src/shared/db/index.js` içinde, satır 383 civarındaki `ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify` satırının hemen ardına ekle:

```js
  try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN pre_warning_hours INTEGER DEFAULT 2`) } catch(_) {}
```

- [ ] **Step 5: `getSlaPreWarningsQuery` fonksiyonunu ekle**

`backend/src/modules/laundry/queries.js` içinde `getSlaViolationsQuery` fonksiyonunun kapanış parantezinden (`}`'den) hemen sonra ekle:

```js
export function getSlaPreWarningsQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
      sc.warning_hours, sc.pre_warning_hours,
      ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours_in_status
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND sc.pre_warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) < sc.warning_hours
      AND (sc.warning_hours - ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)) <= sc.pre_warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}
```

- [ ] **Step 6: `service.js`'e export ekle**

`backend/src/modules/laundry/service.js` içinde `getSlaViolationsService` export satırını bul ve hemen altına ekle:

```js
export const getSlaPreWarningsService = q.getSlaPreWarningsQuery
```

- [ ] **Step 7: Route ekle**

`backend/src/modules/laundry/routes.js` içinde `GET /sla/violations` route'unun hemen ardına ekle:

```js
laundryRouter.get('/sla/pre-warnings', ...laundryRead, (req, res) => {
  res.json(svc.getSlaPreWarningsService())
})
```

- [ ] **Step 8: Testi çalıştır — geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: tüm testler PASS

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/shared/db/index.js backend/src/modules/laundry/queries.js backend/src/modules/laundry/service.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: SLA pre-warning query + route — pre_warning_hours sütunu"
```

---

## Task 2: Backend — `checkSlaPreWarnings()` cron fonksiyonu

**Files:**
- Modify: `backend/src/modules/laundry/sla.js`
- Modify: `backend/src/shared/cron/index.js`

- [ ] **Step 1: `checkSlaPreWarnings()` fonksiyonunu `sla.js`'e ekle**

`backend/src/modules/laundry/sla.js` içinde `checkSlaViolations` fonksiyonunun `return violations.length` satırından hemen sonra (yani `}` kapandıktan sonra) ekle:

```js
/**
 * SLA ihlali yaklaşan öğeleri kontrol eder (pre_warning_hours içinde).
 * Her 15 dakikada cron ile çalışır.
 */
export function checkSlaPreWarnings() {
  const db = getDB()
  const approaching = db.prepare(`
    SELECT li.id, li.status, li.item_count,
           r.block, r.room_no,
           sc.warning_hours, sc.pre_warning_hours,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 2) as hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND sc.pre_warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 2) < sc.warning_hours
      AND (sc.warning_hours - ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 2)) <= sc.pre_warning_hours
  `).all()

  for (const v of approaching) {
    const stage = 'pre_warning_' + v.status
    if (!shouldSendSlaNotification(db, v.id, stage)) continue
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status] || v.status
    const hoursLeft = Math.round((v.warning_hours - v.hours) * 10) / 10
    createNotification({
      message: `⚠️ SLA YAKLAŞIYOR: ${v.block || '?'}·${v.room_no || '?'} — ${label}, ${hoursLeft}s kaldı`,
      type: 'warning',
      module: 'laundry',
      target_role: 'laundry',
    })
    // Aynı gün tekrar gönderme — laundry_sla_notifications tablosuna kaydet
    db.prepare(`INSERT OR IGNORE INTO laundry_sla_notifications(item_id, stage, phone) VALUES(?,?,NULL)`)
      .run(v.id, stage)
  }

  return approaching.length
}
```

- [ ] **Step 2: Cron'u güncelle**

`backend/src/shared/cron/index.js` içindeki `*/15` cron bloğunu bul:

```js
  cron.schedule('*/15 * * * *', () => {
    try {
      checkSlaViolations()
      checkMachineTimers()
    } catch (e) { console.error('[Cron] Laundry SLA hatası:', e.message) }
  })
```

Replace ile:

```js
  // Her 1 dakikada makine zamanlayıcı kontrolü
  cron.schedule('*/1 * * * *', () => {
    try {
      checkMachineTimers()
    } catch (e) { console.error('[Cron] Makine timer hatası:', e.message) }
  })

  // Her 15 dakikada SLA kontrolü
  cron.schedule('*/15 * * * *', () => {
    try {
      checkSlaViolations()
      checkSlaPreWarnings()
      checkMachineMaintenanceAlerts()
    } catch (e) { console.error('[Cron] Laundry SLA hatası:', e.message) }
  })
```

- [ ] **Step 3: `checkSlaPreWarnings` ve `checkMachineMaintenanceAlerts` import'larını güncelle**

`cron/index.js` dosyasının 5. satırındaki import satırını bul:

```js
import { checkSlaViolations, checkMachineTimers } from '../../modules/laundry/sla.js'
```

Replace:

```js
import { checkSlaViolations, checkMachineTimers, checkSlaPreWarnings, checkMachineMaintenanceAlerts } from '../../modules/laundry/sla.js'
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run
```

Expected: tüm testler PASS (regression yok)

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/modules/laundry/sla.js backend/src/shared/cron/index.js
git commit -m "feat: SLA pre-warning cron + makine timer 1 dk schedule"
```

---

## Task 3: Backend — `checkMachineTimers()` oda bilgisi + `total_runs`

**Files:**
- Modify: `backend/src/modules/laundry/sla.js` (satır 46–66)
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`laundry.test.js` içinde `describe('SLA engine', ...)` bloğuna, Task 1'de eklediğin testin ardına ekle:

```js
it('checkMachineTimers — tamamlanan makinenin mesajı oda bilgisi içerir', async () => {
  const { checkMachineTimers } = await import('./sla.js')
  const db = getDB()

  // Bir makine oluştur ve timer'ı geçmiş yap
  const machineId = db.prepare(
    "INSERT INTO laundry_machines(name,type,capacity_kg) VALUES('Test W','washer',10)"
  ).run().lastInsertRowid

  // Bu makineye bağlı washing item oluştur
  const itemId = db.prepare(
    'INSERT INTO laundry_items(room_id,item_count,status,machine_id,created_by) VALUES(?,1,?,?,?)'
  ).run(roomId, 'washing', machineId, userId).lastInsertRowid

  db.prepare(
    "UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?"
  ).run(machineId)

  checkMachineTimers()

  // Bildirim mesajının oda bilgisi içerip içermediğini kontrol et
  const notif = db.prepare(
    "SELECT * FROM notifications WHERE module='laundry' ORDER BY id DESC LIMIT 1"
  ).get()
  expect(notif.message).toContain('Test W')
  expect(notif.message).toMatch(/[A-Z0-9]+·[0-9]+/) // "BLOK·ODA_NO" formatı

  // Temizlik
  db.prepare('DELETE FROM laundry_items WHERE id=?').run(itemId)
  db.prepare('DELETE FROM laundry_machines WHERE id=?').run(machineId)
})

it('checkMachineTimers — total_runs artar', async () => {
  const { checkMachineTimers } = await import('./sla.js')
  const db = getDB()

  const machineId = db.prepare(
    "INSERT INTO laundry_machines(name,type,capacity_kg,total_runs) VALUES('Test W2','washer',10,5)"
  ).run().lastInsertRowid

  db.prepare(
    "UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?"
  ).run(machineId)

  checkMachineTimers()

  const m = db.prepare('SELECT * FROM laundry_machines WHERE id=?').get(machineId)
  expect(m.total_runs).toBe(6)

  // Temizlik
  db.prepare('DELETE FROM laundry_machines WHERE id=?').run(machineId)
})
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | grep -E "FAIL|oda bilgisi|total_runs"
```

Expected: 2 test FAIL

- [ ] **Step 3: `checkMachineTimers()` fonksiyonunu güncelle**

`backend/src/modules/laundry/sla.js` içindeki `checkMachineTimers` fonksiyonunu (satır 46–66) tamamen replace et:

```js
/**
 * Süresi dolan makineleri 'done' olarak işaretler ve bildirim gönderir.
 * Her 1 dakikada cron ile çalışır.
 */
export function checkMachineTimers() {
  const db = getDB()
  const done = db.prepare(`
    SELECT lm.*,
      GROUP_CONCAT(r.block || '·' || r.room_no, ', ') as rooms
    FROM laundry_machines lm
    LEFT JOIN laundry_items li ON li.machine_id = lm.id AND li.status = 'washing'
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE lm.status = 'running'
      AND lm.timer_end IS NOT NULL
      AND datetime('now') >= datetime(lm.timer_end)
    GROUP BY lm.id
  `).all()

  for (const m of done) {
    db.prepare("UPDATE laundry_machines SET status = 'done', total_runs = total_runs + 1 WHERE id = ?").run(m.id)
    const roomInfo = m.rooms ? ` — ${m.rooms}` : ''
    createNotification({
      message: `${m.name} tamamlandı${roomInfo}`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  return done.length
}
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: tüm testler PASS

- [ ] **Step 5: Full test suite**

```bash
cd backend && npx vitest run
```

Expected: tüm testler PASS

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/modules/laundry/sla.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: checkMachineTimers — oda bilgisi + total_runs artışı"
```

---

## Task 4: Frontend — SlaAlert pre-warning banner + API

**Files:**
- Modify: `frontend/src/modules/laundry/api.js` (~satır 37)
- Modify: `frontend/src/modules/laundry/components/SlaAlert.jsx`
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx` (~satır 1196)

- [ ] **Step 1: `api.js`'e `getSlaPreWarnings` ekle**

`frontend/src/modules/laundry/api.js` içinde `getSlaViolations` satırının hemen ardına ekle:

```js
  getSlaPreWarnings: () => api.get('/laundry/sla/pre-warnings').then(r => r.data),
```

- [ ] **Step 2: `SlaAlert.jsx`'i güncelle**

`frontend/src/modules/laundry/components/SlaAlert.jsx` dosyasının tüm içeriğini replace et:

```jsx
import { useState } from 'react'

export default function SlaAlert({ violations = [], preWarnings = [] }) {
  const [expanded, setExpanded] = useState(false)
  const [preExpanded, setPreExpanded] = useState(false)

  const critical = violations.filter(v => v.sla_level === 'critical')
  const warnings  = violations.filter(v => v.sla_level !== 'critical')
  const isCrit    = critical.length > 0
  const color     = isCrit ? 'var(--red)' : 'var(--accent)'
  const bg        = isCrit ? 'rgba(231,76,60,0.07)' : 'rgba(240,165,0,0.07)'
  const border    = isCrit ? 'rgba(231,76,60,0.2)' : 'rgba(240,165,0,0.2)'

  return (
    <>
      {/* Pre-warning banner — SLA yaklaşıyor */}
      {preWarnings.length > 0 && (
        <div style={{
          background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.2)',
          borderRadius: 10, marginBottom: 8, overflow: 'hidden',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setPreExpanded(e => !e)}
          >
            <span style={{ fontSize: 9, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#fb923c', flex: 1 }}>
              {preWarnings.length} kayıt SLA'ya yaklaşıyor
            </span>
            {!preExpanded && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(251,146,60,0.7)' }}>
                {preWarnings.slice(0,2).map(v => `${v.block||'?'}·${v.room_no||'?'}`).join('  ')}
                {preWarnings.length > 2 && ` +${preWarnings.length-2}`}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: '#fb923c',
              transition: 'transform 0.2s', transform: preExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block',
            }}>▾</span>
          </div>
          {preExpanded && (
            <div style={{ borderTop: '1px solid rgba(251,146,60,0.2)' }}>
              {preWarnings.map((v, i) => {
                const hoursLeft = v.warning_hours != null
                  ? Math.round((v.warning_hours - v.hours_in_status) * 10) / 10
                  : '?'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px',
                    borderBottom: i < preWarnings.length - 1 ? '1px solid rgba(251,146,60,0.15)' : 'none',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: '0 0 80px' }}>
                      {v.block||'?'} · {v.room_no||'?'}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)' }}>
                      {v.item_count} parça · {v.status}
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1, color: '#fb923c' }}>
                      {hoursLeft}s kaldı
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Mevcut violations banner */}
      {violations.length > 0 && (
        <div style={{
          background: bg, border: `1px solid ${border}`, borderRadius: 10,
          marginBottom: 14, overflow: 'hidden',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setExpanded(e => !e)}
          >
            <span className="live-dot" style={{ background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color }}>
                {isCrit && `${critical.length} KRİTİK`}
                {isCrit && warnings.length > 0 && ' · '}
                {warnings.length > 0 && `${warnings.length} UYARI`}
                {' '}— SLA İHLALİ
              </span>
              {!expanded && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: `${color}aa`, marginLeft: 10 }}>
                  {violations.slice(0,2).map(v => `${v.block||'?'}·${v.room_no||'?'}`).join('  ')}
                  {violations.length > 2 && ` +${violations.length-2}`}
                </span>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color,
              transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block',
            }}>▾</span>
          </div>
          {expanded && (
            <div style={{ borderTop: `1px solid ${border}` }}>
              {violations.map((v, i) => {
                const vc = v.sla_level === 'critical' ? 'var(--red)' : 'var(--accent)'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                    borderBottom: i < violations.length - 1 ? `1px solid ${border}` : 'none',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: vc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: '0 0 80px' }}>
                      {v.block||'?'} · {v.room_no||'?'}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)' }}>
                      {v.item_count} parça · {v.status}
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 1, color: vc }}>
                      {v.hours_in_status}s
                    </span>
                    <span className={`badge ${v.sla_level === 'critical' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 8 }}>
                      {v.sla_level === 'critical' ? 'KRİTİK' : 'UYARI'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: LaundryHub'da pre-warnings fetch et ve SlaAlert'e geç**

`frontend/src/modules/laundry/LaundryHub.jsx` içinde `violations` useQuery'sini bul (satır ~1196):

```js
    queryFn: laundryApi.getSlaViolations,
```

Bu useQuery bloğunun hemen ardına (aynı component içinde) ekle:

```js
  const { data: preWarnings = [] } = useQuery({
    queryKey: ['laundry-sla-pre-warnings'],
    queryFn: laundryApi.getSlaPreWarnings,
    refetchInterval: 60_000,
  })
```

- [ ] **Step 4: `SlaAlert`'e `preWarnings` prop'unu geç**

`LaundryHub.jsx` içinde `<SlaAlert violations={violations} />` satırını bul (satır ~1380) ve replace et:

```jsx
<SlaAlert violations={violations} preWarnings={preWarnings} />
```

- [ ] **Step 5: Tarayıcıda doğrula**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude" && npm run dev
```

Çamaşırhane hub'a git. SLA'ya yaklaşan bir test öğesi yoksa manuel test için: DB'de `dirty` statüsündeki bir öğenin `updated_at`'ını 23 saat öncesine çek → sayfayı yenile → amber "⚠️ X kayıt SLA'ya yaklaşıyor" banner görünüyor mu?

Sunucuyu durdur.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/api.js frontend/src/modules/laundry/components/SlaAlert.jsx frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: SLA pre-warning banner — SlaAlert amber bölümü"
```

---

## Task 5: Frontend — KanbanCol Blok Bazlı Seçim (batchMode)

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx` (KanbanCol ~satır 536, Hub ~satır 1262, KanbanCol çağrısı ~satır 1569)

- [ ] **Step 1: `selectBlock` fonksiyonunu ekle**

`LaundryHub.jsx` içindeki `toggleSelect` fonksiyonunu bul (satır ~1262):

```js
  const toggleSelect = (id) => {
```

Hemen ardına (aynı component içinde) ekle:

```js
  const selectBlock = (blockItems) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = blockItems.every(item => prev.has(item.id))
      if (allSelected) blockItems.forEach(item => next.delete(item.id))
      else blockItems.forEach(item => next.add(item.id))
      return next
    })
  }
```

- [ ] **Step 2: `KanbanCol` prop imzasını genişlet**

`LaundryHub.jsx` içinde satır ~536'daki `KanbanCol` fonksiyonunu bul:

```js
function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom }) {
```

Replace:

```js
function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock }) {
```

- [ ] **Step 3: `renderItems()` fonksiyonuna blok-gruplu batch mode ekle**

`KanbanCol` içindeki `renderItems` fonksiyonunu bul. `if (!groupByRoom)` bloğunun hemen ÖNCESİNE ekle:

```js
    // batchMode + ready kolonu → blok bazlı grupla + "Tümünü Seç" butonları
    if (batchMode && colStatus === 'ready') {
      const blocks = {}
      for (const item of items) {
        const key = item.block || 'Bilinmiyor'
        if (!blocks[key]) blocks[key] = []
        blocks[key].push(item)
      }
      return Object.entries(blocks).sort(([a], [b]) => a.localeCompare(b)).map(([block, blockItems]) => {
        const allSelected = blockItems.length > 0 && blockItems.every(item => selectedIds.has(item.id))
        return (
          <div key={block} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4,
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                color: 'var(--green)', letterSpacing: 1.5, flex: 1,
              }}>
                {block} <span style={{ color: 'var(--text4)' }}>({blockItems.length})</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectBlock(blockItems)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 8, fontFamily: 'var(--mono)',
                  background: allSelected ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                  border: `1px solid ${allSelected ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                  color: allSelected ? 'var(--green)' : 'var(--text3)', cursor: 'pointer',
                }}
              >
                {allSelected ? '✓ Seçildi' : 'Tümünü Seç'}
              </button>
            </div>
            {blockItems.map(item => (
              <div
                key={item.id}
                style={{
                  marginBottom: 8, position: 'relative',
                  outline: selectedIds.has(item.id) ? '2px solid var(--green)' : 'none',
                  borderRadius: 8,
                }}
              >
                <DraggableKanbanCard item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
                  onPersonClick={onPersonClick} onFound={onFound} />
                <div
                  onClick={() => onSelect(item.id)}
                  style={{
                    position: 'absolute', inset: 0, cursor: 'pointer', borderRadius: 8,
                    background: selectedIds.has(item.id) ? 'rgba(16,185,129,0.05)' : 'transparent',
                  }}
                />
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onSelect(item.id)}
                  style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>
        )
      })
    }
```

- [ ] **Step 4: Ready KanbanCol çağrısına yeni prop'ları geç**

`LaundryHub.jsx` içinde satır ~1569'daki `KanbanCol title="RAFTA HAZIR"` satırını bul:

```jsx
            <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   colStatus="ready"   isOver={overCol === 'ready'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} />
```

Replace:

```jsx
            <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   colStatus="ready"   isOver={overCol === 'ready'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} batchMode={batchMode} selectedIds={selectedIds} onSelect={toggleSelect} onSelectBlock={selectBlock} />
```

- [ ] **Step 5: Tarayıcıda doğrula**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude" && npm run dev
```

1. Çamaşırhane → kanban görünümünü aç
2. "Toplu" butonuna bas → batchMode aktif
3. RAFTA HAZIR kolonu bloklar bazında gruplanmış görünüyor mu? (A Bloğu, B Bloğu vb. header'lar)
4. "Tümünü Seç" butonuna bas → o bloğun tüm kartları seçiliyor mu? (yeşil outline + checkbox ✓)
5. Tekrar bas → seçim kalkıyor mu?
6. "Teslim" butonuna bas → seçilen kayıtlar teslim ediliyor mu?

Sunucuyu durdur.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: kanban ready kolonu blok bazlı toplu seçim (batchMode)"
```

---

## Task 6: Frontend — MachineStrip MM:SS (saniye hassasiyeti)

**Files:**
- Modify: `frontend/src/modules/laundry/components/MachineStrip.jsx` (satır 61–113)

Şu an `minutesLeft` tam dakika olarak hesaplanıyor (`Math.round(.../ 60000)`). RingTimer `HH:MM` gösteriyor ama sadece dakika güncelleniyor. Bu task `secondsLeft` hesabına geçer ve `MM:SS` gösterir.

- [ ] **Step 1: `RingTimer` props'larını değiştir**

`MachineStrip.jsx` içinde `function RingTimer({ minutesLeft, totalMinutes, color })` satırını bul (satır ~61):

```js
function RingTimer({ minutesLeft, totalMinutes, color }) {
  const pct = totalMinutes > 0 ? Math.max(0, minutesLeft / totalMinutes) : 0
  const offset = C * (1 - pct)
  const h = String(Math.floor(minutesLeft / 60)).padStart(2, '0')
  const m = String(minutesLeft % 60).padStart(2, '0')
```

Replace:

```js
function RingTimer({ secondsLeft, totalSeconds, color }) {
  const pct = totalSeconds > 0 ? Math.max(0, secondsLeft / totalSeconds) : 0
  const offset = C * (1 - pct)
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
```

- [ ] **Step 2: RingTimer içindeki display'i güncelle**

Aynı fonksiyonda `{h}:{m}` ve `minutesLeft >= 60` satırlarını bul:

```jsx
        <span style={{
          fontFamily: 'var(--display)', fontSize: minutesLeft >= 60 ? 13 : 16,
          letterSpacing: 1, color, lineHeight: 1,
        }}>
          {h}:{m}
        </span>
```

Replace:

```jsx
        <span style={{
          fontFamily: 'var(--display)', fontSize: secondsLeft >= 3600 ? 13 : 16,
          letterSpacing: 1, color, lineHeight: 1,
        }}>
          {mm}:{ss}
        </span>
```

- [ ] **Step 3: `MachineCard`'da `secondsLeft` ve `totalSeconds` hesabına geç**

`MachineCard` fonksiyonunda `minutesLeft` ve `totalMinutes` satırlarını bul (satır ~107–113):

```js
  const minutesLeft = m.timer_end
    ? Math.max(0, Math.round((new Date(m.timer_end) - now) / 60000))
    : null

  const totalMinutes = m.timer_started_at && m.timer_end
    ? Math.round((new Date(m.timer_end) - new Date(m.timer_started_at)) / 60000)
    : 60
```

Replace:

```js
  const secondsLeft = m.timer_end
    ? Math.max(0, Math.floor((new Date(m.timer_end) - now) / 1000))
    : null

  const totalSeconds = m.timer_started_at && m.timer_end
    ? Math.round((new Date(m.timer_end) - new Date(m.timer_started_at)) / 1000)
    : 3600
```

- [ ] **Step 4: `RingTimer` çağrısını güncelle**

`MachineCard` içindeki `<RingTimer` çağrısını bul. `minutesLeft` ve `totalMinutes` prop isimlerini değiştir:

```jsx
          <RingTimer minutesLeft={minutesLeft} totalMinutes={totalMinutes} color={timerColor} />
```

Replace:

```jsx
          <RingTimer secondsLeft={secondsLeft} totalSeconds={totalSeconds} color={timerColor} />
```

- [ ] **Step 5: `secondsLeft` null check'lerini güncelle**

`MachineCard` içinde `minutesLeft`'e referans veren satırları bul. Bunlar genellikle `{minutesLeft} dk` gibi fallback gösterimleri veya koşul kontrollerinde olur. Arama yap:

```bash
grep -n "minutesLeft\|totalMinutes" frontend/src/modules/laundry/components/MachineStrip.jsx
```

Kalan tüm `minutesLeft` referanslarını `secondsLeft` ile, `totalMinutes` referanslarını `totalSeconds` ile replace et. `null` check'ler (`secondsLeft === null`) aynı kalır.

- [ ] **Step 6: Tarayıcıda doğrula**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude" && npm run dev
```

1. Çamaşırhane → makine strip görünüyor mu?
2. Bir makine seç → 45 dk timer başlat
3. SVG ring ve `MM:SS` formatında geri sayım görünüyor mu? (örn. `45:00 → 44:59 → 44:58`)
4. Her saniye güncelliyor mu?
5. Console'da hata yok mu?

Sunucuyu durdur.

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/MachineStrip.jsx
git commit -m "feat: MachineStrip MM:SS saniye hassasiyetli zamanlayıcı"
```
