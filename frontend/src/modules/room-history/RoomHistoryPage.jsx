import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS, blockColor } from '../../shared/blocks.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'

const ALL_BLOCK_NAMES = BLOCKS.map(b => b.block)
const DAYS_OPTIONS = [
  { value: 7, label: '7 GÜN' },
  { value: 14, label: '14 GÜN' },
  { value: 30, label: '30 GÜN' },
]

const STATUS_LABELS = { open: 'AÇIK', assigned: 'ATANDI', in_progress: 'DEVAM', review: 'KONTROL', done: 'TAMAMLANDI' }
const STATUS_COLORS = { open: 'var(--red)', assigned: 'var(--accent)', in_progress: 'var(--blue)', review: 'var(--purple)', done: 'var(--green)' }
const PRIORITY_LABELS = { high: 'YÜKSEK', medium: 'ORTA', low: 'DÜŞÜK' }
const PRIORITY_COLORS = { high: 'var(--red)', medium: 'var(--accent)', low: 'var(--blue)' }

// ── Summary Table ──────────────────────────────────────────────────────────
// Takip hızlı filtreleri — sorunlu odaları tek dokunuşla ayıkla
const QUICK_FILTERS = [
  { id: 'all',       label: 'TÜMÜ',           fn: () => true },
  { id: 'openfault', label: '⚠ AÇIK ARIZA',   fn: r => r.open_faults > 0 },
  { id: 'skipped',   label: '⊘ ATLANMIŞ',     fn: r => r.skipped_count > 0 },
  { id: 'uncleaned', label: '✗ TEMİZLİK YOK', fn: r => r.cleaned_count === 0 },
  { id: 'photo',     label: '📷 FOTO KANITLI', fn: r => r.photo_count > 0 },
]

function fmtLastCleaned(s) {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T'))
  if (isNaN(d)) return null
  return {
    text: d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' +
          d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    isToday: d.toDateString() === new Date().toDateString(),
  }
}

function SummaryTable({ rooms, selectedBlock, onSelectRoom }) {
  const [quickFilter, setQuickFilter] = useState('all')
  const blockFiltered = selectedBlock === 'ALL' ? rooms : rooms.filter(r => r.block === selectedBlock)
  const activeFn = QUICK_FILTERS.find(f => f.id === quickFilter)?.fn || (() => true)
  const filtered = blockFiltered.filter(activeFn)

  const totals = {
    total_tasks: filtered.reduce((s, r) => s + r.total_tasks, 0),
    cleaned: filtered.reduce((s, r) => s + r.cleaned_count, 0),
    skipped: filtered.reduce((s, r) => s + r.skipped_count, 0),
    faults: filtered.reduce((s, r) => s + r.fault_count, 0),
    open_faults: filtered.reduce((s, r) => s + r.open_faults, 0),
    photos: filtered.reduce((s, r) => s + (r.photo_count || 0), 0),
  }

  const kpis = [
    { label: 'TOPLAM GÖREV', value: totals.total_tasks, color: 'var(--text)' },
    { label: 'TEMİZLENDİ', value: totals.cleaned, color: 'var(--green)' },
    { label: 'ATLANDI', value: totals.skipped, color: 'var(--accent)' },
    { label: 'ARIZA', value: totals.faults, color: 'var(--red)' },
    { label: 'AÇIK ARIZA', value: totals.open_faults, color: totals.open_faults > 0 ? 'var(--red)' : 'var(--text3)' },
    { label: 'FOTO KANIT', value: totals.photos, color: totals.photos > 0 ? 'var(--blue)' : 'var(--text3)' },
  ]

  return (
    <>
      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            padding: '12px 14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '4px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Quick filters — sayılar blok filtresine göre */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {QUICK_FILTERS.map(f => {
          const n = f.id === 'all' ? blockFiltered.length : blockFiltered.filter(f.fn).length
          return (
            <button
              key={f.id}
              onClick={() => setQuickFilter(f.id)}
              className={`filter-chip ${quickFilter === f.id ? 'active' : ''}`}
            >
              {f.label} <span style={{ opacity: 0.65 }}>({n})</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table responsive-stack">
          <thead>
            <tr>
              {['Blok', 'Oda', 'Durum', 'Temizlik', 'Son Temizlik', 'Atlanan', 'Arıza', 'Açık', '📷'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(room => {
              const cleanPct = room.total_tasks > 0 ? Math.round((room.cleaned_count / room.total_tasks) * 100) : 0
              return (
                <tr
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  style={{ cursor: 'pointer' }}
                >
                  <td data-label="Blok">
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
                      color: blockColor(room.block),
                      letterSpacing: '1px',
                    }}>{room.block}</span>
                  </td>
                  <td data-label="Oda" style={{ fontWeight: 500 }}>{room.room_no}</td>
                  <td data-label="Durum"><StatusBadge status={room.room_status} /></td>
                  <td data-label="Temizlik">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="prog-bar" style={{ width: '50px' }}>
                        <div
                          className={`prog-fill ${cleanPct >= 80 ? 'prog-green' : cleanPct >= 50 ? 'prog-amber' : 'prog-red'}`}
                          style={{ width: `${cleanPct}%` }}
                        />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
                        {room.cleaned_count}/{room.total_tasks}
                      </span>
                    </div>
                  </td>
                  <td data-label="Son Temizlik">
                    {(() => {
                      const last = fmtLastCleaned(room.last_cleaned_at)
                      if (!last) return <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: room.total_tasks > 0 ? 'var(--red)' : 'var(--text3)' }}>—</span>
                      return (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: last.isToday ? 'var(--green)' : 'var(--text2)' }}>
                          {last.text}
                        </span>
                      )
                    })()}
                  </td>
                  <td data-label="Atlanan">
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px',
                      color: room.skipped_count > 0 ? 'var(--accent)' : 'var(--text3)',
                    }}>{room.skipped_count}</span>
                  </td>
                  <td data-label="Ariza">
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px',
                      color: room.fault_count > 0 ? 'var(--red)' : 'var(--text3)',
                    }}>{room.fault_count}</span>
                  </td>
                  <td data-label="Acik">
                    {room.open_faults > 0 ? (
                      <span className="badge badge-red" style={{ fontSize: '9px' }}>{room.open_faults}</span>
                    ) : (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>0</span>
                    )}
                  </td>
                  <td data-label="Foto">
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px',
                      color: room.photo_count > 0 ? 'var(--blue)' : 'var(--text3)',
                    }}>{room.photo_count > 0 ? `📷 ${room.photo_count}` : '–'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏠</div>
          <div className="empty-title">ODA BULUNAMADI</div>
          <div className="empty-sub">
            {quickFilter !== 'all' && blockFiltered.length > 0
              ? 'Bu filtreye uyan oda yok — iyi haber 👍'
              : 'Bu blokta kayıtlı oda yok'}
          </div>
        </div>
      )}
    </>
  )
}

// ── Room Detail Panel ──────────────────────────────────────────────────────
function RoomDetail({ block, roomNo, days, onBack }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['room-timeline', block, roomNo, days],
    queryFn: () => api.get(`/room-history/room/${block}/${roomNo}?days=${days}`).then(r => r.data),
  })

  if (isLoading) return <SkeletonTable rows={5} cols={4} />

  if (error || !data) {
    return (
      <div className="fade-up">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Listeye Dön</button>
        <div className="empty-state" style={{ marginTop: '20px' }}>
          <div className="empty-icon">⚠</div>
          <div className="empty-title">YÜKLENEMEDİ</div>
          <div className="empty-sub">Oda geçmişi verileri alınamadı</div>
        </div>
      </div>
    )
  }

  const { room, occupants, cleanings = [], faults = [] } = data

  // Build timeline
  const timeline = []
  cleanings.forEach(c => timeline.push({ type: 'cleaning', date: c.scheduled_at, data: c, sortKey: c.scheduled_at }))
  faults.forEach(f => timeline.push({ type: 'fault', date: f.opened_at, data: f, sortKey: f.opened_at }))
  timeline.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''))

  // Group by day
  const dayGroups = {}
  timeline.forEach(item => {
    const day = item.date?.split('T')[0] || item.date?.split(' ')[0] || 'Bilinmiyor'
    if (!dayGroups[day]) dayGroups[day] = []
    dayGroups[day].push(item)
  })
  const sortedDays = Object.keys(dayGroups).sort((a, b) => b.localeCompare(a))

  const cleanedCount = cleanings.filter(c => c.completed_at).length
  const skippedCount = cleanings.filter(c => c.skipped).length
  const openFaults = faults.filter(f => f.status !== 'done').length

  return (
    <div className="fade-up">
      {/* Back button */}
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '16px' }}>
        &larr; Listeye Dön
      </button>

      {/* Room info panel */}
      <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${blockColor(block)}, var(--accent))` }} />
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${blockColor(block)}, var(--accent))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--display)', fontSize: '18px', color: '#000', letterSpacing: '1px',
            }}>
              {room?.room_no}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '24px', letterSpacing: '3px', color: 'var(--text)' }}>
                {block} — ODA {roomNo}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
                <StatusBadge status={room?.status} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  Kat {room?.floor} · Kapasite {room?.active_beds}/{room?.capacity}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Occupants */}
        {occupants && occupants.length > 0 && (
          <div className="panel-body">
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
              MEVCUT SAKİNLER
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {occupants.map((o, i) => (
                <div key={i} style={{
                  background: 'var(--surface2)', borderRadius: '6px', padding: '8px 12px',
                  border: '1px solid var(--border)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{o.full_name}</span>
                  {o.company && <span style={{ color: 'var(--text3)', fontSize: '11px' }}>{o.company}</span>}
                  <span className="tag tag-m">Yatak {o.bed_no}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'TEMİZLİK', value: cleanedCount, color: 'var(--green)' },
          { label: 'ATLANAN', value: skippedCount, color: 'var(--accent)' },
          { label: 'ARIZA', value: faults.length, color: 'var(--red)' },
          { label: 'AÇIK ARIZA', value: openFaults, color: openFaults > 0 ? 'var(--red)' : 'var(--text3)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '12px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="fade-up-3">
        {sortedDays.length === 0 ? (
          <div className="panel">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">KAYIT YOK</div>
              <div className="empty-sub">Bu dönemde temizlik veya arıza kaydı bulunamadı</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedDays.map(day => (
              <DayGroup key={day} day={day} items={dayGroups[day]} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Day Group ──────────────────────────────────────────────────────────────
function DayGroup({ day, items }) {
  const d = new Date(day + 'T00:00:00')
  const dayLabel = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  const isToday = day === new Date().toISOString().split('T')[0]

  return (
    <div className="panel">
      {isToday && <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isToday && <div className="live-dot" />}
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text2)', letterSpacing: '1px' }}>
            {day}
          </span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text3)' }}>{dayLabel}</span>
        </div>
        <span className="badge badge-gray" style={{ fontSize: '9px' }}>{items.length} kayıt</span>
      </div>
      <div className="panel-body" style={{ padding: '4px 16px' }}>
        {items.map((item, idx) => (
          <div key={idx}>
            {item.type === 'cleaning' ? <CleaningItem data={item.data} /> : <FaultItem data={item.data} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Cleaning Item ──────────────────────────────────────────────────────────
// completed_at UTC saklanır (datetime('now')) — gösterimde yerele çevrilir;
// scheduled_at yerel-naive olduğundan olduğu gibi okunur
function fmtUtcTime(s) {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return isNaN(d) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function CleaningItem({ data }) {
  const time = data.completed_at ? fmtUtcTime(data.completed_at) : (data.scheduled_at?.split(' ')[1]?.slice(0, 5) || '')
  const who = data.completed_by || data.worker_name

  let badgeClass, statusLabel
  if (data.completed_at) {
    badgeClass = 'badge-green'; statusLabel = 'TEMİZLENDİ'
  } else if (data.skipped) {
    badgeClass = 'badge-amber'; statusLabel = 'ATLANDI'
  } else {
    badgeClass = 'badge-gray'; statusLabel = 'BEKLİYOR'
  }

  let checklist = null
  try { checklist = data.checklist ? JSON.parse(data.checklist) : null } catch (_) {}

  return (
    <div className="maint-row">
      <div className={`maint-pri ${data.completed_at ? 'pri-low' : data.skipped ? 'pri-mid' : ''}`}
        style={!data.completed_at && !data.skipped ? { background: 'var(--text3)' } : {}} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`badge ${badgeClass}`} style={{ fontSize: '9px' }}>{statusLabel}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{time}</span>
          {who && (
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{who}</span>
          )}
          {!!data.verified_by_qr && (
            <span className="badge badge-blue" style={{ fontSize: '8px' }}>QR</span>
          )}
        </div>
        {data.skipped && data.skip_reason && (
          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>
            Neden: {data.skip_reason}
          </div>
        )}
        {checklist && Array.isArray(checklist) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {checklist.map((item, i) => (
              <span key={i} className="tag" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      {data.photo_url && (
        <img loading="lazy" src={data.photo_url} alt="temizlik kanıtı"
          onClick={() => window.open(data.photo_url, '_blank')}
          title="Temizlik kanıt fotoğrafı — büyütmek için tıkla"
          style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0, alignSelf: 'center' }} />
      )}
    </div>
  )
}

// ── Fault Item ─────────────────────────────────────────────────────────────
function FaultItem({ data }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = STATUS_COLORS[data.status] || 'var(--text3)'
  const statusLabel = STATUS_LABELS[data.status] || data.status
  const prioLabel = PRIORITY_LABELS[data.priority] || data.priority
  const time = data.opened_at?.split(' ')[1]?.slice(0, 5) || data.opened_at?.split('T')[1]?.slice(0, 5) || ''

  const statusBadge = data.status === 'done' ? 'badge-green' : data.status === 'open' ? 'badge-red' : 'badge-amber'
  const prioBadge = data.priority === 'high' ? 'badge-red' : data.priority === 'low' ? 'badge-blue' : 'badge-amber'

  return (
    <div className="maint-row" style={{ flexDirection: 'column', gap: '0' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', width: '100%' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`maint-pri ${data.priority === 'high' ? 'pri-high' : data.priority === 'low' ? 'pri-low' : 'pri-mid'}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className={`badge ${statusBadge}`} style={{ fontSize: '9px' }}>{statusLabel}</span>
            <span className={`badge ${prioBadge}`} style={{ fontSize: '9px' }}>{prioLabel}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{time}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', marginLeft: 'auto' }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '6px', lineHeight: 1.5 }}>
            {data.description}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginTop: '10px', marginLeft: '13px',
          background: 'var(--surface2)', borderRadius: '8px',
          padding: '14px', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
            {data.reporter_name && (
              <div>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>BİLDİREN </span>
                <div style={{ color: 'var(--text)', marginTop: '2px' }}>{data.reporter_name}</div>
              </div>
            )}
            {data.technician_name && (
              <div>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>TEKNİSYEN </span>
                <div style={{ color: 'var(--text)', marginTop: '2px' }}>
                  {data.technician_name}
                  {data.technician_specialty && (
                    <span className="tag tag-s" style={{ marginLeft: '6px' }}>{data.technician_specialty}</span>
                  )}
                </div>
              </div>
            )}
            {data.opened_at && (
              <div>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>AÇILMA </span>
                <div style={{ color: 'var(--text2)', marginTop: '2px', fontFamily: 'var(--mono)', fontSize: '10px' }}>{data.opened_at}</div>
              </div>
            )}
            {data.closed_at && (
              <div>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>KAPANMA </span>
                <div style={{ color: 'var(--green)', marginTop: '2px', fontFamily: 'var(--mono)', fontSize: '10px' }}>{data.closed_at}</div>
              </div>
            )}
          </div>

          {/* Comments */}
          {data.comments && data.comments.length > 0 && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px' }}>
                YORUMLAR
              </div>
              {data.comments.map((c, i) => (
                <div key={i} style={{
                  padding: '8px 0', borderBottom: i < data.comments.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: '11px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{c.user_name || 'Anonim'}</span>
                    <span style={{ color: 'var(--text4)', fontFamily: 'var(--mono)', fontSize: '9px' }}>{c.created_at}</span>
                  </div>
                  <div style={{ color: 'var(--text2)', marginTop: '3px', lineHeight: 1.5 }}>{c.comment}</div>
                </div>
              ))}
            </div>
          )}

          {/* Photos */}
          {(data.photo_before || data.photo_url) && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              {data.photo_before && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>ÖNCE</div>
                  <img loading="lazy" src={data.photo_before} alt="before" style={{ width: '120px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                </div>
              )}
              {data.photo_url && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>SONRA</div>
                  <img loading="lazy" src={data.photo_url} alt="after" style={{ width: '120px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared Components ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active: 'badge-green',
    quarantine: 'badge-red',
    maintenance: 'badge-amber',
  }
  const labels = { active: 'AKTİF', quarantine: 'KARANTİNA', maintenance: 'BAKIM' }
  return <span className={`badge ${map[status] || 'badge-gray'}`} style={{ fontSize: '9px' }}>{labels[status] || status}</span>
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
      <div style={{
        width: '24px', height: '24px', border: '2px solid var(--border)',
        borderTop: '2px solid var(--accent)', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RoomHistoryPage() {
  const [selectedBlock, setSelectedBlock] = useState('ALL')
  const [days, setDays] = useState(7)
  const [selectedRoom, setSelectedRoom] = useState(null)

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['room-history-summary', days],
    queryFn: () => api.get(`/room-history/summary?days=${days}`).then(r => r.data),
  })

  if (selectedRoom) {
    return (
      <RoomDetail
        block={selectedRoom.block}
        roomNo={selectedRoom.room_no}
        days={days}
        onBack={() => setSelectedRoom(null)}
      />
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>ODA GEÇMİŞİ<HelpHint topic="room-history" title="ODA GEÇMİŞİ" /></h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
            TEMİZLİK VE ARIZA TAKİP RAPORU
          </p>
        </div>

        {/* Days filter */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`filter-chip ${days === opt.value ? 'active' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Block filter tabs */}
      <div className="fade-up-1" style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedBlock('ALL')}
          className={`filter-chip ${selectedBlock === 'ALL' ? 'active' : ''}`}
        >
          TÜMÜ
        </button>
        {ALL_BLOCK_NAMES.map(b => (
          <button
            key={b}
            onClick={() => setSelectedBlock(b)}
            className={`filter-chip ${selectedBlock === b ? 'active' : ''}`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="panel fade-up-2">
        <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
        <div className="panel-header">
          <div>
            <div className="panel-title">ODA RAPOR TABLOSU</div>
            <div className="panel-subtitle">
              {selectedBlock === 'ALL' ? 'TÜM BLOKLAR' : selectedBlock + ' BLOĞU'} · SON {days} GÜN
            </div>
          </div>
          {rooms && (
            <>
              <span className="badge badge-gray">{(selectedBlock === 'ALL' ? rooms : rooms.filter(r => r.block === selectedBlock)).length} oda</span>
              <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCsv([
                { key: 'block', label: 'BLOK' },
                { key: 'room_no', label: 'ODA' },
                { key: 'total_tasks', label: 'TOPLAM GÖREV' },
                { key: 'cleaned_count', label: 'TEMİZLENDİ' },
                { key: 'last_cleaned_at', label: 'SON TEMİZLİK' },
                { key: 'skipped_count', label: 'ATLANDI' },
                { key: 'fault_count', label: 'TOPLAM ARIZA' },
                { key: 'open_faults', label: 'AÇIK ARIZA' },
                { key: 'photo_count', label: 'FOTO KANIT' },
              ], selectedBlock === 'ALL' ? (rooms || []) : (rooms || []).filter(r => r.block === selectedBlock), `oda_gecmisi_${selectedBlock}_${days}gun.csv`)}>↓ CSV</button>
            </>
          )}
        </div>
        <div className="panel-body">
          {isLoading ? <SkeletonTable rows={8} cols={6} /> : (
            <SummaryTable
              rooms={rooms || []}
              selectedBlock={selectedBlock}
              onSelectRoom={setSelectedRoom}
            />
          )}
        </div>
      </div>
    </div>
  )
}
