# Vardiyalar UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ShiftsPage'de scroll-pozisyon bug'ı düzelt, Takas sekmesini kaldır, İzinler badge'i ekle, toolbar'ı sadeleştir (Araçlar dropdown), haftalık/günlük view toggle + DailyView, drag-and-drop vardiya ataması, görsel modernizasyon.

**Architecture:** Tüm değişiklikler 2 dosyada: `ShiftsPage.jsx` (tek büyük dosya, mevcut pattern korunur) + `index.css` (CSS keyframe fix + D&D stiller). Yeni backend endpoint yok. Yeni bağımlılık yok. `DailyView` aynı dosyada yeni bir function component olarak eklenir.

**Tech Stack:** React 18, @tanstack/react-query, CSS variables, HTML5 DataTransfer API (native D&D)

---

## File Structure

| Dosya | Ne değişiyor |
|---|---|
| `frontend/src/index.css` | Task 1: 3 keyframe fix + Task 4: drag-highlight CSS class |
| `frontend/src/modules/shifts/ShiftsPage.jsx` | Task 2–6: tüm JS/JSX değişiklikleri |

---

## Task 1: CSS Keyframe Fix (Popover Scroll Bug)

**Problem:** `@keyframes fadeUp/fadeIn/slideInRight` şu an `to` keyframe'inde `transform: translateY/X(0)` içeriyor. `animation-fill-mode: both` ile animasyon bitince bu transform kalıcı uygulanıyor. CSS spec: herhangi bir `transform` değeri o elementi `position: fixed` child'lar için "containing block" yapar. `ScheduleTab` `<div className="fade-up">` döndürdüğünden `SidePanel` viewport yerine bu div'e göre konumlanır. Kullanıcı scroll edince panel off-screen gider.

**Files:**
- Modify: `frontend/src/index.css:216-219`

- [ ] **Step 1: Üç keyframe'i güncelle**

`frontend/src/index.css` satır 216-219'u şu şekilde değiştir:

```css
/* ÖNCE (satır 216-219): */
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
@keyframes slideInRight { from{transform:translateX(100%)}to{transform:translateX(0)} }
@keyframes slideInLeft { from{transform:translateX(-100%)}to{transform:translateX(0)} }
@keyframes fadeIn { from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)} }

/* SONRA: */
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none} }
@keyframes slideInRight { from{transform:translateX(100%)}to{transform:none} }
@keyframes slideInLeft { from{transform:translateX(-100%)}to{transform:none} }
@keyframes fadeIn { from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none} }
```

- [ ] **Step 2: Görsel doğrulama**

```bash
cd frontend && npm run dev
```

Tarayıcıda `/shifts` → Çizelge sekmesi → sayfayı aşağı kaydır → alt sıradaki bir personele tıkla → SidePanel sağda görünmeli, yukarı kaymamalı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: CSS keyframe transform:none — SidePanel scroll positioning bug"
```

---

## Task 2: Nav Simplification + İzinler Badge

**Problem:** Takas sekmesi nadiren kullanılıyor, nav'ı kalabalıklaştırıyor. İzinler sekmesinde kaç tane bekleyen talep olduğu nav'da görünmüyor.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3373-3382` (NAV_ITEMS)
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3384-3403` (ShiftsPage component)
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3447-3481` (nav items render)

- [ ] **Step 1: NAV_ITEMS'tan swap'ı kaldır (satır 3373-3382)**

```js
// ÖNCE:
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
  { id: 'swap',        icon: '🔄', label: 'Takas' },
  { id: 'departments', icon: '🏢', label: 'Bölümler' },
  { id: 'settings',    icon: '⚙️', label: 'Ayarlar' },
]

// SONRA (swap satırı kaldırıldı):
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
  { id: 'departments', icon: '🏢', label: 'Bölümler' },
  { id: 'settings',    icon: '⚙️', label: 'Ayarlar' },
]
```

- [ ] **Step 2: ShiftsPage'e pending leave query ekle (satır ~3389 — mevcut department query'den sonra)**

```js
// Mevcut shiftDefs query'sinden hemen sonra ekle:
const { data: pendingLeaves = [] } = useQuery({
  queryKey: ['leaves', 'badge'],
  queryFn: () => api.get('/shifts/leave?status=pending').then(r => r.data),
  staleTime: 60000,
})
const pendingLeaveCount = pendingLeaves.length
```

- [ ] **Step 3: Nav items render'ı badge ile güncelle (satır ~3447-3481)**

Mevcut `{NAV_ITEMS.map(item => { ... })}` bloğunu bul. `item.id === 'leave'` için badge göster. Tam değişiklik — `<span style={{ fontSize: '18px'... }}>{item.icon}</span>` satırını ve label span'ını içeren bölümü şöyle güncelle:

```jsx
{NAV_ITEMS.map(item => {
  const active = activeTab === item.id
  const badge = item.id === 'leave' && pendingLeaveCount > 0 ? pendingLeaveCount : 0
  return (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      style={{
        width: '100%', padding: '12px 0',
        paddingLeft: navExpanded ? '16px' : 0,
        background: active ? 'rgba(240,165,0,.18)' : 'none',
        border: 'none',
        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
        boxShadow: active ? 'inset 0 0 0 1px rgba(240,165,0,.3)' : 'none',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        justifyContent: navExpanded ? 'flex-start' : 'center',
        gap: '10px',
        transition: 'all .15s',
        position: 'relative',
      }}
      title={item.label}
    >
      {/* İkon + collapsed badge (küçük nokta) */}
      <span style={{ fontSize: '18px', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px var(--accent))' : 'none', position: 'relative' }}>
        {item.icon}
        {badge > 0 && !navExpanded && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-4px',
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--red)', border: '1px solid var(--bg)',
          }} />
        )}
      </span>
      {navExpanded && (
        <span style={{
          fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
          color: active ? 'var(--accent)' : 'var(--text2)',
          fontWeight: active ? 700 : 400,
          whiteSpace: 'nowrap', flex: 1,
        }}>
          {item.label.toUpperCase()}
        </span>
      )}
      {/* Genişletilmiş badge (sayı) */}
      {badge > 0 && navExpanded && (
        <span style={{
          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
          background: 'var(--red)', color: '#fff',
          borderRadius: '999px', padding: '1px 5px',
          marginRight: '8px', flexShrink: 0,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
})}
```

- [ ] **Step 4: Doğrulama**

- Takas sekmesi nav'da gözükmemeli
- `/shifts/leave` ile test verisi varsa İzinler'de kırmızı badge görünmeli
- `swap` tab'ına gidilmeye çalışılınca boş content area gösterilmeli (render'da `activeTab === 'swap'` satırı hâlâ var — zarar vermez, sadece hiç tıklanamaz)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: nav — remove Takas tab, add pending leave badge on İzinler"
```

---

## Task 3: Toolbar Redesign + Araçlar Dropdown

**Problem:** Toolbar çok kalabalık — 7 buton. Yeni tasarım: hafta nav + view toggle + dept filtre + tek "Araçlar" dropdown butonu.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — ScheduleTab (satır ~1326-1340 state, ~1623-1706 toolbar JSX)

- [ ] **Step 1: ScheduleTab'a yeni state değişkenleri ekle (satır ~1326 — mevcut useState'lerin yanına)**

```js
// Mevcut state'lerin yanına ekle:
const [scheduleView, setScheduleView] = useState('weekly') // 'weekly' | 'daily'
const [dailyDate, setDailyDate] = useState(todayStr)
const [toolsOpen, setToolsOpen] = useState(false)
const [toolsRect, setToolsRect] = useState(null)
```

- [ ] **Step 2: Araçlar dropdown dışarı tıklayınca kapansın — useEffect ekle (mevcut useEffect'lerin yanına)**

```js
useEffect(() => {
  if (!toolsOpen) return
  const handler = (e) => {
    // Butonun kendisine tıklayınca zaten toggle ediyor, sadece dışarıyı yakala
    setToolsOpen(false)
    setToolsRect(null)
  }
  // setTimeout ile aynı click event'ini atla
  const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
  return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
}, [toolsOpen])
```

- [ ] **Step 3: Toolbar JSX'i yeniden yaz**

`ScheduleTab` return'ündeki `{/* ── Top control bar ── */}` div'ini (satır ~1623-1706) şu şekilde değiştir:

```jsx
{/* ── Top control bar ── */}
<div style={{
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
  marginBottom: '20px',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '12px 16px',
}}>
  {/* Hafta navigasyonu */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{
      width: '32px', height: '32px', borderRadius: '50%',
      background: 'var(--surface2)', border: '1px solid var(--border)',
      cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>‹</button>
    <div style={{ textAlign: 'center', minWidth: '160px', background: 'var(--surface2)', borderRadius: '10px', padding: '4px 16px' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: '15px', letterSpacing: '1px', color: 'var(--text)' }}>
        {formatDate(weekStart)} — {formatDate(weekEnd)}
      </div>
    </div>
    <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{
      width: '32px', height: '32px', borderRadius: '50%',
      background: 'var(--surface2)', border: '1px solid var(--border)',
      cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>›</button>
    <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{
      padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
      background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
      cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
    }}>Bugün</button>
  </div>

  {/* View toggle: HAFTALIK / GÜNLÜK */}
  <div style={{ display: 'flex', gap: '4px' }}>
    <button
      className={`filter-chip${scheduleView === 'weekly' ? ' active' : ''}`}
      onClick={() => setScheduleView('weekly')}
    >HAFTALIK</button>
    <button
      className={`filter-chip${scheduleView === 'daily' ? ' active' : ''}`}
      onClick={() => { setScheduleView('daily'); setDailyDate(todayStr()) }}
    >GÜNLÜK</button>
  </div>

  {/* Dept filter */}
  <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
    style={{ width: 'auto', minWidth: '150px' }}>
    <option value="">Tüm Bölümler</option>
    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
  </select>

  {/* Araçlar dropdown */}
  {canEdit && (
    <div style={{ marginLeft: 'auto', position: 'relative' }}>
      <button
        onClick={e => {
          if (toolsOpen) {
            setToolsOpen(false); setToolsRect(null)
          } else {
            setToolsRect(e.currentTarget.getBoundingClientRect())
            setToolsOpen(true)
          }
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
          background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
        }}
      >
        <span style={{ fontSize: '16px', letterSpacing: '-1px' }}>⋯</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>Araçlar</span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
      </button>

      {toolsOpen && toolsRect && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: toolsRect.bottom + 4,
            right: window.innerWidth - toolsRect.right,
            zIndex: 100,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,.3)',
            minWidth: '200px',
            overflow: 'hidden',
          }}
        >
          {[
            { label: 'Toplu Vardiya Doldur', action: () => { setBulkFillModal(true); setToolsOpen(false) } },
            { label: 'Tüm Personeli Doldur', action: () => { setAllFillDef(shiftDefs[0]?.id?.toString() || ''); setAllFillModal(true); setToolsOpen(false) } },
            { label: 'Haftayı Kopyala', action: () => { if (confirm('Bu haftayı sonraki haftaya kopyalayalım mı?')) { copyWeek.mutate(); setToolsOpen(false) } } },
            { label: 'Excel Import', action: () => { setExcelModal(true); setExcelPreview(null); setExcelError(''); setToolsOpen(false) } },
            { label: '+ Çizelgeye Personel Ekle', action: () => { setAddPersonModal(true); setToolsOpen(false) } },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 16px', background: 'none', border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)',
              transition: 'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{label}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )}
</div>
```

Not: `createPortal` `react-dom`'dan `ShiftsPage.jsx`'in üstünde zaten import edilmiş (satır 2).

- [ ] **Step 4: Doğrulama**

- Toolbar sade görünmeli: hafta nav + HAFTALIK/GÜNLÜK + dept filtre + Araçlar
- "Araçlar" butonuna tıklayınca dropdown açılmalı, sağda viewport kenarına yapışmalı
- Dropdown dışına tıklayınca kapanmalı
- Her dropdown öğesi doğru modal'ı açmalı
- GÜNLÜK butonuna basınca view değişmeli (içerik Task 5'te gelecek)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: schedule toolbar redesign — view toggle + Araçlar dropdown (position:fixed)"
```

---

## Task 4: D&D Vardiya Ataması + assignCell onError

**Problem:** Vardiya hücrelerine sürükle-bırak ile atama yapılamıyor. `assignCell` mutation'ında `onError` handler yok.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — `assignCell` mutation + D&D state/handlers + palette JSX + cell `onDragOver`/`onDrop`
- Modify: `frontend/src/index.css` — drag highlight CSS class

- [ ] **Step 1: `assignCell` mutation'a `onError` ekle (satır ~1401)**

```js
const assignCell = useMutation({
  mutationFn: ({ staffId, deptId, shiftDefId, date, status }) =>
    api.post('/shifts/schedule', {
      entries: [{ staff_id: staffId, dept_id: deptId, shift_def_id: shiftDefId || null, work_date: date, status: status || 'scheduled' }]
    }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) },
  onError: (err) => {
    // CLAUDE.md: console.* commit öncesi temizlenir — burada kasıtlı yok
    const msg = err?.response?.data?.error || 'Vardiya atanamadı'
    alert(msg)
  },
})
```

- [ ] **Step 2: D&D drag state ekle (ScheduleTab state'lerine, satır ~1326)**

```js
const [dragShiftId, setDragShiftId] = useState(null)    // drag'deki shiftDefId
const [dragOverCell, setDragOverCell] = useState(null)  // 'staffId-date' format
```

- [ ] **Step 3: Shift palette'i toolbar'dan sonra ekle (sadece HAFTALIK modda ve canEdit ise)**

Toolbar div'inin hemen ardına (`{/* ── Schedule grid ── */}` comment'inden önce) ekle:

```jsx
{/* ── Shift palette (D&D) ── */}
{scheduleView === 'weekly' && canEdit && !('ontouchstart' in window) && (
  <div style={{
    display: 'flex', gap: '8px', marginBottom: '12px',
    padding: '8px 12px', background: 'var(--surface2)',
    borderRadius: '8px', border: '1px solid var(--border)',
    alignItems: 'center',
  }}>
    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginRight: '4px' }}>
      SÜRÜKLE:
    </span>
    {shiftDefs.map(s => {
      const sc = shiftColor(s.color_class)
      return (
        <div
          key={s.id}
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('shiftDefId', String(s.id))
            setDragShiftId(s.id)
          }}
          onDragEnd={() => setDragShiftId(null)}
          style={{
            padding: '5px 12px', borderRadius: '6px',
            background: sc.bg, color: sc.text,
            fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
            cursor: 'grab', userSelect: 'none',
            border: `1px solid ${sc.text}33`,
          }}
        >
          {s.name} {s.start_hour}–{s.end_hour === 24 ? '00' : s.end_hour}
        </div>
      )
    })}
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('shiftDefId', 'delete'); setDragShiftId('delete') }}
      onDragEnd={() => setDragShiftId(null)}
      style={{
        padding: '5px 12px', borderRadius: '6px',
        background: 'rgba(231,76,60,.12)', color: 'var(--red)',
        fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
        cursor: 'grab', userSelect: 'none',
        border: '1px solid rgba(231,76,60,.3)',
      }}
    >
      ✕ Sil
    </div>
  </div>
)}
```

- [ ] **Step 4: Schedule cell'lerine D&D event handler'ları ekle**

`ScheduleTab` grid'indeki hücre `<td>` elementini bul (satır ~1828). `<td>` elementin `onDragOver` ve `onDrop` prop'larını ekle:

```jsx
<td key={d}
  onDragOver={e => {
    if (!canEdit || !dragShiftId || 'ontouchstart' in window) return
    if (assignCell.isPending) return
    e.preventDefault()
    setDragOverCell(`${person.id}-${d}`)
  }}
  onDragLeave={() => setDragOverCell(null)}
  onDrop={e => {
    e.preventDefault()
    setDragOverCell(null)
    if (!canEdit || assignCell.isPending) return
    const rawId = e.dataTransfer.getData('shiftDefId')
    setDragShiftId(null)
    if (rawId === 'delete') {
      deleteShift.mutate({ staffId: person.id, date: d })
    } else {
      const shiftDefId = parseInt(rawId)
      assignCell.mutate({ staffId: person.id, deptId: person.dept_id, shiftDefId, date: d, status: 'scheduled' })
    }
  }}
  style={{
    padding: '6px 4px', textAlign: 'center',
    borderRight: i < 6 ? '1px solid var(--border)' : 'none',
    background: dragOverCell === `${person.id}-${d}`
      ? 'rgba(240,165,0,.15)'
      : isToday ? 'rgba(59,140,240,.04)' : sun ? 'rgba(240,165,0,.03)' : 'transparent',
    transition: 'background .1s',
    outline: dragOverCell === `${person.id}-${d}` ? '2px dashed rgba(240,165,0,.6)' : 'none',
  }}
>
```

- [ ] **Step 5: Doğrulama**

- Palette çubuğu görünmeli (sadece HAFTALIK modda, sadece canEdit kullanıcı için)
- Bir vardiya pilini sürüklüyüp hücreye bırakınca hücre highlight olmalı
- Drop sonrası hücre güncellenmiş vardiya ile render edilmeli
- "✕ Sil" pilini bırakınca shift silinmeli
- `assignCell.isPending` iken hücre drop kabul etmemeli
- Mobile'da palette görünmemeli (`'ontouchstart' in window` → true)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx frontend/src/index.css
git commit -m "feat: D&D shift assignment via HTML5 drag API + assignCell onError handler"
```

---

## Task 5: DailyView Bileşeni

**Problem:** Departman bazlı günlük görünüm yok. Yöneticiler belirli bir gün tüm bölümlerin doluluk durumunu hızlıca görmek istiyor.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — yeni `DailyView` function component + ScheduleTab entegrasyonu

- [ ] **Step 1: `DailyView` function component'ini yaz (ShiftsPage'deki diğer component'lerin yanına, ScheduleTab'dan önce)**

`function ScheduleTab` tanımından hemen önce (satır ~1326) şunu ekle:

```jsx
// ─── Daily View ───────────────────────────────────────────────────────────────
function DailyView({ departments, date, onDateChange }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['personnel-daily', date],
    queryFn: () => api.get(`/shifts/personnel?date=${date}`).then(r => r.data),
    staleTime: 30000,
  })

  // Group by department, then by shift/status
  const deptGroups = useMemo(() => {
    const map = new Map()
    rows.forEach(row => {
      const deptName = row.dept_name || 'Departmansız'
      const deptColor = row.dept_color || 'gray'
      if (!map.has(deptName)) {
        map.set(deptName, { deptName, deptColor, shifts: new Map(), leave: [], absent: [] })
      }
      const g = map.get(deptName)
      if (row.leave_status === 'approved') {
        g.leave.push(row)
      } else if (row.shift_status === 'on_leave') {
        g.leave.push(row)
      } else if (row.shift_status === 'scheduled' || row.shift_status === 'overtime') {
        const shiftKey = row.shift_name || 'Bilinmiyor'
        if (!g.shifts.has(shiftKey)) {
          g.shifts.set(shiftKey, { name: shiftKey, start: row.start_hour, end: row.end_hour, color: row.shift_color, staff: [] })
        }
        g.shifts.get(shiftKey).staff.push(row)
      } else {
        g.absent.push(row)
      }
    })
    return Array.from(map.values())
  }, [rows])

  // shiftColor2: DailyView'a özel. Mevcut modül-level shiftColor() farklı dönüş formatı kullanıyor
  // (background/text/border ayrı), burada basit {bg, text} tuple yeterli.
  const shiftColor2 = (cls) => {
    const map = { 'shift-blue': { bg: 'rgba(52,152,219,.18)', text: '#3498db' }, 'shift-teal': { bg: 'rgba(26,188,156,.18)', text: '#1abc9c' }, 'shift-amber': { bg: 'rgba(240,165,0,.18)', text: '#f0a500' }, 'shift-red': { bg: 'rgba(231,76,60,.18)', text: '#e74c3c' }, 'shift-purple': { bg: 'rgba(155,89,182,.18)', text: '#9b59b6' } }
    return map[cls] || { bg: 'var(--surface2)', text: 'var(--text2)' }
  }

  const deptColorMap = { 'dept-blue': 'var(--blue)', 'dept-teal': 'var(--teal)', 'dept-amber': 'var(--accent)', 'dept-red': 'var(--red)', 'dept-purple': '#9b59b6', 'dept-green': 'var(--green)' }

  return (
    <div>
      {/* Tarih seçici */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => onDateChange(addDays(date, -1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>
        <div style={{
          fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text)',
          background: 'var(--surface2)', borderRadius: '10px', padding: '6px 20px',
        }}>
          {new Date(date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => onDateChange(addDays(date, 1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
        {date !== todayStr() && (
          <button onClick={() => onDateChange(todayStr())} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
            cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        )}
      </div>

      {isLoading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>YÜKLENİYOR...</div>}

      {/* Dept cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {deptGroups.map(g => {
          const totalStaff = Array.from(g.shifts.values()).reduce((s, sh) => s + sh.staff.length, 0) + g.leave.length + g.absent.length
          const accentColor = deptColorMap[g.deptColor] || 'var(--accent)'
          return (
            <div key={g.deptName} style={{
              borderRadius: '14px', border: '1px solid var(--border)',
              background: 'var(--surface)', overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                borderLeft: `4px solid ${accentColor}`,
                background: 'var(--surface2)',
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px', color: 'var(--text)', flex: 1 }}>
                  {g.deptName.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  {totalStaff} kişi
                </div>
              </div>

              {/* Shift groups */}
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from(g.shifts.values()).map(sh => {
                  const sc = shiftColor2(sh.color)
                  const pct = totalStaff > 0 ? (sh.staff.length / totalStaff) * 100 : 0
                  return (
                    <div key={sh.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px',
                          background: sc.bg, color: sc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                        }}>{sh.name}</span>
                        {sh.start != null && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                            {sh.start}:00–{sh.end === 24 ? '00' : sh.end}:00
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', fontWeight: 600, marginLeft: 'auto' }}>
                          {sh.staff.length} kişi
                        </span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: sc.text, borderRadius: '3px', transition: 'width .3s' }} />
                      </div>
                    </div>
                  )
                })}

                {g.leave.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(26,188,156,.12)', color: 'var(--teal)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>İZİNDE</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      {g.leave.map(s => s.full_name).join(' · ')}
                    </span>
                  </div>
                )}

                {g.absent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--surface3)', color: 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>YOKTA</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', opacity: 0.7 }}>
                      {g.absent.map(s => s.full_name).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ScheduleTab'da DailyView'i entegre et**

`ScheduleTab` return'ünde, palette strip'inden sonra ve `{isLoading ? ...}` schedule grid'inden önce şu şartlı render'ı ekle:

```jsx
{/* View: GÜNLÜK */}
{scheduleView === 'daily' && (
  <DailyView
    departments={departments}
    date={dailyDate}
    onDateChange={setDailyDate}
  />
)}

{/* View: HAFTALIK */}
{scheduleView === 'weekly' && (
  // ... mevcut isLoading ? ... : ... schedule grid kodu
)}
```

Yani mevcut `{isLoading ? ... : (...table...)}` bloğunu `{scheduleView === 'weekly' && (...)}` içine al.

- [ ] **Step 3: Doğrulama**

- "GÜNLÜK" butonuna basınca `DailyView` görünmeli
- Bugün için tüm departmanlar kart olarak listelenmeli
- ← / → ile gün değişince yeni veri yüklenmeli
- "HAFTALIK" butonuna dönünce normal grid görünmeli

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: DailyView component — daily dept-based schedule view"
```

---

## Task 6: Görsel Modernizasyon

**Problem:** Çizelge hücreleri biraz sıkışık, vardiya chip'leri eski tarz. Küçük görsel güncellemeler.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — schedule grid hücre stilleri (satır ~1828-1862)

- [ ] **Step 1: Hücre min-height güncelle ve boş hücre hover iyileştir**

Schedule grid'indeki `<button>` (cell button, satır ~1833) stilini bul ve `minHeight` değerini güncelle:

```jsx
// ÖNCE:
minHeight: pillLabel ? '54px' : '48px',

// SONRA:
minHeight: pillLabel ? '58px' : '54px',
```

Boş hücre button'ının `border` stilini güncelle:

```jsx
// ÖNCE:
border: pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,

// SONRA:
border: pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,
// onMouseEnter/Leave handler'larını güncelle:
onMouseEnter={e => {
  if (canEdit) {
    e.currentTarget.style.filter = 'brightness(1.15)'
    if (!pillLabel) e.currentTarget.style.borderStyle = 'solid'
  }
}}
onMouseLeave={e => {
  e.currentTarget.style.filter = 'none'
  if (!pillLabel) e.currentTarget.style.borderStyle = 'dashed'
}}
```

- [ ] **Step 2: Vardiya chip stil güncelle**

Grid cell'deki vardiya etiket span'larını (satır ~1848-1857) güncelle:

```jsx
// ÖNCE — pillLabel span:
<span style={{ fontFamily: 'var(--display)', fontSize: '11px', letterSpacing: '1px', color: pillColor, fontWeight: 700 }}>

// SONRA:
<span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px', color: pillColor, fontWeight: 700 }}>
```

- [ ] **Step 3: Doğrulama**

- Grid hücreleri biraz daha yüksek görünmeli
- Boş hücre hover'da border solid olmalı
- Vardiya etiketi mono font + biraz daha küçük

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "style: schedule grid visual polish — cell height, chip font, hover border"
```

---

## Final Verification

- [ ] **Tüm testleri çalıştır**

```bash
cd backend && npx vitest run
```

Backend testleri geçmeli (frontend değişikliği olmadığından backend testleri etkilenmez).

- [ ] **Manuel smoke test**

1. `npm run dev` ile uygulamayı başlat
2. `/shifts` → SidePanel scroll testi: sayfayı aşağı kaydır, bir hücreye tıkla → panel doğru pozisyonda mı?
3. Nav'da Takas görünmüyor mu?
4. İzinler'de pending talep varsa badge görünüyor mu?
5. Araçlar dropdown açılıp kapanıyor mu?
6. HAFTALIK/GÜNLÜK toggle çalışıyor mu?
7. D&D: palette'den bir vardiyayı hücreye sürükle → güncelleniyor mu?
8. Günlük view'da departman kartları çıkıyor mu?

- [ ] **Final commit (eğer küçük fix'ler yapıldıysa)**

```bash
git add -p
git commit -m "fix: post-implementation tweaks"
```
