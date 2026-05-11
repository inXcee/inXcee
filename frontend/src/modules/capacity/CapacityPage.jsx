import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import HelpHint from '../../shared/components/HelpHint.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import {
  BLOCKS_BY_TYPE,
  BLOCK_BY_NAME,
  expectedRoomNos as expectedRoomNosFromConfig,
  getCapacity as getCapacityFromConfig,
  getFloorLabel,
} from '../../shared/blocks.js'

function roomCls(room, defaultCap = 6) {
  if (room.status === 'maintenance') return 'r-maint'
  const occ = room.occupied || 0
  const cap = room.active_beds || room.capacity || defaultCap
  if (occ === 0) return 'r-empty'
  if (occ >= cap) return 'r-full'
  return 'r-partial'
}

// ── Room cell ────────────────────────────────────────────────────────────────
function RoomCell({ room, selected, onClick, defaultCap, onDropPersonnel, dragOverRoomId, onDragOverRoom }) {
  const occ = room.occupied || 0
  const cap = room.active_beds || room.capacity || defaultCap
  const cls = roomCls(room, defaultCap)
  const isDND = room.is_dnd
  const shiftIcon = room.room_shift === 'night' ? '☾' : room.room_shift === 'day' ? '☀' : ''
  const isS = room.block && !room.block.startsWith('M')

  const isDropTarget = dragOverRoomId === room.id

  return (
    <div
      className={`r-cell ${cls} ${selected ? 'r-selected' : ''}`}
      onClick={() => onClick(room)}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverRoom?.(room.id) }}
      onDragLeave={() => onDragOverRoom?.(null)}
      onDrop={e => { e.preventDefault(); onDragOverRoom?.(null); const pid = e.dataTransfer.getData('personnel-id'); if (pid) onDropPersonnel?.(+pid, room.id) }}
      title={`Oda ${room.room_no} — ${occ}/${cap} kişi${room.room_shift ? ` · ${room.room_shift === 'night' ? 'Gece' : 'Gündüz'} vardiyası` : ''}${isDND ? ' · DND' : ''}${isS ? ' · Özel banyo' : ''}`}
      style={{
        width: '56px', height: '68px', aspectRatio: 'unset',
        flexDirection: 'column', gap: '2px', flexShrink: 0,
        borderRadius: '6px', cursor: 'pointer',
        position: 'relative',
        ...(isDND ? { boxShadow: 'inset 0 0 0 2px rgba(245,166,35,.5)' } : {}),
        ...(isDropTarget ? { boxShadow: '0 0 12px var(--accent)', border: '2px solid var(--accent)', transform: 'scale(1.08)', transition: 'all .15s' } : {}),
      }}
    >
      {isDND && (
        <div style={{
          position: 'absolute', top: '-4px', right: '-4px',
          background: 'var(--accent)', color: '#000', fontSize: '6px', fontWeight: 800,
          padding: '1px 3px', borderRadius: '3px', fontFamily: 'var(--mono)',
          letterSpacing: '0.5px', lineHeight: 1.2,
        }}>DND</div>
      )}
      {isS && (
        <div style={{
          position: 'absolute', bottom: '3px', right: '3px',
          fontSize: '9px', lineHeight: 1, opacity: 0.7,
        }} title="Özel banyo + tuvalet">🚿</div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, lineHeight: 1 }}>
        {room.room_no}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', opacity: 0.9 }}>
        {occ}/{cap}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', opacity: 0.6 }}>
        {room.status === 'maintenance' ? '⚙' : room.status === 'quarantine' ? '🔒' : occ > 0 && shiftIcon ? shiftIcon : ''}
      </div>
    </div>
  )
}

function GhostCell({ roomNo }) {
  return (
    <div style={{
      width: '56px', height: '68px', flexShrink: 0, borderRadius: '6px',
      border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', fontWeight: 600 }}>{roomNo}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)' }}>—</div>
    </div>
  )
}

// Shared facility (M blocks only)
function FacilityCell({ type, height = 34 }) {
  const isWC = type === 'WC'
  return (
    <div style={{
      height, width: '38px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
      background: isWC ? 'rgba(59,140,240,.1)' : 'rgba(26,188,156,.1)',
      border: `1px solid ${isWC ? 'rgba(59,140,240,.3)' : 'rgba(26,188,156,.3)'}`,
      borderRadius: '4px',
    }}>
      <span style={{ fontSize: '12px' }}>{isWC ? '🚽' : '🚿'}</span>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: '6px', letterSpacing: '0.3px',
        color: isWC ? 'var(--blue)' : 'var(--teal)', fontWeight: 700,
      }}>{type}</span>
    </div>
  )
}

// ── Room detail panel ─────────────────────────────────────────────────────────
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

  if (isLoading) return <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Yükleniyor...</div>
  if (items.length === 0) return <div className="empty-sub">Zimmet kaydı yok</div>

  const unreturned = items.filter(z => !z.returned_at)

  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
        {personnelName} — ZİMMET
      </div>
      {unreturned.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '12px' }}
          onClick={() => { if (confirm('Tüm zimmetler iade edilsin mi?')) returnAllMut.mutate('normal') }}>
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
              onClick={() => { if (confirm('Zimmetler iade edilmeden zorla cikis yapilacak. Emin misiniz?')) forceCheckout.mutate() }}
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

function RoomDetailPanel({ room, onClose, onRoomUpdated, swapSource, onSwapSelect, onSwapCancel }) {
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
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', padding: '12px 0' }}>Yükleniyor...</div>
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
                              onClick={() => {
                                if (confirm(`${swapSource.name} (${swapSource.roomLabel}) ↔ ${p.full_name} (${room.block}-${room.room_no}) takası yapılsın mı?`))
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
                            onClick={() => { if (confirm(`${p.full_name} odadan çıkarılsın mı?`)) mutRemove.mutate(p.id) }}
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
                  onClick={() => {
                    if (confirm(`Bu odadaki ${personnel.length} kisiyi tamamen cikis yapmak istediginize emin misiniz?`))
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

// ── Corridor plan ─────────────────────────────────────────────────────────────
function CorridorPlan({ block, floor, rooms, selectedRoom, onSelect, onDropPersonnel, dragOverRoomId, onDragOverRoom }) {
  const cfg = BLOCK_BY_NAME[block]
  const isM = cfg?.type === 'M'
  const isS2Floor2 = block === 'S2' && floor === 2
  const defaultCap = getCapacityFromConfig(block, floor)

  const floorRooms = rooms.filter(r => r.floor === floor)
  const byNo = Object.fromEntries(floorRooms.map(r => [r.room_no, r]))

  const allNos = expectedRoomNosFromConfig(block, floor)
  const oddNos  = allNos.filter(n => n % 2 !== 0)   // SOL — odd
  const evenNos = allNos.filter(n => n % 2 === 0)   // SAĞ — even

  const totalCap = floorRooms.reduce((s, r) => s + (r.active_beds || r.capacity || defaultCap), 0)
  const totalOcc = floorRooms.reduce((s, r) => s + (r.occupied || 0), 0)
  const pct = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0
  const progCls = pct >= 90 ? 'prog-red' : pct >= 70 ? 'prog-amber' : 'prog-green'

  const rowH = 68

  return (
    <div>
      {/* S2 Floor 2 warning */}
      {isS2Floor2 && (
        <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
          <span>⚠</span>
          <span>
            <strong>S2 KAT 2 İSTİSNA:</strong> Odalar 4 kişilik · Her odada özel banyo
          </span>
        </div>
      )}

      {/* Y blok placeholder warning */}
      {cfg?.isPlaceholder && (
        <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
          <span>⚠</span>
          <span>
            <strong>PLACEHOLDER:</strong> Bu bloğun kapasitesi henüz girilmedi (1 kişilik). Doğru yatak sayılarını oda detayından düzenleyin.
          </span>
        </div>
      )}

      {/* Floor stats */}
      {floorRooms.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100px, 100%), 1fr))', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: 'TOPLAM YATAK', value: totalCap, color: 'var(--text)' },
              { label: 'DOLU YATAK',   value: totalOcc, color: 'var(--accent)' },
              { label: 'BOŞ YATAK',    value: totalCap - totalOcc, color: 'var(--green)' },
              { label: 'DOLULUK',      value: `%${pct}`, color: pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--accent)' : 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '3px' }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="prog-bar" style={{ marginBottom: '14px' }}>
            <div className={`prog-fill ${progCls}`} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[['r-empty','BOŞ'],['r-partial','KISMİ'],['r-full','DOLU'],['r-maint','BAKIM']].map(([cls,lbl]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className={`r-cell ${cls}`} style={{ width: '14px', height: '14px', aspectRatio: 'unset', fontSize: 0, flexShrink: 0, borderRadius: '3px' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{lbl}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
          {isM ? 'ORTAK WC/BANYO' : 'HER ODADA ÖZEL BANYO'}
        </div>
      </div>

      {/* ── Corridor layout ── */}
      <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
        <div style={{ minWidth: 'max-content', userSelect: 'none' }}>

          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px', paddingLeft: isM ? '58px' : '58px' }}>
            GİRİŞ →
          </div>

          {/* SOL (odd) row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
            <div style={{
              width: '50px', flexShrink: 0, textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', lineHeight: 1.5,
            }}>
              SOL<br/>TEK
            </div>
            {isM && <FacilityCell type="BANYO" height={rowH} />}
            <div style={{ display: 'flex', gap: '3px' }}>
              {oddNos.map(no => {
                const key = String(no)
                const room = byNo[key]
                return room
                  ? <RoomCell key={no} room={room} selected={selectedRoom?.id === room.id} onClick={onSelect} defaultCap={defaultCap} onDropPersonnel={onDropPersonnel} dragOverRoomId={dragOverRoomId} onDragOverRoom={onDragOverRoom} />
                  : <GhostCell key={no} roomNo={no} />
              })}
            </div>
            {isM && <FacilityCell type="WC" height={rowH} />}
          </div>

          {/* CORRIDOR strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '28px', margin: '3px 0' }}>
            <div style={{ width: '50px', flexShrink: 0 }} />
            {isM && (
              <div style={{ width: '38px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.15)', border: '1px solid rgba(26,188,156,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.15)', border: '1px solid rgba(59,140,240,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
              </div>
            )}
            <div style={{
              flex: 1, height: '100%',
              background: 'linear-gradient(90deg, rgba(0,0,0,.3), rgba(35,45,63,.4), rgba(0,0,0,.3))',
              borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '6px' }}>KORİDOR</span>
            </div>
            {isM && (
              <div style={{ width: '38px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.15)', border: '1px solid rgba(59,140,240,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.15)', border: '1px solid rgba(26,188,156,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
              </div>
            )}
          </div>

          {/* SAĞ (even) row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
            <div style={{
              width: '50px', flexShrink: 0, textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', lineHeight: 1.5,
            }}>
              SAĞ<br/>ÇİFT
            </div>
            {isM && <FacilityCell type="WC" height={rowH} />}
            <div style={{ display: 'flex', gap: '3px' }}>
              {evenNos.map(no => {
                const key = String(no)
                const room = byNo[key]
                return room
                  ? <RoomCell key={no} room={room} selected={selectedRoom?.id === room.id} onClick={onSelect} defaultCap={defaultCap} onDropPersonnel={onDropPersonnel} dragOverRoomId={dragOverRoomId} onDragOverRoom={onDragOverRoom} />
                  : <GhostCell key={no} roomNo={no} />
              })}
            </div>
            {isM && <FacilityCell type="BANYO" height={rowH} />}
          </div>

          {/* Footer info */}
          <div style={{
            marginTop: '10px', paddingLeft: '54px',
            fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px',
            display: 'flex', gap: '20px',
          }}>
            <span>{block} BLOK — KAT {floor}</span>
            <span>{allNos.length} ODA</span>
            <span>{isM ? 'ORTAK BANYO/WC' : 'HER ODADA ÖZEL BANYO'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Unassigned Personnel Pool ─────────────────────────────────────────────────
function UnassignedPool({ selectedRoom, onAssigned }) {
  const qc = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [assignMsg, setAssignMsg] = useState(null)
  const [companyFilter, setCompanyFilter] = useState('')

  const { data: unassigned = [], isLoading } = useQuery({
    queryKey: ['unassigned-personnel', searchQ],
    queryFn: () => api.get(`/capacity/unassigned${searchQ.trim().length >= 2 ? `?q=${encodeURIComponent(searchQ)}` : ''}`).then(r => r.data),
    refetchInterval: 15000,
  })

  const mutBulkAssign = useMutation({
    mutationFn: ({ personnelIds, roomId }) => api.post('/capacity/bulk/assign', { personnel_ids: personnelIds, room_id: roomId }),
    onSuccess: () => {
      setSelected(new Set())
      setAssignMsg({ ok: true, msg: 'Personeller odaya yerleştirildi.' })
      qc.invalidateQueries(['unassigned-personnel'])
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      onAssigned?.()
    },
    onError: (e) => setAssignMsg({ ok: false, msg: e.response?.data?.error || 'Atama başarısız.' }),
  })

  const mutSingleAssign = useMutation({
    mutationFn: ({ personnelId, roomId }) => api.post('/capacity/reassign', { personnel_id: personnelId, room_id: roomId }),
    onSuccess: () => {
      qc.invalidateQueries(['unassigned-personnel'])
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      onAssigned?.()
    },
    onError: (e) => setAssignMsg({ ok: false, msg: e.response?.data?.error || 'Atama başarısız.' }),
  })

  // Get unique companies for filter
  const companies = [...new Set(unassigned.map(p => p.company).filter(Boolean))].sort()

  const filtered = companyFilter
    ? unassigned.filter(p => p.company === companyFilter)
    : unassigned

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  const selectCompany = (company) => {
    const companyIds = unassigned.filter(p => p.company === company).map(p => p.id)
    setSelected(new Set(companyIds))
    setCompanyFilter(company)
  }

  if (isLoading) return null

  return (
    <div className="panel fade-up" style={{ marginTop: '18px' }}>
      <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--accent), var(--red2))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ fontSize: '16px' }}>
            ODASIZ PERSONEL
            <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
              {unassigned.length}
            </span>
          </div>
          <div className="panel-subtitle">ODA ATANMAMIŞ PERSONELLER · SEÇ VE YERLEŞTİR</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected.size > 0 && selectedRoom && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setAssignMsg(null)
                mutBulkAssign.mutate({ personnelIds: [...selected], roomId: selectedRoom.id })
              }}
              disabled={mutBulkAssign.isPending}
            >
              {mutBulkAssign.isPending ? 'YERLEŞTİRİLİYOR...' : `${selected.size} KİŞİYİ ODA ${selectedRoom.room_no}'YA YERLEŞTİR`}
            </button>
          )}
          {selected.size > 0 && !selectedRoom && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>
              {selected.size} kişi seçili — yukarıdan oda seçin
            </span>
          )}
        </div>
      </div>

      <div className="panel-body">
        {assignMsg && (
          <div className={`alert ${assignMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '12px' }}>
            <span>{assignMsg.ok ? '✓' : '!'}</span><span>{assignMsg.msg}</span>
          </div>
        )}

        {unassigned.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px' }}>
            <div className="empty-icon" style={{ fontSize: '28px' }}>✓</div>
            <div className="empty-sub">Tüm personeller odalara yerleştirilmiş</div>
          </div>
        ) : (
          <>
            {/* Filters row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="İsim, firma veya TC ara..."
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSelected(new Set()) }}
                style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
              />
              {companies.length > 1 && (
                <select
                  className="form-input"
                  value={companyFilter}
                  onChange={e => { setCompanyFilter(e.target.value); setSelected(new Set()) }}
                  style={{ minWidth: '140px', maxWidth: '220px' }}
                >
                  <option value="">Tüm Firmalar ({unassigned.length})</option>
                  {companies.map(c => (
                    <option key={c} value={c}>{c} ({unassigned.filter(p => p.company === c).length})</option>
                  ))}
                </select>
              )}
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>
                {selected.size === filtered.length ? 'SEÇİMİ KALDIR' : 'TÜMÜNÜ SEÇ'}
              </button>
            </div>

            {/* Company quick-select chips */}
            {companies.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {companies.map(c => {
                  const count = unassigned.filter(p => p.company === c).length
                  return (
                    <button
                      key={c}
                      className="btn btn-ghost btn-xs"
                      style={{
                        fontSize: '9px', padding: '3px 8px',
                        background: companyFilter === c ? 'var(--accent)' : undefined,
                        color: companyFilter === c ? '#000' : undefined,
                      }}
                      onClick={() => selectCompany(c)}
                    >
                      {c} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Personnel list */}
            <div style={{
              maxHeight: '360px', overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: '7px',
            }}>
              {filtered.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('personnel-id', String(p.id)); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.4' }}
                  onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
                    background: selected.has(p.id) ? 'rgba(245,166,35,.08)' : 'transparent',
                    transition: 'background .1s', cursor: 'grab',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>
                      {p.company || '—'} · {p.phone_number || '—'}
                      {p.check_in_date && (
                        <span style={{ marginLeft: '6px' }}>
                          giriş: {new Date(p.check_in_date).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedRoom && (
                    <button
                      className="btn btn-primary btn-xs"
                      style={{ fontSize: '9px' }}
                      onClick={() => mutSingleAssign.mutate({ personnelId: p.id, roomId: selectedRoom.id })}
                      disabled={mutSingleAssign.isPending}
                    >
                      ODA {selectedRoom.room_no}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '8px' }}>
              {filtered.length} kişi listeleniyor
              {selected.size > 0 && ` · ${selected.size} seçili`}
              {selectedRoom && ` · Hedef: ODA ${selectedRoom.room_no} (${selectedRoom.block})`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CapacityPage() {
  const [searchParams] = useSearchParams()
  const blockParam = searchParams.get('block')

  const initialType = blockParam ? (BLOCK_BY_NAME[blockParam]?.type ?? 'M') : 'M'
  const [blockType, setBlockType] = useState(initialType)
  const [selectedBlock, setSelectedBlock] = useState(blockParam || 'M1')
  const [floor, setFloor] = useState(1)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [roomCompanyFilter, setRoomCompanyFilter] = useState('')
  const [swapSource, setSwapSource] = useState(null)
  const [dragOverRoomId, setDragOverRoomId] = useState(null)
  const [dropMsg, setDropMsg] = useState(null)
  const qc = useQueryClient()

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', selectedBlock, emptyOnly, roomCompanyFilter],
    queryFn: () => {
      let url = `/capacity/rooms?block=${selectedBlock}`
      if (emptyOnly) url += '&empty_only=true'
      if (roomCompanyFilter) url += `&company=${encodeURIComponent(roomCompanyFilter)}`
      return api.get(url).then(r => r.data)
    },
    enabled: !!selectedBlock,
  })

  const { data: companySuggestions = [] } = useQuery({
    queryKey: ['company-suggestions'],
    queryFn: () => api.get('/checkin/company-suggestions').then(r => r.data),
  })

  const blocks = BLOCKS_BY_TYPE[blockType]

  function handleBlockChange(b) { setSelectedBlock(b); setFloor(1); setSelectedRoom(null) }
  function handleBlockTypeChange(t) {
    setBlockType(t)
    const firstBlock = BLOCKS_BY_TYPE[t][0]
    setSelectedBlock(firstBlock)
    setFloor(1)
    setSelectedRoom(null)
  }
  function handleRoomSelect(room) {
    setSelectedRoom(prev => prev?.id === room.id ? null : room)
  }
  const mutDropAssign = useMutation({
    mutationFn: ({ personnelId, roomId }) => api.post('/capacity/reassign', { personnel_id: personnelId, room_id: roomId }),
    onSuccess: () => {
      setDropMsg({ ok: true, msg: 'Personel odaya taşındı.' })
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      qc.invalidateQueries(['unassigned-personnel'])
      setTimeout(() => setDropMsg(null), 3000)
    },
    onError: (e) => {
      setDropMsg({ ok: false, msg: e.response?.data?.error || 'Taşıma başarısız.' })
      setTimeout(() => setDropMsg(null), 4000)
    },
  })

  function handleDropPersonnel(personnelId, roomId) {
    mutDropAssign.mutate({ personnelId, roomId })
  }

  function handleRoomUpdated() {
    qc.invalidateQueries(['rooms', selectedBlock])
    // Re-fetch to update selectedRoom data
    setSelectedRoom(prev => prev ? { ...prev } : null)
  }

  // sync selectedRoom from fresh rooms data
  const currentRoom = selectedRoom
    ? rooms.find(r => r.id === selectedRoom.id) || selectedRoom
    : null

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '4px', color: 'var(--text)' }}>
            KAPASİTE YÖNETİMİ<HelpHint topic="capacity" title="KAPASİTE" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            KORIDOR PLANI · ODA VE YATAK DURUMU · PERSONEL YÖNETİMİ
          </p>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)',
          border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px',
          lineHeight: 1.8,
        }}>
          <div><span style={{ color: 'var(--blue)' }}>■</span> M1/M2/M3 — 30 ODA/KAT · 6 KİŞİLİK · ORTAK WC/BANYO</div>
          <div><span style={{ color: 'var(--purple)' }}>■</span> S1/S3 — 24 ODA/KAT · 6 KİŞİLİK · ÖZEL BANYO</div>
          <div><span style={{ color: 'var(--accent)' }}>■</span> S2 — 24 ODA/KAT · KAT 2: 4 KİŞİLİK, KAT 1: 6 KİŞİLİK · ÖZEL BANYO</div>
          <div><span style={{ color: 'var(--green)' }}>■</span> A/A1-A4/B/C/D/E/F/G/H/J — KAPASİTE PLACEHOLDER · ÖZEL BANYO</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Block type switcher */}
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: '8px',
          padding: '3px', border: '1px solid var(--border)',
        }}>
          {['M', 'S', 'Y'].map(t => (
            <button
              key={t}
              onClick={() => handleBlockTypeChange(t)}
              style={{
                padding: '7px 22px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--display)', fontSize: '15px', fontWeight: 700, letterSpacing: '2px',
                transition: 'all 0.15s',
                background: blockType === t ? 'var(--accent)' : 'transparent',
                color: blockType === t ? '#000' : 'var(--text2)',
              }}
            >
              {t} BLOK
            </button>
          ))}
        </div>

        {/* Block selector */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {blocks.map(b => (
            <button
              key={b}
              onClick={() => handleBlockChange(b)}
              className={`filter-chip${selectedBlock === b ? ' active' : ''}`}
              style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Floor selector — dinamik */}
        {(() => {
          const cfg = BLOCK_BY_NAME[selectedBlock]
          const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
          if (floorList.length <= 1) return null
          return (
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              {floorList.map(f => (
                <button
                  key={f}
                  onClick={() => { setFloor(f); setSelectedRoom(null) }}
                  className={`filter-chip${floor === f ? ' active' : ''}`}
                >
                  KAT {f}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
                    {getFloorLabel(selectedBlock, f)}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => { setEmptyOnly(v => !v); setSelectedRoom(null) }}
          className={`filter-chip${emptyOnly ? ' active' : ''}`}
          style={{ background: emptyOnly ? 'var(--green)' : undefined, borderColor: emptyOnly ? 'var(--green)' : undefined, color: emptyOnly ? '#000' : undefined }}
        >
          {emptyOnly ? '✓ ' : ''}Bos Odalar
        </button>
        <select
          className="form-select"
          value={roomCompanyFilter}
          onChange={e => { setRoomCompanyFilter(e.target.value); setSelectedRoom(null) }}
          style={{ fontSize: '12px', padding: '6px 10px', minWidth: '160px', maxWidth: '260px' }}
        >
          <option value="">Tum Sirketler</option>
          {companySuggestions.map(c => (
            <option key={c.company || c} value={c.company || c}>{c.company || c}</option>
          ))}
        </select>
        {(emptyOnly || roomCompanyFilter) && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => { setEmptyOnly(false); setRoomCompanyFilter(''); setSelectedRoom(null) }}
            style={{ fontSize: '9px' }}
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Plan panel */}
      <div className="panel" style={{ marginBottom: '0' }}>
        <div style={{ height: '2px', background:
          blockType === 'M' ? 'linear-gradient(90deg,var(--blue),var(--purple))' :
          blockType === 'S' ? 'linear-gradient(90deg,var(--purple),var(--teal))' :
                              'linear-gradient(90deg,var(--teal),var(--green))'
        }} />
        <div className="panel-header">
          <div>
            <div className="panel-title" style={{ fontSize: '17px' }}>{selectedBlock} BLOK — KAT {floor}</div>
            <div className="panel-subtitle">
              KORİDOR PLANI · ODA {getFloorLabel(selectedBlock, floor) || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className={`tag tag-${blockType.toLowerCase()}`}>{blockType}</span>
            {selectedBlock === 'S2' && floor === 2 && <span className="tag tag-exc">4K · İSTİSNA</span>}
            {selectedRoom && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', letterSpacing: '1px' }}>
                ODA {selectedRoom.room_no} SEÇİLİ
              </span>
            )}
          </div>
        </div>
        <div className="panel-body">
          <CorridorPlan
            block={selectedBlock}
            floor={floor}
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelect={handleRoomSelect}
            onDropPersonnel={handleDropPersonnel}
            dragOverRoomId={dragOverRoomId}
            onDragOverRoom={setDragOverRoomId}
          />
        </div>
      </div>

      {/* Drop feedback message */}
      {dropMsg && (
        <div className={`alert ${dropMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '12px' }}>
          <span>{dropMsg.ok ? '✓' : '!'}</span><span>{dropMsg.msg}</span>
        </div>
      )}

      {/* Swap mode banner at page level */}
      {swapSource && !currentRoom && (
        <div className="panel fade-up" style={{ marginTop: '18px', padding: '14px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(142,68,230,.1)', border: '1px solid rgba(142,68,230,.4)',
            borderRadius: '7px', padding: '10px 14px',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--purple)', fontWeight: 600 }}>
              TAKAS MODU: {swapSource.name} ({swapSource.roomLabel}) secildi — baska bir oda secip hedef kisiyi secin
            </span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', fontSize: '9px' }} onClick={() => setSwapSource(null)}>
              IPTAL
            </button>
          </div>
        </div>
      )}

      {/* Room detail panel */}
      {currentRoom && (
        <RoomDetailPanel
          key={currentRoom.id}
          room={currentRoom}
          onClose={() => setSelectedRoom(null)}
          onRoomUpdated={handleRoomUpdated}
          swapSource={swapSource}
          onSwapSelect={(person) => setSwapSource(person)}
          onSwapCancel={() => setSwapSource(null)}
        />
      )}

      {/* Unassigned personnel pool */}
      <UnassignedPool
        selectedRoom={currentRoom}
        onAssigned={handleRoomUpdated}
      />
    </div>
  )
}
