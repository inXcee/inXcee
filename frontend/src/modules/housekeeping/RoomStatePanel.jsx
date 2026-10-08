// Oda kullanım durumu: açık / kapalı / kilitli + oturanın vardiyası (gündüzcü / gececi / karışık).
// Kapalı odaya temizlik görevi açılmaz, kilitli oda "Oda kilitli" diye atlanır, gececi odası 19:00'a planlanır.
// Aynı alanlar Telegram'dan (/oda) da değişir — kaynak backend PATCH /housekeeping/rooms/:id/state.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STATES = [
  { value: 'open', label: 'Açık', icon: '✓', color: 'var(--green)' },
  { value: 'locked', label: 'Kilitli', icon: '🔒', color: '#a855f7' },
  { value: 'closed', label: 'Kapalı', icon: '⛔', color: 'var(--text3)' },
]
const SHIFTS = [
  { value: 'day', label: '☀ Gündüzcü' },
  { value: 'night', label: '☾ Gececi' },
  { value: 'mixed', label: '◐ Karışık' },
  { value: null, label: '— Bilinmiyor' },
]

export default function RoomStatePanel({ room, block, roomNo, onChanged }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(room.state_note || '')
  const [until, setUntil] = useState(room.state_until || '')
  const state = room.use_state || 'open'

  const mut = useMutation({
    mutationFn: (body) => api.patch(`/housekeeping/rooms/${room.id}/state`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hk-room-details', block, roomNo] })
      qc.invalidateQueries({ queryKey: ['capacity-rooms', block] })
      qc.invalidateQueries({ queryKey: ['cleaning-tasks'] })
      qc.invalidateQueries({ queryKey: ['dnd-rooms'] })
      onChanged?.()
    },
  })

  const setState = (value) => mut.mutate(value === 'open'
    ? { use_state: 'open' }
    : { use_state: value, state_note: note || null, state_until: until || null })

  const chip = (active, color) => ({
    fontFamily: 'var(--mono)', fontSize: '10px', padding: '6px 9px', borderRadius: '6px', cursor: 'pointer',
    border: `1px solid ${active ? color : 'var(--border)'}`, background: active ? 'var(--surface3)' : 'var(--surface2)',
    color: active ? color : 'var(--text3)', fontWeight: active ? 700 : 400, opacity: mut.isPending ? 0.6 : 1,
  })

  return (
    <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '7px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px' }}>ODA DURUMU</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {STATES.map(s => (
          <button key={s.value} type="button" disabled={mut.isPending} style={chip(state === s.value, s.color)}
            onClick={() => state !== s.value && setState(s.value)}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>
      {state === 'open' ? (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Kapatma/kilit notu (isteğe bağlı)"
            maxLength={500} style={{ flex: '1 1 160px', fontSize: '11px' }} />
          <input type="date" value={until} onChange={e => setUntil(e.target.value)} title="Bu tarihten sonra kendiliğinden açılır"
            style={{ fontSize: '11px' }} />
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '8px' }}>
          {state === 'closed' ? 'Temizlik görevi açılmaz.' : 'Görev "Oda kilitli" diye atlanır.'}
          {room.state_note && <> · {room.state_note}</>}
          {room.state_until && <> · {room.state_until} sonrası kendiliğinden açılır</>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {SHIFTS.map(s => (
          <button key={String(s.value)} type="button" disabled={mut.isPending}
            style={chip((room.occupant_shift ?? null) === s.value, 'var(--accent)')}
            onClick={() => (room.occupant_shift ?? null) !== s.value && mut.mutate({ occupant_shift: s.value })}>
            {s.label}
          </button>
        ))}
      </div>
      {room.occupant_shift === 'night' && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '6px' }}>
          Gececi 07–19 uyur: görev 19:00'a planlanır, DND listesinde görünür.
        </div>
      )}
      {mut.isError && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', marginTop: '6px' }}>
          {mut.error?.response?.data?.error || 'Kaydedilemedi'}
        </div>
      )}
    </div>
  )
}
