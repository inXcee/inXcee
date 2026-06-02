import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'

// ── QuickAdd ───────────────────────────────────────────────────
export default function QuickAdd({ onClose }) {
  const qc = useQueryClient()
  const [roomNo, setRoomNo]             = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [name, setName]                 = useState('')
  const [selected, setSelected]         = useState([])
  const [quickText, setQuickText]       = useState('')
  const [itemCount, setItemCount]       = useState(1)
  const QUICK_TYPES = ['Pantolon','Gömlek','T-Shirt','Çorap','Boxer','Havlu Tkm','Kazak','Şort']

  const { data: rooms = [] } = useQuery({
    queryKey: ['laundry-rooms'],
    queryFn: laundryApi.getRooms,
    staleTime: 60_000,
  })

  const matchedRooms = useMemo(
    () => roomNo.trim() ? rooms.filter(r => r.room_no === roomNo.trim()) : [],
    [rooms, roomNo]
  )

  useEffect(() => {
    if (matchedRooms.length === 1) setSelectedRoom(matchedRooms[0])
    else setSelectedRoom(null)
  }, [matchedRooms])

  const toggle = (type) => setSelected(prev =>
    prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
  )

  const parseQuickInput = (text) => {
    const lower = text.toLowerCase()
    const numMatch = lower.match(/\b(\d+)\b/)
    const count = numMatch ? Math.min(99, Math.max(1, +numMatch[1])) : null
    const types = QUICK_TYPES.filter(t => lower.includes(t.toLowerCase()))
    return { types, count }
  }

  const handleQuickText = (val) => {
    setQuickText(val)
    const { types, count } = parseQuickInput(val)
    if (types.length > 0) setSelected(types)
    if (count !== null) setItemCount(count)
  }

  const canSubmit = !!selectedRoom && name.trim().length > 0

  const resetForm = () => {
    setName(''); setSelected([]); setQuickText(''); setItemCount(1)
  }

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      room_id: selectedRoom.id,
      intake_name: name.trim(),
      item_count: itemCount,
      clothing_items: selected.length > 0
        ? selected.map(t => ({ type: t, color: '', qty: 1 }))
        : undefined,
      urgent: 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); resetForm() },
  })

  const roomStatus = roomNo.trim()
    ? matchedRooms.length === 0
      ? { ok: false, text: '✗ Bulunamadı', color: 'var(--red)' }
      : selectedRoom
        ? { ok: true, text: `✓ ${selectedRoom.block}·${selectedRoom.room_no}`, color: 'var(--green)' }
        : { ok: false, text: `${matchedRooms.length} blok — seç`, color: 'var(--accent)' }
    : null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: '2px solid var(--accent)', borderRadius: 10,
      padding: '14px 16px', marginBottom: 14,
    }}>
      {/* Oda no + blok seçimi + isim */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <input
            className="form-input"
            value={roomNo}
            onChange={e => { setRoomNo(e.target.value); setSelectedRoom(null) }}
            placeholder="Oda No *"
            style={{ width: 80 }}
            autoFocus
          />
          {roomStatus && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: roomStatus.color }}>
              {roomStatus.text}
            </span>
          )}
        </div>

        {/* Çoklu blok eşleşmesi → seçim */}
        {matchedRooms.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignSelf: 'center' }}>
            {matchedRooms.map(r => (
              <button key={r.id} onClick={() => setSelectedRoom(r)} style={{
                padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                background: selectedRoom?.id === r.id ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
                border: `1px solid ${selectedRoom?.id === r.id ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                color: selectedRoom?.id === r.id ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'var(--mono)', fontSize: 10,
              }}>
                {r.block}
              </button>
            ))}
          </div>
        )}

        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ad Soyad (zorunlu)..."
          style={{ flex: '1 1 160px', minWidth: 140 }}
          onKeyDown={e => e.key === 'Enter' && canSubmit && create.mutate()}
        />
      </div>

      {/* ⚡ Hızlı metin */}
      <div style={{ marginBottom: 8 }}>
        <input
          className="form-input"
          value={quickText}
          onChange={e => handleQuickText(e.target.value)}
          placeholder="⚡ Hızlı: gömlek çorap 3  →  tipleri seçer, sayıyı ayarlar"
          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10 }}
        />
      </div>

      {/* Kıyafet tipleri + adet + kaydet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {QUICK_TYPES.map(type => (
            <button key={type} onClick={() => toggle(type)} style={{
              padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
              background: selected.includes(type) ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
              border: `1px solid ${selected.includes(type) ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: selected.includes(type) ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 10,
            }}>
              {CLOTHING_ICONS[type] || ''} {type}
            </button>
          ))}
        </div>

        {/* Adet stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={() => setItemCount(c => Math.max(1, c - 1))}
            style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent)', minWidth: 22, textAlign: 'center' }}>{itemCount}</span>
          <button
            onClick={() => setItemCount(c => Math.min(99, c + 1))}
            style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>parça</span>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          style={{ whiteSpace: 'nowrap' }}
        >
          {create.isPending ? '...' : `+ Kaydet (${itemCount})`}
        </button>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>Kapat</button>
      </div>

      {create.isError && (
        <div className="alert alert-danger" style={{ marginTop: 6, fontSize: 10 }}>
          {create.error?.response?.data?.error || 'Hata oluştu'}
        </div>
      )}
    </div>
  )
}
