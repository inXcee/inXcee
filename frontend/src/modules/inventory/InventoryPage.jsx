import { useState, useMemo, useRef, memo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'

const CATEGORIES = [
  { key: 'laundry', label: 'Çamaşır', color: 'var(--blue)', icon: '♨', bg: 'rgba(52,152,219,.08)' },
  { key: 'maintenance', label: 'Bakım', color: 'var(--amber)', icon: '⚙', bg: 'rgba(240,165,0,.08)' },
  { key: 'housekeeping', label: 'Temizlik', color: 'var(--green)', icon: '◈', bg: 'rgba(39,201,106,.08)' },
  { key: 'general', label: 'Genel', color: 'var(--purple)', icon: '▨', bg: 'rgba(155,89,182,.08)' },
]
const UNITS = ['adet', 'kg', 'litre', 'paket', 'kutu', 'set', 'metre', 'g', 'ml']
const MOVE_LABEL = { in: 'GİRİŞ', out: 'ÇIKIŞ', count: 'SAYIM', initial: 'KAYIT' }
const MOVE_COLOR = { in: 'var(--green)', out: 'var(--red)', count: 'var(--blue)', initial: 'var(--text3)' }
const TABS = [
  { key: 'stock', label: 'STOK', icon: '▦' },
  { key: 'receipt', label: 'MAL GIRIS', icon: '↓' },
  { key: 'checkouts', label: 'TESLIMLER', icon: '→' },
  { key: 'history', label: 'HAREKETLER', icon: '↺' },
]

const fmt = d => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
const fmtDate = d => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const money = v => v > 0 ? v.toLocaleString('tr-TR', { minimumFractionDigits: 0 }) + ' TL' : '-'
const cat = key => CATEGORIES.find(c => c.key === key)

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, sub, color = 'var(--accent),var(--blue)', wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div className="fade-up" style={{
        position: 'relative', width: wide ? '680px' : '480px', maxWidth: '95vw', maxHeight: '88vh',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'auto',
        boxShadow: '0 24px 48px rgba(0,0,0,.25)',
      }}>
        <div style={{ height: '3px', background: `linear-gradient(90deg,${color})`, borderRadius: '16px 16px 0 0' }} />
        <div style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px' }}>{title}</div>
              {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '3px', letterSpacing: '1px' }}>{sub}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', transition: 'all .15s' }}>✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI ROW — Premium
// ─────────────────────────────────────────────────────────────────────────────
const KPIRow = memo(function KPIRow({ stats }) {
  if (!stats) return null
  const kpis = [
    { label: 'TOPLAM URUN', val: stats.total_items, color: 'var(--accent)', icon: '▦', gradient: 'linear-gradient(135deg, rgba(240,165,0,.06), rgba(240,165,0,.02))' },
    { label: 'DUSUK STOK', val: stats.low_stock, color: stats.low_stock > 0 ? 'var(--red)' : 'var(--green)', icon: '▼', gradient: stats.low_stock > 0 ? 'linear-gradient(135deg, rgba(231,76,60,.06), rgba(231,76,60,.02))' : 'linear-gradient(135deg, rgba(39,201,106,.06), rgba(39,201,106,.02))' },
    { label: 'TUKENMIS', val: stats.out_of_stock, color: stats.out_of_stock > 0 ? 'var(--red)' : 'var(--green)', icon: '✕', gradient: stats.out_of_stock > 0 ? 'linear-gradient(135deg, rgba(231,76,60,.06), rgba(231,76,60,.02))' : 'linear-gradient(135deg, rgba(39,201,106,.06), rgba(39,201,106,.02))' },
    { label: 'TOPLAM DEGER', val: money(stats.total_value || 0), color: 'var(--accent)', icon: '₺', small: true, gradient: 'linear-gradient(135deg, rgba(240,165,0,.06), rgba(240,165,0,.02))' },
    { label: 'AKTIF TESLIM', val: stats.active_checkouts || 0, color: 'var(--blue)', icon: '→', gradient: 'linear-gradient(135deg, rgba(52,152,219,.06), rgba(52,152,219,.02))' },
    { label: 'SON 24S', val: stats.movements_24h, color: 'var(--teal)', icon: '↺', gradient: 'linear-gradient(135deg, rgba(26,188,156,.06), rgba(26,188,156,.02))' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }} className="fade-up">
      {kpis.map(k => (
        <div key={k.label} style={{
          background: k.gradient, border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 18px',
          position: 'relative', overflow: 'hidden', transition: 'transform .15s, box-shadow .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,.08)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '20px', opacity: 0.12, color: k.color }}>{k.icon}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px' }}>{k.label}</div>
          <div style={{ fontFamily: k.small ? 'var(--mono)' : 'var(--display)', fontSize: k.small ? '16px' : '26px', color: k.color, letterSpacing: '1px', lineHeight: 1 }}>{k.val}</div>
        </div>
      ))}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY CHART — Premium
// ─────────────────────────────────────────────────────────────────────────────
const CategoryChart = memo(function CategoryChart({ stats }) {
  if (!stats?.by_category?.length) return null
  const mx = Math.max(...stats.by_category.map(c => c.value || 0), 1)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px', marginBottom: '20px',
    }} className="fade-up-1">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '14px' }}>KATEGORI BAZLI DEGER</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stats.by_category.map(c => {
          const ct = cat(c.category)
          const pct = mx > 0 ? ((c.value || 0) / mx) * 100 : 0
          return (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ct?.bg, fontSize: '14px',
              }}>{ct?.icon}</div>
              <div style={{ width: '55px', fontFamily: 'var(--mono)', fontSize: '10px', color: ct?.color, letterSpacing: '0.5px', flexShrink: 0 }}>{ct?.label}</div>
              <div style={{ flex: 1, height: '24px', background: 'var(--surface2)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  height: '100%', borderRadius: '8px', transition: 'width 0.8s cubic-bezier(.22,1,.36,1)', width: `${pct}%`,
                  background: `linear-gradient(90deg, ${ct?.color}, color-mix(in srgb, ${ct?.color} 60%, transparent))`,
                  opacity: 0.5,
                }} />
                <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', fontWeight: 600 }}>
                  {money(c.value || 0)}
                </span>
              </div>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px', background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', fontWeight: 700, flexShrink: 0,
              }}>{c.count}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// LOW STOCK ALERT — Premium
// ─────────────────────────────────────────────────────────────────────────────
const LowStockAlert = memo(function LowStockAlert({ items }) {
  const low = items.filter(i => i.reorder_threshold > 0 && i.quantity <= i.reorder_threshold)
  if (!low.length) return null
  return (
    <div style={{
      padding: '14px 18px', marginBottom: '16px', borderRadius: '14px',
      background: 'linear-gradient(135deg, rgba(231,76,60,.04), rgba(231,76,60,.01))',
      border: '1px solid rgba(231,76,60,.15)',
    }} className="fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '8px', background: 'rgba(231,76,60,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--red)' }}>!</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '2px', fontWeight: 700 }}>DUSUK STOK — {low.length} URUN</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {low.map(i => (
          <span key={i.id} style={{
            padding: '5px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
            background: 'rgba(231,76,60,.08)', color: 'var(--red)', fontFamily: 'var(--mono)',
            border: '1px solid rgba(231,76,60,.1)',
          }}>
            {i.item_name}: {i.quantity} {i.unit}
          </span>
        ))}
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// ITEM CARD — Premium
// ─────────────────────────────────────────────────────────────────────────────
const ItemCard = memo(function ItemCard({ item, onAdjust, onCheckout, onEdit, onShowLog, onDelete, forecastEntry }) {
  const ct = cat(item.category)
  const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold
  const isOut = item.quantity === 0
  const pct = item.reorder_threshold > 0 ? Math.min((item.quantity / (item.reorder_threshold * 3)) * 100, 100) : 100
  const val = (item.quantity || 0) * (item.unit_price || 0)
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isOut ? 'rgba(231,76,60,.2)' : isLow ? 'rgba(240,165,0,.2)' : 'var(--border)'}`,
      borderRadius: '14px', overflow: 'hidden', transition: 'transform .2s ease, box-shadow .2s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
      {/* Category accent */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${ct?.color || 'var(--text3)'}, transparent)`, opacity: 0.6 }} />
      <div style={{ padding: '16px 18px' }}>
        {/* Top: icon + name + status */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: ct?.bg, fontSize: '16px',
          }}>{ct?.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.item_name}
              </div>
              {forecastEntry && (
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                  background: forecastEntry.severity === 'critical'
                    ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.15)',
                  color: forecastEntry.severity === 'critical'
                    ? 'var(--red)' : 'var(--amber)',
                  border: `1px solid ${forecastEntry.severity === 'critical'
                    ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.3)'}`,
                }}>
                  ~{forecastEntry.days_left}g
                </span>
              )}
              {isOut && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(231,76,60,.1)', color: 'var(--red)', fontFamily: 'var(--mono)', flexShrink: 0 }}>TUKENDI</span>}
              {!isOut && isLow && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(240,165,0,.1)', color: 'var(--amber)', fontFamily: 'var(--mono)', flexShrink: 0 }}>DUSUK</span>}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '0.5px', marginTop: '2px' }}>
              {ct?.label} {item.location ? `· ${item.location}` : ''}
            </div>
          </div>
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: '28px', color: isOut ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--text)', letterSpacing: '1px', lineHeight: 1 }}>{item.quantity}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{item.unit}</span>
          </div>
          <div style={{ height: '5px', background: 'var(--surface2)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px', transition: 'width 0.6s cubic-bezier(.22,1,.36,1)', width: `${pct}%`,
              background: isOut ? 'var(--red)' : isLow ? 'linear-gradient(90deg, var(--amber), var(--red))' : 'linear-gradient(90deg, var(--green), var(--teal))',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            {item.reorder_threshold > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>min {item.reorder_threshold}</span>}
            {val > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', fontWeight: 600 }}>{money(val)}</span>}
          </div>
          {item.last_updated && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '4px' }}>
              güncellendi: {fmt(item.last_updated)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          {[
            { label: '+/-', color: 'var(--green)', fn: () => onAdjust(item), flex: true },
            { label: 'TESLİM', color: 'var(--blue)', fn: () => onCheckout(item), flex: true },
            { label: 'LOG', color: 'var(--purple)', fn: () => onShowLog(item), flex: false },
            { label: 'DÜZ', color: 'var(--accent)', fn: () => onEdit(item), flex: false },
            { label: 'SİL', color: 'var(--red)', fn: () => onDelete(item), flex: false },
          ].map(a => (
            <button key={a.label} onClick={a.fn} style={{
              flex: a.flex ? 1 : 'none',
              padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '8px',
              background: 'var(--surface)', color: a.color, fontSize: '9px', fontWeight: 700,
              fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.5px',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${a.color} 8%, var(--surface))` }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// ADJUST MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AdjustModal({ item, onClose, onSave, isPending }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const n = +delta
  return (
    <Modal onClose={onClose} title="STOK HAREKETI" sub={`${item.item_name} — Mevcut: ${item.quantity} ${item.unit}`} color="var(--green),var(--blue)">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '12px' }}>
        {[1, 5, 10, 25, 50, 100].map(v => (
          <button key={`p${v}`} onClick={() => setDelta(String(v))} style={{
            padding: '8px 4px', border: '1px solid var(--border)', borderRadius: '8px',
            background: delta === String(v) ? 'rgba(39,201,106,.1)' : 'var(--surface)',
            color: 'var(--green)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)',
            cursor: 'pointer', transition: 'all .15s',
          }}>+{v}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '16px' }}>
        {[1, 5, 10, 25, 50].map(v => (
          <button key={`m${v}`} onClick={() => setDelta(String(-v))} style={{
            padding: '8px 4px', border: '1px solid var(--border)', borderRadius: '8px',
            background: delta === String(-v) ? 'rgba(231,76,60,.1)' : 'var(--surface)',
            color: 'var(--red)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)',
            cursor: 'pointer', transition: 'all .15s',
          }}>-{v}</button>
        ))}
      </div>
      <input className="form-input" type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="miktar" autoFocus
        style={{ fontSize: '24px', fontFamily: 'var(--display)', textAlign: 'center', letterSpacing: '3px', marginBottom: '6px', borderRadius: '10px' }} />
      {n !== 0 && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px', color: n > 0 ? 'var(--green)' : 'var(--red)', marginBottom: '12px', padding: '8px', background: n > 0 ? 'rgba(39,201,106,.05)' : 'rgba(231,76,60,.05)', borderRadius: '8px' }}>
          {item.quantity} {n > 0 ? '+' : ''}{n} = <strong>{item.quantity + n}</strong> {item.unit}
        </div>
      )}
      <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Aciklama..." style={{ marginBottom: '16px', borderRadius: '10px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" style={{ flex: 1, borderRadius: '10px', padding: '12px' }} disabled={!n || (item.quantity + n < 0) || isPending}
          onClick={() => onSave({ id: item.id, delta: n, reason })}>
          {isPending ? '...' : n > 0 ? `+${n} GIRIS` : `${n} CIKIS`}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT MODAL (Teslim — step-by-step)
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutModal({ item, onClose }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }) }
  const [step, setStep] = useState(0)
  const [personQ, setPersonQ] = useState('')
  const [person, setPerson] = useState(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const { data: results = [] } = useQuery({
    queryKey: ['inv-person-search', personQ],
    queryFn: () => api.get(`/inventory/personnel/search?q=${personQ}`).then(r => r.data),
    enabled: personQ.length >= 2,
  })

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/checkout', d),
    onSuccess: () => { inv(); setStep(2) },
  })

  return (
    <Modal onClose={onClose} title="MALZEME TESLIM" sub={item.item_name} color="var(--blue),var(--teal)">
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px' }}>
        {['PERSONEL', 'MIKTAR', 'TAMAM'].map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
                background: step >= i ? (step === i ? 'var(--accent)' : 'var(--green)') : 'var(--surface3)',
                color: step >= i ? '#000' : 'var(--text3)',
                transition: 'all .3s',
              }}>{step > i ? '✓' : i + 1}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px', color: step === i ? 'var(--accent)' : 'var(--text4)' }}>{s}</div>
            </div>
            {i < 2 && <div style={{ width: '24px', height: '2px', borderRadius: '1px', background: step > i ? 'var(--green)' : 'var(--border)', transition: 'background .3s' }} />}
          </div>
        ))}
      </div>

      {/* Step 0: Person search */}
      {step === 0 && (
        <div>
          <label className="form-label">Personel Ara</label>
          <input className="form-input" value={personQ} onChange={e => setPersonQ(e.target.value)}
            placeholder="Ad, firma veya telefon..." autoFocus style={{ borderRadius: '10px' }} />
          <div style={{ maxHeight: '240px', overflow: 'auto', marginTop: '10px' }}>
            {results.map(p => (
              <div key={p.id} onClick={() => { setPerson(p); setStep(1) }} style={{
                padding: '12px 14px', cursor: 'pointer', borderRadius: '10px', marginBottom: '5px',
                border: '1px solid var(--border)', transition: 'all 0.15s',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(240,165,0,.03)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{p.company || '-'} · {p.job_title || '-'}</div>
                </div>
                {p.block && <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', background: 'rgba(240,165,0,.06)', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>{p.block}-{p.room_no}</span>}
              </div>
            ))}
            {personQ.length >= 2 && results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Sonuc bulunamadi</div>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Quantity */}
      {step === 1 && (
        <div>
          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(52,152,219,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{person?.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{person?.company || '-'} {person?.block ? `· ${person.block}-${person.room_no}` : ''}</div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setStep(0)} style={{ borderRadius: '8px' }}>degistir</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '16px' }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={{
              width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
            }}>-</button>
            <input className="form-input" type="number" min="1" max={item.quantity} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(item.quantity, +e.target.value)))}
              style={{ width: '100px', textAlign: 'center', fontFamily: 'var(--display)', fontSize: '30px', letterSpacing: '2px', borderRadius: '12px' }} />
            <button onClick={() => setQty(Math.min(item.quantity, qty + 1))} style={{
              width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
            }}>+</button>
          </div>
          <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '16px', padding: '8px', background: 'var(--surface2)', borderRadius: '8px' }}>
            Stok: {item.quantity} {item.unit} → Teslim sonrasi: <strong style={{ color: 'var(--accent)' }}>{item.quantity - qty}</strong> {item.unit}
          </div>

          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Not (opsiyonel)..." style={{ marginBottom: '16px', borderRadius: '10px' }} />

          {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '12px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '10px', fontSize: '12px' }}
            disabled={mut.isPending} onClick={() => mut.mutate({ item_id: item.id, personnel_id: person.id, quantity: qty, note })}>
            {mut.isPending ? 'KAYDEDILIYOR...' : `${qty} ${item.unit} TESLIM ET`}
          </button>
        </div>
      )}

      {/* Step 2: Done */}
      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '24px', color: 'var(--green)' }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', marginBottom: '8px' }}>TESLIM KAYDEDILDI</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
            {qty} {item.unit} {item.item_name} → {person?.full_name}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            <button className="btn btn-primary" onClick={() => { setPerson(null); setPersonQ(''); setQty(1); setNote(''); setStep(0) }} style={{ borderRadius: '10px' }}>YENI TESLIM</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG MODAL
// ─────────────────────────────────────────────────────────────────────────────
function LogModal({ item, onClose }) {
  const { data: moves = [] } = useQuery({
    queryKey: ['inv-moves', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/movements`).then(r => r.data),
  })
  return (
    <Modal onClose={onClose} title="HAREKET GECMISI" sub={item.item_name} color="var(--purple),var(--accent)" wide>
      {moves.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Hareket yok</div>
      ) : (
        <div style={{ maxHeight: '380px', overflow: 'auto' }}>
          {moves.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                color: MOVE_COLOR[m.type], fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
              }}>{m.delta > 0 ? '+' : ''}{m.delta}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
                    padding: '2px 6px', borderRadius: '4px',
                    background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                    color: MOVE_COLOR[m.type], letterSpacing: '0.5px',
                  }}>{MOVE_LABEL[m.type]}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.reason || '-'}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '2px' }}>
                  {fmt(m.created_at)} · {m.username} · Sonuc: {m.quantity_after} {m.unit}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────────
const INIT_F = { item_name: '', quantity: 0, unit: 'adet', reorder_threshold: 0, category: 'general', location: '', unit_price: 0 }

function EditModal({ item, onClose, onSave, isPending }) {
  const [f, sf] = useState(item || INIT_F)
  const u = (k, v) => sf(p => ({ ...p, [k]: v }))
  const draftKey = item?.id ? null : 'draft:inventory:new-item'
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft(
    draftKey ?? 'draft:inventory:new-item',
    f,
    sf,
    item || INIT_F,
  )
  return (
    <Modal onClose={onClose} title={item?.id ? 'URUN DUZENLE' : 'YENI URUN'} sub="ENVANTER KAYIT FORMU" color="var(--accent),var(--blue)">
      {!item?.id && <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Urun Adi</label>
          <input className="form-input" value={f.item_name} onChange={e => u('item_name', e.target.value)} autoFocus style={{ borderRadius: '10px' }} />
        </div>
        <div><label className="form-label">Miktar</label><input className="form-input" type="number" min="0" step="any" value={f.quantity} onChange={e => u('quantity', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Birim</label><select className="form-select" value={f.unit} onChange={e => u('unit', e.target.value)} style={{ borderRadius: '10px' }}>{UNITS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label className="form-label">Kategori</label><select className="form-select" value={f.category} onChange={e => u('category', e.target.value)} style={{ borderRadius: '10px' }}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}</select></div>
        <div><label className="form-label">Min. Esik</label><input className="form-input" type="number" min="0" value={f.reorder_threshold} onChange={e => u('reorder_threshold', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Konum</label><input className="form-input" value={f.location || ''} onChange={e => u('location', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Birim Fiyat (TL)</label><input className="form-input" type="number" min="0" step="any" value={f.unit_price || 0} onChange={e => u('unit_price', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!f.item_name || isPending} onClick={() => { if (!item?.id) onSubmitSuccess(); onSave(f) }} style={{ borderRadius: '10px' }}>
          {isPending ? '...' : item?.id ? 'GUNCELLE' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CountModal({ items, onClose }) {
  const qc = useQueryClient()
  const [catF, setCatF] = useState('')
  const [counts, setCounts] = useState(() => Object.fromEntries(items.map(i => [i.id, i.quantity])))
  const [result, setResult] = useState(null)
  const refs = useRef({})

  const filtered = catF ? items.filter(i => i.category === catF) : items
  const changed = items.filter(i => counts[i.id] !== i.quantity)

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/bulk-count', { items: d }).then(r => r.data),
    onSuccess: d => { setResult(d); qc.invalidateQueries() },
  })

  const handleKey = (e, idx) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const nxt = filtered[idx + 1]; if (nxt) refs.current[nxt.id]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); const prev = filtered[idx - 1]; if (prev) refs.current[prev.id]?.focus() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div className="fade-up" style={{ position: 'relative', width: '720px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,.25)' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg,var(--teal),var(--green))' }} />

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px' }}>STOK SAYIMI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
              {filtered.length} urun · {changed.length} degisiklik · Enter ile gecis
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>✕</button>
        </div>

        <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <button onClick={() => setCatF('')} className={`btn btn-xs ${!catF ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TUMU</button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCatF(c.key)}
              className={`btn btn-xs ${catF === c.key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '8px', ...(catF === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {result ? (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--green)' }}>✓</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px' }}>SAYIM TAMAMLANDI</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{result.updated} guncellendi · {result.skipped || 0} degismedi</div>
              {result.errors?.length > 0 && <div className="alert alert-danger"><span>!</span><span>{result.errors.join(', ')}</span></div>}
              <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            </div>
          ) : (
            <table className="data-table" style={{ margin: 0 }}>
              <thead><tr><th>#</th><th>URUN</th><th>KAT.</th><th>SISTEM</th><th style={{ width: '110px' }}>SAYIM</th><th>FARK</th></tr></thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const diff = counts[item.id] - item.quantity
                  const ct = cat(item.category)
                  return (
                    <tr key={item.id} style={{ background: diff > 0 ? 'rgba(39,201,106,.03)' : diff < 0 ? 'rgba(231,76,60,.03)' : undefined }}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px' }}>{item.item_name}</td>
                      <td><span style={{ fontSize: '12px' }}>{ct?.icon}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{item.quantity} <span style={{ fontSize: '9px' }}>{item.unit}</span></td>
                      <td>
                        <input ref={el => refs.current[item.id] = el}
                          className="form-input" type="number" min="0" step="any"
                          value={counts[item.id]} onChange={e => setCounts(p => ({ ...p, [item.id]: +e.target.value }))}
                          onFocus={e => e.target.select()} onKeyDown={e => handleKey(e, idx)}
                          style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px', borderRadius: '8px',
                            borderColor: diff !== 0 ? (diff > 0 ? 'rgba(39,201,106,.5)' : 'rgba(231,76,60,.5)') : undefined }} />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center',
                        color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text4)' }}>
                        {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!result && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: changed.length > 0 ? 'var(--accent)' : 'var(--text4)' }}>
              {changed.length > 0 ? changed.slice(0, 3).map(i => `${i.item_name}: ${i.quantity}→${counts[i.id]}`).join(' · ') : 'Degisiklik yok'}
              {changed.length > 3 ? ` +${changed.length - 3}` : ''}
            </span>
            <button className="btn btn-primary" disabled={changed.length === 0 || mut.isPending}
              onClick={() => mut.mutate(changed.map(i => ({ id: i.id, counted_qty: counts[i.id] })))} style={{ borderRadius: '10px' }}>
              {mut.isPending ? '...' : `${changed.length} KAYDET`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GOODS RECEIPT MODAL (Mal Giris)
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptModal({ items, onClose }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['inv-recent-moves'] }); qc.invalidateQueries({ queryKey: ['goods-receipts'] }) }

  const [supplier, setSupplier] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ item_id: '', quantity: '', unit_price: '' }])
  const [lineSearches, setLineSearches] = useState({})
  const [result, setResult] = useState(null)

  const updateLineSearch = (idx, val) => setLineSearches(p => ({ ...p, [idx]: val }))

  const addLine = () => setLines(p => [...p, { item_id: '', quantity: '', unit_price: '' }])
  const removeLine = idx => setLines(p => p.filter((_, i) => i !== idx))
  const updateLine = (idx, key, val) => setLines(p => p.map((l, i) => i === idx ? { ...l, [key]: val } : l))

  const totalValue = lines.reduce((sum, l) => {
    const q = +l.quantity || 0
    const p = +l.unit_price || (items.find(i => i.id === +l.item_id)?.unit_price || 0)
    return sum + q * p
  }, 0)

  const validLines = lines.filter(l => l.item_id && +l.quantity > 0)

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/receipts', d),
    onSuccess: d => { inv(); setResult(d.data) },
  })

  if (result) {
    return (
      <Modal onClose={onClose} title="MAL GIRIS KAYDEDILDI" color="var(--green),var(--teal)">
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '24px', color: 'var(--green)' }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', marginBottom: '6px' }}>KAYIT TAMAMLANDI</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', marginBottom: '4px', fontWeight: 700 }}>{result.receipt_no}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
            {validLines.length} kalem · {money(result.total_value)}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            <button className="btn btn-primary" onClick={() => { setResult(null); setSupplier(''); setInvoiceNo(''); setNotes(''); setLines([{ item_id: '', quantity: '', unit_price: '' }]) }} style={{ borderRadius: '10px' }}>YENI GIRIS</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} title="MAL GIRIS" sub="TEDARIKCI SIPARIS KAYDI" color="var(--green),var(--blue)" wide>
      {/* Supplier info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Tedarikci / Firma *</label>
          <input className="form-input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Tedarikci adi..." autoFocus style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Fatura No</label>
          <input className="form-input" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Opsiyonel" style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Tarih</label>
          <input className="form-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px' }}>KALEMLER</div>
          <button onClick={addLine} style={{
            padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '8px',
            background: 'var(--surface)', color: 'var(--green)', fontSize: '10px', fontWeight: 700,
            fontFamily: 'var(--mono)', cursor: 'pointer',
          }}>+ EKLE</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lines.map((line, idx) => {
            const selectedItem = items.find(i => i.id === +line.item_id)
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 90px 28px', gap: '6px', alignItems: 'end',
                padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)',
              }}>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>ÜRÜN</label>
                  <input className="form-input" placeholder="Ürün ara..." value={lineSearches[idx] ?? ''}
                    onChange={e => updateLineSearch(idx, e.target.value)}
                    style={{ borderRadius: '8px', fontSize: '11px', marginBottom: '3px' }} />
                  <select className="form-select" value={line.item_id} onChange={e => {
                    updateLine(idx, 'item_id', e.target.value)
                    updateLineSearch(idx, '')
                    const it = items.find(i => i.id === +e.target.value)
                    if (it && !line.unit_price) updateLine(idx, 'unit_price', it.unit_price || '')
                  }} style={{ borderRadius: '8px', fontSize: '11px' }}>
                    <option value="">Ürün seç...</option>
                    {items.filter(i => !lineSearches[idx] || i.item_name.toLowerCase().includes(lineSearches[idx].toLowerCase())).map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.quantity} {i.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>MIKTAR</label>
                  <input className="form-input" type="number" min="0" step="any" value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)}
                    placeholder={selectedItem ? selectedItem.unit : '0'}
                    style={{ borderRadius: '8px', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', textAlign: 'center' }} />
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>FIYAT</label>
                  <input className="form-input" type="number" min="0" step="any" value={line.unit_price}
                    onChange={e => updateLine(idx, 'unit_price', e.target.value)}
                    placeholder="TL"
                    style={{ borderRadius: '8px', fontSize: '12px', fontFamily: 'var(--mono)', textAlign: 'center' }} />
                </div>
                <button onClick={() => removeLine(idx)} disabled={lines.length <= 1} style={{
                  width: '28px', height: '32px', border: '1px solid var(--border)', borderRadius: '8px',
                  background: 'var(--surface)', color: lines.length > 1 ? 'var(--red)' : 'var(--text4)',
                  cursor: lines.length > 1 ? 'pointer' : 'default', fontSize: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Notes */}
      <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not (opsiyonel)..." style={{ marginBottom: '16px', borderRadius: '10px' }} />

      {/* Footer */}
      {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '12px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
          {validLines.length} kalem · {money(totalValue)}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
          <button className="btn btn-primary" style={{ borderRadius: '10px', padding: '10px 20px' }}
            disabled={!supplier || validLines.length === 0 || mut.isPending}
            onClick={() => mut.mutate({
              supplier, invoice_no: invoiceNo, receipt_date: receiptDate, notes,
              items: validLines.map(l => ({ item_id: +l.item_id, quantity: +l.quantity, unit_price: +l.unit_price || undefined }))
            })}>
            {mut.isPending ? 'KAYDEDILIYOR...' : 'MAL GIRIS KAYDET'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptDetailModal({ receiptId, onClose }) {
  const { data: receipt } = useQuery({
    queryKey: ['receipt-detail', receiptId],
    queryFn: () => api.get(`/inventory/receipts/${receiptId}`).then(r => r.data),
  })
  if (!receipt) return null
  return (
    <Modal onClose={onClose} title={receipt.receipt_no} sub={`${receipt.supplier} · ${fmtDate(receipt.receipt_date)}`} color="var(--green),var(--teal)" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>TEDARIKCI</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{receipt.supplier}</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>FATURA NO</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{receipt.invoice_no || '-'}</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>TOPLAM</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{money(receipt.total_value)}</div>
        </div>
      </div>

      {receipt.notes && (
        <div style={{ padding: '10px 12px', background: 'rgba(240,165,0,.04)', border: '1px solid rgba(240,165,0,.1)', borderRadius: '10px', marginBottom: '14px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
          {receipt.notes}
        </div>
      )}

      <table className="data-table" style={{ margin: 0 }}>
        <thead><tr><th>URUN</th><th>KAT.</th><th>MIKTAR</th><th>BIRIM FIYAT</th><th>TOPLAM</th></tr></thead>
        <tbody>
          {receipt.items?.map(ri => {
            const ct = cat(ri.category)
            return (
              <tr key={ri.id}>
                <td style={{ fontWeight: 500, fontSize: '12px' }}>{ri.item_name}</td>
                <td><span style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 600, background: ct?.bg, color: ct?.color, fontFamily: 'var(--mono)' }}>{ct?.icon} {ct?.label}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{ri.quantity} <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>{ri.unit}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{money(ri.unit_price)}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{money(ri.quantity * ri.unit_price)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>Kaydeden: {receipt.created_by_name} · {fmt(receipt.created_at)}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{money(receipt.total_value)}</div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE CHECKOUTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ActiveCheckoutsPanel({ fullView }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }) }
  const [returningId, setReturningId] = useState(null)
  const [returnQty, setReturnQty] = useState(1)

  const { data: checkouts = [] } = useQuery({
    queryKey: ['checkouts-active'],
    queryFn: () => api.get('/inventory/checkouts/active').then(r => r.data),
    refetchInterval: 30000,
  })

  const returnMut = useMutation({
    mutationFn: ({ id, qty }) => api.post(`/inventory/return/${id}`, { quantity: qty }),
    onSuccess: () => { inv(); setReturningId(null) },
  })

  if (!fullView && checkouts.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', ...(fullView ? {} : { marginTop: '20px' }) }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--red))' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>AKTİF TESLİMLER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{checkouts.length} MALZEME PERSONELDE</div>
        </div>
      </div>
      {checkouts.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Aktif teslim yok</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th>PERSONEL</th><th>ODA</th><th>MALZEME</th><th>ADET</th><th>TARİH</th><th>VEREN</th><th>İADE</th></tr></thead>
            <tbody>
              {checkouts.map(co => {
                const remaining = co.quantity - co.returned_qty
                return (
                  <tr key={co.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>{co.personnel_name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{co.company || '-'}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{co.block ? `${co.block}-${co.room_no}` : '-'}</td>
                    <td style={{ fontSize: '12px' }}>{co.item_name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{remaining} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text3)' }}>{co.unit}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(co.checked_out_at)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{co.given_by}</td>
                    <td>
                      {returningId === co.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input type="number" min="1" max={remaining} value={returnQty}
                            onChange={e => setReturnQty(Math.max(1, Math.min(remaining, +e.target.value)))}
                            style={{ width: '52px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                          <button onClick={() => returnMut.mutate({ id: co.id, qty: returnQty })} disabled={returnMut.isPending}
                            style={{ padding: '4px 8px', border: '1px solid rgba(39,201,106,.3)', borderRadius: '6px', background: 'rgba(39,201,106,.08)', color: 'var(--green)', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setReturningId(null)}
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setReturningId(co.id); setReturnQty(remaining) }}
                          style={{
                            padding: '5px 12px', border: '1px solid rgba(39,201,106,.2)', borderRadius: '8px',
                            background: 'rgba(39,201,106,.05)', color: 'var(--green)', fontSize: '9px', fontWeight: 700,
                            fontFamily: 'var(--mono)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(39,201,106,.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(39,201,106,.05)' }}>
                          İADE
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUTS TAB VIEW — Aktif + Geçmiş toggle
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutsTabView() {
  const [view, setView] = useState('active')
  const { data: history = [] } = useQuery({
    queryKey: ['checkouts-history'],
    queryFn: () => api.get('/inventory/checkouts/history?limit=100').then(r => r.data),
    enabled: view === 'history',
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '3px', width: 'fit-content' }}>
        {[['active', 'AKTİF'], ['history', 'GEÇMİŞ']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{
            padding: '7px 20px', border: 'none', borderRadius: '9px', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
            background: view === key ? 'var(--accent)' : 'transparent',
            color: view === key ? '#000' : 'var(--text3)',
          }}>{label}</button>
        ))}
      </div>
      {view === 'active' && <ActiveCheckoutsPanel fullView />}
      {view === 'history' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>TESLİM GEÇMİŞİ</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{history.length} KAYIT (İADE EDİLENLER DAHİL)</div>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Geçmiş kayıt yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ margin: 0 }}>
                <thead><tr><th>PERSONEL</th><th>MALZEME</th><th>ADET</th><th>TESLİM TARİHİ</th><th>İADE TARİHİ</th><th>VEREN</th><th>DURUM</th></tr></thead>
                <tbody>
                  {history.map(co => (
                    <tr key={co.id} style={{ opacity: co.returned_at ? 0.7 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: '12px' }}>{co.personnel_name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{co.company || '-'}</div>
                      </td>
                      <td style={{ fontSize: '12px' }}>{co.item_name}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{co.quantity} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text3)' }}>{co.unit}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(co.checked_out_at)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: co.returned_at ? 'var(--green)' : 'var(--text4)', whiteSpace: 'nowrap' }}>
                        {co.returned_at ? fmt(co.returned_at) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{co.given_by}</td>
                      <td>
                        {co.returned_at
                          ? <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(39,201,106,.08)', color: 'var(--green)', fontFamily: 'var(--mono)' }}>İADE</span>
                          : <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(52,152,219,.08)', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>AKTİF</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPTS LIST PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptsListPanel({ onNewReceipt }) {
  const [detailId, setDetailId] = useState(null)
  const { data: receipts = [] } = useQuery({
    queryKey: ['goods-receipts'],
    queryFn: () => api.get('/inventory/receipts').then(r => r.data),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px' }}>{receipts.length} MAL GIRIS KAYDI</div>
        <button onClick={onNewReceipt} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI MAL GIRIS</button>
      </div>

      {receipts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', color: 'var(--text3)',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>↓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>MAL GIRIS KAYDI YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '16px' }}>Ilk tedarik kaydini olustur</div>
          <button onClick={onNewReceipt} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI MAL GIRIS</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {receipts.map(r => (
            <div key={r.id} onClick={() => setDetailId(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
              cursor: 'pointer', transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(39,201,106,.06)', fontSize: '16px', color: 'var(--green)',
              }}>↓</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>{r.receipt_no}</span>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{r.supplier}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {fmtDate(r.receipt_date)} · {r.item_count} kalem · {r.created_by_name}
                  {r.invoice_no ? ` · Fatura: ${r.invoice_no}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
                {money(r.total_value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailId && <ReceiptDetailModal receiptId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RECENT MOVEMENTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function RecentMovements({ fullView }) {
  const [typeFilter, setTypeFilter] = useState('')
  const { data: moves = [] } = useQuery({
    queryKey: ['inv-recent-moves'],
    queryFn: () => api.get(`/inventory/movements/recent?limit=${fullView ? 100 : 8}`).then(r => r.data),
    refetchInterval: 30000,
  })
  const displayed = typeFilter ? moves.filter(m => m.type === typeFilter) : moves
  if (!fullView && !moves.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', ...(fullView ? {} : { marginTop: '20px' }) }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--purple))' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>SON HAREKETLER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{fullView ? `${displayed.length} hareket gösteriliyor` : 'SON 8 STOK İŞLEM'}</div>
        </div>
        {fullView && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['', 'TÜMÜ'], ['in', 'GİRİŞ'], ['out', 'ÇIKIŞ'], ['count', 'SAYIM'], ['initial', 'KAYIT']].map(([key, label]) => (
              <button key={key} onClick={() => setTypeFilter(key)}
                style={{
                  padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px',
                  background: typeFilter === key ? (key === 'in' ? 'var(--green)' : key === 'out' ? 'var(--red)' : key === 'count' ? 'var(--blue)' : 'var(--accent)') : 'var(--surface)',
                  color: typeFilter === key ? '#000' : key === 'in' ? 'var(--green)' : key === 'out' ? 'var(--red)' : key === 'count' ? 'var(--blue)' : 'var(--text3)',
                  borderColor: typeFilter === key ? 'transparent' : 'var(--border)',
                }}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {displayed.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Hareket yok</div>
      ) : (
        <div style={{ padding: '0 18px 14px' }}>
          {(fullView ? displayed : displayed.slice(0, 8)).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                color: MOVE_COLOR[m.type], fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
              }}>{m.delta > 0 ? '+' : ''}{m.delta}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{m.item_name}</span>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
                    padding: '1px 5px', borderRadius: '4px',
                    background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                    color: MOVE_COLOR[m.type], letterSpacing: '0.5px',
                  }}>{MOVE_LABEL[m.type]}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '1px' }}>
                  {m.reason || '-'} · {m.username} · {fmt(m.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('stock')
  const [view, setView] = useState('grid')
  const [searchInput, setSearchInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const searchTimer = useRef(null)
  const [catFilter, setCatFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [adjustItem, setAdjustItem] = useState(null)
  const [checkoutItem, setCheckoutItem] = useState(null)
  const [logItem, setLogItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showCount, setShowCount] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['inv-recent-moves'] }) }

  const { data: items = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => api.get('/inventory').then(r => r.data) })
  const { data: stats } = useQuery({ queryKey: ['inventory-stats'], queryFn: () => api.get('/inventory/stats').then(r => r.data), staleTime: 15000 })
  const { data: forecast = [] } = useQuery({
    queryKey: ['inventory-forecast'],
    queryFn: () => api.get('/inventory/forecast').then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })

  const createMut = useMutation({ mutationFn: d => api.post('/inventory', d), onSuccess: () => { inv(); setShowNew(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => api.put(`/inventory/${id}`, d), onSuccess: () => { inv(); setEditItem(null) } })
  const deleteMut = useMutation({ mutationFn: id => api.delete(`/inventory/${id}`), onSuccess: inv })
  const adjustMut = useMutation({ mutationFn: ({ id, delta, reason }) => api.patch(`/inventory/${id}/adjust`, { delta, reason }), onSuccess: () => { inv(); setAdjustItem(null) } })

  const forecastMap = useMemo(() => {
    const m = {}
    forecast.forEach(f => { m[f.id] = f })
    return m
  }, [forecast])

  const filtered = useMemo(() => {
    let list = items
    if (catFilter) list = list.filter(i => i.category === catFilter)
    if (searchQ.trim()) { const q = searchQ.toLowerCase(); list = list.filter(i => i.item_name.toLowerCase().includes(q) || (i.location || '').toLowerCase().includes(q)) }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.item_name.localeCompare(b.item_name)
      if (sortBy === 'qty-asc') return a.quantity - b.quantity
      if (sortBy === 'qty-desc') return b.quantity - a.quantity
      if (sortBy === 'value') return (b.quantity * (b.unit_price || 0)) - (a.quantity * (a.unit_price || 0))
      return 0
    })
  }, [items, searchQ, catFilter, sortBy])

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '1100px' }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '5px', color: 'var(--text)', margin: 0 }}>
            ENVANTER<HelpHint topic="inventory" title="ENVANTER" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '5px', letterSpacing: '1.5px' }}>STOK TAKİP · MAL GİRİŞ · MALZEME TESLİM · SAYIM</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => api.get('/inventory/export/csv', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'envanter.csv'; a.click(); URL.revokeObjectURL(url) })} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px' }}>CSV</button>
          <button onClick={() => setShowCount(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px' }}>SAYIM</button>
          <button onClick={() => setShowReceipt(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px', color: 'var(--green)' }}>↓ MAL GIRIS</button>
          <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ URUN</button>
        </div>
      </div>

      {/* KPI + Chart */}
      <KPIRow stats={stats} />
      <CategoryChart stats={stats} />
      <LowStockAlert items={items} />

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

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '4px',
      }} className="fade-up-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: '10px',
            background: activeTab === t.key ? 'var(--accent)' : 'transparent',
            color: activeTab === t.key ? '#000' : 'var(--text3)',
            fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '1.5px',
            cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <span style={{ fontSize: '13px' }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB: STOCK ═══════════════ */}
      {activeTab === 'stock' && (
        <>
          {/* Toolbar */}
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px',
          }}>
            <input className="form-input" value={searchInput}
              onChange={e => { const v = e.target.value; setSearchInput(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchQ(v), 150) }}
              placeholder="Urun veya konum ara..." style={{ flex: '1 1 180px', fontSize: '12px', borderRadius: '10px' }} />
            <div style={{ display: 'flex', gap: '3px' }}>
              <button onClick={() => setCatFilter('')} className={`btn btn-xs ${!catFilter ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TUMU</button>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)}
                  className={`btn btn-xs ${catFilter === c.key ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '8px', ...(catFilter === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
                  {c.icon}
                </button>
              ))}
            </div>
            <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ width: 'auto', fontSize: '10px', padding: '5px 8px', borderRadius: '8px' }}>
              <option value="name">A-Z</option>
              <option value="qty-asc">Az stok</option>
              <option value="qty-desc">Cok stok</option>
              <option value="value">Deger</option>
            </select>
            <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px' }}>
              <button onClick={() => setView('grid')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px',
                background: view === 'grid' ? 'var(--surface3)' : 'transparent', color: view === 'grid' ? 'var(--text)' : 'var(--text3)', fontWeight: 600, transition: 'all .15s' }}>▦</button>
              <button onClick={() => setView('table')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px',
                background: view === 'table' ? 'var(--surface3)' : 'transparent', color: view === 'table' ? 'var(--text)' : 'var(--text3)', fontWeight: 600, transition: 'all .15s' }}>≡</button>
            </div>
          </div>

          {/* Grid View */}
          {view === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }} className="fade-up-2">
              {filtered.map(item => (
                <ItemCard key={item.id} item={item}
                  onAdjust={setAdjustItem} onCheckout={setCheckoutItem} onEdit={setEditItem} onShowLog={setLogItem}
                  onDelete={it => { if (window.confirm(`"${it.item_name}" silinsin mi?`)) deleteMut.mutate(it.id) }}
                  forecastEntry={forecastMap[item.id]} />
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.3 }}>▦</div>
                  Urun bulunamadi
                </div>
              )}
            </div>
          )}

          {/* Table View */}
          {view === 'table' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }} className="fade-up-2">
              <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
              <div style={{ overflowX: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Urun bulunamadi</div>
                ) : (
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead><tr><th>URUN</th><th>KAT.</th><th>STOK</th><th>ESIK</th><th>DURUM</th><th>KONUM</th><th>DEGER</th><th style={{ textAlign: 'center' }}>ISLEM</th></tr></thead>
                    <tbody>
                      {filtered.map(item => {
                        const ct = cat(item.category)
                        const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold
                        const isOut = item.quantity === 0
                        const val = (item.quantity || 0) * (item.unit_price || 0)
                        return (
                          <tr key={item.id} style={{ background: isOut ? 'rgba(231,76,60,.02)' : isLow ? 'rgba(240,165,0,.02)' : undefined }}>
                            <td style={{ fontWeight: 600, fontSize: '12px' }}>
                              {item.item_name}
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
                            </td>
                            <td><span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 600,
                              background: ct?.bg, color: ct?.color, fontFamily: 'var(--mono)' }}>{ct?.icon} {ct?.label}</span></td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: isOut ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--text)' }}>
                              {item.quantity} <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>{item.unit}</span></td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '11px' }}>{item.reorder_threshold > 0 ? item.reorder_threshold : '-'}</td>
                            <td>{isOut ? <span className="badge badge-red" style={{ fontSize: '8px' }}>TUKENDI</span>
                              : isLow ? <span className="badge badge-amber" style={{ fontSize: '8px' }}>DUSUK</span>
                              : <span className="badge badge-green" style={{ fontSize: '8px' }}>OK</span>}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{item.location || '-'}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>{money(val)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--green)', borderRadius: '6px' }} onClick={() => setAdjustItem(item)}>+/-</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--blue)', borderRadius: '6px' }} onClick={() => setCheckoutItem(item)}>TES</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--purple)', borderRadius: '6px' }} onClick={() => setLogItem(item)}>LOG</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--accent)', borderRadius: '6px' }} onClick={() => setEditItem(item)}>DUZ</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderRadius: '6px' }}
                                  onClick={() => { if (confirm(`${item.item_name} silinsin mi?`)) deleteMut.mutate(item.id) }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Mini panels on stock tab */}
          <ActiveCheckoutsPanel />
          <RecentMovements />
        </>
      )}

      {/* ═══════════════ TAB: RECEIPT ═══════════════ */}
      {activeTab === 'receipt' && (
        <ReceiptsListPanel onNewReceipt={() => setShowReceipt(true)} />
      )}

      {/* ═══════════════ TAB: CHECKOUTS ═══════════════ */}
      {activeTab === 'checkouts' && (
        <CheckoutsTabView />
      )}

      {/* ═══════════════ TAB: HISTORY ═══════════════ */}
      {activeTab === 'history' && (
        <RecentMovements fullView />
      )}

      {/* Modals */}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={d => adjustMut.mutate(d)} isPending={adjustMut.isPending} />}
      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} />}
      {logItem && <LogModal item={logItem} onClose={() => setLogItem(null)} />}
      {editItem && <EditModal item={editItem} onClose={() => setEditItem(null)} onSave={d => updateMut.mutate({ id: editItem.id, ...d })} isPending={updateMut.isPending} />}
      {showNew && <EditModal item={null} onClose={() => setShowNew(false)} onSave={d => createMut.mutate(d)} isPending={createMut.isPending} />}
      {showCount && <CountModal items={items} onClose={() => setShowCount(false)} />}
      {showReceipt && <ReceiptModal items={items} onClose={() => setShowReceipt(false)} />}
    </div>
  )
}
