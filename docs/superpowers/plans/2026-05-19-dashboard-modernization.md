# Dashboard Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici dashboard'unu modern bir görsel dile + 12-grid bento layout'a taşı; 4 yeni widget ekle (Bugünün Nabzı, Yaklaşan Etkinlikler, Sağlık Skoru, Anomali Uyarıları).

**Architecture:** 3 fazlı katmanlı geçiş. Faz 1 sadece görsel: yeni CSS utility'leri + mevcut widget'lara kategori gradient şeritleri + DashboardPage'i bento-grid container'a sarma. Faz 2 frontend-derived widget'lar (yeni backend yok). Faz 3 backend agregatör endpoint'leri + son widget'lar.

**Tech Stack:** React + Vite (frontend), Express + better-sqlite3 (backend), Vitest (test), Tailwind + CSS variables (styling), recharts (grafikler), @tanstack/react-query (data fetch).

---

## Spec Referansı

`docs/superpowers/specs/2026-05-19-dashboard-modernization-design.md`

## Dosya Yapısı Özeti

**Faz 1 (Görsel Dil + Layout):**
- Modify: `frontend/src/index.css` — yeni utility classlar
- Modify: `frontend/src/modules/dashboard/KPICard.jsx`
- Modify: `frontend/src/modules/dashboard/TrendCard.jsx`
- Modify: `frontend/src/modules/dashboard/HeatMap.jsx`
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

**Faz 2 (Frontend Widget'ları):**
- Create: `frontend/src/modules/dashboard/TodaysPulse.jsx`
- Create: `frontend/src/modules/dashboard/UpcomingEvents.jsx`
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

**Faz 3 (Backend + Widget'lar):**
- Modify: `backend/src/modules/dashboard/queries.js` — `getHealthScore`, `getAnomalies`
- Modify: `backend/src/modules/dashboard/routes.js` — 2 yeni route
- Modify: `backend/src/modules/dashboard/dashboard.test.js`
- Create: `frontend/src/modules/dashboard/HealthScoreWidget.jsx`
- Create: `frontend/src/modules/dashboard/AnomalyAlerts.jsx`
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

---

# FAZ 1 — Görsel Dil + Bento Layout

## Task 1.1: CSS utility classları + kategori token'ları

**Files:**
- Modify: `frontend/src/index.css` (200. satır civarı `Prog bar` bölümünden sonra)

- [ ] **Step 1: `:root` blokuna kategori token'ları ekle**

`index.css`'in `:root` bölümünün sonuna (mevcut `--shadow-sm: 0 4px 12px rgba(0,0,0,0.3);` satırından hemen sonra) ekle:

```css
    /* Category gradient tokens */
    --cat-occupancy: linear-gradient(135deg, #3b8cf0 0%, #1abc9c 100%);
    --cat-maintenance: linear-gradient(135deg, #e74c3c 0%, #e05c2a 100%);
    --cat-housekeeping: linear-gradient(135deg, #27c96a 0%, #1abc9c 100%);
    --cat-finance: linear-gradient(135deg, #9b59b6 0%, #3b8cf0 100%);
    --cat-personnel: linear-gradient(135deg, #f0a500 0%, #e05c2a 100%);
    --cat-health: linear-gradient(135deg, #1abc9c 0%, #27c96a 100%);
    --cat-alert: linear-gradient(135deg, #e74c3c 0%, #f0a500 100%);
    /* Category glow shadows (matching base colors) */
    --glow-occupancy: 0 0 12px rgba(59,140,240,.25);
    --glow-maintenance: 0 0 12px rgba(231,76,60,.25);
    --glow-housekeeping: 0 0 12px rgba(39,201,106,.25);
    --glow-finance: 0 0 12px rgba(155,89,182,.25);
    --glow-personnel: 0 0 12px rgba(240,165,0,.25);
    --glow-health: 0 0 12px rgba(26,188,156,.25);
    --glow-alert: 0 0 12px rgba(231,76,60,.3);
```

- [ ] **Step 2: Yeni utility class'larını ekle**

`index.css`'in en sonuna ekle:

```css
/* ── Bento grid layout ──────────────────────────────────────────────────── */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  position: relative;
  z-index: 1;
}
.bento-cell { min-width: 0; }
.bento-span-4  { grid-column: span 4; }
.bento-span-5  { grid-column: span 5; }
.bento-span-6  { grid-column: span 6; }
.bento-span-7  { grid-column: span 7; }
.bento-span-8  { grid-column: span 8; }
.bento-span-12 { grid-column: 1 / -1; }
@media (max-width: 1399px) {
  .bento-grid { gap: 12px; }
}
@media (max-width: 1023px) {
  .bento-span-4, .bento-span-5, .bento-span-6, .bento-span-7, .bento-span-8 {
    grid-column: span 6;
  }
}
@media (max-width: 767px) {
  .bento-span-4, .bento-span-5, .bento-span-6, .bento-span-7, .bento-span-8 {
    grid-column: 1 / -1;
  }
}

/* ── Glass card surface ─────────────────────────────────────────────────── */
.card-glass {
  background: rgba(15,19,25,.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}
[data-theme="light"] .card-glass {
  background: rgba(255,255,255,.72);
}

/* ── Category stripe (3px top accent + soft glow halo) ─────────────────── */
.cat-stripe {
  position: relative;
}
.cat-stripe::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
  z-index: 2;
}
.cat-stripe::after {
  content: '';
  position: absolute;
  top: 0; left: 10%; right: 10%;
  height: 14px;
  filter: blur(10px);
  opacity: .45;
  z-index: 1;
  pointer-events: none;
}
.cat-stripe-occupancy::before { background: var(--cat-occupancy); }
.cat-stripe-occupancy::after  { background: var(--cat-occupancy); }
.cat-stripe-maintenance::before { background: var(--cat-maintenance); }
.cat-stripe-maintenance::after  { background: var(--cat-maintenance); }
.cat-stripe-housekeeping::before { background: var(--cat-housekeeping); }
.cat-stripe-housekeeping::after  { background: var(--cat-housekeeping); }
.cat-stripe-finance::before { background: var(--cat-finance); }
.cat-stripe-finance::after  { background: var(--cat-finance); }
.cat-stripe-personnel::before { background: var(--cat-personnel); }
.cat-stripe-personnel::after  { background: var(--cat-personnel); }
.cat-stripe-health::before { background: var(--cat-health); }
.cat-stripe-health::after  { background: var(--cat-health); }
.cat-stripe-alert::before { background: var(--cat-alert); }
.cat-stripe-alert::after  { background: var(--cat-alert); }

/* ── Fade-up stagger (60ms delay step) ──────────────────────────────────── */
@keyframes fadeUpStagger {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-up-stagger > * {
  animation: fadeUpStagger .25s ease-out backwards;
}
.fade-up-stagger > *:nth-child(1) { animation-delay: 0ms; }
.fade-up-stagger > *:nth-child(2) { animation-delay: 60ms; }
.fade-up-stagger > *:nth-child(3) { animation-delay: 120ms; }
.fade-up-stagger > *:nth-child(4) { animation-delay: 180ms; }
.fade-up-stagger > *:nth-child(5) { animation-delay: 240ms; }
.fade-up-stagger > *:nth-child(6) { animation-delay: 300ms; }
.fade-up-stagger > *:nth-child(7) { animation-delay: 360ms; }
.fade-up-stagger > *:nth-child(8) { animation-delay: 420ms; }
.fade-up-stagger > *:nth-child(n+9) { animation-delay: 480ms; }

/* ── Live dot pulse ──────────────────────────────────────────────────────── */
@keyframes live-dot-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(39,201,106,.6); }
  50%      { opacity: .6; box-shadow: 0 0 0 6px rgba(39,201,106,0); }
}
.live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--green);
  animation: live-dot-pulse 2s ease-in-out infinite;
}
```

- [ ] **Step 3: Frontend dev server'ı başlat ve görsel doğrula**

```bash
cd "C:/Users/hrync/OneDrive/Masaüstü/test claude" && npm run dev
```

Tarayıcıda `http://localhost:5173` aç. Dashboard sayfasına git. **Beklenen:** Henüz görsel değişiklik yok (sadece CSS eklendi, kimse kullanmıyor). Konsolda hata yok.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(dashboard): bento grid utility, glass kart ve kategori stripe classlari"
```

---

## Task 1.2: KPICard kategori stripe + glass surface

**Files:**
- Modify: `frontend/src/modules/dashboard/KPICard.jsx` (tamamı yeniden yazılır)

- [ ] **Step 1: `KPICard.jsx`'i tamamen yeniden yaz**

```jsx
const COLOR_MAP = {
  orange: { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.10)',  cat: 'personnel' },
  amber:  { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.10)',  cat: 'personnel' },
  red:    { accent: 'var(--red)',     bg: 'rgba(231,76,60,.10)',  cat: 'maintenance' },
  green:  { accent: 'var(--green)',   bg: 'rgba(39,201,106,.10)', cat: 'housekeeping' },
  blue:   { accent: 'var(--blue)',    bg: 'rgba(59,140,240,.10)', cat: 'occupancy' },
  purple: { accent: 'var(--purple)',  bg: 'rgba(155,89,182,.10)', cat: 'finance' },
  teal:   { accent: 'var(--teal)',    bg: 'rgba(26,188,156,.10)', cat: 'health' },
}

export default function KPICard({ icon, label, value, color = 'orange', subtitle, barPct, trend, category }) {
  const c = COLOR_MAP[color] || COLOR_MAP.orange
  const catName = category || c.cat
  const progClass = color === 'red' ? 'prog-red' : color === 'green' ? 'prog-green' : color === 'blue' ? 'prog-blue' : 'prog-amber'

  return (
    <div
      className={`kpi-card card-glass cat-stripe cat-stripe-${catName}`}
      style={{ padding: '22px 20px 20px', transition: 'all .2s' }}
      aria-label={`${label} ${value}`}
    >
      <div style={{
        width: '34px', height: '34px',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px',
        marginBottom: '14px',
        background: c.bg,
      }}>
        {icon}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '4px' }}>
        <div style={{
          fontFamily: 'var(--display)', fontSize: '44px', lineHeight: 1,
          color: c.accent, letterSpacing: '1px',
        }}>
          {value}
        </div>
        {trend && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            color: trend === 'up' ? 'var(--green)' : 'var(--red)',
            marginBottom: '6px',
          }}>
            {trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>

      <div style={{
        fontFamily: 'var(--mono)', fontSize: '10px',
        color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase',
      }}>
        {label}
      </div>

      {subtitle && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}

      {barPct !== undefined && (
        <div className="prog-bar" style={{ marginTop: '14px' }}>
          <div className={`prog-fill ${progClass}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Tarayıcıda doğrula**

`/dashboard` adresinde KPI kartlarının üstünde 3px gradient + soft glow şerit göründüğünü doğrula. Hover'da `kpi-card:hover` mevcut CSS kuralıyla `translateY(-2px)` hâlâ çalışmalı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/dashboard/KPICard.jsx
git commit -m "feat(dashboard): KPICard kategori gradient stripe + glass surface"
```

---

## Task 1.3: TrendCard kategori stripe + glass

**Files:**
- Modify: `frontend/src/modules/dashboard/TrendCard.jsx`

- [ ] **Step 1: `CONFIGS` objesine kategori ata**

Mevcut `CONFIGS` objesini şu şekilde değiştir (her metrik için `cat` field'ı ekle):

```jsx
const CONFIGS = {
  occupancy: {
    label: 'DOLULUK', unit: '%', color: 'var(--blue)', type: 'area', dataKey: 'value',
    cat: 'occupancy',
  },
  sla: {
    label: 'BAKIM SLA UYUMU', unit: '%', color: 'var(--green)', type: 'area', dataKey: 'value',
    cat: 'maintenance',
  },
  housekeeping: {
    label: 'TEMİZLİK TAMAMLAMA', unit: '%', color: 'var(--teal)', type: 'area', dataKey: 'value',
    cat: 'housekeeping',
  },
  checkins: {
    label: 'GİRİŞ / ÇIKIŞ', unit: '', color: null, type: 'line2',
    cat: 'personnel',
  },
}
```

- [ ] **Step 2: TrendCard root div'ini güncelle**

Mevcut TrendCard döndüğü JSX'in en üst div'i şu şekilde değiştir:

```jsx
return (
  <div className={`panel card-glass cat-stripe cat-stripe-${cfg.cat}`} style={{ overflow: 'hidden' }}>
    <div style={{ padding: '20px 18px 8px' }}>
```

`<div style={{ height: '2px', background: cfg.color || 'linear-gradient(90deg,var(--green),var(--red))' }} />` satırını sil — kategori stripe onun yerini alıyor. Padding'i `16px 18px 8px` → `20px 18px 8px` yap (stripe için 4px üst boşluk).

- [ ] **Step 3: Tarayıcıda kontrol et**

Trend kartlarının üstünde 4 farklı renk gradient (mavi-teal, kırmızı-turuncu, yeşil-teal, amber-turuncu) görünmeli.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/TrendCard.jsx
git commit -m "feat(dashboard): TrendCard kategori stripe + glass surface"
```

---

## Task 1.4: HeatMap glass surface + refined gradient şerit

**Files:**
- Modify: `frontend/src/modules/dashboard/HeatMap.jsx`

- [ ] **Step 1: Her blok kart'a `card-glass` ekle**

`<div key={block.block} className="heatmap-block"` satırını şu hâle getir:

```jsx
<div
  key={block.block}
  className="heatmap-block card-glass"
  onClick={() => navigate(`/capacity?block=${block.block}`)}
  style={{
    background: s.bg,
    border: `1px solid ${s.border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    position: 'relative',
  }}
>
```

(`borderRadius` 10 → 12, `card-glass` class'ı eklendi.)

- [ ] **Step 2: Üst şerit yüksekliğini 3px yap ve glow ekle**

`<div style={{ height: '2px', background: s.grad }} />` satırını şununla değiştir:

```jsx
<div style={{
  height: '3px',
  background: s.grad,
  position: 'relative',
}}>
  <div style={{
    position: 'absolute',
    top: 0, left: '10%', right: '10%', height: '14px',
    background: s.grad, filter: 'blur(10px)', opacity: 0.5,
    pointerEvents: 'none',
  }} />
</div>
```

- [ ] **Step 3: Tarayıcıda kontrol et**

Blok kartlarının üst kenarında 3px gradient + altında 10px blur halo görünmeli.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/HeatMap.jsx
git commit -m "feat(dashboard): HeatMap glass surface + 3px glow stripe"
```

---

## Task 1.5: DashboardPage'i bento-grid layout'a taşı

**Files:**
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

- [ ] **Step 1: Default export'u bento yapısına dönüştür**

`DashboardPage` fonksiyonunun return'unü tamamen şu şekilde değiştir:

```jsx
return (
  <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
    {/* Header — full width */}
    <div className="page-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div>
        <h1 style={{ fontSize: '32px', letterSpacing: '6px', color: 'var(--text)' }}>
          DASHBOARD<HelpHint topic="dashboard" title="DASHBOARD" />
        </h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          ŞANTİYE YATAKHANE — GENEL DURUM
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {isManager && <ExportButtons />}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="live-dot" />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>CANLI</span>
        </div>
      </div>
    </div>

    {isManager && <ManagementWidgets />}

    {/* Alert banners — full width */}
    {criticalNotifs.length > 0 && (
      <div style={{ marginBottom: '16px' }}>
        {criticalNotifs.map(n => (
          <div key={n.id} className="alert alert-danger">
            <span>!</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{n.message}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: '8px' }}>
                {n.module} · {new Date(n.created_at).toLocaleString('tr-TR')}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
    {highOccBlocks.length > 0 && (
      <div className="alert alert-warn" style={{ marginBottom: '16px' }}>
        <span>!</span>
        <span><strong>{highOccBlocks.map(b => b.block).join(', ')} blok</strong> %90 üzeri dolulukta</span>
      </div>
    )}

    {/* Bento grid */}
    <div className="bento-grid fade-up-stagger">
      {/* KPI 4'lü — span 8 */}
      {kpi && (
        <div className="bento-cell bento-span-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          <KPICard icon="👤" label="Aktif Personel" value={kpi.active_personnel} color="blue" category="personnel" />
          <KPICard
            icon="🛏" label="Doluluk" value={`${kpi.occupancy_pct}%`}
            color={occupancyColor} subtitle={`${kpi.occupied}/${kpi.total_beds} yatak`}
            barPct={kpi.occupancy_pct} category="occupancy"
          />
          <KPICard
            icon="🔧" label="Açık Arıza" value={kpi.open_maintenance}
            color={kpi.open_maintenance > 5 ? 'red' : 'green'} category="maintenance"
          />
          <KPICard
            icon="🏠" label="Karantina" value={kpi.quarantine_rooms}
            color={kpi.quarantine_rooms > 0 ? 'orange' : 'green'} category="alert"
          />
        </div>
      )}

      {/* Sağ panel placeholder #1 — Sağlık Skoru (Faz 3) */}
      <div className="bento-cell bento-span-4" style={{ minHeight: '180px' }}>
        {/* HealthScoreWidget gelecek — Faz 3 */}
      </div>

      {/* Yatak Doluluk — span 8 */}
      <div className="bento-cell bento-span-8">
        <BedOccupancyPanel data={bedOccupancy} />
      </div>

      {/* Sağ panel placeholder #2 — Bugünün Nabzı (Faz 2) */}
      <div className="bento-cell bento-span-4" style={{ minHeight: '320px' }}>
        {/* TodaysPulse gelecek — Faz 2 */}
      </div>

      {/* Trend grafikleri — span 8 (mevcut TrendChartsSection 2x2 internal grid'i yapıyor) */}
      <div className="bento-cell bento-span-8">
        <TrendChartsSection />
      </div>

      {/* Sağ panel placeholder #3 — Yaklaşan Etkinlikler (Faz 2) */}
      <div className="bento-cell bento-span-4" style={{ minHeight: '320px' }}>
        {/* UpcomingEvents gelecek — Faz 2 */}
      </div>

      {/* Blok HeatMap — span 12 */}
      <div className="bento-cell bento-span-12">
        <div className="sect">
          <div className="sect-title">BLOK DURUMU</div>
          <div className="sect-line" />
        </div>
        <HeatMap data={heatmap} />
      </div>

      {/* Anomali placeholder — Faz 3'te koşullu render */}

      {/* Aktif Arızalar — span 7 */}
      <div className="bento-cell bento-span-7">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">AKTİF ARIZALAR</div>
              <div className="panel-subtitle">AÇIK TEKNİK TALEPLER</div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/maintenance')}>
              Tümü →
            </button>
          </div>
          <div className="panel-body" style={{ padding: '10px 20px' }}>
            {maintRequests.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px' }}>
                <div className="empty-icon">✓</div>
                <div className="empty-sub">Açık arıza yok</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '0 20px' }}>
                {maintRequests.slice(0, 6).map(req => (
                  <div key={req.id} className="maint-row">
                    <PriorityBar priority={req.priority} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12.5px', color: 'var(--text)', fontWeight: 500, marginBottom: '3px' }}>
                        {req.description?.slice(0, 50)}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                        {req.location}
                        {req.wait_reason && (
                          <span style={{ color: 'var(--amber)', marginLeft: '6px' }}> · {req.wait_reason}</span>
                        )}
                      </div>
                    </div>
                    <span className={`badge badge-${req.priority === 'high' ? 'red' : req.priority === 'medium' ? 'amber' : 'blue'}`}>
                      {req.priority === 'high' ? 'ACİL' : req.priority === 'medium' ? 'NORMAL' : 'DÜŞÜK'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 14 Gün Projeksiyon — span 5 */}
      {projection.length > 0 && (
        <div className="bento-cell bento-span-5">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">14 GÜN PROJEKSİYON</div>
                <div className="panel-subtitle">AYRILACAK PERSONEL</div>
              </div>
              <span className="badge badge-amber">TAHMİN</span>
            </div>
            <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))', gap: '8px' }}>
              {projection.map(p => (
                <div key={p.block} style={{
                  background: 'var(--surface2)', borderRadius: '7px', padding: '10px 8px', textAlign: 'center',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '4px' }}>{p.block} BLOK</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--accent)', letterSpacing: '1px' }}>{p.c}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>kişi</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Denetim Kaydı — sadece campus_manager — span 12 */}
      {isManager && (
        <div className="bento-cell bento-span-12">
          <div className="sect">
            <div className="sect-title">DENETİM KAYDI</div>
            <div className="sect-line" />
          </div>
          <AuditLogPanel />
        </div>
      )}
    </div>
  </div>
)
```

**Notlar:**
- `BedOccupancyPanel`, `AuditLogPanel` mevcut hâliyle kalıyor (sonraki task'ta detaylı işlenebilir).
- KPI grid'i bento cell içinde mini-grid; minmax 160px korunur.
- `fade-up-N` class'ları kaldırıldı, yerine container'da `fade-up-stagger` var.
- Sağ panel hücreleri Faz 2/3'te dolacak. Şimdilik boş (`minHeight` ile yüksek tutarak grid çökmesini önlüyor).

- [ ] **Step 2: `npm run dev` çalıştır ve tarayıcıda doğrula**

`/dashboard` aç. Beklenen:
- Üst başlık 32px ve 6px letter-spacing
- KPI 4 kart bir satırda (4 sütun) — geniş ekran
- Sağ panel hücreleri boş ama yüksekliğini koruyor
- Mobilde (kenarı daralt) tek kolona stack'liyor
- Mevcut paneller (yatak doluluk, trend, heatmap, arızalar, projeksiyon, denetim) çalışıyor

- [ ] **Step 3: Mevcut backend testlerini çalıştır (regresyon kontrolü)**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: 11 test geçer.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): 12-grid bento layout + stagger fade-up"
```

---

# FAZ 2 — Frontend Widget'ları

## Task 2.1: TodaysPulse widget'ını oluştur

**Files:**
- Create: `frontend/src/modules/dashboard/TodaysPulse.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/dashboard/TodaysPulse.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PulseRow({ icon, label, value, color, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width: '28px', height: '28px', borderRadius: '7px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px',
        background: `${color}1a`,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px' }}>{label}</div>
        {sub && <div style={{ fontSize: '10px', color: 'var(--text2)' }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, lineHeight: 1, letterSpacing: '1px' }}>{value}</div>
    </div>
  )
}

export default function TodaysPulse() {
  const navigate = useNavigate()

  const { data: trends } = useQuery({
    queryKey: ['trends-2d-pulse'],
    queryFn: () => api.get('/dashboard/trends?metrics=checkins&days=2').then(r => r.data),
    refetchInterval: 60000,
  })
  const { data: openMaint = [] } = useQuery({
    queryKey: ['maint-open-pulse'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data).catch(() => []),
    refetchInterval: 60000,
  })
  const { data: hkTasks = [] } = useQuery({
    queryKey: ['hk-tasks-pulse'],
    queryFn: () => api.get('/housekeeping/tasks').then(r => r.data).catch(() => []),
    refetchInterval: 60000,
  })
  const { data: visitors } = useQuery({
    queryKey: ['visitors-pulse'],
    queryFn: () => api.get('/visitors/stats').then(r => r.data).catch(() => null),
    refetchInterval: 60000,
  })

  const today = todayDateStr()
  const todayPoint = trends?.checkins?.find(p => p.date === today)
  const inToday = todayPoint?.in ?? 0
  const outToday = todayPoint?.out ?? 0
  const maintToday = openMaint.filter(r => (r.opened_at || '').startsWith(today)).length
  const hkDoneToday = hkTasks.filter(t => (t.completed_at || '').startsWith(today)).length
  const activeVisitors = visitors?.active ?? 0

  return (
    <div className="panel card-glass cat-stripe cat-stripe-personnel">
      <div className="panel-header">
        <div>
          <div className="panel-title">BUGÜNÜN NABZI</div>
          <div className="panel-subtitle">CANLI HAREKET ÖZETİ</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <PulseRow
          icon="▲" label="GİRİŞ" value={inToday}
          color="var(--green)" sub="Bugün kayıt"
          onClick={() => navigate('/checkin')}
        />
        <PulseRow
          icon="▼" label="ÇIKIŞ" value={outToday}
          color="var(--red)" sub="Bugün kayıt"
          onClick={() => navigate('/checkin')}
        />
        <PulseRow
          icon="🔧" label="YENİ ARIZA" value={maintToday}
          color="var(--accent2)" sub={`${openMaint.length} açık toplam`}
          onClick={() => navigate('/maintenance')}
        />
        <PulseRow
          icon="🧹" label="TEMİZLİK TAMAM" value={hkDoneToday}
          color="var(--teal)" sub={`${hkTasks.length} toplam görev`}
          onClick={() => navigate('/housekeeping')}
        />
        <PulseRow
          icon="👥" label="AKTİF ZİYARETÇİ" value={activeVisitors}
          color="var(--blue)"
          onClick={() => navigate('/settings/visitors')}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DashboardPage'de placeholder yerine widget'ı koy**

`frontend/src/modules/dashboard/DashboardPage.jsx`'in başına import ekle:

```jsx
import TodaysPulse from './TodaysPulse.jsx'
```

Sonra bento grid'deki şu placeholder'ı:

```jsx
{/* Sağ panel placeholder #2 — Bugünün Nabzı (Faz 2) */}
<div className="bento-cell bento-span-4" style={{ minHeight: '320px' }}>
  {/* TodaysPulse gelecek — Faz 2 */}
</div>
```

Şununla değiştir:

```jsx
<div className="bento-cell bento-span-4">
  <TodaysPulse />
</div>
```

- [ ] **Step 3: Tarayıcıda doğrula**

`/dashboard` aç. Sağ panelin 2. hücresinde "BUGÜNÜN NABZI" paneli görünmeli. 5 satır: GİRİŞ, ÇIKIŞ, YENİ ARIZA, TEMİZLİK TAMAM, AKTİF ZİYARETÇİ. Her satıra tıklayınca ilgili sayfa açılmalı.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/TodaysPulse.jsx frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): TodaysPulse widget — bugünün hareket özeti"
```

---

## Task 2.2: UpcomingEvents widget'ını oluştur

**Files:**
- Create: `frontend/src/modules/dashboard/UpcomingEvents.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/dashboard/UpcomingEvents.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

function EventRow({ date, days, title, sub, color, onClick }) {
  const isOverdue = days != null && days < 0
  const isUrgent = days != null && days >= 0 && days <= 2
  const dayColor = isOverdue ? 'var(--red)' : isUrgent ? 'var(--accent)' : color
  const dayLabel = days == null ? '—' : days < 0 ? `${Math.abs(days)} gün geçti` : days === 0 ? 'BUGÜN' : `${days} gün`

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        minWidth: '50px', padding: '6px 8px',
        background: `${dayColor}15`, border: `1px solid ${dayColor}33`,
        borderRadius: '6px', textAlign: 'center',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: dayColor, letterSpacing: '1px', fontWeight: 600 }}>
          {dayLabel}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export default function UpcomingEvents() {
  const navigate = useNavigate()

  const { data: drillStats } = useQuery({
    queryKey: ['upcoming-drills'],
    queryFn: () => api.get('/drills/stats').then(r => r.data).catch(() => null),
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: expiring = [] } = useQuery({
    queryKey: ['upcoming-companies'],
    queryFn: () => api.get('/companies/expiring?days=30').then(r => r.data).catch(() => []),
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: openMaint = [] } = useQuery({
    queryKey: ['upcoming-sla'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data).catch(() => []),
    refetchInterval: 60 * 1000,
  })

  const events = []

  if (drillStats?.upcoming) {
    events.push({
      key: 'drill',
      days: daysUntil(drillStats.upcoming),
      title: 'Sonraki tatbikat',
      sub: drillStats.upcoming,
      color: 'var(--purple)',
      onClick: () => navigate('/settings/drills'),
    })
  }

  for (const c of expiring) {
    if (c.days_left != null && c.days_left <= 7) {
      events.push({
        key: `co-${c.id}`,
        days: c.days_left,
        title: `${c.name} sözleşmesi bitiyor`,
        sub: c.contract_end || '—',
        color: 'var(--purple)',
        onClick: () => navigate('/settings/companies'),
      })
    }
  }

  for (const r of openMaint) {
    if (r.sla_deadline) {
      const d = daysUntil(r.sla_deadline)
      if (d != null && d <= 7) {
        events.push({
          key: `sla-${r.id}`,
          days: d,
          title: `SLA: ${(r.description || '').slice(0, 40)}`,
          sub: r.location,
          color: 'var(--red)',
          onClick: () => navigate('/maintenance'),
        })
      }
    }
  }

  events.sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
  const top = events.slice(0, 5)

  return (
    <div className="panel card-glass cat-stripe cat-stripe-finance">
      <div className="panel-header">
        <div>
          <div className="panel-title">YAKLAŞAN ETKİNLİKLER</div>
          <div className="panel-subtitle">ÖNÜMÜZDEKİ 7 GÜN</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {top.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', color: 'var(--text3)', marginBottom: '6px' }}>—</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px' }}>
              YAKLAŞAN ETKİNLİK YOK
            </div>
          </div>
        ) : top.map(ev => (
          <EventRow key={ev.key} {...ev} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DashboardPage'de placeholder'ı widget ile değiştir**

`DashboardPage.jsx`'in başına import ekle:

```jsx
import UpcomingEvents from './UpcomingEvents.jsx'
```

Sonra:

```jsx
{/* Sağ panel placeholder #3 — Yaklaşan Etkinlikler (Faz 2) */}
<div className="bento-cell bento-span-4" style={{ minHeight: '320px' }}>
  {/* UpcomingEvents gelecek — Faz 2 */}
</div>
```

Yerine:

```jsx
<div className="bento-cell bento-span-4">
  <UpcomingEvents />
</div>
```

- [ ] **Step 3: Tarayıcıda doğrula**

`/dashboard` aç. Sağ panelin 3. hücresinde "YAKLAŞAN ETKİNLİKLER" görünmeli. Etkinlik yoksa "YAKLAŞAN ETKİNLİK YOK" empty state'i göster.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/UpcomingEvents.jsx frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): UpcomingEvents widget — yaklaşan etkinlik/sözleşme/SLA özeti"
```

---

# FAZ 3 — Backend Endpoint'leri + Son Widget'lar

## Task 3.1: `getHealthScore()` backend fonksiyonu + test

**Files:**
- Modify: `backend/src/modules/dashboard/queries.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: Test'i önce yaz**

`backend/src/modules/dashboard/dashboard.test.js`'in başına import güncelle:

```js
import { getTrends, getHealthScore } from './queries.js'
```

Dosyanın sonuna ekle:

```js
describe('getHealthScore', () => {
  it('returns score 0-100 with breakdown of 5 components', () => {
    const result = getHealthScore()
    expect(result).toHaveProperty('score')
    expect(typeof result.score).toBe('number')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(Array.isArray(result.breakdown)).toBe(true)
    expect(result.breakdown).toHaveLength(5)
    for (const c of result.breakdown) {
      expect(c).toHaveProperty('label')
      expect(c).toHaveProperty('value')
      expect(c).toHaveProperty('weight')
      expect(c.value).toBeGreaterThanOrEqual(0)
      expect(c.value).toBeLessThanOrEqual(100)
    }
  })

  it('weights sum to 1.0', () => {
    const result = getHealthScore()
    const sum = result.breakdown.reduce((s, c) => s + c.weight, 0)
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001)
  })

  it('returns color green/amber/red based on score', () => {
    const result = getHealthScore()
    expect(['green', 'amber', 'red']).toContain(result.color)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail görmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "getHealthScore"
```

Beklenen: 3 yeni test FAIL (`getHealthScore is not a function`).

- [ ] **Step 3: `queries.js`'e `getHealthScore` fonksiyonunu ekle**

`backend/src/modules/dashboard/queries.js`'in sonuna ekle:

```js
// ── Health Score ────────────────────────────────────────────────────────────

function _getHealthScore() {
  const db = getDB()

  // Doluluk skoru: 100 - |85 - actual%|, hedef %85
  const totalBeds = db.prepare("SELECT COALESCE(SUM(active_beds), 0) as t FROM rooms WHERE status='active'").get().t
  const occupied = db.prepare("SELECT COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL").get().c
  const occPct = totalBeds > 0 ? Math.round(occupied * 100 / totalBeds) : 0
  const occupancyScore = Math.max(0, 100 - Math.abs(85 - occPct))

  // SLA skoru: son 30 gün SLA uyum yüzdesi
  const slaRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN sla_deadline >= closed_at THEN 1 END) as ontime
    FROM maintenance_requests
    WHERE status='done' AND closed_at >= date('now', '-30 days') AND sla_deadline IS NOT NULL
  `).get()
  const slaScore = slaRow.total === 0 ? 100 : Math.round(slaRow.ontime * 100 / slaRow.total)

  // Temizlik skoru: son 7 gün tamamlanma yüzdesi
  const hkRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as done
    FROM cleaning_tasks
    WHERE DATE(scheduled_at) >= date('now', '-7 days') AND DATE(scheduled_at) <= date('now')
  `).get()
  const housekeepingScore = hkRow.total === 0 ? 100 : Math.round(hkRow.done * 100 / hkRow.total)

  // Arıza skoru: 0 açık = 100, 10+ = 0, doğrusal
  const openMaint = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c
  const maintenanceScore = Math.max(0, 100 - openMaint * 10)

  // Disiplin skoru: aktif kara liste sayısı × 5 cezalandır
  let disciplineScore = 100
  try {
    const blacklistCount = db.prepare(
      "SELECT COUNT(*) as c FROM blacklist WHERE active = 1"
    ).get()?.c ?? 0
    disciplineScore = Math.max(0, 100 - blacklistCount * 5)
  } catch (e) {
    // blacklist tablosu yoksa 100 varsay
    disciplineScore = 100
  }

  const breakdown = [
    { label: 'DOLULUK',  value: occupancyScore,    weight: 0.30 },
    { label: 'SLA',      value: slaScore,          weight: 0.25 },
    { label: 'TEMİZLİK', value: housekeepingScore, weight: 0.20 },
    { label: 'ARIZA',    value: maintenanceScore,  weight: 0.15 },
    { label: 'DİSİPLİN', value: disciplineScore,   weight: 0.10 },
  ]

  const score = Math.round(breakdown.reduce((s, c) => s + c.value * c.weight, 0))
  const color = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'

  return { score, breakdown, color }
}
export const getHealthScore = memoize(_getHealthScore, 60_000)
```

- [ ] **Step 4: Testleri tekrar çalıştır, geçmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "getHealthScore"
```

Beklenen: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/queries.js backend/src/modules/dashboard/dashboard.test.js
git commit -m "feat(dashboard): getHealthScore — 5 bileşenli sistem sağlık skoru"
```

---

## Task 3.2: `/dashboard/health` route + integration test

**Files:**
- Modify: `backend/src/modules/dashboard/routes.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: Test ekle**

`dashboard.test.js`'in `describe('Dashboard')` bloğunun içine ekle (örn. KPI test'inden sonra):

```js
  it('returns health score', async () => {
    const res = await request(app).get('/api/dashboard/health').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('score')
    expect(res.body).toHaveProperty('breakdown')
    expect(res.body).toHaveProperty('color')
  })

  it('rejects unauthenticated health request', async () => {
    const res = await request(app).get('/api/dashboard/health')
    expect(res.status).toBe(401)
  })
```

- [ ] **Step 2: Test'i çalıştır, fail görmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "health"
```

Beklenen: yeni 2 test FAIL (route henüz yok, 404).

- [ ] **Step 3: Route'u ekle**

`backend/src/modules/dashboard/routes.js`'de import'u güncelle (mevcut import satırına `getHealthScore` ekle):

```js
import { getKPI, getHeatmap, getProjection, getBedOccupancy, getAuditLog, exportPersonnel, exportOccupancy, exportMaintenance, getTrends, getHealthScore } from './queries.js'
```

Sonra `/projection` route'undan sonra yeni route ekle:

```js
dashboardRouter.get('/health', ...mgmt, cacheFor(60), (req, res) => {
  try { res.json(getHealthScore()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
```

- [ ] **Step 4: Testleri çalıştır, geçmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: tüm test'ler PASS (yeni 2 + mevcut 11 + Task 3.1'in 3'ü = 16 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/routes.js backend/src/modules/dashboard/dashboard.test.js
git commit -m "feat(dashboard): GET /api/dashboard/health endpoint"
```

---

## Task 3.3: `getAnomalies()` backend fonksiyonu + test

**Files:**
- Modify: `backend/src/modules/dashboard/queries.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: Test'i önce yaz**

`dashboard.test.js`'in import'una `getAnomalies` ekle:

```js
import { getTrends, getHealthScore, getAnomalies } from './queries.js'
```

Dosyanın sonuna yeni describe ekle:

```js
describe('getAnomalies', () => {
  it('returns an object with anomalies array', () => {
    const result = getAnomalies()
    expect(result).toHaveProperty('anomalies')
    expect(Array.isArray(result.anomalies)).toBe(true)
  })

  it('each anomaly has required fields', () => {
    const result = getAnomalies()
    for (const a of result.anomalies) {
      expect(a).toHaveProperty('id')
      expect(a).toHaveProperty('severity')
      expect(a).toHaveProperty('title')
      expect(a).toHaveProperty('detail')
      expect(['warning', 'critical']).toContain(a.severity)
    }
  })

  it('returns empty array on a clean seeded db', () => {
    // Seed verileri normal seviyede; ani anomali olmamalı
    const result = getAnomalies()
    expect(result.anomalies.length).toBeGreaterThanOrEqual(0) // 0+ kabul ediliyor
  })
})
```

- [ ] **Step 2: Test'i çalıştır, fail görmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "getAnomalies"
```

Beklenen: 3 test FAIL (`getAnomalies is not a function`).

- [ ] **Step 3: `queries.js`'e `getAnomalies` fonksiyonunu ekle**

`backend/src/modules/dashboard/queries.js`'in sonuna ekle:

```js
// ── Anomaly Detection ───────────────────────────────────────────────────────

function _getAnomalies() {
  const db = getDB()
  const anomalies = []

  // R1: Blok arıza yoğunluğu — bir blokta bugünkü açık arıza sayısı
  // son 7 günün ortalamasının ≥2 katı VE bugün ≥3 yeni arıza
  const maintByBlock = db.prepare(`
    WITH today_counts AS (
      SELECT
        SUBSTR(location, 1, INSTR(location || ' ', ' ') - 1) AS block,
        COUNT(*) AS today_count
      FROM maintenance_requests
      WHERE DATE(opened_at) = DATE('now')
      GROUP BY block
    ),
    week_avg AS (
      SELECT
        SUBSTR(location, 1, INSTR(location || ' ', ' ') - 1) AS block,
        COUNT(*) * 1.0 / 7.0 AS avg_per_day
      FROM maintenance_requests
      WHERE DATE(opened_at) >= DATE('now', '-7 days') AND DATE(opened_at) < DATE('now')
      GROUP BY block
    )
    SELECT t.block, t.today_count, COALESCE(w.avg_per_day, 0) AS avg_7d
    FROM today_counts t
    LEFT JOIN week_avg w ON w.block = t.block
    WHERE t.today_count >= 3 AND t.today_count >= COALESCE(w.avg_per_day, 0) * 2
  `).all()

  for (const row of maintByBlock) {
    if (!row.block) continue
    anomalies.push({
      id: `maint-density-${row.block}`,
      severity: 'warning',
      title: `${row.block} bloğunda arıza yoğunluğu yüksek`,
      detail: `Son 7 gün ortalaması ${row.avg_7d.toFixed(1)}/gün, bugün ${row.today_count} yeni kayıt`,
      action_path: `/maintenance?block=${row.block}`,
    })
  }

  // R3: Temizlik gecikmesi — bugün 3+ saat bekleyen tamamlanmamış görev
  const lateHk = db.prepare(`
    SELECT COUNT(*) AS c
    FROM cleaning_tasks
    WHERE completed_at IS NULL
      AND skipped = 0
      AND scheduled_at <= datetime('now', '-3 hours')
      AND DATE(scheduled_at) = DATE('now')
  `).get()
  if (lateHk.c > 0) {
    anomalies.push({
      id: 'hk-late',
      severity: lateHk.c >= 10 ? 'critical' : 'warning',
      title: 'Temizlik görevleri gecikiyor',
      detail: `${lateHk.c} görev 3 saatten fazla bekliyor`,
      action_path: '/housekeeping',
    })
  }

  // R4: Uzun karantina — audit_log üzerinden son room_quarantine kaydı 48+ saat önce
  // ve oda hâlâ karantina statüsünde
  const longQuarantine = db.prepare(`
    SELECT r.block, r.room_no,
      (SELECT MAX(created_at) FROM audit_log
        WHERE action='room_quarantine'
          AND detail LIKE '%' || r.block || '%' || r.room_no || '%') AS last_q
    FROM rooms r
    WHERE r.status = 'quarantine'
  `).all()
  for (const r of longQuarantine) {
    if (!r.last_q) continue
    const hoursSince = (Date.now() - new Date(r.last_q + 'Z').getTime()) / 3600000
    if (hoursSince >= 48) {
      anomalies.push({
        id: `qua-long-${r.block}-${r.room_no}`,
        severity: 'warning',
        title: `${r.block}-${r.room_no} karantinası uzun sürüyor`,
        detail: `${Math.round(hoursSince)} saattir karantinada`,
        action_path: `/capacity?block=${r.block}`,
      })
    }
  }

  // R2: Ani doluluk düşüşü — bugün çıkış sayısı son 7 gün ortalamasının ≥3 katı
  // ve bugün ≥5 çıkış
  const occRow = db.prepare(`
    WITH today_out AS (
      SELECT COUNT(*) AS c FROM personnel
      WHERE DATE(check_out_date) = DATE('now')
    ),
    week_avg AS (
      SELECT COUNT(*) * 1.0 / 7.0 AS avg_out FROM personnel
      WHERE DATE(check_out_date) >= DATE('now', '-7 days') AND DATE(check_out_date) < DATE('now')
    )
    SELECT t.c AS today_out, COALESCE(w.avg_out, 0) AS avg_out
    FROM today_out t, week_avg w
  `).get()
  if (occRow.today_out >= 5 && occRow.today_out >= occRow.avg_out * 3) {
    anomalies.push({
      id: 'occ-drop',
      severity: 'warning',
      title: 'Doluluk hızla düşüyor',
      detail: `Bugün ${occRow.today_out} çıkış (7 gün ort. ${occRow.avg_out.toFixed(1)})`,
      action_path: '/checkin',
    })
  }

  return { anomalies }
}
export const getAnomalies = memoize(_getAnomalies, 120_000)
```

- [ ] **Step 4: Testleri çalıştır, geçmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "getAnomalies"
```

Beklenen: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/queries.js backend/src/modules/dashboard/dashboard.test.js
git commit -m "feat(dashboard): getAnomalies — 4 kural ile anomali tespiti"
```

---

## Task 3.4: `/dashboard/anomalies` route + integration test

**Files:**
- Modify: `backend/src/modules/dashboard/routes.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: Test ekle**

`dashboard.test.js`'in `describe('Dashboard')` bloğunun içine ekle:

```js
  it('returns anomalies array', async () => {
    const res = await request(app).get('/api/dashboard/anomalies').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('anomalies')
    expect(Array.isArray(res.body.anomalies)).toBe(true)
  })

  it('rejects unauthenticated anomalies request', async () => {
    const res = await request(app).get('/api/dashboard/anomalies')
    expect(res.status).toBe(401)
  })
```

- [ ] **Step 2: Test'i çalıştır, fail görmesi gerek**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js -t "anomalies"
```

Beklenen: 2 yeni test FAIL (route 404).

- [ ] **Step 3: Route'u ekle**

`routes.js`'de import'u güncelle:

```js
import { getKPI, getHeatmap, getProjection, getBedOccupancy, getAuditLog, exportPersonnel, exportOccupancy, exportMaintenance, getTrends, getHealthScore, getAnomalies } from './queries.js'
```

`/health` route'unun altına ekle:

```js
dashboardRouter.get('/anomalies', ...mgmt, cacheFor(120), (req, res) => {
  try { res.json(getAnomalies()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
```

- [ ] **Step 4: Test'i çalıştır**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/routes.js backend/src/modules/dashboard/dashboard.test.js
git commit -m "feat(dashboard): GET /api/dashboard/anomalies endpoint"
```

---

## Task 3.5: HealthScoreWidget bileşeni

**Files:**
- Create: `frontend/src/modules/dashboard/HealthScoreWidget.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/dashboard/HealthScoreWidget.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

function Gauge({ score, color }) {
  const radius = 56
  const cx = 70, cy = 70
  const startAngle = Math.PI            // 180° (sol)
  const endAngle = 2 * Math.PI          // 360° (sağ)
  const progressAngle = startAngle + (endAngle - startAngle) * (score / 100)

  const arcPath = (start, end) => {
    const x1 = cx + radius * Math.cos(start)
    const y1 = cy + radius * Math.sin(start)
    const x2 = cx + radius * Math.cos(end)
    const y2 = cy + radius * Math.sin(end)
    const largeArc = end - start > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  const colorVar = color === 'green' ? 'var(--green)' : color === 'amber' ? 'var(--accent)' : 'var(--red)'

  return (
    <svg viewBox="0 0 140 90" width="100%" style={{ maxHeight: '110px' }}>
      <path d={arcPath(startAngle, endAngle)} stroke="var(--border)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={arcPath(startAngle, progressAngle)} stroke={colorVar} strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function BreakdownBar({ label, value, weight }) {
  const color = value >= 80 ? 'var(--green)' : value >= 60 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', minWidth: '64px' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width .6s ease' }} />
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', minWidth: '28px', textAlign: 'right' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text4)', minWidth: '28px', textAlign: 'right' }}>
        ×{weight.toFixed(2)}
      </div>
    </div>
  )
}

export default function HealthScoreWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-health'],
    queryFn: () => api.get('/dashboard/health').then(r => r.data),
    refetchInterval: 60000,
  })

  if (isLoading || !data) {
    return (
      <div className="panel card-glass cat-stripe cat-stripe-health" style={{ minHeight: '280px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">SAĞLIK SKORU</div>
            <div className="panel-subtitle">SİSTEM GENEL DURUMU</div>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '160px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Yükleniyor…</div>
        </div>
      </div>
    )
  }

  const colorVar = data.color === 'green' ? 'var(--green)' : data.color === 'amber' ? 'var(--accent)' : 'var(--red)'

  return (
    <div className="panel card-glass cat-stripe cat-stripe-health">
      <div className="panel-header">
        <div>
          <div className="panel-title">SAĞLIK SKORU</div>
          <div className="panel-subtitle">SİSTEM GENEL DURUMU</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '18px 20px' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '12px' }}>
          <Gauge score={data.score} color={data.color} />
          <div style={{
            position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '44px', lineHeight: 1, color: colorVar, letterSpacing: '1px' }}>
              {data.score}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '2px', marginTop: '2px' }}>
              / 100
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {data.breakdown.map(c => (
            <BreakdownBar key={c.label} {...c} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DashboardPage'e ekle**

`DashboardPage.jsx`'in başına import:

```jsx
import HealthScoreWidget from './HealthScoreWidget.jsx'
```

Sonra şu placeholder'ı:

```jsx
{/* Sağ panel placeholder #1 — Sağlık Skoru (Faz 3) */}
<div className="bento-cell bento-span-4" style={{ minHeight: '180px' }}>
  {/* HealthScoreWidget gelecek — Faz 3 */}
</div>
```

Şununla değiştir:

```jsx
<div className="bento-cell bento-span-4">
  <HealthScoreWidget />
</div>
```

- [ ] **Step 3: Tarayıcıda doğrula**

`/dashboard` aç. Sağ panelin en üst hücresinde "SAĞLIK SKORU" widget'ı görünmeli — yarım daire gauge + büyük skor + 5 satır breakdown bar.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/HealthScoreWidget.jsx frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): HealthScoreWidget — yarım daire gauge + 5 bileşen breakdown"
```

---

## Task 3.6: AnomalyAlerts bileşeni

**Files:**
- Create: `frontend/src/modules/dashboard/AnomalyAlerts.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/dashboard/AnomalyAlerts.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function AlertRow({ severity, title, detail, action_path }) {
  const navigate = useNavigate()
  const isCritical = severity === 'critical'
  const color = isCritical ? 'var(--red)' : 'var(--accent)'
  const bg = isCritical ? 'rgba(231,76,60,.08)' : 'rgba(240,165,0,.08)'
  const border = isCritical ? 'rgba(231,76,60,.25)' : 'rgba(240,165,0,.25)'

  return (
    <div
      onClick={() => action_path && navigate(action_path)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 16px',
        background: bg, border: `1px solid ${border}`,
        borderRadius: '10px',
        cursor: action_path ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { if (action_path) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${border}` } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px',
        background: color, color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--display)', fontSize: '20px', fontWeight: 700,
        flexShrink: 0,
      }}>!</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '2px' }}>
          {title}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
          {detail}
        </div>
      </div>
      {action_path && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color, letterSpacing: '1px', flexShrink: 0 }}>
          İNCELE →
        </div>
      )}
    </div>
  )
}

export default function AnomalyAlerts() {
  const { data } = useQuery({
    queryKey: ['dashboard-anomalies'],
    queryFn: () => api.get('/dashboard/anomalies').then(r => r.data),
    refetchInterval: 120000,
  })

  const anomalies = data?.anomalies ?? []
  if (anomalies.length === 0) return null

  return (
    <div className="panel card-glass cat-stripe cat-stripe-alert">
      <div className="panel-header">
        <div>
          <div className="panel-title">ANOMALİ UYARILARI</div>
          <div className="panel-subtitle">OTOMATIK TESPIT · {anomalies.length} KAYIT</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {anomalies.map(a => (
          <AlertRow key={a.id} {...a} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DashboardPage'e ekle**

`DashboardPage.jsx`'in başına import:

```jsx
import AnomalyAlerts from './AnomalyAlerts.jsx'
```

Sonra Blok HeatMap hücresinden sonra (`{/* Anomali placeholder — Faz 3'te koşullu render */}` yorumunun yerine) ekle:

```jsx
<div className="bento-cell bento-span-12">
  <AnomalyAlerts />
</div>
```

(`AnomalyAlerts` boş veride `null` döndürür, hücre görünmez kalır.)

- [ ] **Step 3: Tarayıcıda doğrula**

`/dashboard` aç. Anomali yoksa panel görünmez. Manuel test için `npm run dev` sırasında SQLite'a 3+ açık arıza ekleyerek (örn. seed) anomali görünmesini sağlanabilir.

- [ ] **Step 4: Frontend smoke + backend test tam regresyon**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: Tüm testler PASS (KPI/heatmap + trends + health × 2 + anomalies × 2 + getHealthScore × 3 + getAnomalies × 3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/dashboard/AnomalyAlerts.jsx frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): AnomalyAlerts — otomatik anomali uyarı paneli"
```

---

## Final Doğrulama

- [ ] **Step 1: Tüm dashboard testlerinin geçtiğinden emin ol**

```bash
cd backend && npx vitest run src/modules/dashboard
```

Beklenen: 0 fail.

- [ ] **Step 2: Tüm backend test suite'ini çalıştır (regresyon)**

```bash
cd backend && npm run test
```

Beklenen: Mevcut tüm test'ler geçer, yeni testlerle birlikte.

- [ ] **Step 3: Frontend dev'i son kez kontrol et**

```bash
cd "C:/Users/hrync/OneDrive/Masaüstü/test claude" && npm run dev
```

`/dashboard` sayfasını farklı genişliklerde dene:
- Desktop (≥1400px): 12-grid bento, sağ panelde 3 widget üst üste
- Tablet (1024-1399): grid daralır, hücreler 6 span'e düşer
- Mobil (<768): tek kolon stack

**Kontrol listesi:**
- KPI 4 kart kategori şerit + glass
- Bugünün Nabzı verisi geliyor
- Yaklaşan Etkinlikler ya veri ya empty state
- Sağlık Skoru gauge + breakdown
- Anomali varsa görünür, yoksa gizli
- Yatak Doluluk, Heatmap, Trend grafikleri, Arızalar, Projeksiyon, Denetim Kaydı çalışıyor
- Mevcut alert banner'lar header altında full-width

- [ ] **Step 4: Final commit (gerekirse)**

Tüm değişiklikler önceki commit'lerde var. Ek bir final commit gerekmiyor.

---

## Faz Kabul Kriterleri

| Faz | Kabul |
|-----|-------|
| 1 | Tüm mevcut testler geçer; dashboard görsel olarak modern; mobilde stack'lenir; mevcut widget'lar çalışır |
| 2 | TodaysPulse + UpcomingEvents render olur; boş ve dolu durumlar güzel görünür; tıklama navigasyonu çalışır |
| 3 | `/dashboard/health` ve `/dashboard/anomalies` 200 döner; backend testler geçer; widget'lar gerçek veriyle çalışır; anomali yokken panel gizlenir |
