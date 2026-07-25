import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

// Blok panelinde inline arıza / temizlik / oda-kişi bölümleri.
// Veri rol-duyarlı tek uçtan gelir; yetkisi olmayan bölüm hiç render edilmez.
const PRIORITY = {
  high: { label: 'ACİL', color: '#dc2626' },
  medium: { label: 'normal', color: '#f59e0b' },
  low: { label: 'düşük', color: 'var(--text3)' },
}

const box = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '7px 9px',
  background: 'var(--surface2, transparent)',
}
const caption = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)',
  fontWeight: 700, marginBottom: 5,
}

function Collapsible({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text2)',
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700,
        }}
      >
        <span style={{ color: 'var(--accent)' }}>{open ? '▾' : '▸'}</span>
        {title}
        {count != null && <span style={{ color: 'var(--text3)' }}>({count})</span>}
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  )
}

export default function BlockDetailSections({ block, onPersonClick }) {
  const [openRoom, setOpenRoom] = useState(null)

  const { data, isPending, isError } = useQuery({
    queryKey: ['campus-block-detail', block],
    queryFn: () => api.get(`/campus-map/block/${encodeURIComponent(block)}/detail`).then(r => r.data),
    enabled: !!block,
  })

  if (isPending) return <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>Detay yükleniyor…</div>
  if (isError) return <div style={{ fontSize: 10, color: '#dc2626', marginTop: 8 }}>Detay alınamadı.</div>

  const can = data?.can || {}
  const faults = data?.faults || []
  const cleaning = data?.cleaning
  const rooms = data?.rooms || []
  const room = rooms.find(r => r.id === openRoom)

  return (
    <div>
      {can.faults && (
        <Collapsible title="AÇIK ARIZALAR" count={faults.length} defaultOpen={faults.length > 0}>
          {faults.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Açık arıza yok.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {faults.map(fault => {
                const priority = PRIORITY[fault.priority] || PRIORITY.low
                return (
                  <div key={fault.id} style={{ ...box, borderLeft: `3px solid ${priority.color}` }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: priority.color, fontWeight: 700 }}>{priority.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text)', flex: '1 1 auto', minWidth: 0 }}>{fault.location}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{fault.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{fault.description}</div>
                    {fault.technician_name && (
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>atanan: {fault.technician_name}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Collapsible>
      )}

      {can.cleaning && cleaning && (
        <Collapsible title="BUGÜNKÜ TEMİZLİK" count={cleaning.total} defaultOpen={cleaning.pending > 0}>
          {cleaning.total === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Bugün için görev üretilmemiş.</div>
          ) : (
            <div style={{ ...box, display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 10 }}>
              <span style={{ color: 'var(--accent)' }}>%{cleaning.pct}</span>
              <span style={{ color: 'var(--text2)' }}>✓ {cleaning.done} tamam</span>
              <span style={{ color: cleaning.pending ? '#f59e0b' : 'var(--text3)' }}>⏳ {cleaning.pending} kaldı</span>
              {cleaning.skipped > 0 && <span style={{ color: 'var(--text3)' }}>⤳ {cleaning.skipped} atlandı</span>}
            </div>
          )}
        </Collapsible>
      )}

      {can.rooms && (
        <Collapsible title="ODALAR VE KİŞİLER" count={rooms.length}>
          {rooms.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Oda kaydı yok.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {rooms.map(item => {
                  const full = item.active_beds > 0 && item.occupied >= item.active_beds
                  const isOpen = item.id === openRoom
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOpenRoom(isOpen ? null : item.id)}
                      aria-pressed={isOpen}
                      title={`Oda ${item.room_no} · ${item.occupied}/${item.active_beds}${item.status !== 'active' ? ` · ${item.status}` : ''}`}
                      style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
                        border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4,
                        background: isOpen ? 'rgba(245,158,11,.15)' : 'var(--surface2, transparent)',
                        color: item.status !== 'active' ? '#a855f7' : full ? '#dc2626' : 'var(--text2)',
                      }}
                    >
                      {item.room_no}
                      <span style={{ color: 'var(--text3)' }}> {item.occupied}/{item.active_beds}</span>
                    </button>
                  )
                })}
              </div>

              {room && (
                <div style={{ ...box, marginTop: 7 }}>
                  <div style={caption}>ODA {room.room_no} · {room.occupied}/{room.active_beds} KİŞİ</div>
                  {room.occupants.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Bu odada kayıtlı kişi yok.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {room.occupants.map(person => (
                        <button
                          key={person.personnel_id}
                          type="button"
                          onClick={() => onPersonClick?.(person.personnel_id)}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left', width: '100%',
                            background: 'none', border: 'none', borderBottom: '1px dashed var(--border)',
                            padding: '3px 0', cursor: onPersonClick ? 'pointer' : 'default', color: 'var(--text)',
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600 }}>
                            {person.bed_no != null && <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', marginRight: 5 }}>#{person.bed_no}</span>}
                            {person.full_name}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {person.company || 'şirket yok'}
                            {person.assigned_at && ` · giriş ${String(person.assigned_at).slice(0, 10)}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Collapsible>
      )}
    </div>
  )
}
