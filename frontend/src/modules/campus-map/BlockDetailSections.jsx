import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

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

const ROOM_STATUS = [
  { id: 'quarantine', label: '⊘ KARANTINA', color: '#a855f7' },
  { id: 'maintenance', label: '⚒ BAKIM', color: '#f59e0b' },
  { id: 'active', label: '✓ AKTIF', color: '#16a34a' },
]

export default function BlockDetailSections({ block, onPersonClick, isManager = false }) {
  const [openRoom, setOpenRoom] = useState(null)
  const [openFault, setOpenFault] = useState(null)
  const queryClient = useQueryClient()
  const addToast = useToastStore(s => s.addToast)

  // Tek oda durumu — eskiden yalnız TÜM blok topluca değiştirilebiliyordu.
  const roomStatus = useMutation({
    mutationFn: ({ roomId, status }) => api.patch(`/capacity/rooms/${roomId}/status`, { status }),
    onSuccess: (_data, vars) => {
      const label = vars.status === 'quarantine' ? 'karantinaya alindi'
        : vars.status === 'maintenance' ? 'bakima alindi' : 'aktif yapildi'
      addToast(`Oda ${label}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['campus-block-detail', block] })
      queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
      queryClient.invalidateQueries({ queryKey: ['capacity-rooms-all'] })
    },
    onError: err => addToast(err?.response?.data?.error || 'Oda durumu degistirilemedi', 'error'),
  })

  // Arıza yönetimi — yetki kümesi can.faults ile aynı (manager/supervisor/technical).
  // Not: KAPATMA burada yok; /close fotoğraf istiyor, yarım akış olmasın diye
  // "Bakım sayfasında aç" bağlantısı korunuyor.
  const refreshFaults = () => {
    queryClient.invalidateQueries({ queryKey: ['campus-block-detail', block] })
    queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
  }
  const assignFault = useMutation({
    mutationFn: ({ id, technician_id }) => api.patch(`/maintenance/requests/${id}/assign`, { technician_id }),
    onSuccess: () => { addToast('Ariza teknisyene atandi', 'success'); refreshFaults() },
    onError: err => addToast(err?.response?.data?.error || 'Atama yapilamadi', 'error'),
  })
  const setPriority = useMutation({
    mutationFn: ({ id, priority }) => api.patch(`/maintenance/requests/${id}/priority`, { priority }),
    onSuccess: () => { addToast('Oncelik guncellendi', 'success'); refreshFaults() },
    onError: err => addToast(err?.response?.data?.error || 'Oncelik degistirilemedi', 'error'),
  })

  const { data, isPending, isError } = useQuery({
    queryKey: ['campus-block-detail', block],
    queryFn: () => api.get(`/campus-map/block/${encodeURIComponent(block)}/detail`).then(r => r.data),
    enabled: !!block,
  })

  // Teknisyen listesi yalnız bir arıza satırı açıldığında çekilir.
  const { data: technicians = [] } = useQuery({
    queryKey: ['maintenance-technicians'],
    queryFn: () => api.get('/maintenance/technicians').then(r => r.data),
    enabled: Boolean(data?.can?.faults) && openFault != null,
    staleTime: 5 * 60_000,
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
                const isOpen = openFault === fault.id
                return (
                  <div key={fault.id} style={{ ...box, borderLeft: `3px solid ${priority.color}` }}>
                    <button
                      type="button"
                      onClick={() => setOpenFault(isOpen ? null : fault.id)}
                      aria-expanded={isOpen}
                      aria-label={`${fault.location} arizasi`}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'none',
                        border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: priority.color, fontWeight: 700 }}>{priority.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text)', flex: '1 1 auto', minWidth: 0 }}>{fault.location}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{fault.status}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{fault.description}</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                        {fault.technician_name ? `atanan: ${fault.technician_name}` : 'atanmamış'}
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                        <div style={{ ...caption, marginBottom: 4 }}>ÖNCELİK</div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                          {Object.entries(PRIORITY).map(([key, item]) => (
                            key === fault.priority ? null : (
                              <button
                                key={key}
                                type="button"
                                disabled={setPriority.isPending}
                                onClick={() => setPriority.mutate({ id: fault.id, priority: key })}
                                style={{
                                  fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', cursor: 'pointer',
                                  border: `1px solid ${item.color}`, borderRadius: 4, background: 'transparent', color: item.color,
                                }}
                              >
                                {item.label}
                              </button>
                            )
                          ))}
                        </div>
                        <div style={{ ...caption, marginBottom: 4 }}>TEKNİSYENE ATA</div>
                        <select
                          aria-label="Teknisyen seç"
                          defaultValue=""
                          disabled={assignFault.isPending}
                          onChange={event => {
                            const id = event.target.value
                            if (id) assignFault.mutate({ id: fault.id, technician_id: Number(id) })
                          }}
                          style={{
                            width: '100%', fontFamily: 'var(--mono)', fontSize: 10, padding: '4px 6px',
                            background: 'var(--surface)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 4,
                          }}
                        >
                          <option value="">— teknisyen seç —</option>
                          {technicians.map(t => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 5 }}>
                          Kapatma fotoğraf gerektirir → Bakım sayfasından yapılır.
                        </div>
                      </div>
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
                  <div style={caption}>
                    ODA {room.room_no} · {room.occupied}/{room.active_beds} KİŞİ
                    {room.status !== 'active' && <span style={{ color: '#a855f7' }}> · {room.status.toUpperCase()}</span>}
                  </div>

                  {/* Tek oda durumu — blok geneli değil, sadece bu oda */}
                  {isManager && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {ROOM_STATUS.filter(item => item.id !== room.status).map(item => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={roomStatus.isPending}
                          onClick={() => roomStatus.mutate({ roomId: room.id, status: item.id })}
                          title={`Oda ${room.room_no} → ${item.label}`}
                          style={{
                            flex: 1, fontFamily: 'var(--mono)', fontSize: 8, padding: '3px 4px',
                            border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                            background: 'transparent', color: item.color,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

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
