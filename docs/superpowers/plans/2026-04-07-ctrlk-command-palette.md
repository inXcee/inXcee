# Global Ctrl+K Komut Paleti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm authenticated sayfalarda Ctrl+K ile açılan komut paleti — sayfa navigasyonu, hızlı eylem komutları ve isim/oda araması.

**Architecture:** `useCommandPalette` hook (kısayol + state) + `CommandPalette.jsx` (UI) ayrımı. Layout.jsx'e mount edilir. Navigasyon/eylemler statik frontend listesi, kişi araması debounced backend call. Eylemler custom event `yys:open-modal` ile modül modallarını tetikler (navigate + 50ms delay).

**Tech Stack:** React 18, @tanstack/react-query, react-router-dom, Express.js, SQLite (better-sqlite3), Vitest

---

## File Map

| Durum | Dosya | Değişiklik |
|-------|-------|-----------|
| Create | `frontend/src/shared/hooks/useCommandPalette.js` | COMMANDS listesi + Ctrl+K listener + state |
| Create | `frontend/src/shared/components/CommandPalette.jsx` | Tüm UI |
| Modify | `frontend/src/shared/components/Layout.jsx` | `<CommandPalette />` mount |
| Modify | `frontend/src/modules/laundry/LaundryHub.jsx` | `yys:open-modal` listener |
| Modify | `frontend/src/modules/maintenance/MaintenancePage.jsx` | `yys:open-modal` listener |
| Modify | `backend/src/modules/checkin/queries.js` | `searchResidents` fonksiyonu |
| Modify | `backend/src/modules/checkin/service.js` | export satırı |
| Modify | `backend/src/modules/checkin/routes.js` | `GET /checkin/search` route |
| Modify | `backend/src/modules/checkin/checkin.test.js` | 1 yeni test |

---

## Task 1: Backend — `GET /checkin/search` endpoint

**Files:**
- Modify: `backend/src/modules/checkin/queries.js`
- Modify: `backend/src/modules/checkin/service.js`
- Modify: `backend/src/modules/checkin/routes.js`
- Test: `backend/src/modules/checkin/checkin.test.js`

- [ ] **Step 1: Mevcut testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Expected: tüm testler PASS

- [ ] **Step 2: Başarısız test yaz**

`backend/src/modules/checkin/checkin.test.js` dosyasında `describe('Check-in', ...)` bloğunun sonuna (son `it` bloğundan sonra) ekle:

```js
it('GET /checkin/search?q= — isim veya oda ile arama', async () => {
  const res = await request(app)
    .get('/api/checkin/search?q=Mehmet')
    .set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  expect(Array.isArray(res.body)).toBe(true)
  // Seed'deki Mehmet Demir kaydı (önceki testte oluşturulmuştu)
  // Sonuç boş bile olsa array dönmeli
})

it('GET /checkin/search — 1 karakterde boş array döner', async () => {
  const res = await request(app)
    .get('/api/checkin/search?q=A')
    .set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  expect(res.body).toEqual([])
})
```

- [ ] **Step 3: Testi çalıştır — başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js 2>&1 | grep -E "FAIL|search"
```

Expected: FAIL — 404 veya "route not found"

- [ ] **Step 4: `searchResidents` fonksiyonunu `queries.js`'e ekle**

`backend/src/modules/checkin/queries.js` dosyasında `searchByName` fonksiyonunun kapanış `}`'inden hemen sonra ekle:

```js
export function searchResidents(q) {
  const db = getDB()
  const term = `%${q}%`
  return db.prepare(`
    SELECT p.id, p.full_name, p.job_title, p.company,
      r.block, r.room_no, ra.bed_no,
      p.check_out_date
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    WHERE p.check_out_date IS NULL
      AND (p.full_name LIKE ? OR r.room_no LIKE ?)
    ORDER BY p.full_name
    LIMIT 10
  `).all(term, term)
}
```

- [ ] **Step 5: `service.js`'e export ekle**

`backend/src/modules/checkin/service.js` dosyasında mevcut export satırlarının sonuna ekle:

```js
export const searchResidentsService = q.searchResidents
```

- [ ] **Step 6: Route'u ekle**

`backend/src/modules/checkin/routes.js` dosyasında `checkinRouter.post('/search-name', ...)` satırının hemen ardına ekle:

```js
checkinRouter.get('/search', ...allowed, (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json([])
  res.json(svc.searchResidentsService(q.trim()))
})
```

- [ ] **Step 7: Testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Expected: tüm testler PASS

- [ ] **Step 8: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/modules/checkin/queries.js backend/src/modules/checkin/service.js backend/src/modules/checkin/routes.js backend/src/modules/checkin/checkin.test.js
git commit -m "feat: GET /checkin/search — kişi/oda araması endpoint"
```

---

## Task 2: Frontend — `useCommandPalette` hook

**Files:**
- Create: `frontend/src/shared/hooks/useCommandPalette.js`

- [ ] **Step 1: Dosyayı oluştur**

`frontend/src/shared/hooks/useCommandPalette.js`:

```js
import { useState, useEffect, useCallback } from 'react'

export const COMMANDS = [
  // ── Navigasyon ──────────────────────────────────────────────────
  { id: 'nav-dashboard',    type: 'nav',    label: 'Dashboard',             icon: '▣', path: '/' },
  { id: 'nav-checkin',      type: 'nav',    label: 'Check-in',              icon: '↗', path: '/checkin' },
  { id: 'nav-capacity',     type: 'nav',    label: 'Kapasiteler',           icon: '⊞', path: '/capacity' },
  { id: 'nav-checkout',     type: 'nav',    label: 'Check-out',             icon: '↙', path: '/checkout' },
  { id: 'nav-housekeeping', type: 'nav',    label: 'Housekeeping',          icon: '◈', path: '/housekeeping' },
  { id: 'nav-maintenance',  type: 'nav',    label: 'Teknik Servis',         icon: '⚙', path: '/maintenance' },
  { id: 'nav-discipline',   type: 'nav',    label: 'Disiplin',              icon: '⚠', path: '/discipline' },
  { id: 'nav-shifts',       type: 'nav',    label: 'Vardiyalar',            icon: '⬗', path: '/shifts' },
  { id: 'nav-laundry',      type: 'nav',    label: 'Çamaşırhane',           icon: '♨', path: '/laundry' },
  { id: 'nav-inventory',    type: 'nav',    label: 'Envanter',              icon: '▨', path: '/inventory' },
  { id: 'nav-reports',      type: 'nav',    label: 'PDF Raporlar',          icon: '↓', path: '/reports' },
  { id: 'nav-room-history', type: 'nav',    label: 'Oda Geçmişi',           icon: '⬖', path: '/room-history' },
  { id: 'nav-whatsapp',     type: 'nav',    label: 'WhatsApp',              icon: '☎', path: '/whatsapp' },

  // ── Hızlı Eylemler ──────────────────────────────────────────────
  { id: 'act-new-laundry',  type: 'action', label: 'Yeni Çamaşır Kaydı',   icon: '＋', path: '/laundry',      action: 'open-new-laundry' },
  { id: 'act-new-checkin',  type: 'action', label: 'Yeni Check-in',         icon: '＋', path: '/checkin',      action: 'open-checkin' },
  { id: 'act-new-checkout', type: 'action', label: 'Yeni Check-out',        icon: '＋', path: '/checkout',     action: 'open-checkout' },
  { id: 'act-new-maint',    type: 'action', label: 'Yeni Teknik Talep',     icon: '＋', path: '/maintenance',  action: 'open-maintenance' },
  { id: 'act-new-house',    type: 'action', label: 'Yeni Temizlik Talebi',  icon: '＋', path: '/housekeeping', action: 'open-housekeeping' },
]

/** Basit fuzzy match: query'nin her kelimesi label'da geçiyor mu */
export function matchCommand(cmd, query) {
  const q = query.toLowerCase()
  const label = cmd.label.toLowerCase()
  return q.split(' ').every(word => label.includes(word))
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  return { open, setOpen, close, query, setQuery }
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/shared/hooks/useCommandPalette.js
git commit -m "feat: useCommandPalette — Ctrl+K hook + COMMANDS listesi"
```

---

## Task 3: Frontend — `CommandPalette.jsx` bileşeni

**Files:**
- Create: `frontend/src/shared/components/CommandPalette.jsx`

Bu bileşen şunları içerir:
- Input alanı (autofocus)
- Statik komut sonuçları (COMMANDS, fuzzy match)
- Backend kişi araması (debounced, 200ms, min 2 karakter)
- Klavye navigasyonu (↑↓ Enter)
- Kişi detay paneli

- [ ] **Step 1: Bileşeni oluştur**

`frontend/src/shared/components/CommandPalette.jsx`:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client.js'
import { COMMANDS, matchCommand } from '../hooks/useCommandPalette.js'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function CommandPalette({ open, close, query, setQuery }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedPerson, setSelectedPerson] = useState(null)

  const debouncedQuery = useDebounce(query, 200)

  // Backend kişi araması
  const { data: persons = [] } = useQuery({
    queryKey: ['cmd-search', debouncedQuery],
    queryFn: () => api.get('/checkin/search', { params: { q: debouncedQuery } }).then(r => r.data),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  })

  // Statik komut fuzzy match
  const matchedCommands = query.length >= 1
    ? COMMANDS.filter(c => matchCommand(c, query))
    : COMMANDS.slice(0, 8) // boş query: ilk 8 komut

  // Gruplandırılmış sonuçlar (düz liste, idx hesabı için)
  const navItems    = matchedCommands.filter(c => c.type === 'nav')
  const actionItems = matchedCommands.filter(c => c.type === 'action')

  const allItems = [
    ...navItems.map(c => ({ ...c, _group: 'nav' })),
    ...actionItems.map(c => ({ ...c, _group: 'action' })),
    ...persons.map(p => ({ ...p, type: 'person', _group: 'person',
      id: `person-${p.id}`, label: p.full_name })),
  ]

  // Palette açılınca input'a focus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setActiveIdx(0)
      setSelectedPerson(null)
    }
  }, [open])

  // query değişince activeIdx sıfırla
  useEffect(() => {
    setActiveIdx(0)
    setSelectedPerson(null)
  }, [query])

  const executeItem = useCallback((item) => {
    if (item.type === 'nav') {
      navigate(item.path)
      close()
    } else if (item.type === 'action') {
      navigate(item.path)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('yys:open-modal', { detail: { action: item.action } }))
      }, 50)
      close()
    } else if (item.type === 'person') {
      setSelectedPerson(item)
    }
  }, [navigate, close])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allItems[activeIdx]) executeItem(allItems[activeIdx])
    }
  }

  // Active item'ı scroll içinde görünür yap
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  const sectionLabel = {
    fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
    letterSpacing: 2, color: 'var(--text3)', padding: '8px 14px 4px',
    textTransform: 'uppercase',
  }

  const renderItem = (item, idx) => {
    const active = idx === activeIdx
    return (
      <div
        key={item.id}
        data-idx={idx}
        onClick={() => executeItem(item)}
        onMouseEnter={() => setActiveIdx(idx)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', cursor: 'pointer',
          background: active ? 'rgba(240,165,0,0.08)' : 'transparent',
          borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
          transition: 'background 0.1s',
        }}
      >
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 13, color: active ? 'var(--accent)' : 'var(--text3)',
          width: 18, textAlign: 'center', flexShrink: 0,
        }}>
          {item.icon || (item.type === 'person' ? '◎' : '▸')}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', flex: 1 }}>
          {item.label || item.full_name}
        </span>
        {item.type === 'person' && item.block && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
            {item.block}·{item.room_no}
          </span>
        )}
        {item.type === 'action' && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)',
            padding: '1px 5px', borderRadius: 3,
            background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
          }}>
            EYLEM
          </span>
        )}
      </div>
    )
  }

  let globalIdx = 0

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 8999,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Palette */}
      <div style={{
        position: 'fixed', top: '18%', left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, 92vw)',
        zIndex: 9000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ara veya komut gir..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)',
            }}
          />
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
            padding: '2px 6px', borderRadius: 4,
            border: '1px solid var(--border)',
          }}>
            ESC
          </span>
        </div>

        {/* Sonuç listesi */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto' }}>
          {allItems.length === 0 && (
            <div style={{
              padding: '24px', textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)',
            }}>
              Sonuç bulunamadı
            </div>
          )}

          {/* Navigasyon grubu */}
          {navItems.length > 0 && (
            <>
              <div style={sectionLabel}>Sayfalar</div>
              {navItems.map(item => renderItem({ ...item, _group: 'nav' }, globalIdx++))}
            </>
          )}

          {/* Eylemler grubu */}
          {actionItems.length > 0 && (
            <>
              <div style={sectionLabel}>Hızlı Eylemler</div>
              {actionItems.map(item => renderItem({ ...item, _group: 'action' }, globalIdx++))}
            </>
          )}

          {/* Kişiler grubu */}
          {persons.length > 0 && (
            <>
              <div style={sectionLabel}>Kişiler</div>
              {persons.map(p => renderItem(
                { ...p, type: 'person', _group: 'person', id: `person-${p.id}`, icon: '◎' },
                globalIdx++
              ))}
            </>
          )}
        </div>

        {/* Kişi detay paneli */}
        {selectedPerson && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px',
            background: 'var(--surface2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {selectedPerson.full_name}
                </div>
                {selectedPerson.block && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>
                    {selectedPerson.block} Blok · Oda {selectedPerson.room_no}
                    {selectedPerson.bed_no ? ` · Yatak ${selectedPerson.bed_no}` : ''}
                  </div>
                )}
                {selectedPerson.job_title && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {selectedPerson.job_title}
                    {selectedPerson.company ? ` · ${selectedPerson.company}` : ''}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 16, lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>
        )}

        {/* Footer kısayol ipuçları */}
        <div style={{
          display: 'flex', gap: 16, padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          {[['↑↓', 'Seç'], ['↵', 'Uygula'], ['Esc', 'Kapat']].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)',
              }}>{key}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{label}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/shared/components/CommandPalette.jsx
git commit -m "feat: CommandPalette.jsx — UI, klavye navigasyonu, kişi araması"
```

---

## Task 4: Frontend — Layout.jsx entegrasyonu

**Files:**
- Modify: `frontend/src/shared/components/Layout.jsx`

- [ ] **Step 1: Import'ları ekle**

`frontend/src/shared/components/Layout.jsx` dosyasında mevcut import'ların sonuna ekle:

```js
import CommandPalette from './CommandPalette.jsx'
import { useCommandPalette } from '../hooks/useCommandPalette.js'
```

- [ ] **Step 2: Hook'u kullan ve bileşeni mount et**

`Layout.jsx` içindeki `export default function Layout()` fonksiyonunu güncelle:

```jsx
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'YYS'
  const { open, close, query, setQuery } = useCommandPalette()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <CommandPalette open={open} close={close} query={query} setQuery={setQuery} />

      {/* Mobile header */}
      <div className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>&#9776;</button>
        <span style={{
          fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {pageTitle}
        </span>
        <NotificationBell />
      </div>

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content" style={{
        flex: 1,
        marginLeft: 'var(--sidebar)',
        padding: '32px 40px',
        minHeight: '100vh',
        overflowY: 'auto',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/shared/components/Layout.jsx
git commit -m "feat: Layout — CommandPalette mount edildi"
```

---

## Task 5: Frontend — Modül event listener'ları

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`
- Modify: `frontend/src/modules/maintenance/MaintenancePage.jsx`

CheckinPage ve CheckoutPage için navigasyon yeterli (sayfa = form). HousekeepingPage'de "yeni talep" butonu yok, navigasyon yeterli.

### LaundryHub

- [ ] **Step 1: `yys:open-modal` listener ekle**

`LaundryHub.jsx` dosyasında `showNew` state tanımının bulunduğu satırı (`const [showNew, setShowNew] = useState(false)`) bul. Bu satırın altına, mevcut useEffect'lerin yanına yeni bir useEffect ekle. En uygun yer: LaundryHub component fonksiyon gövdesinin başındaki state tanımlarından sonra, ilk query'den önce:

```js
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-new-laundry') setShowNew(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])
```

- [ ] **Step 2: Commit (sadece LaundryHub)**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: LaundryHub — yys:open-modal listener (open-new-laundry)"
```

### MaintenancePage

- [ ] **Step 3: `yys:open-modal` listener ekle**

`MaintenancePage.jsx` dosyasında `showForm` state tanımını bul (`const [showForm, setShowForm] = useState(false)` — satır ~975). Bu state'in bulunduğu component içine useEffect ekle. State tanımının hemen altına:

```js
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-maintenance') setShowForm(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])
```

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/maintenance/MaintenancePage.jsx
git commit -m "feat: MaintenancePage — yys:open-modal listener (open-maintenance)"
```

---

## Task 6: Backend testlerini doğrula + son kontrol

- [ ] **Step 1: Tüm backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Expected: tüm testler PASS (231+ test)

- [ ] **Step 2: Manuel doğrulama**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude" && npm run dev
```

Şunları doğrula:
1. `Ctrl+K` → palette açılıyor mu?
2. `Esc` → kapanıyor mu?
3. Boş query → ilk 8 komut görünüyor mu?
4. "Caması" yazınca → "Çamaşırhane" komutu filtreleniyor mu?
5. `↑↓` ile seçim → active highlight kayıyor mu?
6. `Enter` → navigasyon çalışıyor mu?
7. Bir isim yaz (2+ karakter) → backend arama sonuçları "KİŞİLER" grubu altında görünüyor mu?
8. Kişiye tıkla → detay paneli açılıyor mu?
9. "Yeni Çamaşır Kaydı" → `/laundry` sayfasına gidiyor + NewItemModal açılıyor mu?
10. "Yeni Teknik Talep" → `/maintenance` sayfasına gidiyor + form açılıyor mu?

Sunucuyu durdur.
