import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { todayStr, addDays, shiftColor, formatDate, shortDay } from '../shared.jsx'

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const SITE_ORDER = ['OTC', 'LOKAL', 'KAMP', 'Yemekhane']
const SITE_LABEL = { OTC: 'OTC', LOKAL: 'LOKALLER', KAMP: 'KAMP', Yemekhane: 'YEMEKHANE (atanmamış)' }

// Canlı "ŞU AN" lokasyon doluluğu: seçili gün + an için her noktada kim var,
// hangi lokal boş/eksik. Bugün + canlı modda saat otomatik ilerler (60 sn).
export default function LiveOccupancyBoard({ onPersonClick }) {
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(nowHHMM())
  const [live, setLive] = useState(true)
  const isToday = date === todayStr()

  useEffect(() => {
    if (!live || !isToday) return
    setTime(nowHHMM())
    const t = setInterval(() => setTime(nowHHMM()), 60000)
    return () => clearInterval(t)
  }, [live, isToday, date])

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['shift-occupancy', date, time],
    queryFn: () => api.get('/shifts/occupancy', { params: { date, at: time } }).then(r => r.data),
    enabled: !!date && !!time,
    refetchInterval: live && isToday ? 60000 : false,
  })

  const rows = data?.rows || []
  const bySite = useMemo(() => {
    const m = new Map()
    rows.forEach(r => {
      const k = r.site || 'Yemekhane'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    })
    const keys = [...m.keys()].sort((a, b) => {
      const ia = SITE_ORDER.indexOf(a); const ib = SITE_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'tr')
    })
    return keys.map(k => ({ site: k, locations: m.get(k) }))
  }, [rows])

  const presentTotal = data?.present_total ?? 0
  const emptyCount = data?.empty_count ?? 0
  const alerts = data?.alerts || []

  const setDay = (delta) => { setLive(false); setDate(d => addDays(d, delta)) }
  const goNow = () => { setDate(todayStr()); setLive(true); setTime(nowHHMM()) }

  return (
    <div className="fade-up">
      {/* Kontrol çubuğu */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
        marginBottom: '14px', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setDay(-1)} className="btn btn-ghost btn-sm" style={{ width: 30 }}>‹</button>
          <input type="date" className="form-input" value={date} onChange={e => { setLive(false); setDate(e.target.value) }} style={{ width: 'auto' }} />
          <button onClick={() => setDay(1)} className="btn btn-ghost btn-sm" style={{ width: 30 }}>›</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>SAAT</span>
          <input
            type="time"
            className="form-input"
            value={time}
            onChange={e => { setLive(false); setTime(e.target.value) }}
            style={{ width: 'auto' }}
          />
        </div>

        <button
          className={`filter-chip${live && isToday ? ' active' : ''}`}
          onClick={goNow}
          title="Bugün + şu anki saate dön, canlı takip et"
          style={live && isToday ? { color: 'var(--green)', borderColor: 'var(--green)' } : undefined}
        >
          {live && isToday ? '● CANLI' : '○ ŞU AN'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '14px', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <span style={{ color: 'var(--green)' }}>👥 {presentTotal} kişi sahada</span>
          <span style={{ color: emptyCount ? 'var(--text2)' : 'var(--text3)' }}>⬚ {emptyCount} boş nokta</span>
          <span style={{ color: alerts.length ? 'var(--red)' : 'var(--green)', fontWeight: alerts.length ? 700 : 400 }}>
            {alerts.length ? `⚠ ${alerts.length} eksik` : '✓ eksik yok'}
          </span>
          {isFetching && <span style={{ color: 'var(--text3)' }}>⟳</span>}
        </div>
      </div>

      {/* Eksik/boş uyarı bandı */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)' }}>
          <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
            ⚠ {formatDate(date)} {time} — ZORUNLU NOKTALARDA EKSİK ({alerts.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {alerts.map(a => (
              <span key={a.work_location_id} className="badge badge-red">
                {a.name}: {a.count}/{a.required}
              </span>
            ))}
          </div>
        </div>
      )}

      {isLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>YÜKLENİYOR…</div>}

      {!isLoading && rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🗺️</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>Bu an için çalışma noktası kaydı yok</div>
        </div>
      )}

      {/* Site bazlı lokasyon kartları */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {bySite.map(group => (
          <div key={group.site}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
              {SITE_LABEL[group.site] || group.site.toLocaleUpperCase('tr')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
              {group.locations.map(loc => (
                <LocationCard key={loc.work_location_id ?? 'default'} loc={loc} onPersonClick={onPersonClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LocationCard({ loc, onPersonClick }) {
  const sc = shiftColor(loc.color_class)
  const status = loc.understaffed ? 'under' : loc.empty ? 'empty' : 'ok'
  const border = status === 'under' ? 'rgba(239,68,68,.5)' : status === 'empty' ? 'var(--border)' : 'rgba(34,197,94,.4)'
  const accent = status === 'under' ? 'var(--red)' : status === 'empty' ? 'var(--text3)' : 'var(--green)'
  return (
    <div style={{
      border: `1px solid ${border}`, borderRadius: 12, background: 'var(--surface)',
      borderTop: `3px solid ${sc.text || accent}`, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: accent,
          background: status === 'under' ? 'rgba(239,68,68,.12)' : status === 'ok' ? 'rgba(34,197,94,.12)' : 'var(--surface3)',
          borderRadius: 999, padding: '2px 9px',
        }}>
          {loc.count}{loc.required ? `/${loc.required}` : ''}
        </span>
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
        {loc.present.length === 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: status === 'under' ? 'var(--red)' : 'var(--text3)', padding: '6px 2px' }}>
            {status === 'under' ? `⚠ BOŞ — en az ${loc.required} kişi olmalı` : '— boş —'}
          </div>
        )}
        {loc.present.map(p => (
          <button
            key={p.staff_id}
            onClick={() => onPersonClick?.(p.staff_id)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6, width: '100%', textAlign: 'left',
              background: 'none', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{p.full_name}</span>
            {p.role_name && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.role_name}</span>}
            {p.end_time && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>→{p.end_time}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
