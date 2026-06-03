// Seçili oda için detay paneli: personel listesi/atama/takas, yatak+durum düzenleme,
// zimmet kontrolü ve arıza/not sekmeleri. ZimmetPanel ve UnreturnedZimmetModal
// yalnızca bu panel tarafından kullanılır, bu yüzden burada birlikte tutulur.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

function ZimmetPanel({ personnelId, personnelName }) {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['zimmet', personnelId],
    queryFn: () => api.get(`/checkin/zimmet/${personnelId}`).then(r => r.data),
    enabled: !!personnelId,
  })

  const returnMut = useMutation({
    mutationFn: ({ id, condition }) => api.post('/checkin/zimmet/return', { zimmet_id: id, condition }),
    onSuccess: () => qc.invalidateQueries(['zimmet', personnelId]),
  })

  const returnAllMut = useMutation({
    mutationFn: (condition) => api.post('/checkin/zimmet/return-all', { personnel_id: personnelId, condition }),
    onSuccess: () => qc.invalidateQueries(['zimmet', personnelId]),
  })

  if (isLoading) return <SkeletonTable rows={4} cols={4} />
  if (items.length === 0) return <div className="empty-sub">Zimmet kaydı yok</div>

  const unreturned = items.filter(z => !z.returned_at)

  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
        {personnelName} — ZİMMET
      </div>
      {unreturned.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '12px' }}
          onClick={async () => { if (await confirmDialog({ title: 'Tüm Zimmetler', body: 'Tüm zimmetler iade edilsin mi?' })) returnAllMut.mutate('normal') }}>
          Tümünü İade Et
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(z => (
          <div key={z.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '7px', opacity: z.returned_at ? 0.5 : 1,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500 }}>{z.item_name} x{z.quantity}</div>
              {z.returned_at && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)', marginTop: '2px' }}>
                  iade: {new Date(z.returned_at).toLocaleDateString('tr-TR')} — {z.return_condition === 'damaged' ? 'hasarlı' : 'normal'}
                </div>
              )}
            </div>
            {!z.returned_at && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-ghost btn-xs" onClick={() => returnMut.mutate({ id: z.id, condition: 'normal' })}>
                  İade
                </button>
                <button className="btn btn-xs btn-danger" style={{ fontSize: '8px' }} onClick={() => returnMut.mutate({ id: z.id, condition: 'damaged' })}>
                  Hasarlı
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Unreturned Zimmet Modal ──────────────────────────────────────────────────
function UnreturnedZimmetModal({ details, personnelIds, onClose, onSuccess }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isCampusManager = user?.role === 'campus_manager'

  const returnAllAndCheckout = useMutation({
    mutationFn: async () => {
      // Return all zimmet for each person
      for (const person of details) {
        await api.post('/checkin/zimmet/return-all', { personnel_id: person.personnel_id, condition: 'normal' })
      }
      // Retry checkout
      await api.post('/capacity/bulk/checkout', { personnel_ids: personnelIds })
    },
    onSuccess: () => {
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      qc.invalidateQueries(['unassigned-personnel'])
      onSuccess?.()
      onClose()
    },
  })

  const forceCheckout = useMutation({
    mutationFn: () => api.post('/capacity/bulk/checkout', { personnel_ids: personnelIds, force: true }),
    onSuccess: () => {
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      qc.invalidateQueries(['unassigned-personnel'])
      onSuccess?.()
      onClose()
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '0', maxWidth: '560px', width: '90%',
        maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          height: '3px', background: 'linear-gradient(90deg, var(--red), var(--accent))',
        }} />
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '18px', fontWeight: 700, letterSpacing: '2px', color: 'var(--red)' }}>
            IADE EDILMEMIS ZIMMET
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            ASAGIDAKI PERSONELLERIN IADE EDILMEMIS ZIMMETLERI VAR
          </div>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {details.map(person => (
            <div key={person.personnel_id} style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px', color: 'var(--text)' }}>
                {person.full_name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {person.items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: '6px',
                  }}>
                    <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '12px' }}>
                      {item.item_name} x{item.quantity}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                      {new Date(item.created_at).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap',
        }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            IPTAL
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => returnAllAndCheckout.mutate()}
            disabled={returnAllAndCheckout.isPending}
          >
            {returnAllAndCheckout.isPending ? 'ISLENIYOR...' : 'IADE ET VE CIKIS YAP'}
          </button>
          {isCampusManager && (
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => { if (await confirmDialog({ title: 'Zorla Çıkış', body: 'Zimmetler iade edilmeden zorla çıkış yapılacak. Emin misiniz?', danger: true })) forceCheckout.mutate() }}
              disabled={forceCheckout.isPending}
            >
              {forceCheckout.isPending ? 'ISLENIYOR...' : 'ZORLA CIKIS'}
            </button>
          )}
        </div>

        {(returnAllAndCheckout.isError || forceCheckout.isError) && (
          <div className="alert alert-danger" style={{ margin: '0 24px 16px', borderRadius: '6px' }}>
            <span>!</span>
            <span>{returnAllAndCheckout.error?.response?.data?.error || forceCheckout.error?.response?.data?.error || 'Islem basarisiz.'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoomDetailPanel({ room, onClose, onRoomUpdated, swapSource, onSwapSelect, onSwapCancel }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('personel') // personel | duzenle | ariza | zimmet
  const [zimmetPerson, setZimmetPerson] = useState(null)
  const [noteText, setNoteText] = useState(room.notes || '')
  const [faultDesc, setFaultDesc] = useState('')
  const [faultLoc, setFaultLoc] = useState(`${room.block} Blok - Oda ${room.room_no}`)
  const [zimmetModal, setZimmetModal] = useState(null) // { details, personnelIds }
  const [faultPriority, setFaultPriority] = useState('medium')
  const [searchQ, setSearchQ] = useState('')
  const [activeBeds, setActiveBeds] = useState(room.active_beds || room.capacity || 6)
  const [roomStatus, setRoomStatus] = useState(room.status || 'active')
  const [assignMsg, setAssignMsg] = useState(null)

  const occ = room.occupied || 0
  const cap = room.active_beds || room.capacity || 6
  const empty = Math.max(0, cap - occ)
  const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0
  const progCls = pct >= 100 ? 'prog-red' : pct >= 70 ? 'prog-amber' : 'prog-green'
  const accentLine = pct >= 100
    ? 'linear-gradient(90deg,var(--red),var(--red2))'
    : pct >= 70
      ? 'linear-gradient(90deg,var(--accent),var(--accent3))'
      : 'linear-gradient(90deg,var(--green),var(--teal))'

  const { data: personnel = [], isLoading: personnelLoading } = useQuery({
    queryKey: ['room-personnel', room.id],
    queryFn: () => api.get(`/capacity/rooms/${room.id}/personnel`).then(r => r.data),
    enabled: !!room.id,
  })

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['personnel-search', searchQ],
    queryFn: () => api.get(`/capacity/personnel/search?q=${encodeURIComponent(searchQ)}`).then(r => r.data),
    enabled: searchQ.trim().length >= 2,
    staleTime: 10000,
  })

  const mutBeds = useMutation({
    mutationFn: (v) => api.patch(`/capacity/rooms/${room.id}/beds`, { active_beds: v }),
    onSuccess: () => { qc.invalidateQueries(['rooms']); onRoomUpdated?.() },
  })

  const mutStatus = useMutation({
    mutationFn: (s) => api.patch(`/capacity/rooms/${room.id}/status`, { status: s }),
    onSuccess: () => { qc.invalidateQueries(['rooms']); onRoomUpdated?.() },
  })

  const mutNotes = useMutation({
    mutationFn: (n) => api.patch(`/capacity/rooms/${room.id}/notes`, { notes: n }),
    onSuccess: () => qc.invalidateQueries(['rooms']),
  })

  const mutFault = useMutation({
    mutationFn: () => api.post('/maintenance/requests', {
      location: faultLoc,
      description: faultDesc,
    }),
    onSuccess: () => {
      setFaultDesc('')
      qc.invalidateQueries(['dashboard-maintenance-open'])
    },
  })

  const mutAssign = useMutation({
    mutationFn: (personnelId) => api.post('/capacity/reassign', {
      personnel_id: personnelId, room_id: room.id,
    }),
    onSuccess: (_, pid) => {
      setAssignMsg({ ok: true, msg: 'Personel odaya atandı.' })
      setSearchQ('')
      qc.invalidateQueries(['room-personnel', room.id])
      qc.invalidateQueries(['rooms'])
    },
    onError: (e) => {
      setAssignMsg({ ok: false, msg: e.response?.data?.error || 'Atama başarısız.' })
    },
  })

  const mutRemove = useMutation({
    mutationFn: (personnelId) => api.post('/capacity/remove-from-room', { personnel_id: personnelId }),
    onSuccess: () => {
      qc.invalidateQueries(['room-personnel', room.id])
      qc.invalidateQueries(['rooms'])
    },
  })

  const mutBulkCheckout = useMutation({
    mutationFn: (personnelIds) => api.post('/capacity/bulk/checkout', { personnel_ids: personnelIds }),
    onSuccess: () => {
      qc.invalidateQueries(['room-personnel', room.id])
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['unassigned-personnel'])
      onRoomUpdated?.()
    },
    onError: (e) => {
      if (e.response?.data?.error === 'UNRETURNED_ZIMMET') {
        setZimmetModal({
          details: e.response.data.details,
          personnelIds: personnel.map(p => p.id),
        })
      }
    },
  })

  const mutSwap = useMutation({
    mutationFn: ({ personAId, personBId }) => api.post('/capacity/swap', { person_a_id: personAId, person_b_id: personBId }),
    onSuccess: () => {
      qc.invalidateQueries(['room-personnel'])
      qc.invalidateQueries(['rooms'])
      onSwapCancel?.()
      onRoomUpdated?.()
    },
  })

  const TAB_STYLE = (active) => ({
    padding: '8px 18px', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
    transition: 'all 0.15s',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#000' : 'var(--text3)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  })

  return (
    <div className="panel fade-up" style={{ marginTop: '18px' }}>
      <div style={{ height: '3px', background: accentLine }} />
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ fontSize: '18px' }}>
            ODA {room.room_no}
            <span style={{ marginLeft: '10px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', verticalAlign: 'middle' }}>
              {room.block} BLOK · KAT {room.floor} ·
              {Number(room.room_no) % 2 !== 0 ? ' SOL' : ' SAĞ'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`badge badge-${roomStatus === 'active' ? 'green' : roomStatus === 'maintenance' ? 'amber' : 'red'}`}>
            {roomStatus === 'active' ? 'AKTİF' : roomStatus === 'maintenance' ? 'BAKIM' : 'KARANTİNA'}
          </span>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100px, 100%), 1fr))', gap: '1px', background: 'var(--border)' }}>
        {[
          { label: 'KAPASİTE', value: cap, color: 'var(--text)' },
          { label: 'AKTİF YATAK', value: activeBeds, color: 'var(--blue)' },
          { label: 'DOLU', value: occ, color: 'var(--accent)' },
          { label: 'BOŞ', value: empty, color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', padding: '12px 16px',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: s.color, letterSpacing: '1px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ height: '4px', background: 'var(--surface3)' }}>
        <div className={`prog-fill ${progCls}`} style={{ width: `${pct}%`, height: '100%', transition: 'width .6s ease' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        {[
          { id: 'personel', label: `PERSONEL (${personnel.length})` },
          { id: 'duzenle', label: 'DÜZENLE' },
          { id: 'zimmet', label: 'ZİMMET' },
          { id: 'ariza', label: 'ARIZA / NOT' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={TAB_STYLE(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {/* Swap mode banner */}
        {swapSource && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', marginBottom: '14px',
            background: 'rgba(142,68,230,.1)', border: '1px solid rgba(142,68,230,.4)',
            borderRadius: '7px',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--purple)', fontWeight: 600 }}>
              TAKAS MODU: {swapSource.name} ({swapSource.roomLabel}) secildi — hedef kisiyi secin
            </span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', fontSize: '9px' }} onClick={onSwapCancel}>
              IPTAL
            </button>
          </div>
        )}

        {/* Swap error */}
        {mutSwap.isError && (
          <div className="alert alert-danger" style={{ marginBottom: '12px' }}>
            <span>!</span><span>{mutSwap.error?.response?.data?.error || 'Takas basarisiz.'}</span>
          </div>
        )}

        {/* ── Tab: Personel ── */}
        {tab === 'personel' && (
          <div>
            {/* Personnel list */}
            {personnelLoading ? (
              <SkeletonTable rows={3} cols={3} />
            ) : personnel.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div className="empty-icon" style={{ fontSize: '28px' }}>👤</div>
                <div className="empty-sub">Bu odada kayıtlı personel yok</div>
              </div>
            ) : (
              <table className="data-table responsive-stack" style={{ marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <th>AD SOYAD</th>
                    <th>FİRMA</th>
                    <th>TELEFON</th>
                    <th>VARDİYA</th>
                    <th>YATAK</th>
                    <th>ATANMA</th>
                    <th>İŞLEM</th>
                  </tr>
                </thead>
                <tbody>
                  {personnel.map((p, i) => (
                    <tr key={p.id || i} draggable style={{ cursor: 'grab' }}
                      onDragStart={e => { e.dataTransfer.setData('personnel-id', String(p.id)); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.4' }}
                      onDragEnd={e => { e.currentTarget.style.opacity = '1' }}>
                      <td data-label="Ad Soyad" style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.photo_url ? (
                          <img loading="lazy" src={p.photo_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg,var(--accent),var(--purple))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--display)', fontSize: '11px', color: '#fff',
                          }}>{(p.full_name || '?').charAt(0).toUpperCase()}</div>
                        )}
                        {p.full_name}
                      </td>
                      <td data-label="Firma" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{p.company || '—'}</td>
                      <td data-label="Telefon" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{p.phone_number || '—'}</td>
                      <td data-label="Vardiya">
                        <span className={`badge badge-${p.shift_type === 'night' ? 'purple' : 'amber'}`} style={{ fontSize: '8px' }}>
                          {p.shift_type === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                        </span>
                      </td>
                      <td data-label="Yatak"><span className="badge badge-gray">YATAK {p.bed_no ?? i + 1}</span></td>
                      <td data-label="Atanma" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                        {p.assigned_at ? new Date(p.assigned_at).toLocaleDateString('tr-TR') : '—'}
                      </td>
                      <td data-label="Islem">
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {swapSource && swapSource.id !== p.id && swapSource.roomId !== room.id ? (
                            <button
                              className="btn btn-primary btn-xs"
                              style={{ fontSize: '9px', padding: '3px 8px', background: 'var(--purple)', borderColor: 'var(--purple)' }}
                              onClick={async () => {
                                if (await confirmDialog({ title: 'Oda Takası', body: `${swapSource.name} (${swapSource.roomLabel}) ↔ ${p.full_name} (${room.block}-${room.room_no}) takası yapılsın mı?` }))
                                  mutSwap.mutate({ personAId: swapSource.id, personBId: p.id })
                              }}
                              disabled={mutSwap.isPending}
                            >
                              {mutSwap.isPending ? '...' : 'TAKAS HEDEF'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-xs"
                              style={{ fontSize: '9px', padding: '3px 8px', color: swapSource?.id === p.id ? 'var(--accent)' : 'var(--purple)' }}
                              onClick={() => onSwapSelect?.({ id: p.id, name: p.full_name, roomId: room.id, roomLabel: `${room.block}-${room.room_no}` })}
                            >
                              {swapSource?.id === p.id ? 'SEÇİLDİ' : 'TAKAS'}
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-xs"
                            style={{ fontSize: '9px', padding: '3px 8px' }}
                            onClick={async () => { if (await confirmDialog({ title: 'Odadan Çıkar', body: `${p.full_name} odadan çıkarılsın mı?`, danger: true })) mutRemove.mutate(p.id) }}
                            disabled={mutRemove.isPending}
                          >
                            ÇIKAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Bulk checkout button */}
            {personnel.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Toplu Çıkış', body: `Bu odadaki ${personnel.length} kişiyi tamamen çıkış yapmak istediğinize emin misiniz?`, danger: true }))
                      mutBulkCheckout.mutate(personnel.map(p => p.id))
                  }}
                  disabled={mutBulkCheckout.isPending}
                >
                  {mutBulkCheckout.isPending ? 'ISLENIYOR...' : `TOPLU CIKIS (${personnel.length} KISI)`}
                </button>
                {mutBulkCheckout.isError && !zimmetModal && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--red)' }}>
                    {mutBulkCheckout.error?.response?.data?.error || 'Hata olustu.'}
                  </span>
                )}
              </div>
            )}

            {/* Assign personnel */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
                PERSONEL YERLEŞTİR
              </div>
              {assignMsg && (
                <div className={`alert ${assignMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '10px' }}>
                  {assignMsg.msg}
                </div>
              )}
              <input
                className="form-input"
                placeholder="Ad, firma veya TC ile ara (min 2 harf)..."
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setAssignMsg(null) }}
                style={{ marginBottom: '10px' }}
              />
              {searching && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>Aranıyor...</div>
              )}
              {searchQ.trim().length >= 2 && searchResults.length > 0 && (
                <div style={{
                  border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden',
                  background: 'var(--surface2)', maxHeight: '260px', overflowY: 'auto',
                }}>
                  {searchResults.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.4)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{p.full_name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                          {p.company || '—'} · {p.phone_number || '—'}
                          {p.room_no && (
                            <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>
                              ⚠ Şu an: {p.block} {p.room_no}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={() => mutAssign.mutate(p.id)}
                        disabled={mutAssign.isPending}
                      >
                        YERLEŞTIR
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {searchQ.trim().length >= 2 && !searching && searchResults.length === 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', padding: '8px 0' }}>
                  Sonuç bulunamadı.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Düzenle ── */}
        {tab === 'duzenle' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '20px' }}>
            {/* Active beds editor */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '12px' }}>
                AKTİF YATAK SAYISI
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setActiveBeds(v => Math.max(occ, v - 1))}
                  style={{ fontSize: '18px', padding: '6px 14px', lineHeight: 1 }}
                >−</button>
                <div style={{ fontFamily: 'var(--display)', fontSize: '48px', color: 'var(--text)', letterSpacing: '2px', minWidth: '60px', textAlign: 'center', lineHeight: 1 }}>
                  {activeBeds}
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setActiveBeds(v => Math.min(room.capacity || 6, v + 1))}
                  style={{ fontSize: '18px', padding: '6px 14px', lineHeight: 1 }}
                >+</button>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '10px' }}>
                Max: {room.capacity} · Şu an dolu: {occ}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => mutBeds.mutate(activeBeds)}
                disabled={mutBeds.isPending || activeBeds === (room.active_beds || room.capacity)}
              >
                {mutBeds.isPending ? 'KAYDEDİLİYOR...' : '✓ KAYDET'}
              </button>
              {mutBeds.isSuccess && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)', marginTop: '6px' }}>Kaydedildi.</div>
              )}
            </div>

            {/* Status editor */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '12px' }}>
                ODA DURUMU
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {[
                  { value: 'active', label: 'AKTİF', color: 'var(--green)', icon: '✓' },
                  { value: 'maintenance', label: 'BAKIM', color: 'var(--accent)', icon: '⚙' },
                  { value: 'quarantine', label: 'KARANTİNA', color: 'var(--red)', icon: '🔒' },
                ].map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '7px', cursor: 'pointer',
                      background: roomStatus === opt.value ? 'rgba(255,255,255,.04)' : 'var(--surface2)',
                      border: `1px solid ${roomStatus === opt.value ? opt.color : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      checked={roomStatus === opt.value}
                      onChange={() => setRoomStatus(opt.value)}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: '14px' }}>{opt.icon}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: roomStatus === opt.value ? opt.color : 'var(--text2)' }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => mutStatus.mutate(roomStatus)}
                disabled={mutStatus.isPending || roomStatus === room.status}
              >
                {mutStatus.isPending ? 'KAYDEDİLİYOR...' : '✓ DURUMU GÜNCELLE'}
              </button>
              {mutStatus.isSuccess && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)', marginTop: '6px' }}>Durum güncellendi.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Zimmet (#7) ── */}
        {tab === 'zimmet' && (
          <div>
            {personnel.length === 0 ? (
              <div className="empty-sub">Bu odada personel yok</div>
            ) : zimmetPerson ? (
              <div>
                <button className="btn btn-ghost btn-xs" style={{ marginBottom: '12px' }} onClick={() => setZimmetPerson(null)}>
                  ← Listeye Dön
                </button>
                <ZimmetPanel personnelId={zimmetPerson.id} personnelName={zimmetPerson.full_name} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '6px' }}>
                  ZİMMET KONTROL İÇİN PERSONEL SEÇ
                </div>
                {personnel.map(p => (
                  <div key={p.id}
                    onClick={() => setZimmetPerson(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: '7px', cursor: 'pointer', transition: 'all .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{p.company || ''}</div>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Arıza / Not ── */}
        {tab === 'ariza' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '20px' }}>
            {/* Fault recording */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '12px' }}>
                ARIZA KAYDI
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label className="form-label">KONUM</label>
                  <input
                    className="form-input"
                    value={faultLoc}
                    onChange={e => setFaultLoc(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">ARIZA AÇIKLAMASI</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Arızayı kısaca açıklayın..."
                    value={faultDesc}
                    onChange={e => setFaultDesc(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => mutFault.mutate()}
                  disabled={mutFault.isPending || !faultDesc.trim()}
                >
                  {mutFault.isPending ? 'GÖNDERİLİYOR...' : '⚙ ARIZA BİLDİR'}
                </button>
                {mutFault.isSuccess && (
                  <div className="alert alert-success" style={{ margin: 0 }}>
                    <span>✓</span><span>Arıza kaydedildi.</span>
                  </div>
                )}
                {mutFault.isError && (
                  <div className="alert alert-danger" style={{ margin: 0 }}>
                    <span>!</span><span>Hata: {mutFault.error?.response?.data?.error || 'İşlem başarısız.'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '12px' }}>
                ODA NOTU
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <textarea
                  className="form-textarea"
                  rows={6}
                  placeholder="Bu oda hakkında not ekleyin..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => mutNotes.mutate(noteText)}
                  disabled={mutNotes.isPending}
                >
                  {mutNotes.isPending ? 'KAYDEDİLİYOR...' : '✎ NOTU KAYDET'}
                </button>
                {mutNotes.isSuccess && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)' }}>Not kaydedildi.</div>
                )}
                {room.notes && noteText === room.notes && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', lineHeight: 1.6, padding: '8px', background: 'var(--surface2)', borderRadius: '5px', border: '1px solid var(--border)' }}>
                    {room.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Unreturned Zimmet Modal */}
      {zimmetModal && (
        <UnreturnedZimmetModal
          details={zimmetModal.details}
          personnelIds={zimmetModal.personnelIds}
          onClose={() => setZimmetModal(null)}
          onSuccess={() => {
            qc.invalidateQueries(['room-personnel', room.id])
            qc.invalidateQueries(['rooms'])
            onRoomUpdated?.()
          }}
        />
      )}
    </div>
  )
}
