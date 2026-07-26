import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'

const card = {
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 10,
}

const smallButton = (color = 'var(--text3)') => ({
  border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)',
  color, cursor: 'pointer', padding: '5px 7px', fontFamily: 'var(--mono)', fontSize: 8,
})

const STATUS_LABELS = {
  active: 'Aktif',
  maintenance: 'Bakım',
  quarantine: 'Karantina',
}

function roomLabel(block, room) {
  return `${block}-${room?.room_no || '?'}`
}

function ActionPreview({ action, rooms, targetRoomId, onTargetRoom, onCancel, onMove, onSwap, busy }) {
  const sourceRoom = rooms.find(room => room.id === action.fromRoomId)
  const availableRooms = rooms.filter(room => (
    room.id !== action.fromRoomId
    && room.status === 'active'
    && (action.type === 'swap' ? room.occupied > 0 : room.occupied < room.active_beds)
  ))
  const targetRoom = rooms.find(room => room.id === targetRoomId)

  return (
    <div style={{ ...card, marginTop: 8, borderColor: action.type === 'swap' ? '#a855f7' : '#38bdf8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <strong style={{ fontSize: 10 }}>
          {action.type === 'swap' ? 'TAKAS HEDEFİ' : 'TAŞIMA HEDEFİ'} · {action.person.full_name}
        </strong>
        <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 9 }}>
          {roomLabel(action.block, sourceRoom)}
        </span>
        <button type="button" onClick={onCancel} style={smallButton()}>İPTAL</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))', gap: 4 }}>
        {availableRooms.map(room => (
          <button
            key={room.id}
            type="button"
            onClick={() => onTargetRoom(room.id)}
            aria-pressed={targetRoomId === room.id}
            aria-label={`${action.type === 'swap' ? 'Takas' : 'Taşıma'} hedef oda ${room.room_no}`}
            style={{
              ...smallButton(targetRoomId === room.id ? '#000' : 'var(--text2)'),
              background: targetRoomId === room.id ? 'var(--accent)' : 'var(--surface)',
              borderColor: targetRoomId === room.id ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <strong style={{ display: 'block', fontSize: 10 }}>{room.room_no}</strong>
            {room.occupied}/{room.active_beds}
          </button>
        ))}
      </div>
      {availableRooms.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 9 }}>Uygun hedef oda bulunamadı.</div>
      )}
      {action.type === 'move' && targetRoom && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onMove(targetRoom)}
          style={{ ...smallButton('#000'), width: '100%', marginTop: 7, background: '#38bdf8', borderColor: '#38bdf8' }}
        >
          {busy ? 'TAŞINIYOR…' : `${targetRoom.room_no} ODASINA TAŞI`}
        </button>
      )}
      {action.type === 'swap' && targetRoom && (
        <div style={{ marginTop: 7 }}>
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginBottom: 4 }}>
            TAKAS EDİLECEK KİŞİ
          </div>
          {(targetRoom.occupants || []).map(person => (
            <button
              key={person.personnel_id}
              type="button"
              disabled={busy}
              onClick={() => onSwap(targetRoom, person)}
              style={{ ...smallButton('#a855f7'), width: '100%', display: 'flex', marginBottom: 4 }}
            >
              <span>{person.full_name}</span>
              <span style={{ marginLeft: 'auto' }}>YATAK {person.bed_no || '—'} ↔</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BlockRoomManager({
  block,
  rooms = [],
  selectedRoomId,
  onRoomChange,
  onNavigate,
  canEditRoom = false,
  onDataChanged,
}) {
  const queryClient = useQueryClient()
  const addToast = useToastStore(state => state.addToast)
  const [floor, setFloor] = useState('all')
  const [status, setStatus] = useState('all')
  const [roomSearch, setRoomSearch] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [personAction, setPersonAction] = useState(null)
  const [targetRoomId, setTargetRoomId] = useState(null)
  const [busy, setBusy] = useState(null)
  const [undo, setUndo] = useState(null)

  const selected = rooms.find(room => room.id === selectedRoomId) || null
  const floors = useMemo(() => [...new Set(rooms.map(room => room.floor))].sort((a, b) => a - b), [rooms])
  const filteredRooms = useMemo(() => {
    const needle = roomSearch.trim().toLocaleLowerCase('tr-TR')
    return rooms.filter(room => (
      (floor === 'all' || String(room.floor) === floor)
      && (status === 'all' || room.status === status)
      && (!needle || `${room.room_no} ${(room.occupants || []).map(person => person.full_name).join(' ')}`
        .toLocaleLowerCase('tr-TR').includes(needle))
    ))
  }, [floor, roomSearch, rooms, status])

  const { data: assignResults = [], isFetching: searching } = useQuery({
    queryKey: ['campus-room-person-search', assignSearch],
    queryFn: () => api.get(`/capacity/personnel/search?q=${encodeURIComponent(assignSearch.trim())}`).then(response => response.data),
    enabled: Boolean(selected) && assignSearch.trim().length >= 2,
    staleTime: 10_000,
  })

  useEffect(() => {
    setNoteDraft(selected?.notes || '')
    setAssignSearch('')
    setPersonAction(null)
    setTargetRoomId(null)
  }, [selected?.id, selected?.notes])

  useEffect(() => {
    if (!undo) return undefined
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [undo])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campus-block-workspace', block] }),
      queryClient.invalidateQueries({ queryKey: ['campus-map-operations'] }),
      queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['capacity-rooms-all'] }),
    ])
    await onDataChanged?.()
  }

  function offerUndo(label, run) {
    setUndo({ label, run, expiresAt: Date.now() + 30_000 })
  }

  async function execute(key, operation, successMessage) {
    setBusy(key)
    try {
      await operation()
      addToast(successMessage, 'success')
      await refresh()
      return true
    } catch (error) {
      addToast(error?.response?.data?.error || 'İşlem tamamlanamadı', 'error')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function undoLast() {
    if (!undo || undo.expiresAt <= Date.now()) return
    const current = undo
    setUndo(null)
    await execute('undo', current.run, `${current.label} geri alındı`)
  }

  async function updateBeds(nextValue) {
    if (!selected || nextValue === selected.active_beds) return
    const previous = selected.active_beds
    const ok = await execute(
      'beds',
      () => api.patch(`/capacity/rooms/${selected.id}/beds`, { active_beds: nextValue }),
      `Oda ${selected.room_no} aktif yatak sayısı güncellendi`,
    )
    if (ok) offerUndo(
      `Oda ${selected.room_no} yatak değişikliği`,
      () => api.patch(`/capacity/rooms/${selected.id}/beds`, { active_beds: previous }),
    )
  }

  async function saveNotes() {
    if (!selected || noteDraft === (selected.notes || '')) return
    const previous = selected.notes || ''
    const next = noteDraft.trim()
    const ok = await execute(
      'notes',
      () => api.patch(`/capacity/rooms/${selected.id}/notes`, { notes: next || null }),
      `Oda ${selected.room_no} notu kaydedildi`,
    )
    if (ok) offerUndo(
      `Oda ${selected.room_no} notu`,
      () => api.patch(`/capacity/rooms/${selected.id}/notes`, { notes: previous || null }),
    )
  }

  async function updateStatus(nextStatus) {
    if (!selected || selected.status === nextStatus) return
    const occupants = [...(selected.occupants || [])]
    const destructive = nextStatus !== 'active' && occupants.length > 0
    const confirmed = await confirmDialog({
      title: 'Oda Durumu Etki Önizlemesi',
      body: destructive
        ? `${roomLabel(block, selected)} ${STATUS_LABELS[nextStatus]} yapılacak ve ${occupants.length} kişi odadan çıkarılacak. Bu kişiler aktif personel olarak kalır.`
        : `${roomLabel(block, selected)} durumu ${STATUS_LABELS[selected.status]} → ${STATUS_LABELS[nextStatus]} olarak değişecek.`,
      confirmLabel: 'Durumu değiştir',
      danger: destructive || nextStatus === 'quarantine',
    })
    if (!confirmed) return
    const previous = selected.status
    const ok = await execute(
      'status',
      () => api.patch(`/capacity/rooms/${selected.id}/status`, { status: nextStatus }),
      `Oda ${selected.room_no} ${STATUS_LABELS[nextStatus]} yapıldı`,
    )
    if (ok) offerUndo(`Oda ${selected.room_no} durum değişikliği`, async () => {
      await api.patch(`/capacity/rooms/${selected.id}/status`, { status: previous })
      if (previous === 'active' && occupants.length) {
        await api.post('/capacity/bulk/assign', {
          personnel_ids: occupants.map(person => person.personnel_id),
          room_id: selected.id,
        })
      }
    })
  }

  async function assignPerson(person) {
    if (!selected || person.room_id === selected.id) return
    const from = person.room_id ? `${person.block}-${person.room_no}` : 'atanmamış havuz'
    const confirmed = await confirmDialog({
      title: 'Yerleşim Etki Önizlemesi',
      body: `${person.full_name}: ${from} → ${roomLabel(block, selected)}. Oda doluluk durumu ${selected.occupied}/${selected.active_beds}.`,
      confirmLabel: person.room_id ? 'Taşı' : 'Yerleştir',
    })
    if (!confirmed) return
    const sourceRoomId = person.room_id || null
    const ok = await execute(
      `assign-${person.id}`,
      () => api.post('/capacity/reassign', { personnel_id: person.id, room_id: selected.id }),
      `${person.full_name} ${roomLabel(block, selected)} odasına yerleştirildi`,
    )
    if (!ok) return
    setAssignSearch('')
    offerUndo(`${person.full_name} yerleşimi`, () => (
      sourceRoomId
        ? api.post('/capacity/reassign', { personnel_id: person.id, room_id: sourceRoomId })
        : api.post('/capacity/remove-from-room', { personnel_id: person.id })
    ))
  }

  async function removePerson(person) {
    if (!selected) return
    const confirmed = await confirmDialog({
      title: 'Odadan Çıkarma Önizlemesi',
      body: `${person.full_name}, ${roomLabel(block, selected)} odasından çıkarılacak. Personelin kampüs kaydı kapanmayacak ve atanmış oda havuzuna alınacak.`,
      confirmLabel: 'Odadan çıkar',
      danger: true,
    })
    if (!confirmed) return
    const ok = await execute(
      `remove-${person.personnel_id}`,
      () => api.post('/capacity/remove-from-room', { personnel_id: person.personnel_id }),
      `${person.full_name} odadan çıkarıldı`,
    )
    if (ok) offerUndo(
      `${person.full_name} oda çıkarma işlemi`,
      () => api.post('/capacity/reassign', { personnel_id: person.personnel_id, room_id: selected.id }),
    )
  }

  async function movePerson(targetRoom) {
    if (!personAction) return
    const person = personAction.person
    const confirmed = await confirmDialog({
      title: 'Kişi Taşıma Önizlemesi',
      body: `${person.full_name}: ${personAction.fromLabel} → ${roomLabel(block, targetRoom)}. Hedef doluluk ${targetRoom.occupied}/${targetRoom.active_beds}.`,
      confirmLabel: 'Taşı',
    })
    if (!confirmed) return
    const ok = await execute(
      `move-${person.personnel_id}`,
      () => api.post('/capacity/reassign', { personnel_id: person.personnel_id, room_id: targetRoom.id }),
      `${person.full_name} ${targetRoom.room_no} odasına taşındı`,
    )
    if (!ok) return
    const sourceRoomId = personAction.fromRoomId
    setPersonAction(null)
    setTargetRoomId(null)
    onRoomChange(targetRoom.id)
    offerUndo(
      `${person.full_name} taşıma işlemi`,
      () => api.post('/capacity/reassign', { personnel_id: person.personnel_id, room_id: sourceRoomId }),
    )
  }

  async function swapPeople(targetRoom, targetPerson) {
    if (!personAction) return
    const source = personAction.person
    const confirmed = await confirmDialog({
      title: 'Kişi Takası Önizlemesi',
      body: `${source.full_name} (${personAction.fromLabel}) ↔ ${targetPerson.full_name} (${roomLabel(block, targetRoom)}).`,
      confirmLabel: 'Takası yap',
    })
    if (!confirmed) return
    const ok = await execute(
      `swap-${source.personnel_id}`,
      () => api.post('/capacity/swap', {
        person_a_id: source.personnel_id,
        person_b_id: targetPerson.personnel_id,
      }),
      `${source.full_name} ve ${targetPerson.full_name} takas edildi`,
    )
    if (!ok) return
    setPersonAction(null)
    setTargetRoomId(null)
    offerUndo(
      `${source.full_name} takası`,
      () => api.post('/capacity/swap', {
        person_a_id: source.personnel_id,
        person_b_id: targetPerson.personnel_id,
      }),
    )
  }

  return (
    <div>
      {undo && (
        <div role="status" style={{
          ...card, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8,
          borderColor: '#16a34a', background: 'rgba(22,163,74,.09)',
        }}>
          <span style={{ flex: 1, fontSize: 9 }}>{undo.label} tamamlandı.</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>30 sn içinde</span>
          <button type="button" onClick={undoLast} disabled={busy === 'undo'} style={smallButton('#16a34a')}>
            ↩ GERİ AL
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
        <input
          value={roomSearch}
          onChange={event => setRoomSearch(event.target.value)}
          aria-label="Oda veya kişi filtrele"
          placeholder="Oda veya kişi filtrele…"
          style={{
            minWidth: 150, flex: 1, padding: '6px 8px', border: '1px solid var(--border)',
            borderRadius: 5, background: 'var(--surface2)', color: 'var(--text)', fontSize: 10,
          }}
        />
        <select value={floor} onChange={event => setFloor(event.target.value)} aria-label="Kat filtresi" style={smallButton('var(--text2)')}>
          <option value="all">Tüm katlar</option>
          {floors.map(value => <option key={value} value={value}>Kat {value}</option>)}
        </select>
        <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Oda durumu filtresi" style={smallButton('var(--text2)')}>
          <option value="all">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="maintenance">Bakım</option>
          <option value="quarantine">Karantina</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(96px, .68fr) minmax(0, 1.32fr)' : '1fr', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 5, alignContent: 'start' }}>
          {filteredRooms.map(room => (
            <button
              key={room.id}
              type="button"
              onClick={() => onRoomChange(room.id === selectedRoomId ? null : room.id)}
              aria-pressed={room.id === selectedRoomId}
              aria-label={`Oda ${room.room_no}, ${room.occupied}/${room.active_beds} kişi, ${STATUS_LABELS[room.status]}`}
              style={{
                padding: '7px 4px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${room.id === selectedRoomId ? 'var(--accent)' : 'var(--border)'}`,
                background: room.id === selectedRoomId ? 'rgba(245,158,11,.13)' : 'var(--surface2)',
                color: room.status !== 'active' ? '#a855f7' : 'var(--text)',
                fontFamily: 'var(--mono)', fontSize: 9,
              }}
            >
              <strong style={{ display: 'block', fontSize: 11 }}>{room.room_no}</strong>
              {room.occupied}/{room.active_beds}
              {room.status !== 'active' && <span style={{ display: 'block', fontSize: 7 }}>{STATUS_LABELS[room.status]}</span>}
            </button>
          ))}
          {filteredRooms.length === 0 && <div style={{ ...card, gridColumn: '1 / -1', color: 'var(--text3)', fontSize: 9 }}>Filtreye uygun oda yok.</div>}
        </div>

        {selected && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 7 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>ODA {selected.room_no}</strong>
              <span style={{ color: 'var(--text3)', fontSize: 8 }}>KAT {selected.floor}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: selected.status === 'active' ? '#16a34a' : '#a855f7' }}>
                {STATUS_LABELS[selected.status].toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 7 }}>
              {[
                ['DOLU', selected.occupied],
                ['AKTİF YATAK', selected.active_beds],
                ['BOŞ', Math.max(0, selected.active_beds - selected.occupied)],
              ].map(([label, value]) => (
                <div key={label} style={{ ...card, padding: 6 }}>
                  <span style={{ display: 'block', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 7 }}>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            {canEditRoom && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                  {Object.keys(STATUS_LABELS).map(value => (
                    <button
                      key={value}
                      type="button"
                      disabled={busy === 'status' || selected.status === value}
                      onClick={() => updateStatus(value)}
                      style={{
                        ...smallButton(selected.status === value ? '#000' : 'var(--text2)'),
                        flex: 1, background: selected.status === value ? 'var(--accent)' : 'var(--surface)',
                      }}
                    >{STATUS_LABELS[value].toUpperCase()}</button>
                  ))}
                </div>
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 7, padding: 7, marginBottom: 7 }}>
                  <span style={{ flex: 1, fontSize: 9 }}>Aktif yatak · en fazla {selected.capacity || selected.active_beds}</span>
                  <button
                    type="button"
                    aria-label="Aktif yatağı azalt"
                    disabled={busy === 'beds' || selected.active_beds <= selected.occupied}
                    onClick={() => updateBeds(selected.active_beds - 1)}
                    style={smallButton()}
                  >−</button>
                  <strong>{selected.active_beds}</strong>
                  <button
                    type="button"
                    aria-label="Aktif yatağı artır"
                    disabled={busy === 'beds' || selected.active_beds >= (selected.capacity || selected.active_beds)}
                    onClick={() => updateBeds(selected.active_beds + 1)}
                    style={smallButton()}
                  >＋</button>
                </div>
              </>
            )}

            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 4 }}>KİŞİLER</div>
            {selected.occupants?.length ? selected.occupants.map(person => (
              <div key={person.personnel_id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', borderTop: '1px solid var(--border)', padding: '6px 0' }}>
                <button
                  type="button"
                  onClick={() => onNavigate(`/personnel/${person.personnel_id}`)}
                  style={{ flex: '1 1 125px', minWidth: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <strong style={{ display: 'block', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.full_name}</strong>
                  <span style={{ fontSize: 8, color: 'var(--text3)' }}>{person.company || 'Şirket yok'} · Yatak {person.bed_no || '—'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPersonAction({
                      type: 'move', person, block, fromRoomId: selected.id,
                      fromLabel: roomLabel(block, selected),
                    })
                    setTargetRoomId(null)
                  }}
                  style={smallButton('#38bdf8')}
                >TAŞI</button>
                <button
                  type="button"
                  onClick={() => {
                    setPersonAction({
                      type: 'swap', person, block, fromRoomId: selected.id,
                      fromLabel: roomLabel(block, selected),
                    })
                    setTargetRoomId(null)
                  }}
                  style={smallButton('#a855f7')}
                >TAKAS</button>
                <button type="button" onClick={() => removePerson(person)} style={smallButton('#dc2626')}>ÇIKAR</button>
              </div>
            )) : <div style={{ color: 'var(--text3)', fontSize: 9, marginBottom: 7 }}>Bu oda boş.</div>}

            {personAction && (
              <ActionPreview
                action={personAction}
                rooms={rooms}
                targetRoomId={targetRoomId}
                onTargetRoom={setTargetRoomId}
                onCancel={() => { setPersonAction(null); setTargetRoomId(null) }}
                onMove={movePerson}
                onSwap={swapPeople}
                busy={Boolean(busy)}
              />
            )}

            {selected.status === 'active' && selected.occupied < selected.active_beds && (
              <div style={{ marginTop: 8 }}>
                <input
                  type="search"
                  value={assignSearch}
                  onChange={event => setAssignSearch(event.target.value)}
                  aria-label="Odaya yerleştirilecek kişiyi ara"
                  placeholder="Kişi ara ve bu odaya yerleştir…"
                  style={{
                    width: '100%', padding: '6px 8px', border: '1px solid var(--border)',
                    borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', fontSize: 9,
                  }}
                />
                {assignSearch.trim().length >= 2 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 5, marginTop: 4, maxHeight: 145, overflowY: 'auto' }}>
                    {searching ? (
                      <div style={{ padding: 7, color: 'var(--text3)', fontSize: 9 }}>Aranıyor…</div>
                    ) : assignResults.length ? assignResults.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        disabled={person.room_id === selected.id || busy === `assign-${person.id}`}
                        onClick={() => assignPerson(person)}
                        style={{
                          display: 'flex', width: '100%', padding: '6px 7px', border: 0,
                          borderBottom: '1px solid var(--border)', background: 'var(--surface2)',
                          color: 'var(--text)', cursor: person.room_id === selected.id ? 'default' : 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 9 }}>{person.full_name}</span>
                        <span style={{ color: 'var(--text3)', fontSize: 8 }}>
                          {person.room_id === selected.id ? 'BU ODADA' : person.block ? `${person.block}-${person.room_no}` : 'ATANMAMIŞ'}
                        </span>
                      </button>
                    )) : <div style={{ padding: 7, color: 'var(--text3)', fontSize: 9 }}>Kişi bulunamadı.</div>}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <textarea
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                aria-label="Oda notu"
                placeholder="Oda notu…"
                rows={2}
                style={{
                  width: '100%', resize: 'vertical', padding: 6, boxSizing: 'border-box',
                  border: '1px solid var(--border)', borderRadius: 5,
                  background: 'var(--surface)', color: 'var(--text)', fontSize: 9,
                }}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy === 'notes' || noteDraft === (selected.notes || '')}
                  onClick={saveNotes}
                  style={{ ...smallButton('#16a34a'), flex: 1 }}
                >NOTU KAYDET</button>
                <button type="button" onClick={() => onNavigate(`/checkin?block=${block}&room=${selected.id}`)} style={smallButton('#16a34a')}>CHECK-IN</button>
                <button type="button" onClick={() => onNavigate(`/bulk-actions?block=${block}&room=${selected.id}`)} style={smallButton('#a855f7')}>TOPLU</button>
                <button type="button" onClick={() => onNavigate(`/capacity?block=${block}&room=${selected.id}`)} style={smallButton('#38bdf8')}>TAM DETAY</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
