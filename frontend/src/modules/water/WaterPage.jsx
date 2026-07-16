import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { inputDialog } from '../../shared/components/InputDialog.jsx'
import DailyDistributionModal from './components/DailyDistributionModal.jsx'
import TruckArrivalPanel from './components/TruckArrivalPanel.jsx'
import WaterBoard from './components/WaterBoard.jsx'
import WaterCollapsiblePanel from './components/WaterCollapsiblePanel.jsx'
import WaterDailyDigestPanel from './components/WaterDailyDigestPanel.jsx'
import WaterExpiryPanel from './components/WaterExpiryPanel.jsx'
import WaterModal from './components/WaterModal.jsx'
import WaterQueryErrorCenter from './components/WaterQueryErrorCenter.jsx'
import ZoneHistoryModal from './components/ZoneHistoryModal.jsx'
import {
  availableUnitsForProduct,
  baseUnitForProduct,
  coerceUnitForProduct,
  defaultUnitForProduct,
  exactBaseQuantity,
  humanQty,
  multiplier,
  productInputUnit,
  smartQty,
  unitOptionsForProduct,
} from './logic/waterUnits.js'
import { invalidateWaterQueries } from './logic/waterQueryInvalidation.js'
import { calcText, dateRange, dayShort, nf, todayStr } from './logic/waterUi.js'

const toastOk = (m) => useToastStore.getState().addToast(m, 'success')
const toastErr = (m) => useToastStore.getState().addToast(m, 'error')
const errMsg = (e, f) => e?.response?.data?.error || e?.message || f

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const pad2 = (n) => String(n).padStart(2, '0')
const monthBounds = (y, m) => {
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(last)}`, label: `${MONTHS_TR[m - 1]} ${y}` }
}
// ─────────────────────────── ANA SAYFA (tek ekran pano) ───────────────────────────
export default function WaterPage() {
  const now = new Date()
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const [modal, setModal] = useState(null) // 'settings' | 'text' | 'adjust' | null
  const [truckFocus, setTruckFocus] = useState({ seq: 0, mode: 'new' })
  const [selectedZone, setSelectedZone] = useState(null)
  const { from, to, label } = monthBounds(ym.y, ym.m)

  const summaryQuery = useQuery({
    queryKey: ['water-summary', from, to],
    queryFn: () => api.get('/water/summary', { params: { from, to } }).then(r => r.data),
  })
  const summary = summaryQuery.data

  const shiftMonth = (delta) => setYm(({ y, m }) => {
    const idx = (y * 12 + (m - 1)) + delta
    return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
  })
  const t = summary?.totals
  const lowItems = useMemo(() => (summary?.stock || []).filter(item => item.low), [summary?.stock])

  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">SU TAKİP</div><div className="sect-line" /></div>

      <WaterQueryErrorCenter />

      <AlertBand />

      <WaterDailyDigestPanel />

      <WaterExpiryPanel />

      <ReviewPanel />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '3px 4px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px' }}>‹</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '120px', textAlign: 'center', fontWeight: 600 }}>{label}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} style={{ padding: '4px 8px' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('text')}>📝 Metinden</button>
          {isManager && <button className="btn btn-ghost btn-sm" onClick={() => setModal('adjust')}>🛠 Düzeltme</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('settings')}>⚙ Ayarlar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'center', marginBottom: '16px', borderTop: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderRight: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderBottom: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderLeft: '5px solid var(--teal)', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 7%, var(--surface))', padding: '12px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13px' }}>PERSONEL / TIR GİRİŞİ VE MAİL DOSYASI</strong>
            <span className="badge badge-green">PDF</span>
            <span className="badge badge-blue">EXCEL</span>
            <span className="badge badge-amber">PNG</span>
          </div>
          <div style={{ color: 'var(--text2)', fontSize: '11px', marginTop: '4px' }}>Tırcı bilgilerini gir, ana merkez mailini hazırla ve aynı kaydı üç formatta indir.</div>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setTruckFocus({ seq: Date.now(), mode: 'new' })}>Yeni Giriş Hazırla</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setTruckFocus({ seq: Date.now(), mode: 'records' })}>Kayıt ve Çıktılar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          ['Ay Dağıtım', t?.period_out, 'var(--accent)'],
          ['Gelen (Tır)', t?.period_in, 'var(--green)'],
          ['Ay Farkı', t?.period_net, (t?.period_net || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Kalan Stok', t?.balance, (t?.balance || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Eksi Stok', t?.deficit_total, (t?.deficit_total || 0) > 0 ? 'var(--red)' : 'var(--text3)'],
          ['Boş İade', t?.period_return, 'var(--text)'],
        ].map(([lbl, val, color]) => (
          <div key={lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, marginTop: '2px' }}>{summaryQuery.isError ? '—' : nf(val)}</div>
          </div>
        ))}
      </div>

      <WaterBoard from={from} to={to} label={label} lowItems={lowItems} onOpenZone={setSelectedZone} />

      {selectedZone && (
        <ZoneHistoryModal zone={selectedZone} from={from} to={to} label={label} onClose={() => setSelectedZone(null)} />
      )}

      <ForecastPanel />

      <PendingWaybillPanel />

      <TruckArrivalPanel from={from} to={to} label={label} focusRequest={truckFocus} />

      <MonthClosurePanel month={`${ym.y}-${String(ym.m).padStart(2, '0')}`} label={label} />

      <MonthlyReportPanel summary={summary} from={from} to={to} label={label} />

      <TrendPanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <GelenTirPanel from={from} to={to} label={label} stockItems={summary?.stock || []} />
        <BosIadePanel from={from} to={to} deposit={summary?.deposit || []} />
      </div>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'text' && <TextModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} />}
    </div>
  )
}

// ─────────────────────────── Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ───────────────────────────
function AlertBand() {
  const [open, setOpen] = useState(null) // hangi kategori açık
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-alerts', today],
    queryFn: () => api.get('/water/alerts', { params: { today } }).then(r => r.data),
    refetchInterval: 60000,
  })

  const s = data?.summary
  if (!data) return null
  if (!s || s.total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' }}>
        <span style={{ color: 'var(--green)', fontSize: '15px' }}>✓</span>
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Bugün için bekleyen operasyon işi yok — her şey güncel.</span>
      </div>
    )
  }

  const lotStatusLabel = { expired: 'SKT geçti', expiring: 'SKT yaklaşıyor', quarantined: 'karantina', missing: 'SKT eksik' }
  const CARDS = [
    { key: 'pending', icon: '🧾', label: 'İrsaliye Bekleyen', count: s.pending, color: 'var(--accent)', items: data.pending_waybill,
      render: (it) => `${it.product_name} — ${it.unallocated_human} (${it.count} kayıt, ${it.waiting_days} gün)` },
    { key: 'negative', icon: '⚠️', label: 'Eksi Stok', count: s.negative, color: 'var(--red)', items: data.negative_stock,
      render: (it) => `${it.product_name} — ${it.balance_human}` },
    { key: 'over', icon: '📉', label: 'Ay Dağıtım > Gelen', count: s.over, color: 'var(--red)', items: data.over_distributed,
      render: (it) => `${it.product_name} — dağıtılan ${it.period_out_human}, gelen ${it.period_in_human} (fazla ${it.diff_human})` },
    { key: 'low', icon: '🔽', label: 'Düşük Stok', count: s.low, color: 'var(--amber, #d97706)', items: data.low_stock,
      render: (it) => `${it.product_name} — kalan ${it.balance_human} (eşik ${it.min_human})` },
    { key: 'lots', icon: 'SKT', label: 'Lot / SKT', count: s.lot_critical, color: 'var(--red)', items: data.lot_alerts,
      render: (it) => `${it.product_name} — ${it.lot_no || 'lot yok'} · ${lotStatusLabel[it.health] || it.health} · ${it.remaining_human}` },
    { key: 'idle', icon: '🕳', label: 'Bugün Kayıtsız Bölge', count: s.idle_zones, color: 'var(--text3)', items: data.idle_zones,
      render: (it) => it.zone_name },
  ].filter(c => c.count > 0)

  const active = CARDS.find(c => c.key === open)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)' }}>BUGÜN YAPILACAKLAR</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>· {data.date}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
        {CARDS.map(c => {
          const isOpen = open === c.key
          return (
            <button key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
              style={{ textAlign: 'left', cursor: 'pointer', background: isOpen ? 'var(--surface2)' : 'var(--surface)',
                borderTop: `1px solid ${isOpen ? c.color : 'var(--border)'}`,
                borderRight: `1px solid ${isOpen ? c.color : 'var(--border)'}`,
                borderBottom: `1px solid ${isOpen ? c.color : 'var(--border)'}`,
                borderLeft: `3px solid ${c.color}`,
                borderRadius: '10px', padding: '10px 12px', transition: 'border-color .15s' }}
              title="Detayı aç/kapat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>{c.icon}</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: '22px', color: c.color }}>{c.count}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{c.label}</div>
            </button>
          )
        })}
      </div>
      {active && (
        <div style={{ marginTop: '10px', background: 'var(--surface)', borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
          borderLeft: `3px solid ${active.color}`, borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', marginBottom: '6px' }}>
            {active.icon} {active.label} ({active.count})
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {active.items.map((it, i) => (
              <li key={it.product_id ?? it.zone_id ?? i} style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {active.render(it)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── ANA PANO — INDEX matris + günlük giriş ───────────────────────────


// ─────────────────────────── Onay Akışı (kontrol bekleyen eksi stok) ───────────────────────────
function ReviewPanel() {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['water-review'],
    queryFn: () => api.get('/water/review').then(r => r.data),
    refetchInterval: 60000,
  })
  const rows = data?.rows || []
  const approve = useMutation({
    mutationFn: ({ ids, note }) => api.post('/water/review/approve', { ids, note }),
    onSuccess: (r) => { invalidateWaterQueries(qc, 'review'); toastOk(`${r.data.approved} kayıt onaylandı ✓`) },
    onError: (e) => toastErr(errMsg(e, 'Onaylanamadı')),
  })
  const approveWithNote = async (ids) => {
    const note = await inputDialog({
      title: ids ? 'İstisna Onayı' : 'Toplu İstisna Onayı',
      body: 'Stok karşılığı olmayan dağıtımın neden onaylandığını yazın. Bu gerekçe denetim geçmişinde saklanır.',
      placeholder: 'Örn. Acil saha ihtiyacı; irsaliye sonradan işlenecek',
      confirmLabel: 'Gerekçeyle Onayla',
    })
    if (note == null) return
    const reason = note.trim()
    if (reason.length < 3) return toastErr('Onay gerekçesi en az 3 karakter olmalı')
    approve.mutate({ ids, note: reason })
  }
  if (!data || rows.length === 0) return null

  return (
    <WaterCollapsiblePanel
      id="water-review-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      openLabel="Listele"
      className=""
      headerClassName=""
      headerStyle={{ display: 'flex', flexWrap: 'wrap' }}
      headerLead={(
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px' }}>🔎</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{rows.length} eksi stok dağıtımı kontrol bekliyor</span>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>stok karşılığı olmadan girildi</span>
        </div>
      )}
      afterToggle={isManager && (
        <button type="button" className="btn btn-primary btn-sm" disabled={approve.isPending} onClick={() => approveWithNote(null)}>✓ Toplu Onayla</button>
      )}
      style={{ marginBottom: '16px', background: 'color-mix(in srgb, var(--red) 8%, var(--surface))', border: '1px solid var(--red)', borderLeft: '3px solid var(--red)', borderRadius: '10px', padding: '10px 14px' }}
    >
      <div style={{ marginTop: '8px', overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: '640px' }}>
            <thead><tr>{['Tarih', 'Bölge', 'Ürün', 'Miktar', 'Karşılıksız', 'Giren', isManager ? '' : null].filter(h => h !== null).map((h, i) => <th key={i} style={{ textAlign: ['Tarih', 'Bölge', 'Ürün', 'Giren'].includes(h) ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.movement_id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                  <td>{r.zone_name}</td>
                  <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.qty_human}>{nf(r.qty_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }} title={r.unallocated_human}>{nf(r.unallocated_base)}</td>
                  <td style={{ color: 'var(--text3)' }}>{r.created_by_name || '—'}</td>
                  {isManager && <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" disabled={approve.isPending} onClick={() => approveWithNote([r.movement_id])}>Onayla</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </WaterCollapsiblePanel>
  )
}

// ─────────────────────────── Tüketim Öngörüsü & Sipariş Önerisi (V1) ───────────────────────────
function ForecastPanel() {
  const [open, setOpen] = useState(false)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-forecast', today],
    queryFn: () => api.get('/water/forecast', { params: { today } }).then(r => r.data),
  })
  const rows = data?.rows || []
  const orders = data?.order_suggestions || []
  const t = data?.totals || { order_count: 0, overdue_order_count: 0, due_soon_order_count: 0, soon_count: 0 }
  const withData = useMemo(() => [...rows].filter(r => r.days_of_cover != null).sort((a, b) => a.days_of_cover - b.days_of_cover), [rows])
  if (!data || (withData.length === 0 && orders.length === 0)) return null

  const coverColor = (d) => d == null ? 'var(--text3)' : d <= 7 ? 'var(--red)' : d <= 14 ? 'var(--amber, #d97706)' : 'var(--green)'
  const urgencyColor = (urgency) => urgency === 'overdue' ? 'var(--red)' : urgency === 'due_soon' ? 'var(--amber, #d97706)' : urgency === 'insufficient_data' ? 'var(--text3)' : 'var(--green)'
  const orderDateLabel = (row) => row.order_urgency === 'insufficient_data'
    ? 'veri az'
    : row.order_urgency === 'overdue'
    ? `${Math.abs(row.order_due_in_days)}g gecikti`
    : row.order_urgency === 'due_soon'
      ? `${row.order_due_in_days}g kaldı`
      : row.order_by_date || '—'
  return (
    <WaterCollapsiblePanel
      id="water-forecast-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title="📉 SİPARİŞ ÖNERİLERİ & GÜN-YETER"
      subtitle={<>{t.order_count > 0 ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t.order_count} ürün sipariş bekliyor</span> : 'sipariş gerekmiyor'}{t.overdue_order_count > 0 ? <> · <span style={{ color: 'var(--red)', fontWeight: 700 }}>{t.overdue_order_count} gecikmiş</span></> : null} · {t.soon_count} ürün 7 günden az · ürün bazlı tedarik süresine göre</>}
      style={{ marginTop: '16px', borderTop: `3px solid ${t.order_count ? 'var(--red)' : 'var(--teal)'}` }}
    >
          {orders.length > 0 && (
            <div style={{ padding: '0 0 10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', marginBottom: '6px' }}>ÖNERİLEN SİPARİŞLER</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orders.map(o => (
                  <span key={o.product_id} style={{ fontSize: '11px', border: '1px solid var(--red)', background: 'color-mix(in srgb, var(--red) 8%, transparent)', borderRadius: '8px', padding: '4px 9px' }}>
                    {o.brand_name ? `${o.brand_name} · ` : ''}<b>{o.product_name}</b> → {o.suggested_human}{' '}
                    <span style={{ color: urgencyColor(o.order_urgency), fontWeight: 700 }}>({orderDateLabel(o)})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: '900px' }}>
              <thead><tr>{['Ürün', 'Bakiye', 'Günlük ort.', 'Gün yeter', 'Tedarik + emniyet', 'Sipariş son günü', 'Tahmini bitiş', 'Öneri'].map((h, i) => <th key={i} style={{ textAlign: h === 'Ürün' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {withData.map(r => (
                  <tr key={r.product_id}>
                    <td style={{ fontWeight: 600 }}>{r.product_name}{r.confidence === 'low' && <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>(az veri)</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.balance_human}>{nf(r.balance)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.avg_daily}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: coverColor(r.days_of_cover) }}>{r.days_of_cover}g</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{r.lead_time_days}g + {r.safety_stock_days}g</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: r.needs_order ? 700 : 500, color: urgencyColor(r.order_urgency) }} title={r.order_by_date || ''}>{orderDateLabel(r)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.stockout_date || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: r.needs_order ? 'var(--red)' : 'var(--text3)' }}>{r.needs_order ? r.suggested_human : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </WaterCollapsiblePanel>
  )
}

// ─────────────────────────── İrsaliye Bekleyenler (eşleşmemiş dağıtımlar) ───────────────────────────
function PendingWaybillPanel() {
  const [open, setOpen] = useState(false)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-pending', today],
    queryFn: () => api.get('/water/pending', { params: { today } }).then(r => r.data),
    refetchInterval: 60000,
  })
  const rows = data?.rows || []
  const t = data?.totals || { count: 0, overdue: 0 }
  if (t.count === 0) return null // hiç bekleyen yoksa gizle (AlertBand zaten "güncel" der)

  return (
    <WaterCollapsiblePanel
      id="water-pending-waybill-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title={`🧾 İRSALİYE BEKLEYEN DAĞITIMLAR (${t.count})`}
      subtitle={<>{t.overdue > 0 ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t.overdue} tanesi 3+ gündür bekliyor</span> : 'hepsi taze'} · yeni irsaliye girince otomatik kapanır</>}
      style={{ marginTop: '16px', borderTop: `3px solid ${t.overdue ? 'var(--red)' : 'var(--accent)'}` }}
    >
      <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: '820px' }}>
            <thead>
              <tr>
                {['Tarih', 'Bölge', 'Ürün', 'Dağıtılan', 'Eşleşen', 'Bekleyen', 'Gün', 'İrsaliye'].map(h => (
                  <th key={h} style={{ textAlign: ['Tarih', 'Bölge', 'Ürün'].includes(h) ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.movement_id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                  <td>{r.zone_name}</td>
                  <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.qty_human}>{nf(r.qty_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }} title={r.allocated_human}>{r.allocated_base ? nf(r.allocated_base) : '·'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }} title={r.unallocated_human}>{nf(r.unallocated_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: r.severity === 'overdue' ? 700 : 400, color: r.severity === 'overdue' ? 'var(--red)' : 'var(--text2)' }}>{r.waiting_days}g</td>
                  <td style={{ fontSize: '10px', color: 'var(--text3)' }}>{r.source_waybills || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </WaterCollapsiblePanel>
  )
}

// ─────────────────────────── Ay Sonu Kapanış / Uyuşturma ───────────────────────────
const STATUS_META = {
  pending: { label: 'Sayım yok', color: 'var(--text3)' },
  even: { label: 'Tuttu', color: 'var(--green)' },
  over: { label: 'Fazla', color: 'var(--teal)' },
  short: { label: 'Eksik', color: 'var(--red)' },
}
function MonthClosurePanel({ month, label }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isManager = user?.role === 'campus_manager'
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState({}) // product_id -> { counted, reason, note }

  const { data } = useQuery({
    queryKey: ['water-reconciliation', month],
    queryFn: () => api.get('/water/reconciliation', { params: { month } }).then(r => r.data),
    enabled: open,
  })
  const rows = data?.rows || []
  const reasons = data?.reasons || []
  const locked = !!data?.locked
  const t = data?.totals

  const saveCount = useMutation({
    mutationFn: (body) => api.post('/water/stock-count', body),
    onSuccess: (_r, body) => {
      invalidateWaterQueries(qc, 'reconciliation')
      setDrafts(prev => { const n = { ...prev }; delete n[body.product_id]; return n })
      toastOk('Sayım kaydedildi')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const closeMonth = useMutation({
    mutationFn: () => api.post('/water/monthly-close', { month }),
    onSuccess: () => { invalidateWaterQueries(qc, 'reconciliation'); toastOk(`${label} kapatıldı 🔒`) },
    onError: (e) => toastErr(errMsg(e, 'Kapatılamadı')),
  })
  const unlockMonth = useMutation({
    mutationFn: () => api.post(`/water/monthly-close/${month}/unlock`),
    onSuccess: () => { invalidateWaterQueries(qc, 'reconciliation'); toastOk(`${label} kilidi açıldı 🔓`) },
    onError: (e) => toastErr(errMsg(e, 'Açılamadı')),
  })

  const setDraft = (pid, patch) => setDrafts(prev => ({ ...prev, [pid]: { ...prev[pid], ...patch } }))

  const commit = (row) => {
    if (locked) return toastErr(`${label} kilitli; sayımı değiştirmek için önce kilidi açın`)
    const d = drafts[row.product_id] || {}
    if (d.counted == null || String(d.counted).trim() === '') return
    const counted = Number(String(d.counted).replace(',', '.'))
    if (!Number.isFinite(counted) || counted < 0) return toastErr('Geçersiz sayım miktarı')
    const diff = counted - row.system_base
    const reason = d.reason ?? row.reason
    if (diff !== 0 && !reason) return toastErr(`${row.product_name}: fark var — sebep seçin`)
    saveCount.mutate({ month, product_id: row.product_id, counted_qty: counted, counted_unit: 'adet', reason: diff !== 0 ? reason : undefined, note: d.note })
  }

  const askClose = async () => {
    if (await confirmDialog({ title: `${label} kapatılsın mı?`, message: 'Ay kilitlenir; bu aya yeni kayıt ekleme, mevcut kaydı değiştirme ve silme işlemleri engellenir. Gerekirse önce kilidi açabilirsiniz.', confirmText: 'Ayı Kilitle' })) closeMonth.mutate()
  }
  const downloadPdf = async () => {
    try {
      const r = await api.get(`/water/reconciliation/${month}/pdf`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(r.data)
      a.download = `su-ay-kapanis-${month}.pdf`; a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('PDF oluşturulamadı') }
  }

  return (
    <WaterCollapsiblePanel
      id={`water-month-closure-${month}`}
      open={open}
      onToggle={() => setOpen(value => !value)}
      title={<>AY KAPANIŞI — {label} {locked && <span style={{ color: 'var(--red)', fontSize: '12px' }}>🔒 KİLİTLİ</span>}</>}
      subtitle="Sistem kalanı vs fiziksel sayım — fark + açıklama + kilit"
      afterToggle={<>
        {open && <button type="button" className="btn btn-ghost btn-sm" onClick={downloadPdf}>📄 PDF Özet</button>}
        {open && isManager && (locked
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => unlockMonth.mutate()}>🔓 Kilidi Aç</button>
          : <button type="button" className="btn btn-primary btn-sm" onClick={askClose}>🔒 Ayı Kilitle</button>)}
      </>}
      style={{ marginTop: '16px', borderTop: `3px solid ${locked ? 'var(--red)' : 'var(--amber, #d97706)'}` }}
    >
          {locked && (
            <div role="status" style={{ marginBottom: '10px', padding: '9px 11px', border: '1px solid rgba(239,68,68,.35)', borderRadius: '6px', background: 'rgba(239,68,68,.07)', color: 'var(--red)', fontSize: '11px', fontWeight: 600 }}>
              Bu ay kilitli. Kayıtlar ve fiziksel sayımlar yalnız kilit açıldıktan sonra değiştirilebilir.
            </div>
          )}
          {t && (
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', margin: '4px 0 12px', fontSize: '11px', color: 'var(--text2)' }}>
              <span>{t.products} ürün</span>
              <span>· {t.counted} sayıldı</span>
              <span style={{ color: t.pending ? 'var(--amber, #d97706)' : 'var(--text3)' }}>· {t.pending} bekliyor</span>
              <span style={{ color: t.mismatch ? 'var(--red)' : 'var(--green)' }}>· {t.mismatch} farklı</span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: '900px' }}>
              <thead>
                <tr>
                  {['Marka', 'Ürün', 'Devreden', 'Gelen', 'Dağıtılan', 'Düzeltme', 'Boş İade', 'Sistem', 'Sayım', 'Fark', 'Sebep', 'Durum'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Marka' || h === 'Ürün' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const d = drafts[row.product_id] || {}
                  const draftCounted = d.counted != null && String(d.counted).trim() !== '' ? Number(String(d.counted).replace(',', '.')) : null
                  const effCounted = draftCounted != null ? draftCounted : row.counted_base
                  const diff = effCounted == null || !Number.isFinite(effCounted) ? row.diff_base : effCounted - row.system_base
                  const hasDiff = diff != null && diff !== 0
                  const meta = STATUS_META[diff == null ? 'pending' : diff === 0 ? 'even' : diff > 0 ? 'over' : 'short']
                  return (
                    <tr key={row.product_id}>
                      <td style={{ color: 'var(--text3)' }}>{row.brand_name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{row.product_name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={row.opening_human}>{nf(row.opening_base)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }} title={row.month_in_human}>{nf(row.month_in)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }} title={row.month_out_human}>{nf(row.month_out)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.month_adjust ? (row.month_adjust > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)' }} title={row.month_adjust_human || ''}>{row.month_adjust ? (row.month_adjust > 0 ? '+' : '') + nf(row.month_adjust) : '·'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }} title={row.month_return_human}>{row.month_return ? nf(row.month_return) : '·'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }} title={row.system_human}>{nf(row.system_base)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input aria-label={`${row.product_name} sayım`} inputMode="decimal"
                          disabled={locked}
                          defaultValue={row.counted_base ?? ''}
                          onChange={e => setDraft(row.product_id, { counted: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') commit(row) }}
                          onBlur={() => commit(row)}
                          style={{ width: '68px', textAlign: 'right', fontFamily: 'var(--mono)', padding: '2px 4px', background: locked ? 'var(--surface)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: locked ? 'var(--text3)' : 'var(--text)', cursor: locked ? 'not-allowed' : undefined }} />
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: hasDiff ? 'var(--red)' : 'var(--text3)' }}>{diff == null ? '·' : nf(diff)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {hasDiff ? (
                          <select aria-label={`${row.product_name} sebep`} value={d.reason ?? row.reason ?? ''}
                            disabled={locked}
                            onChange={e => setDraft(row.product_id, { reason: e.target.value })}
                            style={{ fontSize: '10px', padding: '2px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text)', maxWidth: '110px' }}>
                            <option value="">— seç —</option>
                            {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: meta.color }}>{meta.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
    </WaterCollapsiblePanel>
  )
}

// ─────────────────────────── Trend & Analiz (V2) ───────────────────────────
function TrendPanel() {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(6)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-trends', today, months],
    queryFn: () => api.get('/water/trends', { params: { today, months } }).then(r => r.data),
    enabled: open,
  })
  const monthly = data?.monthly || []
  const zones = data?.zones || []
  const products = data?.products || []
  const maxFlow = Math.max(1, ...monthly.map(m => Math.max(m.in_base, m.out_base)))
  const maxZone = Math.max(1, ...zones.map(z => z.total))

  return (
    <WaterCollapsiblePanel
      id="water-trend-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title="📈 TREND & ANALİZ"
      subtitle="aylık gelen/dağıtım + en çok tüketen bölge/ürün"
      beforeToggle={open && (
        <select className="form-select" aria-label="Dönem" value={months} onChange={e => setMonths(+e.target.value)} style={{ fontSize: '12px', width: 'auto' }}>
          {[3, 6, 12].map(m => <option key={m} value={m}>Son {m} ay</option>)}
        </select>
      )}
      style={{ marginTop: '16px', borderTop: '3px solid var(--teal)' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px', paddingTop: '4px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>AYLIK GELEN / DAĞITIM</div>
            {monthly.map(m => (
              <div key={m.month} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)' }}><span style={{ fontFamily: 'var(--mono)' }}>{m.month}</span><span>↓{nf(m.in_base)} · ↑{nf(m.out_base)}</span></div>
                <div style={{ height: '9px', marginTop: '2px' }}><div style={{ width: `${(m.in_base / maxFlow) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: '2px' }} /></div>
                <div style={{ height: '9px', marginTop: '2px' }}><div style={{ width: `${(m.out_base / maxFlow) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '2px' }} /></div>
              </div>
            ))}
            {monthly.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Veri yok</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK TÜKETEN BÖLGELER</div>
            {zones.map(z => (
              <div key={z.zone_id} style={{ marginBottom: '7px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ fontWeight: 600 }}>{z.zone_name}</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{nf(z.total)}</span></div>
                <div style={{ height: '8px', background: 'var(--surface2)', borderRadius: '3px', marginTop: '2px' }}><div style={{ width: `${(z.total / maxZone) * 100}%`, height: '100%', background: 'var(--teal)', borderRadius: '3px' }} /></div>
              </div>
            ))}
            {zones.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Veri yok</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK DAĞITILAN ÜRÜNLER</div>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {products.map(p => (
                  <tr key={p.product_id}>
                    <td>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.out_human || nf(p.out)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td style={{ color: 'var(--text3)' }}>Veri yok</td></tr>}
              </tbody>
            </table>
          </div>
      </div>
    </WaterCollapsiblePanel>
  )
}

function MonthlyReportPanel({ summary, from, to, label }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const dailyMap = useMemo(() => {
    const m = new Map()
    ;(summary?.daily || []).forEach(d => m.set(d.move_date, d))
    return m
  }, [summary])
  const days = useMemo(() => dateRange(from, to), [from, to])
  const maxFlow = Math.max(1, ...(summary?.daily || []).map(d => Math.max(d.in_base || 0, d.out_base || 0)))
  const topZones = useMemo(() => {
    const m = new Map()
    ;(summary?.zones || []).forEach(z => {
      const cur = m.get(z.zone_id) || { zone_id: z.zone_id, zone_name: z.zone_name, total: 0, products: [] }
      cur.total += z.total_out || 0
      cur.products.push(`${z.product_name}: ${nf(z.total_out)}`)
      m.set(z.zone_id, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [summary])
  const stock = summary?.stock || []
  const totals = summary?.totals || {}
  const reconcileRows = useMemo(() => [...stock].sort((a, b) => {
    const aRisk = (a.negative ? 2 : 0) + (a.period_net < 0 ? 1 : 0)
    const bRisk = (b.negative ? 2 : 0) + (b.period_net < 0 ? 1 : 0)
    return bRisk - aRisk || Math.abs(b.period_net || 0) - Math.abs(a.period_net || 0)
  }), [stock])
  const busyDays = useMemo(() => days.map(iso => ({ iso, ...(dailyMap.get(iso) || { in_base: 0, out_base: 0 }) }))
    .filter(d => (d.in_base || 0) > 0 || (d.out_base || 0) > 0)
    .sort((a, b) => b.iso.localeCompare(a.iso)), [days, dailyMap])

  return (
    <>
    <div className="panel" style={{ marginTop: '16px', borderTop: '3px solid var(--teal)' }}>
      <div className="panel-header" style={{ alignItems: 'flex-start', gap: '10px' }}>
        <div>
          <div className="panel-title">AYLIK RAPOR — {label}</div>
          <div className="panel-subtitle">Gün gün akış, eldeki stok ve bölge dağıtım özeti</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: '8px', marginLeft: 'auto', minWidth: '360px' }}>
          {[
            ['Gelen', totals.period_in, 'var(--green)'],
            ['Dağıtım', totals.period_out, 'var(--accent)'],
            ['Ay Farkı', totals.period_net, (totals.period_net || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
            ['Stok', totals.balance, (totals.balance || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
            ['Eksi', totals.deficit_total, (totals.deficit_total || 0) > 0 ? 'var(--red)' : 'var(--text3)'],
          ].map(([name, value, color]) => (
            <div key={name} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', padding: '7px 9px', borderRadius: '8px', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{name}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color }}>{nf(value)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .9fr)', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>GÜNLÜK ÇİZELGE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: '7px' }}>
            {days.map(iso => {
              const d = dailyMap.get(iso) || { in_base: 0, out_base: 0 }
              const hasIn = (d.in_base || 0) > 0
              const hasOut = (d.out_base || 0) > 0
              const intensity = Math.min(1, Math.max(d.in_base || 0, d.out_base || 0) / maxFlow)
              return (
                <button
                  key={iso}
                  type="button"
                  data-testid={`water-day-${iso}`}
                  onClick={() => setSelectedDay(iso)}
                  title={`${iso} · gelen ${nf(d.in_base)} · dağıtım ${nf(d.out_base)}`}
                  style={{
                    minHeight: '74px',
                    border: `1px solid ${hasIn || hasOut ? 'rgba(20,184,166,.55)' : 'var(--border)'}`,
                    borderLeft: `4px solid ${hasOut ? 'var(--accent)' : hasIn ? 'var(--green)' : 'var(--border)'}`,
                    background: hasIn || hasOut ? `rgba(20,184,166,${0.06 + intensity * 0.12})` : 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '7px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    font: 'inherit',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'baseline' }}>
                    <strong style={{ fontFamily: 'var(--display)', fontSize: '18px', color: hasOut ? 'var(--accent)' : 'var(--text)' }}>{iso.slice(-2)}</strong>
                    <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{dayShort(iso)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '7px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    <span style={{ color: hasIn ? 'var(--green)' : 'var(--text3)' }}>G {nf(d.in_base)}</span>
                    <span style={{ color: hasOut ? 'var(--accent)' : 'var(--text3)', textAlign: 'right' }}>D {nf(d.out_base)}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {busyDays.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>HAREKETLİ GÜNLER</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <tbody>
                    {busyDays.map(d => (
                      <tr key={d.iso} onClick={() => setSelectedDay(d.iso)} style={{ cursor: 'pointer' }} title={`${d.iso} günlük defteri`}>
                        <td>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.iso}</div>
                          <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{dayShort(d.iso)}</div>
                        </td>
                        <td style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>G {nf(d.in_base)}</td>
                        <td style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', textAlign: 'right' }}>D {nf(d.out_base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>AY SONU UYUŞTURMA</div>
            <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ textAlign: 'right' }}>Gelen</th>
                    <th style={{ textAlign: 'right' }}>Dağıtım</th>
                    <th style={{ textAlign: 'right' }}>Ay Farkı</th>
                    <th style={{ textAlign: 'right' }}>Kalan</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {reconcileRows.map(s => {
                    const periodNet = s.period_net || 0
                    const bad = s.negative || periodNet < 0
                    const status = s.negative ? 'EKSİ STOK' : periodNet < 0 ? 'AY EKSİ' : periodNet > 0 ? 'FAZLA' : 'TAM'
                    return (
                      <tr key={s.product_id} style={{ background: bad ? 'rgba(239,68,68,.06)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</div>
                          <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{s.unit_label}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{s.period_in_human || humanQty(s, s.period_in)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{s.period_out_human || humanQty(s, s.period_out)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: periodNet < 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 700 }}>{s.period_net_human || humanQty(s, periodNet)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.negative ? 'var(--red)' : 'var(--text)', fontWeight: 700 }}>{s.balance_human || humanQty(s, s.balance)}</td>
                        <td><span style={{ color: bad ? 'var(--red)' : 'var(--teal)', fontWeight: 800 }}>{status}</span></td>
                      </tr>
                    )
                  })}
                  {reconcileRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Uyuşturma verisi yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>ELDEKİ STOK</div>
            <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <tbody>
                  {stock.map(s => (
                    <tr key={s.product_id} style={{ background: s.low ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.negative ? 'var(--red)' : s.low ? 'var(--accent)' : 'var(--text)' }}>{s.balance_human || nf(s.balance)}</td>
                    </tr>
                  ))}
                  {stock.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Stok verisi yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK DAĞITILAN BÖLGELER</div>
            <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <tbody>
                  {topZones.map(z => (
                    <tr key={z.zone_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{z.zone_name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{z.products.slice(0, 2).join(' · ')}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(z.total)}</td>
                    </tr>
                  ))}
                  {topZones.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu ay dağıtım yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    {selectedDay && <DailyDistributionModal day={selectedDay} from={from} to={to} onDayChange={setSelectedDay} onClose={() => setSelectedDay(null)} />}
    </>
  )
}

// ─────────────────────────── GELEN TIR (aylık giriş) ───────────────────────────
function GelenTirPanel({ from, to, label, stockItems = [] }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: intakes = [] } = useQuery({ queryKey: ['water-intake', from, to], queryFn: () => api.get('/water/movements', { params: { type: 'in', from, to } }).then(r => r.data) })

  const byProduct = useMemo(() => {
    const m = new Map()
    intakes.forEach(r => {
      const cur = m.get(r.product_id) || { name: r.product_name, brand: r.brand_name, p: r, base: 0, remaining: 0 }
      cur.base += r.qty_base || 0
      cur.remaining += r.remaining_base || 0
      m.set(r.product_id, cur)
    })
    return [...m.values()].sort((a, b) => b.base - a.base)
  }, [intakes])

  // Çok-satırlı irsaliye: üstte irsaliye no + tarih tek kez, altında N ürün satırı
  const [waybill, setWaybill] = useState('')
  const [date, setDate] = useState(todayStr())
  const blankRow = { product_id: '', input_qty: '', input_unit: 'palet', lot_no: '', production_date: '', expiry_date: '', note: '' }
  const [rows, setRows] = useState([{ ...blankRow }])

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/intake/batch', payload),
    onSuccess: (r) => {
      invalidateWaterQueries(qc, 'intake')
      const m = r.data.matched ? ` · ${r.data.matched} bekleyen dağıtım eşleşti ✓` : ''
      toastOk(`${r.data.count} ürün kaydedildi${m}`)
      setRows([{ ...blankRow }]); setWaybill('')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const updRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, { ...blankRow }])
  const rmRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)
  const rowCalc = (r) => smartQty(r.input_qty, products.find(p => String(p.id) === String(r.product_id)), r.input_unit)
  const rowIssue = (r) => {
    const product = products.find(p => String(p.id) === String(r.product_id))
    if (!product) return 'Ürün seçin'
    const calc = rowCalc(r)
    if (!calc.valid) return calc.error || 'Miktarı kontrol edin'
    if (product.expiry_tracking && !r.lot_no.trim()) return `${product.name} için lot numarası zorunlu`
    if (product.expiry_tracking && !r.expiry_date) return `${product.name} için SKT zorunlu`
    if (r.production_date && r.production_date > date) return 'Üretim tarihi giriş tarihinden sonra olamaz'
    if (r.production_date && r.expiry_date && r.production_date > r.expiry_date) return 'SKT üretim tarihinden önce olamaz'
    if (r.expiry_date && r.expiry_date < date) return 'SKT giriş tarihinden önce olamaz'
    return null
  }
  const enteredRows = rows.filter(r => r.product_id || String(r.input_qty || '').trim() || r.lot_no.trim() || r.production_date || r.expiry_date || String(r.note || '').trim())
  const validRows = enteredRows.filter(r => !rowIssue(r))
  const invalidRows = enteredRows.filter(r => rowIssue(r))
  const submit = () => {
    if (invalidRows.length > 0) return toastErr(rowIssue(invalidRows[0]) || 'Eksik veya geçersiz ürün satırını düzeltin')
    if (validRows.length === 0) return toastErr('En az bir geçerli ürün satırı girin')
    saveBatch.mutate({
      move_date: date, waybill_no: waybill.trim() || undefined,
      lines: validRows.map(r => {
        const c = rowCalc(r)
        return {
          product_id: +r.product_id,
          input_qty: c.input_qty,
          input_unit: c.input_unit,
          lot_no: r.lot_no.trim() || undefined,
          production_date: r.production_date || undefined,
          expiry_date: r.expiry_date || undefined,
          note: r.note?.trim() || undefined,
        }
      }),
    })
  }

  return (
    <div className="panel" style={{ borderTop: '3px solid var(--green)' }}>
      <div className="panel-header"><div><div className="panel-title">GELEN TIR / İRSALİYE — {label}</div><div className="panel-subtitle">Çok satırlı irsaliye — tek no/tarih, N ürün; kayıtta bekleyen dağıtımlar otomatik kapanır</div></div></div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(260px, .95fr)', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">İrsaliye no</label><input className="form-input" placeholder="Ör. IRS-2026-045" value={waybill} onChange={e => setWaybill(e.target.value)} /></div>
            <div style={{ width: '150px' }}><label className="form-label">Tarih</label><input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', width: '100%', minWidth: '980px' }}>
              <thead><tr><th>Ürün</th><th style={{ width: '78px' }}>Miktar</th><th style={{ width: '82px' }}>Birim</th><th style={{ width: '110px' }}>Hesaplanan</th><th style={{ width: '120px' }}>Lot</th><th style={{ width: '155px' }}>Üretim / SKT</th><th>Not</th><th style={{ width: '30px' }}></th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = products.find(x => String(x.id) === String(r.product_id))
                  const calc = rowCalc(r)
                  return (
                    <tr key={i}>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '150px' }} value={r.product_id} onChange={e => {
                        const np = products.find(x => String(x.id) === e.target.value)
                        const preferred = availableUnitsForProduct(np).includes('palet') ? 'palet' : defaultUnitForProduct(np)
                        updRow(i, { product_id: e.target.value, input_unit: preferred })
                      }}>
                        <option value="">Ürün…</option>
                        {products.map(pp => <option key={pp.id} value={pp.id}>{pp.brand_name ? `${pp.brand_name} · ` : ''}{pp.name}</option>)}
                      </select></td>
                      <td><input type="text" inputMode="decimal" className="form-input" style={{ fontSize: '11px' }} placeholder="3 / 3p" value={r.input_qty} onChange={e => updRow(i, { input_qty: e.target.value })} /></td>
                      <td><select className="form-select" style={{ fontSize: '11px' }} value={coerceUnitForProduct(r.input_unit, p)} onChange={e => updRow(i, { input_unit: e.target.value })}>{unitOptionsForProduct(p).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={{ fontFamily: 'var(--mono)', color: calc.valid ? 'var(--green)' : calc.error ? 'var(--red)' : 'var(--text3)', maxWidth: '110px' }}>{calc.valid ? nf(calc.base) : calc.error || '·'}</td>
                      <td><input className="form-input" style={{ fontSize: '11px' }} placeholder={p?.expiry_tracking ? 'Lot no *' : 'Lot no'} value={r.lot_no} onChange={e => updRow(i, { lot_no: e.target.value })} /></td>
                      <td><div style={{ display: 'grid', gap: '4px' }}>
                        <input type="date" className="form-input" style={{ fontSize: '10px', minWidth: '138px' }} title="Üretim tarihi" aria-label={`${i + 1}. satır üretim tarihi`} value={r.production_date} onChange={e => updRow(i, { production_date: e.target.value })} />
                        <input type="date" className="form-input" style={{ fontSize: '10px', minWidth: '138px', borderColor: p?.expiry_tracking && !r.expiry_date ? 'var(--amber, #b45309)' : undefined }} title="Son kullanma tarihi" aria-label={`${i + 1}. satır son kullanma tarihi`} value={r.expiry_date} onChange={e => updRow(i, { expiry_date: e.target.value })} />
                      </div></td>
                      <td><input className="form-input" style={{ fontSize: '11px' }} placeholder="opsiyonel" value={r.note} onChange={e => updRow(i, { note: e.target.value })} /></td>
                      <td style={{ textAlign: 'center' }}>{rows.length > 1 && <button type="button" onClick={() => rmRow(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ Ürün satırı</button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={saveBatch.isPending || validRows.length === 0 || invalidRows.length > 0} style={{ marginLeft: 'auto' }}>{saveBatch.isPending ? 'Kaydediliyor…' : `İrsaliyeyi Kaydet (${validRows.length} ürün)`}</button>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '280px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>İrsaliye</th><th>Ürün</th><th>Lot / SKT</th><th style={{ textAlign: 'right' }}>Gelen</th><th style={{ textAlign: 'right' }}>Kalan</th></tr></thead>
              <tbody>
                {intakes.slice(0, 12).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: r.waybill_no ? 'var(--text)' : 'var(--text3)' }}>{r.waybill_no || '—'}</td>
                    <td>{r.brand_name ? `${r.brand_name} · ` : ''}{r.product_name}</td>
                    <td><div style={{ fontFamily: 'var(--mono)' }}>{r.lot_no || '—'}</div><div style={{ fontSize: '10px', color: r.expiry_date ? 'var(--text3)' : (r.expiry_tracking ? 'var(--red)' : 'var(--text3)') }}>{r.expiry_date || (r.expiry_tracking ? 'SKT eksik' : 'Takip kapalı')}</div></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.qty_human || humanQty(r, r.qty_base)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: (r.remaining_base || 0) > 0 ? 'var(--teal)' : 'var(--text3)' }}>{r.remaining_human || nf(r.remaining_base)}</td>
                  </tr>
                ))}
                {intakes.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu ay gelen tır kaydı yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)' }}>ELDEKİ SU/STOK</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {stockItems.map(s => (
                  <tr key={s.product_id} style={{ background: s.low ? 'rgba(239,68,68,.06)' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.low ? 'var(--red)' : 'var(--text)' }}>{s.balance_human || nf(s.balance)}</td>
                  </tr>
                ))}
                {stockItems.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Stok verisi yok</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginTop: '4px' }}>BU AY GELEN ÜRÜN ÖZETİ</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {byProduct.map(r => (
                  <tr key={r.name + (r.brand || '')}>
                    <td style={{ color: 'var(--text2)' }}>
                      <div style={{ fontWeight: 600 }}>{r.brand ? `${r.brand} · ` : ''}{r.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '9px' }}>irsaliye kalan {humanQty(r.p, r.remaining)}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{humanQty(r.p, r.base)}</td>
                  </tr>
                ))}
                {byProduct.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Gelen ürün özeti yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── BOŞ İADE (depozito) ───────────────────────────
function BosIadePanel({ from, to, deposit }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const returnable = useMemo(() => products.filter(p => p.is_returnable), [products])
  const { data: returns = [] } = useQuery({ queryKey: ['water-returns', from, to], queryFn: () => api.get('/water/returns', { params: { from, to } }).then(r => r.data) })

  const [form, setForm] = useState({ product_id: '', input_qty: '', input_unit: 'adet', move_date: todayStr() })
  const selected = returnable.find(p => String(p.id) === String(form.product_id))
  const returnCalc = smartQty(form.input_qty, selected, form.input_unit)

  const invalidate = () => invalidateWaterQueries(qc, 'returns')
  const save = useMutation({
    mutationFn: (payload) => api.post('/water/returns', payload),
    onSuccess: () => { invalidate(); toastOk('İade kaydedildi'); setForm(f => ({ ...f, input_qty: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/returns/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const submit = () => {
    if (!form.product_id) return toastErr('İade edilebilir ürün seçin')
    if (!returnCalc.valid) return toastErr(returnCalc.error || 'Miktar girin')
    save.mutate({ product_id: +form.product_id, input_qty: returnCalc.input_qty, input_unit: returnCalc.input_unit, move_date: form.move_date })
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">BOŞ İADE — DEPOZİTO</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {deposit.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
            {deposit.map(d => (
              <div key={d.product_id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{d.brand_name ? `${d.brand_name} · ` : ''}{d.name}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '19px', color: d.outstanding > 0 ? 'var(--accent)' : 'var(--teal)' }}>{nf(d.outstanding)}</div>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>dolaşımda · ay iade {nf(d.period_return)}</div>
              </div>
            ))}
          </div>
        )}
        {returnable.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>İade edilebilir ürün yok — ⚙ Ayarlar’dan bir ürünü “iade edilebilir” işaretleyin.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr .9fr auto', gap: '6px', alignItems: 'end' }}>
            <select className="form-select" value={form.product_id} onChange={e => {
              const p = returnable.find(x => String(x.id) === e.target.value)
              setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
            }}>
              <option value="">Ürün…</option>
              {returnable.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
            </select>
            <input type="text" inputMode="decimal" className="form-input" placeholder="Miktar" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} />
            <select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>
              {unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={save.isPending || (!!form.input_qty && !returnCalc.valid)}>Ekle</button>
          </div>
        )}
        {!!form.input_qty && <div style={{ fontSize: '10px', color: returnCalc.valid ? 'var(--green)' : 'var(--red)' }}>{returnCalc.valid ? calcText(selected, returnCalc) : returnCalc.error || 'Geçerli miktar girin'}</div>}
        <table className="data-table" style={{ fontSize: '11px' }}>
          <tbody>
            {returns.slice(0, 8).map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                <td>{r.brand_name ? `${r.brand_name} · ` : ''}{r.product_name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.input_qty} {r.input_unit}</td>
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'İade Sil', body: 'Silinsin mi?', danger: true })) del.mutate(r.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
              </tr>
            ))}
            {returns.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '10px' }}>Bu ay iade kaydı yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('firmalar')
  return (
    <WaterModal title="AYARLAR" onClose={onClose} width="900px">
      <div style={{ display: 'flex', gap: '2px', marginBottom: '14px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['firmalar', '📍 Dağıtım Yerleri'], ['urunler', '💧 Ürünler & Marka'], ['sablonlar', '🗂 Şablonlar']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>
      {tab === 'firmalar' ? <ZonesTab /> : tab === 'urunler' ? <ProductsTab /> : <TemplatesTab />}
    </WaterModal>
  )
}

function AdjustModal({ onClose }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: adjData } = useQuery({ queryKey: ['water-adjustments'], queryFn: () => api.get('/water/adjustments').then(r => r.data) })
  const rows = adjData?.rows || []
  const reasons = adjData?.reasons || []
  const [form, setForm] = useState({ product_id: '', direction: 'in', input_qty: '', input_unit: 'adet', move_date: todayStr(), reason: '', note: '' })
  const selected = products.find(p => String(p.id) === String(form.product_id))
  const calc = smartQty(form.input_qty, selected, form.input_unit)
  const invalidate = () => invalidateWaterQueries(qc, 'adjustments')
  const create = useMutation({
    mutationFn: () => api.post('/water/adjustments', { product_id: +form.product_id, direction: form.direction, input_qty: calc.input_qty, input_unit: calc.input_unit, move_date: form.move_date, reason: form.reason, note: form.note?.trim() || undefined }),
    onSuccess: () => { invalidate(); setForm(f => ({ ...f, input_qty: '', note: '' })); toastOk('Düzeltme kaydedildi') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/adjustments/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!calc.valid) return toastErr(calc.error || 'Miktar girin')
    if (!form.reason) return toastErr('Sebep seçin')
    create.mutate()
  }
  const reasonLabel = (k) => reasons.find(r => r.key === k)?.label || k

  return (
    <WaterModal title="STOK DÜZELTME / SAYIM FİŞİ" onClose={onClose} width="760px">
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>Kontrollü stok düzeltmesi — normal dağıtımdan ayrı tutulur, ay uyuşturmasında “Düzeltme” kolonunda görünür.</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Ürün</label>
          <select className="form-select" value={form.product_id} onChange={e => { const p = products.find(x => String(x.id) === e.target.value); setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) })) }}>
            <option value="">Ürün…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">Yön</label>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
            {[['in', '+ Artı'], ['out', '− Eksi']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm(f => ({ ...f, direction: v }))} style={{ border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', background: form.direction === v ? (v === 'in' ? 'var(--green)' : 'var(--red)') : 'transparent', color: form.direction === v ? '#000' : 'var(--text3)', fontWeight: 700 }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ width: '78px' }}><label className="form-label">Miktar</label><input type="text" inputMode="decimal" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
        <div style={{ width: '84px' }}><label className="form-label">Birim</label><select className="form-select" value={coerceUnitForProduct(form.input_unit, selected)} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>{unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div style={{ width: '140px' }}><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} /></div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '6px' }}>
        <div style={{ width: '180px' }}><label className="form-label">Sebep</label>
          <select className="form-select" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
            <option value="">— seç —</option>
            {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="opsiyonel" /></div>
        <button className="btn btn-primary" disabled={create.isPending} onClick={submit}>Kaydet</button>
      </div>
      <div style={{ minHeight: '20px', fontSize: '11px', color: calc.valid ? (form.direction === 'in' ? 'var(--green)' : 'var(--red)') : calc.error ? 'var(--red)' : 'var(--text3)', marginBottom: '10px' }}>
        {calc.valid ? `Stok etkisi: ${form.direction === 'in' ? '+' : '−'}${nf(calc.base)} ${selected?.unit_label || 'adet'}` : calc.error || 'Ürün + miktar girince stok etkisi burada görünür.'}
      </div>
      <div style={{ maxHeight: '38vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead><tr><th>Tarih</th><th>Ürün</th><th style={{ textAlign: 'right' }}>Etki</th><th>Sebep</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'var(--mono)' }}>{a.move_date}</td>
                <td>{a.brand_name ? `${a.brand_name} · ` : ''}{a.product_name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: a.direction === 'in' ? 'var(--green)' : 'var(--red)' }}>{a.signed_human}</td>
                <td style={{ color: 'var(--text2)' }}>{reasonLabel(a.reason)}</td>
                <td style={{ color: 'var(--text3)' }}>{a.note || '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Düzeltmeyi Sil', body: 'Bu düzeltme silinsin mi? Stok bakiyesi geri döner.', danger: true })) del.mutate(a.id) }}>Sil</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>Henüz düzeltme kaydı yok</td></tr>}
          </tbody>
        </table>
      </div>
    </WaterModal>
  )
}

function TextModal({ onClose }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const onSaved = () => invalidateWaterQueries(qc, 'distribution')
  return (
    <WaterModal title="METİNDEN DAĞITIM" onClose={onClose} width="720px">
      <TextDistribute products={products} zones={zones} onSaved={onSaved} />
    </WaterModal>
  )
}

// Metinden dağıtım: yapıştır → çözümle → önizle/düzelt → kaydet
function TextDistribute({ products, zones, onSaved }) {
  const [text, setText] = useState('')
  const [moveDate, setMoveDate] = useState(todayStr())
  const [items, setItems] = useState(null)

  const parse = useMutation({
    mutationFn: () => api.post('/water/distribute/parse', { text }).then(r => r.data),
    onSuccess: (d) => {
      if (!d.items.length) { toastErr('Metinden satır çıkarılamadı'); return }
      setItems(d.items.map((it, i) => {
        const product = products.find(p => String(p.id) === String(it.product_id))
        return { ...it, input_unit: coerceUnitForProduct(it.input_unit, product), _id: i }
      }))
    },
    onError: (e) => toastErr(errMsg(e, 'Çözümlenemedi')),
  })
  const saveBatch = useMutation({
    mutationFn: (lines) => api.post('/water/distribute/batch', { move_date: moveDate, lines }),
    onSuccess: (r) => { onSaved(); toastOk(`${r.data.count} dağıtım kaydedildi`); setItems(null); setText('') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const upd = (id, patch) => setItems(items.map(it => it._id === id ? { ...it, ...patch } : it))
  const itemCalc = (item) => smartQty(item.input_qty, products.find(p => String(p.id) === String(item.product_id)), item.input_unit)
  const validItems = items?.filter(item => item.zone_id && item.product_id && itemCalc(item).valid) || []
  const validCount = validItems.length
  const invalidItemCount = items ? items.length - validCount : 0

  const save = () => {
    if (invalidItemCount > 0) return toastErr('Kırmızı satırları düzeltmeden toplu kayıt yapılamaz')
    const lines = validItems.map(item => {
      const calc = itemCalc(item)
      return { zone_id: +item.zone_id, product_id: +item.product_id, input_qty: calc.input_qty, input_unit: calc.input_unit }
    })
    if (!lines.length) return toastErr('Kaydedilecek geçerli satır yok')
    saveBatch.mutate(lines)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!items ? (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Her satıra bir dağıtım yeri yaz. Örnek:<br />
            <code style={{ fontSize: '10px' }}>OTC Kamp Alanı 5 koli 0.5, 10 damacana</code><br />
            <code style={{ fontSize: '10px' }}>Heliport 2 palet 0.33</code>
          </div>
          <textarea className="form-input" rows={7} value={text} onChange={e => setText(e.target.value)} placeholder="Dağıtım raporunu buraya yapıştır…" style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0 }}>Tarih:</label>
            <input type="date" className="form-input" value={moveDate} onChange={e => setMoveDate(e.target.value)} style={{ width: 'auto' }} />
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => parse.mutate()} disabled={!text.trim() || parse.isPending}>{parse.isPending ? 'Çözümleniyor…' : '🔍 Çözümle'}</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{validCount}/{items.length} satır hazır. Eksikleri (kırmızı) düzeltip kaydet.</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Dağıtım yeri</th><th>Ürün</th><th>Miktar</th><th>Birim</th><th></th></tr></thead>
              <tbody>
                {items.map(it => {
                  const selectedProduct = products.find(p => String(p.id) === String(it.product_id))
                  const calc = itemCalc(it)
                  const bad = !it.zone_id || !it.product_id || !calc.valid
                  return (
                    <tr key={it._id} style={{ background: bad ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.zone_id || ''} onChange={e => upd(it._id, { zone_id: e.target.value })}>
                        <option value="">— seç —</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></td>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.product_id || ''} onChange={e => {
                        const p = products.find(x => String(x.id) === e.target.value)
                        upd(it._id, { product_id: e.target.value, input_unit: defaultUnitForProduct(p) })
                      }}>
                        <option value="">— seç —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                      <td><input type="text" inputMode="decimal" className="form-input" title={calc.error || ''} style={{ fontSize: '11px', width: '86px', borderColor: calc.error ? 'var(--red)' : undefined }} value={it.input_qty ?? ''} onChange={e => upd(it._id, { input_qty: e.target.value })} />{calc.error && <div style={{ color: 'var(--red)', fontSize: '9px' }}>{calc.error}</div>}</td>
                      <td><select className="form-select" style={{ fontSize: '11px' }} value={it.input_unit} onChange={e => upd(it._id, { input_unit: e.target.value })}>{unitOptionsForProduct(selectedProduct).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={{ textAlign: 'right' }}><button onClick={() => setItems(items.filter(x => x._id !== it._id))} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setItems(null)}>← Geri</button>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Tarih: {moveDate}</span>
              <button className="btn btn-primary" onClick={save} disabled={saveBatch.isPending || validCount === 0 || invalidItemCount > 0}>{saveBatch.isPending ? 'Kaydediliyor…' : `${validCount} Dağıtımı Kaydet`}</button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── DAĞITIM YERLERİ (bölge yönetimi) ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '', expected_monthly: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const invalidate = () => invalidateWaterQueries(qc, 'zones')
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { invalidate(); setForm({ name: '', code: '', note: '', expected_monthly: '' }); toastOk('Dağıtım yeri eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: ({ id, ...p }) => api.put(`/water/zones/${id}`, p), onSuccess: () => { invalidate(); toastOk('Güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const saveExpected = (z, value) => {
    const expected = Math.max(0, parseInt(value) || 0)
    if (expected === (z.expected_monthly || 0)) return
    update.mutate({ id: z.id, name: z.name, code: z.code, note: z.note, is_active: z.is_active !== 0, expected_monthly: expected })
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Dağıtım yeri adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. OTC Kamp Alanı" /></div>
        <div style={{ width: '90px' }}><label className="form-label">Kod</label><input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
        <div style={{ width: '120px' }}><label className="form-label">Beklenen/ay</label><input type="number" min="0" className="form-input" value={form.expected_monthly} onChange={e => setForm(f => ({ ...f, expected_monthly: e.target.value }))} placeholder="adet" /></div>
        <div style={{ flex: 1, minWidth: '120px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim() })}>Ekle</button>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Kod</th><th style={{ textAlign: 'right' }}>Beklenen/ay</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {zones.map(z => (
              <tr key={z.id}>
                <td style={{ fontWeight: 600 }}>{z.name}</td>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{z.code || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <input type="number" min="0" aria-label={`${z.name} beklenen aylık`} defaultValue={z.expected_monthly || ''}
                    onBlur={e => saveExpected(z, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    style={{ width: '72px', textAlign: 'right', fontFamily: 'var(--mono)', padding: '3px 5px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text)' }} placeholder="—" />
                </td>
                <td style={{ color: 'var(--text3)' }}>{z.note || '—'}</td>
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Dağıtım Yerini Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
              </tr>
            ))}
            {zones.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Dağıtım yeri yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── HIZLI GİRİŞ ŞABLONLARI ───────────────────────────
function TemplatesTab() {
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['water-templates'], queryFn: () => api.get('/water/templates').then(r => r.data) })
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const [name, setName] = useState('')
  const [lines, setLines] = useState([])

  const templateLineStatus = (line) => {
    const product = productsById.get(+line.product_id)
    const configured = !!(line.zone_id || line.product_id || String(line.default_qty ?? '').trim())
    if (!configured) return { configured: false, valid: false, error: null }
    if (!line.zone_id || !product) return { configured: true, valid: false, error: 'Yer ve ürün seçin' }
    if (line.default_qty === '' || line.default_qty == null) return { configured: true, valid: true, error: null }
    const qty = Number(line.default_qty)
    const conversion = exactBaseQuantity(product, qty, line.default_unit)
    if (!Number.isFinite(qty) || qty < 0) return { configured: true, valid: false, error: 'Geçerli miktar girin' }
    if (!conversion.exact) return { configured: true, valid: false, error: `Tam ${product.unit_label || 'adet'} gerekli` }
    return { configured: true, valid: true, error: null }
  }
  const validLines = lines.filter(line => templateLineStatus(line).valid).length
  const invalidLines = lines.filter(line => {
    const status = templateLineStatus(line)
    return status.configured && !status.valid
  }).length

  const invalidate = () => invalidateWaterQueries(qc, 'templates')
  const create = useMutation({
    mutationFn: () => api.post('/water/templates', {
      name: name.trim(),
      lines: lines.filter(l => l.zone_id && l.product_id).map(l => ({ zone_id: +l.zone_id, product_id: +l.product_id, default_qty: l.default_qty === '' ? null : +l.default_qty, default_unit: l.default_unit })),
    }),
    onSuccess: () => { invalidate(); setName(''); setLines([]); toastOk('Şablon kaydedildi') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/templates/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  const addLine = () => setLines(ls => [...ls, { zone_id: '', product_id: '', default_qty: '', default_unit: 'adet' }])
  const updLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const rmLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  return (
    <div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '14px', background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}><label className="form-label">Şablon adı</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ör. FPU Yemekhane Rutin" /></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Satır</button>
        </div>
        {lines.map((l, i) => {
          const prod = productsById.get(+l.product_id)
          const unitOpts = prod ? unitOptionsForProduct(prod) : [['adet', 'Adet']]
          const lineStatus = templateLineStatus(l)
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <select className="form-select" style={{ flex: 1, fontSize: '11px' }} value={l.zone_id} onChange={e => updLine(i, { zone_id: e.target.value })}>
                <option value="">Dağıtım yeri…</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <select className="form-select" style={{ flex: 1, fontSize: '11px' }} value={l.product_id} onChange={e => {
                const product = productsById.get(+e.target.value)
                updLine(i, { product_id: e.target.value, default_unit: defaultUnitForProduct(product) })
              }}>
                <option value="">Ürün…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="0" step="any" className="form-input" title={lineStatus.error || ''} style={{ width: '82px', fontSize: '11px', borderColor: lineStatus.error ? 'var(--red)' : undefined }} value={l.default_qty} onChange={e => updLine(i, { default_qty: e.target.value })} placeholder={lineStatus.error || 'miktar'} />
              <select className="form-select" style={{ width: '90px', fontSize: '11px' }} value={l.default_unit} onChange={e => updLine(i, { default_unit: e.target.value })}>
                {unitOpts.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
              </select>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => rmLine(i)}>✕</button>
            </div>
          )
        })}
        {lines.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '6px 0' }}>Satır ekleyin (dağıtım yeri + ürün + varsayılan miktar/birim).</div>}
        <button className="btn btn-primary btn-sm" style={{ marginTop: '8px' }} disabled={!name.trim() || validLines === 0 || invalidLines > 0 || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Kaydediliyor…' : `Şablonu Kaydet (${validLines} satır)`}</button>
      </div>

      <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
        {templates.map(t => (
          <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700 }}>🗂 {t.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.lines.length} satır</span>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={async () => { if (await confirmDialog({ title: 'Şablonu Sil', body: `"${t.name}" silinsin mi?`, danger: true })) del.mutate(t.id) }}>Sil</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
              {t.lines.map(l => (
                <span key={l.id} style={{ fontSize: '10px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '999px', padding: '2px 8px' }}>
                  {l.zone_name} · {l.product_name}{l.default_qty != null ? ` · ${nf(l.default_qty)} ${l.default_unit}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {templates.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px', fontSize: '12px' }}>Henüz şablon yok</div>}
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER + MARKA ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const blank = { id: null, name: '', unit_label: 'adet', base_unit: 'adet', units_per_case: '1', cases_per_pallet: '1', min_qty: '', crit_qty: '', min_unit: 'adet', lead_time_days: '7', safety_stock_days: '3', expiry_tracking: false, expiry_warning_days: '30', brand_id: '', is_returnable: false, is_active: true }
  const [form, setForm] = useState(blank)
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })
  const { data: brands = [] } = useQuery({ queryKey: ['water-brands'], queryFn: () => api.get('/water/brands').then(r => r.data) })

  const invalidate = () => invalidateWaterQueries(qc, 'products')
  const payload = () => {
    const upc = +form.units_per_case || 1, cpp = +form.cases_per_pallet || 1
    const productShape = { unit_label: form.unit_label, base_unit: form.base_unit, units_per_case: upc, cases_per_pallet: cpp }
    const minUnit = coerceUnitForProduct(form.min_unit, productShape)
    const thresholdBase = (raw, label) => {
      const qty = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(qty) || qty < 0) throw new Error(`${label} miktarı geçersiz`)
      const conversion = exactBaseQuantity(productShape, qty, minUnit)
      if (!conversion.exact) throw new Error(`${label} tam ${form.unit_label || 'adet'} karşılığına dönüşmeli`)
      return conversion.base
    }
    const daySetting = (raw, label) => {
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > 365) throw new Error(`${label} 0-365 arasında tam sayı olmalı`)
      return value
    }
    return {
      name: form.name.trim(),
      unit_label: form.unit_label,
      base_unit: form.base_unit,
      units_per_case: upc,
      cases_per_pallet: cpp,
      min_level: thresholdBase(form.min_qty, 'Minimum stok'),
      critical_level: thresholdBase(form.crit_qty, 'Kritik stok'),
      lead_time_days: daySetting(form.lead_time_days, 'Tedarik süresi'),
      safety_stock_days: daySetting(form.safety_stock_days, 'Emniyet günü'),
      expiry_tracking: form.expiry_tracking,
      expiry_warning_days: daySetting(form.expiry_warning_days, 'SKT uyarı günü'),
      brand_id: form.brand_id || null,
      is_returnable: form.is_returnable,
      is_active: form.is_active,
    }
  }
  const create = useMutation({ mutationFn: () => api.post('/water/products', payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: () => api.put(`/water/products/${form.id}`, payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/products/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const patch = useMutation({ mutationFn: (p) => api.put(`/water/products/${p.id}`, p), onSuccess: () => { invalidate(); toastOk('Güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })

  const editProduct = (p) => setForm({ id: p.id, name: p.name, unit_label: p.unit_label, base_unit: baseUnitForProduct(p), units_per_case: String(p.units_per_case), cases_per_pallet: String(p.cases_per_pallet), min_qty: p.min_level ? String(p.min_level) : '', crit_qty: p.critical_level ? String(p.critical_level) : '', min_unit: 'adet', lead_time_days: String(p.lead_time_days ?? 7), safety_stock_days: String(p.safety_stock_days ?? 3), expiry_tracking: !!p.expiry_tracking, expiry_warning_days: String(p.expiry_warning_days ?? 30), brand_id: p.brand_id ? String(p.brand_id) : '', is_returnable: !!p.is_returnable, is_active: p.is_active !== 0 })
  const toggleActive = (p) => patch.mutate({ id: p.id, name: p.name, unit_label: p.unit_label, base_unit: baseUnitForProduct(p), units_per_case: p.units_per_case, cases_per_pallet: p.cases_per_pallet, min_level: p.min_level, critical_level: p.critical_level, lead_time_days: p.lead_time_days, safety_stock_days: p.safety_stock_days, expiry_tracking: p.expiry_tracking, expiry_warning_days: p.expiry_warning_days, brand_id: p.brand_id, is_returnable: p.is_returnable, is_active: p.is_active === 0 })
  const formPackage = { unit_label: form.unit_label, base_unit: form.base_unit, units_per_case: +form.units_per_case || 1, cases_per_pallet: +form.cases_per_pallet || 1 }
  const packageMode = baseUnitForProduct(formPackage) === 'paket' ? 'packPallet'
    : baseUnitForProduct(formPackage) === 'koli' ? 'casePallet'
      : (+form.cases_per_pallet || 1) > 1 ? 'piecePallet' : 'single'
  const formUnitOptions = unitOptionsForProduct(formPackage)
  const updatePackageNumber = (field, value) => setForm(f => {
    const next = { ...f, [field]: value }
    const nextPackage = { unit_label: next.unit_label, base_unit: next.base_unit, units_per_case: +next.units_per_case || 1, cases_per_pallet: +next.cases_per_pallet || 1 }
    return { ...next, min_unit: coerceUnitForProduct(next.min_unit, nextPackage) }
  })
  const setPackageMode = (mode) => {
    if (mode === 'single') setForm(f => ({ ...f, base_unit: 'adet', units_per_case: '1', cases_per_pallet: '1', min_unit: 'adet' }))
    else if (mode === 'piecePallet') setForm(f => ({ ...f, base_unit: 'adet', units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '36' : f.cases_per_pallet, min_unit: 'adet' }))
    else if (mode === 'casePallet') setForm(f => ({ ...f, base_unit: 'koli', units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '140' : f.cases_per_pallet, min_unit: 'koli' }))
    else setForm(f => ({ ...f, base_unit: 'paket', units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '80' : f.cases_per_pallet, min_unit: 'paket' }))
  }
  const paletText = (p) => {
    const mult = multiplier(p, 'palet')
    if (mult <= 1 && baseUnitForProduct(p) !== 'palet') return '—'
    return `${nf(mult)} ${p.unit_label || 'adet'}`
  }
  const koliText = (p) => {
    if (baseUnitForProduct(p) === 'koli') return `1 ${p.unit_label || 'koli'}`
    return p.units_per_case > 1 ? `${nf(p.units_per_case)} ${p.unit_label}` : '—'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">{form.id ? 'Ürün düzenle' : 'Ürün adı'}</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 0.5 L Şişe Su" /></div>
        <div style={{ width: '92px' }}><label className="form-label">Baz birim</label><select className="form-select" value={form.base_unit} onChange={e => setForm(f => {
          const next = { ...f, base_unit: e.target.value }
          return { ...next, min_unit: coerceUnitForProduct(next.min_unit, { base_unit: next.base_unit, unit_label: next.unit_label, units_per_case: +next.units_per_case || 1, cases_per_pallet: +next.cases_per_pallet || 1 }) }
        })}><option value="adet">Adet</option><option value="koli">Koli</option><option value="paket">Paket</option><option value="palet">Palet</option></select></div>
        <div style={{ width: '100px' }}><label className="form-label">Gösterim</label><input className="form-input" value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} placeholder="damacana" /></div>
        <div style={{ minWidth: '200px' }}><label className="form-label">Paket tipi</label><div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['single', 'Tekil'], ['piecePallet', 'Adet+Palet'], ['casePallet', 'Koli+Palet'], ['packPallet', 'Paket+Palet']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPackageMode(id)} style={{ border: 'none', borderRadius: '5px', padding: '6px 9px', fontSize: '10px', cursor: 'pointer', background: packageMode === id ? 'var(--accent)' : 'transparent', color: packageMode === id ? '#000' : 'var(--text3)' }}>{label}</button>
          ))}
        </div></div>
        <div style={{ width: '78px' }}><label className="form-label">Koli içi</label><input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => updatePackageNumber('units_per_case', e.target.value)} /></div>
        <div style={{ width: '86px' }}><label className="form-label">Palet çarp.</label><input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => updatePackageNumber('cases_per_pallet', e.target.value)} /></div>
        <div style={{ width: '72px' }}><label className="form-label">Min. stok</label><input type="number" min="0" step="any" className="form-input" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} /></div>
        <div style={{ width: '72px' }}><label className="form-label" title="Min’den düşük acil eşik">Kritik</label><input type="number" min="0" step="any" className="form-input" value={form.crit_qty} onChange={e => setForm(f => ({ ...f, crit_qty: e.target.value }))} /></div>
        <div style={{ width: '72px' }}><label className="form-label">Min. birim</label><select className="form-select" value={coerceUnitForProduct(form.min_unit, formPackage)} onChange={e => setForm(f => ({ ...f, min_unit: e.target.value }))}>{formUnitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div style={{ width: '84px' }}><label className="form-label" title="Sipariş ile teslim arasındaki ortalama gün">Tedarik gün</label><input type="number" min="0" max="365" step="1" className="form-input" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} /></div>
        <div style={{ width: '84px' }}><label className="form-label" title="Gecikme ve tüketim dalgalanmasına karşı ek stok günü">Emniyet gün</label><input type="number" min="0" max="365" step="1" className="form-input" value={form.safety_stock_days} onChange={e => setForm(f => ({ ...f, safety_stock_days: e.target.value }))} /></div>
        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Yeni girişte lot numarası ve son kullanma tarihi zorunlu olur">
          <input type="checkbox" checked={form.expiry_tracking} onChange={e => setForm(f => ({ ...f, expiry_tracking: e.target.checked }))} /> Lot/SKT zorunlu
        </label>
        <div style={{ width: '86px' }}><label className="form-label" title="SKT yaklaşırken kaç gün önce uyarı verileceği">SKT uyarı</label><input type="number" min="0" max="365" step="1" className="form-input" value={form.expiry_warning_days} onChange={e => setForm(f => ({ ...f, expiry_warning_days: e.target.value }))} /></div>
        <div style={{ minWidth: '130px' }}><label className="form-label">Marka</label><select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}>
          <option value="">Markasız</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></div>
        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Boş kap iade takibi (depozito)">
          <input type="checkbox" checked={form.is_returnable} onChange={e => setForm(f => ({ ...f, is_returnable: e.target.checked }))} /> İade edilebilir
        </label>
        {form.id && (
          <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Pasif ürün yeni girişte görünmez, eski raporlarda kalır">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Aktif
          </label>
        )}
        {form.id && <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>+ Yeni</button>}
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={() => form.id ? update.mutate() : create.mutate()}>{form.id ? 'Güncelle' : 'Ekle'}</button>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>Baz birim Excel hücresindeki ham sayıdır; ör. damacana adet, 0.33/0.5 koli, 5 L/cam paket. Palet çarpanı bu ham sayıya çevrilir. Lot/SKT zorunlu açılırsa her yeni irsaliye satırında lot ve SKT istenir; yaklaşma uyarısı ürün bazında hesaplanır.</div>

      <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px', minWidth: '1040px' }}>
          <thead><tr><th>Ad</th><th>Marka</th><th>Birimler</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min.</th><th style={{ textAlign: 'right' }}>Kritik</th><th style={{ textAlign: 'right' }}>Tedarik + emniyet</th><th>Lot / SKT</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{p.name} {p.is_returnable ? <span title="İade edilebilir" style={{ fontSize: '10px', color: 'var(--teal)' }}>♻️</span> : null}{p.is_active ? null : <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>(pasif)</span>}</td>
                <td style={{ color: 'var(--text3)' }}>{p.brand_name || '—'}</td>
                <td style={{ color: 'var(--text3)' }}>{unitOptionsForProduct(p).map(([, label]) => label).join(' / ')}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{koliText(p)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{paletText(p)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.min_level ? 'var(--text)' : 'var(--text3)' }}>{p.min_level ? `${nf(p.min_level)}` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.critical_level ? 'var(--red)' : 'var(--text3)' }}>{p.critical_level ? `${nf(p.critical_level)}` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{p.lead_time_days ?? 7}g + {p.safety_stock_days ?? 3}g</td>
                <td>{p.expiry_tracking ? <span className="badge badge-amber">Zorunlu · {p.expiry_warning_days ?? 30}g</span> : <span style={{ color: 'var(--text3)' }}>Kapalı</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editProduct(p)} className="btn btn-ghost btn-sm">Düzenle</button>
                  <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-sm" title={p.is_active ? 'Pasife al' : 'Aktifleştir'}>{p.is_active ? 'Pasife al' : 'Aktif et'}</button>
                  <button onClick={async () => { if (await confirmDialog({ title: 'Ürünü Sil', body: `"${p.name}" silinsin mi? (hareketi varsa silinemez)`, danger: true })) del.mutate(p.id) }} className="btn btn-danger btn-sm">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BrandManager brands={brands} onChange={() => invalidateWaterQueries(qc, 'brands')} />
    </div>
  )
}

function BrandManager({ brands, onChange }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const create = useMutation({ mutationFn: () => api.post('/water/brands', { name: name.trim(), color }), onSuccess: () => { onChange(); setName(''); toastOk('Marka eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: (b) => api.put(`/water/brands/${b.id}`, b), onSuccess: () => { onChange(); toastOk('Marka güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/brands/${id}`), onSuccess: () => { onChange(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
      <div className="panel-title" style={{ marginBottom: '10px' }}>MARKALAR (TEDARİKÇİ)</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Yeni marka</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ör. MİLA SU" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create.mutate() }} /></div>
        <div><label className="form-label">Renk</label><input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '34px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--surface2)', cursor: 'pointer' }} /></div>
        <button className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Ekle</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {brands.map(b => (
          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: b.color ? `${b.color}18` : 'var(--surface2)', border: `1px solid ${b.color || 'var(--border)'}`, borderRadius: '999px', padding: '4px 10px', fontSize: '11px' }}>
            <input type="color" aria-label={`${b.name} rengi`} value={b.color || '#64748b'} onChange={e => update.mutate({ id: b.id, name: b.name, sort_order: b.sort_order, is_active: b.is_active !== 0, color: e.target.value })} style={{ width: '16px', height: '16px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} title="Rengi değiştir" />
            {b.name}
            <button onClick={async () => { if (await confirmDialog({ title: 'Markayı Sil', body: `"${b.name}" silinsin mi? (bağlı ürün varsa silinemez)`, danger: true })) del.mutate(b.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>✕</button>
          </span>
        ))}
        {brands.length === 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Marka yok</span>}
      </div>
    </div>
  )
}
