# Staff Detail Panel Premium Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yoklama sekmesini ShiftsPage'den kaldır ve StaffDetailPanel'i premium bottom sheet'e dönüştür — departman renk bandı, büyük avatar, stat grid, 5 sekme, inline aksiyon formları.

**Architecture:** Tek dosya değişikliği: `ShiftsPage.jsx`. Mevcut `SidePanel` bileşeni korunur, yeni `BottomSheet` bileşeni eklenir. Backend değişmez — `/shifts/staff/:id/detail` endpoint'i zaten gerekli veriyi döndürüyor.

**Tech Stack:** React 18, @tanstack/react-query, inline CSS styles, CSS variables (`var(--*)`)

**Spec:** `docs/superpowers/specs/2026-03-24-staff-detail-panel-design.md`

---

## Dosya Haritası

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | Tek değişen dosya — 6 task |

---

## Task 1: AttendanceTab'ı ve Nav Girdisini Kaldır

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:2366-2530` (AttendanceTab sil)
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3183-3195` (NAV_ITEMS)
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3210-3213` (handlePersonClick)
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:3321-3335` (render, selectedStaff)

- [ ] **Step 1: `AttendanceTab` fonksiyonunu sil (satır 2366–2530)**

  `function AttendanceTab(...)` başından `}` kapanışına kadar tüm bloğu sil.

- [ ] **Step 2: `NAV_ITEMS`'tan attendance girdisini kaldır**

  ```js
  // ÖNCE (satır ~3186):
  { id: 'attendance',  icon: '✅', label: 'Yoklama' },
  // → bu satırı tamamen sil
  ```

- [ ] **Step 3: `handlePersonClick`'i sadeleştir ve `selectedStaff` state'ini düz id'ye çevir**

  ```js
  // ÖNCE:
  const [selectedStaff, setSelectedStaff] = useState(null)
  const handlePersonClick = useCallback((id, rect) => {
    setSelectedStaff({ id, rect: rect || null })
  }, [])

  // SONRA:
  const [selectedStaff, setSelectedStaff] = useState(null)
  const handlePersonClick = useCallback((id) => {
    setSelectedStaff(id)
  }, [])
  ```

- [ ] **Step 4: Tüm `onPersonClick` call site'larını güncelle — `getBoundingClientRect()` argümanını kaldır**

  Dosyada şu satırlarda `onPersonClick(x.id, e.currentTarget.getBoundingClientRect())` geçiyor — hepsini `onPersonClick(x.id)` yap:
  ```
  satır ~289   StaffTab
  satır ~789   ScheduleTab
  satır ~801   ScheduleTab
  satır ~1421  ScheduleTab
  satır ~2018  LeaveTab
  satır ~2251  OvertimeTab
  satır ~3067  PuantajTab
  ```
  Her biri için `getBoundingClientRect()` argümanını kaldır, yalnızca `id` bırak.

- [ ] **Step 5: Render'dan attendance satırını ve StaffDetailPanel çağrısını güncelle**

  ```jsx
  // Sil:
  {activeTab === 'attendance'  && <AttendanceTab departments={departments} onPersonClick={handlePersonClick} />}

  // Güncelle (anchorRect kaldır):
  // ÖNCE:
  {selectedStaff && (
    <StaffDetailPanel staffId={selectedStaff.id} anchorRect={selectedStaff.rect} onClose={() => setSelectedStaff(null)} />
  )}
  // SONRA:
  {selectedStaff && (
    <StaffDetailPanel staffId={selectedStaff} onClose={() => setSelectedStaff(null)} />
  )}
  ```

- [ ] **Step 5: Dosyayı kaydet, backend testlerini çalıştır**

  ```bash
  cd backend && npx vitest run src/modules/shifts/shifts.test.js
  ```
  Beklenen: 25 test geçer.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: yoklama sekmesini kaldır, handlePersonClick sadeleştir"
  ```

---

## Task 2: BottomSheet Bileşeni Ekle

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — `SidePanel` fonksiyonundan hemen sonrasına ekle (~satır 142)

- [ ] **Step 1: `BottomSheet` bileşenini `SidePanel`'den hemen sonra ekle**

  ```jsx
  // ─── Bottom Sheet ─────────────────────────────────────────────────────────────
  function BottomSheet({ onClose, children }) {
    const [visible, setVisible] = useState(false)

    // Body scroll lock
    useEffect(() => {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }, [])

    // Animate in
    useEffect(() => {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }, [])

    // NOT: Esc listener BURAYA eklenmez — StaffDetailPanel kendi yönetir
    // (çift listener → activeForm açıkken sheet de kapanır, spec ihlali)

    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 54,
            background: 'rgba(0,0,0,0.6)',
            animation: 'fadeIn .2s ease',
          }}
        />
        {/* Sheet */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55,
          height: '82vh', maxHeight: '82vh',
          background: 'var(--bg)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: visible ? '0.28s cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}>
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>
          {children}
        </div>
      </>
    )
  }
  ```

- [ ] **Step 2: Tarayıcıda test — herhangi bir personele tıkla**

  `npm run dev` çalışıyorsa sayfayı aç, bir personele tıkla.
  Beklenen: eski SidePanel hâlâ açılıyor (henüz StaffDetailPanel değişmedi — sonraki task).

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: BottomSheet bileşeni ekle"
  ```

---

## Task 3: StaffDetailPanel — Header Bölümü

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx:322-584` — tam yeniden yaz

- [ ] **Step 1: Eski `StaffDetailPanel`'i tamamen sil (satır 322–584)**

  `function StaffDetailPanel(...)` başından `}` kapanışına kadar her şeyi sil.

- [ ] **Step 2: Yeni `StaffDetailPanel`'i yaz — sadece header + stat grid (sekmeler sonraki task'ta)**

  ```jsx
  function StaffDetailPanel({ staffId, onClose }) {
    const qc = useQueryClient()
    const [activeForm, setActiveForm] = useState(null) // 'edit'|'shift'|'leave'|'overtime'|null
    const [detailTab, setDetailTab] = useState('overview')
    const [shiftPage, setShiftPage] = useState(30)

    const { data, isLoading } = useQuery({
      queryKey: ['staff-detail', staffId],
      queryFn: () => api.get(`/shifts/staff/${staffId}/detail`).then(r => r.data),
      enabled: !!staffId,
      staleTime: 60000,
    })

    // Esc: önce formu kapat, yoksa sheet'i
    useEffect(() => {
      const h = e => {
        if (e.key === 'Escape') {
          if (activeForm) setActiveForm(null)
          else onClose()
        }
      }
      document.addEventListener('keydown', h)
      return () => document.removeEventListener('keydown', h)
    }, [activeForm, onClose])

    const person = data?.person
    const stats = data?.stats || { totalShifts: 0, workedShifts: 0, totalOvertime: 0, totalLeave: 0, absentCount: 0 }
    const shiftHistory = data?.shiftHistory || []
    const leaveHistory = data?.leaveHistory || []
    const overtimeRecords = data?.overtimeRecords || []

    // dept hesabı person yüklenince yapılır — fallback ile güvenli
    const dept = deptColor(person?.dept_color)
    const deptBg = person ? dept.bg : 'var(--border)'  // yükleme sırasında nötr renk
    const attendRate = stats.totalShifts > 0 ? Math.round((stats.workedShifts / stats.totalShifts) * 100) : 0

    const STAT_ITEMS = [
      { label: 'VARDİYA', value: stats.totalShifts,    color: 'var(--blue)' },
      { label: 'ÇALIŞTI', value: stats.workedShifts,   color: 'var(--green)', showBar: true },
      { label: 'MESAİ',   value: `${stats.totalOvertime}s`, color: 'var(--accent)' },
      { label: 'İZİN',    value: `${stats.totalLeave}g`, color: 'var(--purple)' },
      { label: 'YOK',     value: stats.absentCount,    color: 'var(--red)' },
    ]

    return (
      <BottomSheet onClose={onClose}>
        {/* Dept color band — .bg kullan (spec), deptBg yükleme sırasında nötr */}
        <div style={{ height: 4, background: deptBg, flexShrink: 0, marginTop: -2 }} />

        {/* Header */}
        <div style={{ padding: '14px 24px 0', background: 'var(--surface)', flexShrink: 0 }}>
          {isLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Yükleniyor...</div>
          ) : !person ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Veri bulunamadı</div>
          ) : (
            <>
              {/* Avatar + identity + actions */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                {/* Left: avatar + identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 200 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: person.gender === 'female' ? 'rgba(244,114,182,0.15)' : 'rgba(59,130,246,0.15)',
                    border: `2px solid ${dept.text}`,
                    color: person.gender === 'female' ? '#f472b6' : 'var(--blue)',
                    fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700,
                  }}>
                    {person.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '1px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {person.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                      {person.position || 'Pozisyon yok'} · #{person.id}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                      {person.dept_name && <span className="badge badge-blue" style={{ fontSize: 8, padding: '1px 6px' }}>{person.dept_name}</span>}
                      {person.blood_type && <span className="badge badge-red" style={{ fontSize: 8, padding: '1px 6px' }}>{person.blood_type}</span>}
                      <span className={`badge ${person.is_active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 8, padding: '1px 6px' }}>
                        {person.is_active ? 'AKTİF' : 'PASİF'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: action buttons */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {[
                    { key: 'edit',     label: '✎ Düzenle', cls: 'btn-ghost' },
                    { key: 'shift',    label: '+ Vardiya',  cls: 'btn-ghost' },
                    { key: 'leave',    label: '+ İzin',     cls: 'btn-ghost' },
                    { key: 'overtime', label: '+ Mesai',    cls: 'btn-ghost' },
                  ].map(a => (
                    <button key={a.key} onClick={() => setActiveForm(a.key)}
                      className={`btn ${a.cls} btn-xs`}
                      style={{ borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.5px' }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stat grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 14 }}>
                {STAT_ITEMS.map(s => (
                  <div key={s.label} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 4px', textAlign: 'center',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px', marginTop: 3 }}>{s.label}</div>
                    {s.showBar && stats.totalShifts > 0 && (
                      <div style={{ margin: '5px 6px 0', height: 3, borderRadius: 2, background: 'var(--border)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--green)', width: `${attendRate}%`, transition: 'width .4s ease' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tab bar — sekmeler ve içerik sonraki task'ta eklenir */}
        <div style={{ flex: 1 }} />
      </BottomSheet>
    )
  }
  ```

- [ ] **Step 3: Tarayıcıda doğrula**

  Personele tıkla → bottom sheet aşağıdan kayarak açılmalı, header görünmeli, stat grid görünmeli. Esc ile kapanmalı, backdrop tıklamasıyla kapanmalı.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: StaffDetailPanel premium header ve BottomSheet entegrasyonu"
  ```

---

## Task 4: Sekme Çubuğu + ÖZET ve BİLGİ Sekmeleri

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — Task 3'te yazdığın `StaffDetailPanel` içinde `{/* Tab bar */}` placeholder'ını gerçek içerikle değiştir

- [ ] **Step 1: `StaffDetailPanel` içindeki `{/* Tab bar */}` placeholder'ını tam implementasyonla değiştir**

  ```jsx
  {/* ── Tab bar ── */}
  {!isLoading && person && (
    <>
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        marginTop: 14, background: 'var(--surface)',
      }}>
        {[
          { id: 'overview', icon: '◈', label: 'ÖZET' },
          { id: 'info',     icon: '👤', label: 'BİLGİ' },
          { id: 'shifts',   icon: '📅', label: 'VARDİYA' },
          { id: 'leave',    icon: '🏖️', label: 'İZİN' },
          { id: 'overtime', icon: '⏰', label: 'MESAİ' },
        ].map(t => (
          <button key={t.id} onClick={() => setDetailTab(t.id)} style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: detailTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: detailTab === t.id ? 'var(--accent)' : 'var(--text3)',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
            transition: 'color .15s',
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', position: 'relative' }}>

        {/* ActionForm overlay — sonraki task'ta dolacak, şimdilik null */}
        {activeForm && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'var(--bg)', padding: '20px 24px',
            animation: 'fadeIn .15s ease',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
              FORM: {activeForm} — sonraki task'ta implemente edilecek
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveForm(null)}>İptal</button>
          </div>
        )}

        {/* ÖZET — Activity Timeline */}
        {detailTab === 'overview' && (() => {
          const events = [
            ...shiftHistory.map(s => ({
              date: s.work_date,
              type: 'shift',
              color: 'var(--blue)',
              icon: '📅',
              label: s.shift_name ? `${s.shift_name} · ${s.start_hour}:00–${s.end_hour === 24 ? '00' : s.end_hour}:00` : 'Vardiya',
              sub: s.status === 'worked' ? 'Çalıştı' : s.status === 'absent' ? 'Gelmedi' : s.status === 'on_leave' ? 'İzinli' : 'Planlandı',
            })),
            ...leaveHistory.map(l => ({
              date: l.start_date,
              type: 'leave',
              color: 'var(--purple)',
              icon: '🏖️',
              label: `${LEAVE_TYPES[l.leave_type]?.label || l.leave_type} · ${l.total_days} gün`,
              sub: STATUS_MAP[l.status]?.label || l.status,
            })),
            ...overtimeRecords.map(o => ({
              date: o.work_date,
              type: 'overtime',
              color: 'var(--accent)',
              icon: '⏰',
              label: `${o.hours} saat mesai`,
              sub: o.reason || '',
            })),
          ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20)

          return events.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Kayıt yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--surface2)' : 'transparent' }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 70 }}>
                    {new Date(e.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span style={{ fontSize: 14 }}>{e.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</div>
                    {e.sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{e.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* BİLGİ — Info Grid */}
        {detailTab === 'info' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: '🪪', label: 'TC NO',      value: person.tc_no },
              { icon: '📞', label: 'TELEFON',     value: person.phone },
              { icon: '✉️', label: 'E-POSTA',     value: person.email },
              { icon: '🩸', label: 'KAN GRUBU',   value: person.blood_type },
              { icon: '🎂', label: 'DOĞUM',       value: person.birth_date ? `${new Date(person.birth_date).toLocaleDateString('tr-TR')} (${calcAge(person.birth_date)} yaş)` : null },
              { icon: '📋', label: 'İŞE GİRİŞ',  value: person.hire_date ? new Date(person.hire_date).toLocaleDateString('tr-TR') : null },
              { icon: '🚨', label: 'ACİL KİŞİ',  value: person.emergency_contact },
              { icon: '📱', label: 'ACİL TEL',    value: person.emergency_phone },
              { icon: '💰', label: 'MAAŞ',        value: person.salary ? `${Number(person.salary).toLocaleString('tr-TR')} ₺` : null },
              { icon: '👤', label: 'CİNSİYET',    value: person.gender === 'male' ? 'Erkek' : person.gender === 'female' ? 'Kadın' : null },
              { icon: '📍', label: 'ADRES',       value: person.address, full: true },
            ].map(f => (
              <div key={f.label} style={f.full ? { gridColumn: '1/-1' } : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 12 }}>{f.icon}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px' }}>{f.label}</span>
                </div>
                <div style={{ fontSize: 12, color: f.value ? 'var(--text)' : 'var(--text4)', paddingLeft: 18 }}>{f.value || '—'}</div>
              </div>
            ))}
            {person.notes && (
              <div style={{ gridColumn: '1/-1', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px', marginBottom: 4 }}>NOTLAR</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{person.notes}</div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )}
  ```

  **Not:** `LEAVE_TYPES` ve `STATUS_MAP` sabitlerini ÖZET sekmesinde kullandık — bunlar dosyanın başında zaten tanımlı (satır 7–21).

- [ ] **Step 2: Tarayıcıda doğrula**

  - Personele tıkla → 5 sekme görünmeli
  - ÖZET sekmesi → activity timeline görünmeli
  - BİLGİ sekmesi → ikon + etiket + değer grid görünmeli
  - Aksiyon butonlarına tıklayınca placeholder form overlay açılmalı

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: ÖZET timeline ve BİLGİ sekmesi eklendi"
  ```

---

## Task 5: VARDİYA, İZİN ve MESAİ Sekmeleri

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — `content area` içine `detailTab === 'shifts'`, `'leave'`, `'overtime'` bloklarını ekle

- [ ] **Step 1: BİLGİ bloğunun hemen altına VARDİYA, İZİN, MESAİ bloklarını ekle**

  ```jsx
  {/* VARDİYA */}
  {detailTab === 'shifts' && (
    <div>
      {/* Filtre */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: '', label: 'TÜM' },
          { key: 'worked',    label: 'ÇALIŞTI' },
          { key: 'scheduled', label: 'PLANLI' },
          { key: 'on_leave',  label: 'İZİNLİ' },
          { key: 'absent',    label: 'YOK' },
        ].map(f => {
          // ShiftFilter state'i bu bileşende yoktu — basit local useState ekle
          // Bu filtre state'i StaffDetailPanel içinde useState ile yönetilir
          // shiftFilter state zaten StaffDetailPanel'de tanımlanacak (aşağıda)
          return null // placeholder — step 2'de düzeltilecek
        })}
      </div>
    </div>
  )}
  ```

  **Aslında şöyle yap:** `StaffDetailPanel`'e `const [shiftFilter, setShiftFilter] = useState('')` state'i ekle (diğer state'lerin yanına), sonra sekmeyi tam yaz:

  ```jsx
  {/* VARDİYA */}
  {detailTab === 'shifts' && (() => {
    const filtered = shiftFilter ? shiftHistory.filter(s => s.status === shiftFilter) : shiftHistory
    const visible = filtered.slice(0, shiftPage)
    return (
      <div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['', 'TÜM'], ['worked','ÇALIŞTI'], ['scheduled','PLANLI'], ['on_leave','İZİNLİ'], ['absent','YOK']].map(([k, l]) => (
            <button key={k} onClick={() => { setShiftFilter(k); setShiftPage(30) }}
              className={`btn btn-xs ${shiftFilter === k ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 9 }}>{l}</button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Kayıt yok</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visible.map((s, i) => {
              const sc = shiftColor(s.shift_color)
              const STATUS_C = { worked: 'var(--green)', scheduled: 'var(--blue)', on_leave: 'var(--purple)', absent: 'var(--red)', overtime: 'var(--accent)' }
              const STATUS_L = { worked: 'Çalıştı', scheduled: 'Planlandı', on_leave: 'İzinli', absent: 'Gelmedi', overtime: 'Mesai' }
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--surface2)' : 'transparent' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 80 }}>
                    {new Date(s.work_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}
                  </span>
                  {s.shift_name && (
                    <span style={{ padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.text, fontSize: 9, fontWeight: 600 }}>{s.shift_name}</span>
                  )}
                  {s.start_hour != null && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 600, color: STATUS_C[s.status] || 'var(--text3)' }}>{STATUS_L[s.status] || s.status}</span>
                </div>
              )
            })}
            {filtered.length > shiftPage && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShiftPage(p => p + 30)}
                style={{ marginTop: 8, borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 9 }}>
                Daha fazla göster ({filtered.length - shiftPage} kaldı)
              </button>
            )}
          </div>
        )}
      </div>
    )
  })()}

  {/* İZİN */}
  {detailTab === 'leave' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {leaveHistory.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>İzin kaydı yok</div>
      ) : leaveHistory.map((l, i) => {
        const bandColor = l.status === 'approved' ? 'var(--green)' : l.status === 'rejected' ? 'var(--red)' : 'var(--accent)'
        return (
          <div key={i} style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ width: 4, background: bandColor, flexShrink: 0 }} />
            <div style={{ padding: '10px 14px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`} style={{ fontSize: 8 }}>{LEAVE_TYPES[l.leave_type]?.label || l.leave_type}</span>
                <span className={`badge ${STATUS_MAP[l.status]?.badge || 'badge-gray'}`} style={{ fontSize: 8 }}>{STATUS_MAP[l.status]?.label || l.status}</span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                {new Date(l.start_date).toLocaleDateString('tr-TR')} → {new Date(l.end_date).toLocaleDateString('tr-TR')}
                <span style={{ marginLeft: 10, color: 'var(--accent)', fontWeight: 700 }}>{l.total_days} gün</span>
              </div>
              {l.reason && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{l.reason}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )}

  {/* MESAİ */}
  {detailTab === 'overtime' && (
    <div>
      {overtimeRecords.length > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(155,89,182,.12)', border: '1px solid rgba(155,89,182,.2)', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TOPLAM</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--purple)', fontWeight: 700 }}>
            {overtimeRecords.reduce((sum, o) => sum + (o.hours || 0), 0)}s
          </span>
        </div>
      )}
      {overtimeRecords.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Mesai kaydı yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {overtimeRecords.map((o, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
              background: i % 2 === 0 ? 'var(--surface2)' : 'transparent',
              transition: 'background .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface2)' : 'transparent'}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 70 }}>
                {new Date(o.work_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
              </span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--purple)', minWidth: 40 }}>{o.hours}s</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.reason || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )}
  ```

  **Not:** `const [shiftFilter, setShiftFilter] = useState('')` ve `const [shiftPage, setShiftPage] = useState(30)` state'lerini StaffDetailPanel'in state bloğuna ekle.

- [ ] **Step 2: Tarayıcıda doğrula**

  - VARDİYA: filtre butonları çalışıyor, "Daha fazla göster" butonu var
  - İZİN: sol renk bandı (yeşil/kırmızı/sarı), kart görünümü
  - MESAİ: toplam saat chip'i üstte, satır hover efekti

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: VARDİYA, İZİN, MESAİ sekmeleri eklendi"
  ```

---

## Task 6: ActionForm — Inline Form Sistemi

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` — `activeForm && (...)` bloğunu gerçek formlarla doldur

- [ ] **Step 1: ActionForm data ihtiyaçları için query ekle**

  `StaffDetailPanel` içindeki query bloğuna ekle:

  ```js
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })
  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })
  ```

  Form mutation'ları:
  ```js
  const assignShiftMut = useMutation({
    mutationFn: d => api.post('/shifts/schedule', { entries: [{ staff_id: staffId, dept_id: d.dept_id, shift_def_id: d.shift_def_id || null, work_date: d.work_date, status: 'scheduled' }] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['schedule'] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })
  const addLeaveMut = useMutation({
    mutationFn: d => api.post('/shifts/leave', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })
  const addOvertimeMut = useMutation({
    mutationFn: d => api.post('/shifts/overtime', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })
  const updateStaffMut = useMutation({
    mutationFn: d => api.put(`/shifts/staff/${staffId}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['staff-list'] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })
  ```

  Form state'leri (StaffDetailPanel state bloğuna ekle):
  ```js
  const [formData, setFormData] = useState({})
  ```

  `setActiveForm` çağrısını şu şekilde değiştir — form açılınca başlangıç değerlerini yükle:
  ```js
  const openForm = (key) => {
    if (key === 'edit' && person) {
      setFormData({
        full_name: person.full_name || '', tc_no: person.tc_no || '',
        phone: person.phone || '', email: person.email || '',
        position: person.position || '', department_id: person.department_id?.toString() || '',
        hire_date: person.hire_date || '', birth_date: person.birth_date || '',
        address: person.address || '', emergency_contact: person.emergency_contact || '',
        emergency_phone: person.emergency_phone || '', blood_type: person.blood_type || '',
        gender: person.gender || 'male', salary: person.salary?.toString() || '',
        notes: person.notes || '',
      })
    } else {
      setFormData({})
    }
    setActiveForm(key)
  }
  ```
  Aksiyon butonlarını `onClick={() => setActiveForm(a.key)}` yerine `onClick={() => openForm(a.key)}` yap.

- [ ] **Step 2: ActionForm overlay'ini gerçek formlarla doldur**

  `{activeForm && (...)}` bloğunu:

  ```jsx
  {activeForm && (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'var(--bg)', padding: '20px 24px',
      overflowY: 'auto',
      animation: 'fadeIn .15s ease',
    }}>
      {/* Form header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: '2px' }}>
          {activeForm === 'edit' ? '✎ DÜZENLE' : activeForm === 'shift' ? '+ VARDİYA' : activeForm === 'leave' ? '+ İZİN' : '+ MESAİ'}
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => setActiveForm(null)} style={{ borderRadius: 8 }}>✕ İptal</button>
      </div>

      {/* Düzenle formu */}
      {activeForm === 'edit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'full_name', label: 'Ad Soyad', type: 'text', required: true },
            { key: 'tc_no', label: 'TC No', type: 'text' },
            { key: 'phone', label: 'Telefon', type: 'text' },
            { key: 'email', label: 'E-posta', type: 'email' },
            { key: 'position', label: 'Pozisyon', type: 'text' },
            { key: 'hire_date', label: 'İşe Giriş', type: 'date' },
            { key: 'birth_date', label: 'Doğum Tarihi', type: 'date' },
            { key: 'salary', label: 'Maaş (₺)', type: 'number' },
            { key: 'emergency_contact', label: 'Acil Kişi', type: 'text' },
            { key: 'emergency_phone', label: 'Acil Tel', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input className="form-input" type={f.type} value={formData[f.key] || ''}
                onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: '100%', borderRadius: 8 }} />
            </div>
          ))}
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>CİNSİYET</label>
            <select className="form-input" value={formData.gender || ''} onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
              <option value="male">Erkek</option>
              <option value="female">Kadın</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>KAN GRUBU</label>
            <select className="form-input" value={formData.blood_type || ''} onChange={e => setFormData(p => ({ ...p, blood_type: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
              <option value="">—</option>
              {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>ADRES</label>
            <textarea className="form-input" value={formData.address || ''} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => updateStaffMut.mutate({ ...formData, department_id: formData.department_id ? parseInt(formData.department_id) : null, salary: formData.salary ? parseFloat(formData.salary) : null })} disabled={!formData.full_name || updateStaffMut.isPending} style={{ borderRadius: 10 }}>
              {updateStaffMut.isPending ? '...' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* Vardiya formu */}
      {activeForm === 'shift' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>TARİH</label>
            <input className="form-input" type="date" value={formData.work_date || ''} onChange={e => setFormData(p => ({ ...p, work_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>VARDİYA</label>
            <select className="form-input" value={formData.shift_def_id || ''} onChange={e => setFormData(p => ({ ...p, shift_def_id: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
              <option value="">Vardiyasız (İzin/Yok)</option>
              {shiftDefs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.start_hour}:00–{d.end_hour === 24 ? '00' : d.end_hour}:00)</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>DEPARTMAN</label>
            <select className="form-input" value={formData.dept_id || ''} onChange={e => setFormData(p => ({ ...p, dept_id: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
              <option value="">Varsayılan</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => assignShiftMut.mutate({ ...formData, dept_id: formData.dept_id ? parseInt(formData.dept_id) : (person?.department_id || null), shift_def_id: formData.shift_def_id ? parseInt(formData.shift_def_id) : null })} disabled={!formData.work_date || assignShiftMut.isPending} style={{ borderRadius: 10 }}>
            {assignShiftMut.isPending ? '...' : 'Vardiya Ata'}
          </button>
        </div>
      )}

      {/* İzin formu */}
      {activeForm === 'leave' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>İZİN TİPİ</label>
            <select className="form-input" value={formData.leave_type || ''} onChange={e => setFormData(p => ({ ...p, leave_type: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
              <option value="">Seçin</option>
              {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>BAŞLANGIÇ</label>
              <input className="form-input" type="date" value={formData.start_date || ''} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>BİTİŞ</label>
              <input className="form-input" type="date" value={formData.end_date || ''} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
            </div>
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>AÇIKLAMA</label>
            <textarea className="form-input" value={formData.reason || ''} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
          </div>
          <button className="btn btn-primary" onClick={() => addLeaveMut.mutate({ staff_id: staffId, leave_type: formData.leave_type, start_date: formData.start_date, end_date: formData.end_date, reason: formData.reason || null })} disabled={!formData.leave_type || !formData.start_date || !formData.end_date || addLeaveMut.isPending} style={{ borderRadius: 10 }}>
            {addLeaveMut.isPending ? '...' : 'İzin Ekle'}
          </button>
        </div>
      )}

      {/* Mesai formu */}
      {activeForm === 'overtime' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>TARİH</label>
            <input className="form-input" type="date" value={formData.work_date || ''} onChange={e => setFormData(p => ({ ...p, work_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>SAAT MİKTARI</label>
            <input className="form-input" type="number" min="0.5" max="12" step="0.5" value={formData.hours || ''} onChange={e => setFormData(p => ({ ...p, hours: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>NEDEN</label>
            <textarea className="form-input" value={formData.reason || ''} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
          </div>
          <button className="btn btn-primary" onClick={() => addOvertimeMut.mutate({ staff_id: staffId, work_date: formData.work_date, hours: parseFloat(formData.hours), reason: formData.reason || null })} disabled={!formData.work_date || !formData.hours || addOvertimeMut.isPending} style={{ borderRadius: 10 }}>
            {addOvertimeMut.isPending ? '...' : 'Mesai Ekle'}
          </button>
        </div>
      )}
    </div>
  )}
  ```

- [ ] **Step 2: Tarayıcıda doğrula**

  - "✎ Düzenle" → tüm alanlar mevcut verilerle dolu, kaydet çalışıyor
  - "+ Vardiya" → tarih + vardiya tipi seç, kaydet → VARDİYA sekmesi güncelleniyor
  - "+ İzin" → form çalışıyor, İZİN sekmesi güncelleniyor
  - "+ Mesai" → form çalışıyor, MESAİ sekmesi güncelleniyor
  - Esc → önce formu kapatıyor, ikincide sheet kapanıyor

- [ ] **Step 3: Backend testleri çalıştır**

  ```bash
  cd backend && npx vitest run
  ```
  Beklenen: 114 test geçer.

- [ ] **Step 4: Final commit**

  ```bash
  git add frontend/src/modules/shifts/ShiftsPage.jsx
  git commit -m "feat: ActionForm inline formlar — vardiya, izin, mesai, düzenle"
  ```

---

## Doğrulama Kontrol Listesi

Tüm task'lar tamamlandıktan sonra:

- [ ] Yoklama sekmesi sidebar'da görünmüyor
- [ ] Personele tıklayınca bottom sheet aşağıdan açılıyor, backdrop var
- [ ] Sheet açıkken body scroll lock çalışıyor (sayfa arkası scroll edilemiyor)
- [ ] Esc ile kapanıyor
- [ ] Header: departman renk bandı, 64px avatar, isim/pozisyon/badge, 4 aksiyon butonu
- [ ] Stat grid: 5 kart, renkli sayılar, ÇALIŞTI kartında progress bar
- [ ] 5 sekme çalışıyor: ÖZET, BİLGİ, VARDİYA, İZİN, MESAİ
- [ ] ÖZET: activity timeline karma liste
- [ ] VARDİYA: filtre butonları + "Daha fazla göster"
- [ ] İZİN: sol renk bandlı kartlar
- [ ] MESAİ: toplam chip + hover efekti
- [ ] 4 aksiyon formu çalışıyor ve data kayıt sonrası güncelleniyor
- [ ] `npx vitest run` — 114 test geçiyor
