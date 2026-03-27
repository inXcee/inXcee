import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

/* ── Status config ─────────────────────────────────────────── */
const FLOW = ['dirty', 'washing', 'ready', 'delivered']
const FLOW_LABELS = { dirty: 'Sepet', washing: 'Yıkama', ready: 'Hazır', delivered: 'Teslim' }
const FLOW_COLORS = {
  dirty:     'var(--accent)',
  washing:   'var(--blue)',
  ready:     'var(--green)',
  delivered: 'var(--text3)',
}

/* ── Urgent glow keyframes (injected once) ──────────────────── */
const STYLE_ID = 'lc-urgent-glow'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes urgentPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(231,76,60,0); }
      50%      { box-shadow: 0 0 18px 4px rgba(231,76,60,0.22); }
    }
    @keyframes slaSlide { from { width:0 } }
    .item-card-urgent { animation: urgentPulse 2.4s ease-in-out infinite; }
    .lc-action-btn {
      flex: 1;
      padding: 8px 10px;
      border-radius: 8px;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .lc-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .lc-action-btn.primary {
      background: var(--accent);
      color: #000;
    }
    .lc-action-btn.primary:not(:disabled):hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(240,165,0,0.35);
    }
    .lc-action-btn.success {
      background: rgba(39,201,106,0.12);
      color: var(--green);
      border: 1px solid rgba(39,201,106,0.25);
    }
    .lc-action-btn.success:not(:disabled):hover {
      background: rgba(39,201,106,0.22);
      transform: translateY(-1px);
    }
    .lc-action-btn.ghost {
      background: rgba(255,255,255,0.04);
      color: var(--text2);
      border: 1px solid var(--border);
    }
    .lc-action-btn.ghost:not(:disabled):hover {
      border-color: var(--border2);
      color: var(--text);
    }
    .lc-action-btn.danger {
      background: rgba(231,76,60,0.1);
      color: var(--red);
      border: 1px solid rgba(231,76,60,0.2);
    }
    .lc-action-btn.danger:not(:disabled):hover {
      background: rgba(231,76,60,0.2);
    }
    .lc-select {
      flex: 1;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 10px;
      outline: none;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .lc-select:focus { border-color: var(--accent); }
    .lc-select option { background: var(--surface2); }
  `
  document.head.appendChild(s)
}

/* ── SLA bar ────────────────────────────────────────────────── */
function SlaBar({ hours, status }) {
  const limits = { dirty: 48, washing: 24, ready: 24 }
  const limit = limits[status] || 48
  const pct = Math.min(100, (hours / limit) * 100)
  const color = pct >= 100 ? 'var(--red)' : pct >= 65 ? 'var(--accent)' : 'var(--green)'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>SLA</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color, letterSpacing: 0.5 }}>
          {hours != null ? `${hours}s / ${limit}s` : '—'}
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 2,
          background: pct >= 100
            ? 'linear-gradient(90deg, var(--red), var(--red2))'
            : pct >= 65
              ? 'linear-gradient(90deg, var(--accent), #e67e22)'
              : 'linear-gradient(90deg, var(--green), var(--teal))',
          transition: 'width 0.6s ease',
          animation: 'slaSlide 0.6s ease',
        }} />
      </div>
    </div>
  )
}

/* ── Flow indicator ─────────────────────────────────────────── */
function FlowBar({ status }) {
  const idx = FLOW.indexOf(status)
  if (idx < 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
      {FLOW.map((step, i) => {
        const active = i === idx
        const done = i < idx
        const color = done || active ? FLOW_COLORS[step] : 'var(--border)'
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < FLOW.length - 1 ? '1' : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: active ? 10 : 7, height: active ? 10 : 7,
                borderRadius: '50%', background: color,
                boxShadow: active ? `0 0 8px ${color}` : 'none',
                transition: 'all 0.2s',
                flexShrink: 0,
              }} />
              {active && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 8, color, letterSpacing: 0.5,
                  whiteSpace: 'nowrap', fontWeight: 700,
                }}>
                  {FLOW_LABELS[step]}
                </span>
              )}
            </div>
            {i < FLOW.length - 1 && (
              <div style={{
                flex: 1, height: 1, marginBottom: active ? 14 : 0,
                background: i < idx
                  ? `linear-gradient(90deg, ${FLOW_COLORS[FLOW[i]]}, ${FLOW_COLORS[FLOW[i+1]]})`
                  : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Chip ───────────────────────────────────────────────────── */
function Chip({ color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: `${color}14`, border: `1px solid ${color}30`,
      fontFamily: 'var(--mono)', fontSize: 9, color, letterSpacing: 0.5,
    }}>
      {children}
    </span>
  )
}

/* ── Main component ─────────────────────────────────────────── */
export default function ItemCard({ item, machines = [], onDeliver, onDamage, selected, onSelect }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const advance = useMutation({
    mutationFn: (data) => laundryApi.advanceItem(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })
  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })
  const deleteItem = useMutation({
    mutationFn: () => laundryApi.deleteItem(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const accentColor = FLOW_COLORS[item.status] || 'var(--accent)'
  const isUrgent = item.urgent === 1
  const isSlaWarn = item.hours_in_status > 24
  const isSlaRed  = item.hours_in_status > 48

  return (
    <div
      className={isUrgent ? 'item-card-urgent' : ''}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isUrgent ? 'rgba(231,76,60,0.35)' : isSlaRed ? 'rgba(231,76,60,0.2)' : 'var(--border)'}`,
        borderLeft: `3px solid ${isUrgent ? 'var(--red)' : accentColor}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ padding: '14px 16px' }}>

        {/* ── Row 1: oda + seçim + badge ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onSelect && (
              <input type="checkbox" checked={selected} onChange={() => onSelect(item.id)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
            )}
            <span style={{
              fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2.5, color: 'var(--text)', lineHeight: 1,
            }}>
              {item.block || '?'} · {item.room_no || '?'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isUrgent && <span className="badge badge-red" style={{ fontSize: 8 }}>ACİL</span>}
            {item.damage_count > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 8 }}>
                ⚠ {item.damage_count} HASAR
              </span>
            )}
            {item.status === 'lost' && <span className="badge badge-gray">KAYIP</span>}
          </div>
        </div>

        {/* ── Flow bar (sadece aktif statülerde) ── */}
        {item.status !== 'lost' && <FlowBar status={item.status} />}

        {/* ── Meta chips ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip color={accentColor}>
            {item.item_count} parça
          </Chip>
          {item.machine_name && (
            <Chip color="var(--blue)">
              ⚙ {item.machine_name}
            </Chip>
          )}
          {item.shelf_location && (
            <Chip color="var(--green)">
              ▣ Raf {item.shelf_location}
            </Chip>
          )}
          {item.created_by_name && (
            <Chip color="var(--text2)">
              {item.created_by_name}
            </Chip>
          )}
        </div>

        {/* ── Notes ── */}
        {item.notes && (
          <div style={{
            padding: '6px 10px',
            background: 'var(--surface2)',
            borderRadius: 6,
            fontFamily: 'var(--sans)',
            fontSize: 11,
            color: 'var(--text2)',
            fontStyle: 'italic',
            marginBottom: 8,
            borderLeft: '2px solid var(--border2)',
          }}>
            {item.notes}
          </div>
        )}

        {/* ── SLA bar ── */}
        {item.hours_in_status != null && item.status !== 'delivered' && item.status !== 'lost' && (
          <SlaBar hours={item.hours_in_status} status={item.status} />
        )}

        {/* ── Aksiyonlar ── */}
        {item.status !== 'lost' && item.status !== 'delivered' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {item.status === 'dirty' && (
              <select
                className="lc-select"
                onChange={e => e.target.value && advance.mutate({ machine_id: +e.target.value })}
                defaultValue=""
                disabled={advance.isPending}
              >
                <option value="">⚙ Makineye At...</option>
                {machines.filter(m => m.status === 'idle').map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
                {machines.filter(m => m.status === 'idle').length === 0 && (
                  <option disabled>Boş makine yok</option>
                )}
              </select>
            )}
            {item.status === 'washing' && (
              <button
                className="lc-action-btn primary"
                onClick={() => {
                  const shelf = prompt('Raf konumu (örn: 2. Kat A):')
                  if (shelf !== null) advance.mutate({ shelf_location: shelf })
                }}
                disabled={advance.isPending}
              >
                ▣ Rafa Koy
              </button>
            )}
            {item.status === 'ready' && (
              <button className="lc-action-btn success" onClick={() => onDeliver(item)}>
                ✓ Teslim Et
              </button>
            )}
            {onDamage && (
              <button className="lc-action-btn ghost" onClick={() => onDamage(item)}>
                ⚠ Hasar
              </button>
            )}
            <button
              className="lc-action-btn ghost"
              style={{ flex: 'none', padding: '8px 12px' }}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '▲' : '▾'}
            </button>
          </div>
        )}

        {/* ── Genişletilmiş ── */}
        {expanded && (
          <div style={{
            display: 'flex', gap: 6, marginTop: 10,
            paddingTop: 10, borderTop: '1px solid var(--border)',
          }}>
            <button className="lc-action-btn ghost"
              style={{ fontSize: 9 }}
              onClick={() => { if (confirm('Kayıp olarak işaretle?')) markLost.mutate() }}>
              Kayıp İşaretle
            </button>
            {item.status === 'dirty' && (
              <button className="lc-action-btn danger"
                style={{ fontSize: 9 }}
                onClick={() => { if (confirm('Kaydı sil?')) deleteItem.mutate() }}>
                Sil
              </button>
            )}
          </div>
        )}

        {/* ── Hata ── */}
        {advance.isError && (
          <div className="alert alert-danger" style={{ marginTop: 8, padding: '6px 10px', fontSize: 11 }}>
            {advance.error?.response?.data?.error || 'İşlem hatası'}
          </div>
        )}
      </div>
    </div>
  )
}
