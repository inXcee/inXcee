import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCK_BY_NAME } from '../../../shared/blocks.js'
import AssignModal from './AssignModal.jsx'
import ShelfModal  from './ShelfModal.jsx'
import LostModal   from './LostModal.jsx'
import PremiumGarmentList from './PremiumGarmentList.jsx'
import PremiumDeliveryModal from './PremiumDeliveryModal.jsx'

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

/* ── ExpandedSection (inline copy — intentional YAGNI) ──────── */
function ExpandedSection({ item, onLost, onFound }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['item-history', item.id],
    queryFn: () => laundryApi.getItemHistory(item.id),
    enabled: true,
  })

  const STATUS_LABELS = { dirty: 'Kirli sepete eklendi', washing: 'Makineye atandı', ready: 'Rafa kondu', delivered: 'Teslim edildi', lost: 'Kayıp işaretlendi' }
  const STATUS_COLORS = { dirty: 'var(--accent)', washing: 'var(--blue)', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)' }

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      {/* Kıyafet detayı */}
      {item.clothing_items && (() => {
        try {
          const cl = JSON.parse(item.clothing_items)
          return (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {cl.map((c, i) => (
                  <span key={i} style={{
                    padding: '2px 8px', borderRadius: 12, fontSize: 9, fontFamily: 'var(--mono)',
                    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)',
                  }}>
                    {c.qty}× {c.type}{c.color ? ` (${c.color})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        } catch { return null }
      })()}

      {/* Timeline */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>TİMELİNE</div>
      {isLoading ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>yükleniyor...</div>
      ) : history.map((h, idx) => {
        const next = history[idx + 1]
        const dur = next
          ? Math.round((new Date(next.created_at) - new Date(h.created_at)) / 60000)
          : null
        return (
          <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[h.to_status] || 'var(--text3)', flexShrink: 0, marginTop: 3 }} />
            <div>
              <span style={{ color: 'var(--text2)', fontSize: 9 }}>{STATUS_LABELS[h.to_status] || h.to_status}</span>
              {h.actor_name && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {h.actor_name}</span>}
              {dur != null && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {dur < 60 ? `${dur}dk` : `${Math.round(dur/60)}s`} bekledi</span>}
              <div style={{ fontSize: 8, color: 'var(--text3)' }}>{new Date(h.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
            </div>
          </div>
        )
      })}

      {/* Alt butonlar */}
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        {item.status === 'lost' ? (
          <button onClick={onFound} style={{
            flex: 1, padding: '4px 6px', borderRadius: 5,
            background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
            color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer', fontWeight: 700,
          }}>Bulundu →</button>
        ) : (
          <button onClick={onLost} style={{
            flex: 1, padding: '4px 6px', borderRadius: 5,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer',
          }}>Kayıp</button>
        )}
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────── */
export default function ItemCard({ item, machines = [], onDeliver, onDamage, selected, onSelect, onPersonClick, onFound }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [garmentOpen, setGarmentOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [shelfOpen,  setShelfOpen]  = useState(false)
  const [lostOpen,   setLostOpen]   = useState(false)
  const [deleteStep, setDeleteStep] = useState(false)
  const [premiumDeliveryOpen, setPremiumDeliveryOpen] = useState(false)

  const isPremiumItem = item.is_premium === 1 || (item.block && BLOCK_BY_NAME[item.block]?.type === 'Y')

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                onClick={() => onPersonClick && item.occupant_name && onPersonClick(item.occupant_name)}
                style={{
                  fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2.5, color: 'var(--text)', lineHeight: 1,
                  cursor: item.occupant_name ? 'pointer' : 'default',
                }}
              >
                {item.block || '?'} · {item.room_no || '?'}
              </span>
              {item.room_active_count > 1 && (
                <span className="badge badge-amber" style={{ fontSize: 7 }}>×{item.room_active_count}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isUrgent && <span className="badge badge-red" style={{ fontSize: 8 }}>ACİL</span>}
            {item.needs_ironing === 1 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 4, fontSize: 8,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                color: '#6366f1', fontFamily: 'var(--mono)', letterSpacing: 0.5,
              }}>ÜTÜ</span>
            )}
            {item.damage_count > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 8 }}>
                ⚠ {item.damage_count} HASAR
              </span>
            )}
            {item.status === 'lost' && <span className="badge badge-gray">KAYIP</span>}
            {item.all_present === 1 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 4, fontSize: 8,
                background: 'rgba(39,201,106,0.12)', border: '1px solid rgba(39,201,106,0.25)',
                color: 'var(--green)', fontFamily: 'var(--mono)', letterSpacing: 0.5,
              }}>✓ Doğrulandı</span>
            )}
            {item.all_present === 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 4, fontSize: 8,
                background: 'rgba(231,165,0,0.12)', border: '1px solid rgba(231,165,0,0.25)',
                color: 'var(--accent)', fontFamily: 'var(--mono)', letterSpacing: 0.5,
              }} title={item.verification_notes || ''}>⚠ Eksik</span>
            )}
          </div>
        </div>

        {/* ── Flow bar (sadece aktif statülerde) ── */}
        {item.status !== 'lost' && <FlowBar status={item.status} />}

        {/* ── Meta chips ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip color={accentColor}>
            {item.item_count} parça
            {item.clothing_items && (() => {
              try {
                const cl = JSON.parse(item.clothing_items)
                return <span style={{ color: 'var(--text2)', fontSize: 10, fontFamily: 'var(--mono)', marginLeft: 6 }}>
                  {cl.slice(0, 2).map(c => `${c.qty}× ${c.type}`).join(' · ')}{cl.length > 2 ? ` +${cl.length - 2}` : ''}
                </span>
              } catch { return null }
            })()}
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

        {item.premium_garment_count > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 4, marginBottom: 8,
          }}>
            {[
              ['Ütü', `${item.ironed_count || 0}/${item.ironing_total || 0}`, '#8b5cf6'],
              ['Hazır', item.ready_garment_count || 0, 'var(--green)'],
              ['Eksik', item.missing_garment_count || 0, 'var(--red)'],
              ['Hasar', item.damaged_garment_count || 0, '#f97316'],
              ['Tekrar', item.rework_garment_count || 0, 'var(--accent)'],
            ].map(([label, value, color]) => (
              <div key={label} style={{
                border: '1px solid var(--border)', borderRadius: 6, padding: '5px 3px',
                textAlign: 'center', background: 'var(--surface2)',
              }}>
                <div style={{ fontFamily: 'var(--display)', color, fontSize: 14 }}>{value}</div>
                <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 7 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── SLA bar ── */}
        {item.hours_in_status != null && item.status !== 'delivered' && item.status !== 'lost' && (
          <SlaBar hours={item.hours_in_status} status={item.status} />
        )}

        {/* ── Aksiyonlar ── */}
        {item.status !== 'delivered' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {item.status !== 'lost' && item.status === 'dirty' && (
              <button className="lc-action-btn primary" onClick={() => setAssignOpen(true)}>
                ⚙ Makineye At
              </button>
            )}
            {item.status !== 'lost' && item.status === 'washing' && (
              <button className="lc-action-btn primary" onClick={() => setShelfOpen(true)}>
                ▣ Rafa Koy
              </button>
            )}
            {item.status !== 'lost' && item.status === 'ready' && (
              <button
                className="lc-action-btn success"
                onClick={() => isPremiumItem ? setPremiumDeliveryOpen(true) : onDeliver(item)}
              >
                ✓ Teslim Et
              </button>
            )}
            {item.status !== 'delivered' && item.status !== 'lost' && (
              <button
                className="lc-action-btn ghost"
                onClick={() => setGarmentOpen(o => !o)}
                style={{
                  border: garmentOpen ? '1px solid rgba(240,165,0,0.4)' : undefined,
                  color: garmentOpen ? 'var(--accent)' : undefined,
                  background: garmentOpen ? 'rgba(240,165,0,0.06)' : undefined,
                }}
              >
                ★ Parçalar
              </button>
            )}
            {item.status !== 'lost' && onDamage && (
              <button className="lc-action-btn ghost" onClick={() => onDamage(item)}>
                ⚠ Hasar
              </button>
            )}
            <button
              className="lc-action-btn ghost"
              style={{ flex: 'none', padding: '8px 12px' }}
              onClick={() => { setExpanded(!expanded); setDeleteStep(false) }}
            >
              {expanded ? '▲' : '▾'}
            </button>
          </div>
        )}

        {/* ── Parça paneli (bağımsız toggle) ── */}
        {garmentOpen && (
          <PremiumGarmentList item={item} />
        )}

        {/* ── Genişletilmiş (timeline + hasar) ── */}
        {expanded && (
          <ExpandedSection
            item={item}
            onLost={() => setLostOpen(true)}
            onFound={() => onFound && onFound(item)}
          />
        )}
        {/* Sil butonu (dirty + expand) */}
        {expanded && item.status === 'dirty' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {deleteStep ? (
              <button className="lc-action-btn danger"
                style={{ fontSize: 9 }}
                onClick={() => { deleteItem.mutate(); setDeleteStep(false) }}
              >
                Emin misin? Sil
              </button>
            ) : (
              <button className="lc-action-btn danger"
                style={{ fontSize: 9 }}
                onClick={() => setDeleteStep(true)}
              >
                Sil
              </button>
            )}
          </div>
        )}

        {/* ── Modals ── */}
        {assignOpen && (
          <AssignModal
            item={item}
            machines={machines}
            onClose={() => setAssignOpen(false)}
          />
        )}
        {shelfOpen && (
          <ShelfModal
            item={item}
            onClose={() => setShelfOpen(false)}
          />
        )}
        {lostOpen && (
          <LostModal
            item={item}
            onClose={() => setLostOpen(false)}
          />
        )}
        {premiumDeliveryOpen && (
          <PremiumDeliveryModal
            item={item}
            onClose={() => { setPremiumDeliveryOpen(false); qc.invalidateQueries({ queryKey: ['laundry-items'] }) }}
          />
        )}
      </div>
    </div>
  )
}
