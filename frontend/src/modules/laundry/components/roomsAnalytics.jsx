import { useState, useMemo } from 'react'

// RoomsSection'ın sunumsal analiz/grafik bileşenleri — saf (veri prop → JSX).
// RoomCard (Stat/Sparkline) ve RoomDetailPanel (geri kalan) tarafından kullanılır.

const DOW_LABELS = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

const NEXT_STATUS_LABEL = {
  dirty: 'Yıkamaya al',
  pending_collection: 'Topla',
  washing: 'Rafa al',
  ironing: 'Ütüyü tamamla',
  ready: 'Teslim et',
}

export function TlChipGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(([k, label]) => {
        const active = value === k
        return (
          <button key={k} onClick={() => onChange(k)} type="button"
            style={{
              padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.5, lineHeight: 1.4,
              background: active ? 'rgba(240,165,0,0.18)' : 'transparent',
              border: `1px solid ${active ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: active ? 'var(--accent)' : 'var(--text3)',
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '3px 0', background: 'var(--surface2)', borderRadius: 4 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)', letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  )
}

export function Sparkline({ points = [] }) {
  const max = Math.max(1, ...points)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20, flex: 1 }}>
      {points.map((p, i) => (
        <div key={i} style={{
          flex: 1, height: `${(p / max) * 100}%`, minHeight: 1,
          background: p > 0 ? 'var(--accent3)' : 'var(--border)',
          opacity: 0.4 + 0.6 * (i / Math.max(1, points.length - 1)),
          borderRadius: 1,
        }} title={`${p}`} />
      ))}
    </div>
  )
}

export function YearHeatmap({ points = [] }) {
  // points: [{day: 'YYYY-MM-DD', count: N}]
  const map = useMemo(() => {
    const m = {}
    for (const p of points) m[p.day] = p.count
    return m
  }, [points])

  // 53 hafta'lık grid — bugünden geriye
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks = []
  // En sağdaki hafta — bugünü içerecek; bu hafta cumartesi ile biter
  const dayOfWeek = today.getDay() // 0=Sun
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + (6 - dayOfWeek)) // bu haftanın Cumartesisi
  const cursor = new Date(endDate)
  cursor.setDate(cursor.getDate() - 53 * 7 + 1)
  for (let w = 0; w < 53; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10)
      const count = map[key] || 0
      const future = cursor.getTime() > today.getTime()
      days.push({ key, count, future })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(days)
  }

  const maxCount = Math.max(1, ...points.map(p => p.count))
  const cellSize = 9

  function color(count, future) {
    if (future) return 'transparent'
    if (count === 0) return 'var(--surface2)'
    const intensity = Math.min(1, count / maxCount)
    if (intensity < 0.25) return 'rgba(96,165,250,0.35)'
    if (intensity < 0.5)  return 'rgba(96,165,250,0.55)'
    if (intensity < 0.75) return 'rgba(96,165,250,0.75)'
    return 'rgba(96,165,250,0.95)'
  }

  // Ay etiketleri — her 4 haftada bir hafta'nın ilk gününün ay'ını yaz
  const monthLabels = weeks.map((w, i) => {
    if (i % 4 !== 0) return null
    const d = new Date(w[0].key)
    return d.toLocaleDateString('tr-TR', { month: 'short' })
  })

  return (
    <div className="panel" style={{ padding: 12, overflowX: 'auto' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        SON 12 AY — YILLIK ISI HARİTASI
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 'fit-content' }}>
        <div style={{ display: 'flex', gap: 2, paddingLeft: 16 }}>
          {monthLabels.map((m, i) => (
            <div key={i} style={{ width: cellSize, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)' }}>
              {m || ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)' }}>
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Pzt</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Çar</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Cum</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize }} />
          </div>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {w.map(d => (
                <div key={d.key} title={`${d.key}: ${d.count} torba`}
                  style={{ width: cellSize, height: cellSize, borderRadius: 2, background: color(d.count, d.future) }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>az</span>
          {[0, 0.25, 0.5, 0.75, 1].map(i => (
            <div key={i} style={{ width: cellSize, height: cellSize, borderRadius: 2, background: color(i * maxCount, false) }} />
          ))}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>çok</span>
        </div>
      </div>
    </div>
  )
}

export function HourDayMatrix({ points = [] }) {
  // points: [{dow, hour, count}]
  const matrix = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const p of points) m[p.dow][p.hour] = p.count
    return m
  }, [points])

  const max = Math.max(1, ...points.map(p => p.count))

  function color(count) {
    if (count === 0) return 'var(--surface2)'
    const intensity = Math.min(1, count / max)
    if (intensity < 0.25) return 'rgba(168,85,247,0.30)'
    if (intensity < 0.5)  return 'rgba(168,85,247,0.55)'
    if (intensity < 0.75) return 'rgba(168,85,247,0.80)'
    return 'rgba(168,85,247,1)'
  }

  // Pzt (1) → Pzr (0) sıralaması iş günlerini önce göstermek için
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div className="panel" style={{ padding: 12, overflowX: 'auto' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        SAAT × GÜN PATTERN'İ
      </div>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 2, paddingLeft: 30 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ width: 11, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)', textAlign: 'center' }}>
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {dowOrder.map(dow => (
          <div key={dow} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <div style={{ width: 28, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{DOW_LABELS[dow]}</div>
            {matrix[dow].map((c, h) => (
              <div key={h} title={`${DOW_LABELS[dow]} ${h}:00 — ${c} torba`}
                style={{ width: 11, height: 11, borderRadius: 2, background: color(c) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function BlockCompareCard({ blockAvg, summary }) {
  if (!blockAvg || blockAvg.room_count == null) return null
  const rows = [
    { label: 'Toplam torba',     mine: summary.total_given || 0,   block: blockAvg.avg_total || 0 },
    { label: '30 günlük',        mine: null /* eklenebilir */,     block: blockAvg.avg_last_30d || 0 },
    { label: 'Kayıp adedi',      mine: summary.total_lost || 0,    block: blockAvg.avg_lost || 0,    inverse: true },
    { label: 'Ort. teslim (s)',  mine: summary.avg_hours || 0,     block: blockAvg.avg_delivery_hours || 0, inverse: true },
  ].filter(r => r.mine != null)

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        BLOK ORTALAMASIYLA KIYAS ({blockAvg.room_count} oda)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const delta = r.block > 0 ? ((r.mine - r.block) / r.block) * 100 : 0
          const better = r.inverse ? delta < 0 : delta > 0
          const same = Math.abs(delta) < 5
          const color = same ? 'var(--text3)' : (better ? 'var(--green)' : 'var(--red)')
          return (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--text)', minWidth: 40, textAlign: 'right' }}>
                {Number(r.mine).toFixed?.(r.label.includes('s)') ? 1 : 0) ?? r.mine}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>vs</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>
                {Number(r.block).toFixed?.(1) ?? r.block}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color, minWidth: 56, textAlign: 'right', fontWeight: 700 }}>
                {same ? '~aynı' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SlaCard({ violations }) {
  if (!violations || violations.length === 0) return null
  return (
    <div className="panel" style={{ padding: 12, borderLeft: '3px solid var(--red)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', letterSpacing: 1.5, marginBottom: 8 }}>
        ⚠ SLA İHLALİ ({violations.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {violations.map(v => {
          const critical = v.hours >= (v.critical_hours || Infinity)
          return (
            <div key={v.id} style={{
              padding: '6px 10px', borderRadius: 6,
              background: critical ? 'rgba(220,38,38,0.12)' : 'rgba(240,165,0,0.08)',
              border: `1px solid ${critical ? 'rgba(220,38,38,0.3)' : 'rgba(240,165,0,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)' }}>{v.bag_no || `#${v.id}`}</span>
              <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                {v.status} · {v.hours}s
                {v.intake_name && ` · ${v.intake_name}`}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: critical ? 'var(--red)' : 'var(--accent)' }}>
                {critical ? 'KRİTİK' : 'UYARI'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ItemActionMenu({ item, onAdvance, onDeliver, onLost, onClose }) {
  const [mode, setMode] = useState(null)  // null | 'deliver' | 'lost'
  const [input, setInput] = useState('')
  const nextLabel = NEXT_STATUS_LABEL[item.status]
  return (
    <div onClick={e => e.stopPropagation()}
      style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      }}>
      {mode === null && (
        <>
          {nextLabel && item.status !== 'ready' && (
            <button onClick={onAdvance} className="btn btn-ghost btn-xs"
              style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>
              → {nextLabel}
            </button>
          )}
          {item.status === 'ready' && (
            <button onClick={() => setMode('deliver')} className="btn btn-primary btn-xs">
              🚚 Teslim et
            </button>
          )}
          <button onClick={() => setMode('lost')} className="btn btn-ghost btn-xs"
            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            ✕ Kayıp
          </button>
          <button onClick={onClose} className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }}>Kapat</button>
        </>
      )}
      {mode === 'deliver' && (
        <>
          <input className="form-input" value={input} autoFocus
            onChange={e => setInput(e.target.value)}
            placeholder="Teslim alan adı..."
            style={{ flex: 1, minWidth: 100, height: 26, fontSize: 11 }} />
          <button onClick={() => input.trim() && onDeliver(input.trim())}
            disabled={!input.trim()}
            className="btn btn-primary btn-xs">✓</button>
          <button onClick={() => { setMode(null); setInput('') }} className="btn btn-ghost btn-xs">İptal</button>
        </>
      )}
      {mode === 'lost' && (
        <>
          <input className="form-input" value={input} autoFocus
            onChange={e => setInput(e.target.value)}
            placeholder="Kayıp notu (opsiyonel)..."
            style={{ flex: 1, minWidth: 100, height: 26, fontSize: 11 }} />
          <button onClick={() => onLost(input.trim() || null)}
            className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            ✕ Kayıp işaretle
          </button>
          <button onClick={() => { setMode(null); setInput('') }} className="btn btn-ghost btn-xs">İptal</button>
        </>
      )}
    </div>
  )
}

export function DamagesCard({ damages }) {
  if (!damages || damages.length === 0) return null
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        🔧 HASAR RAPORLARI ({damages.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {damages.slice(0, 10).map(d => (
          <div key={d.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
            {d.photo_url && (
              <img src={d.photo_url} alt="hasar"
                style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--blue)' }}>{d.bag_no || `#${d.item_id}`}</span>
                {d.at_intake ? ' · giriş anında' : ' · sonradan'}
                {d.intake_name && ` · ${d.intake_name}`}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', marginTop: 2 }}>
                {d.description}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 2 }}>
                {d.reported_by_name && `${d.reported_by_name} · `}
                {new Date(d.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
