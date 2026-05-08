import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos as expectedRoomNosFromConfig } from '../../shared/blocks.js'

const PRIORITIES = [
  { key: 'high', label: 'ACİL', color: 'var(--red)' },
  { key: 'medium', label: 'NORMAL', color: 'var(--amber)' },
  { key: 'low', label: 'DÜŞÜK', color: 'var(--blue)' },
]

const SPECIALTIES = {
  elektrik: 'Elektrik',
  tesisat: 'Tesisat',
  genel: 'Genel',
  klima: 'Klima',
  boya: 'Boya',
}

const SHIFTS = {
  '1': { label: '1. Vardiya', hours: '08:00–17:00', color: 'var(--amber)' },
  '2': { label: '2. Vardiya', hours: '15:00–00:00', color: 'var(--blue)' },
  '3': { label: '3. Vardiya', hours: '00:00–08:00', color: 'var(--purple)' },
}

const STATUSES = [
  { key: 'open', label: 'AÇIK', color: 'var(--red)', dotColor: '#e74c3c' },
  { key: 'in_progress', label: 'DEVAM EDİYOR', color: 'var(--amber)', dotColor: '#f0a500' },
  { key: 'done', label: 'TAMAMLANDI', color: 'var(--green)', dotColor: '#27c96a' },
]

function statusInfo(s) { return STATUSES.find(x => x.key === s) || STATUSES[0] }

const WAIT_REASONS = [
  'Yetkili servis çağrıldı',
  'Odada kişi var, gündüz bakılacak',
  'Malzeme bekleniyor',
  'Parça siparişte',
]

const BLOCK_TYPES = ['M', 'S', 'Y']

function priInfo(p) { return PRIORITIES.find(x => x.key === p) || PRIORITIES[1] }

function getCurrentShift() {
  const h = new Date().getHours()
  if (h >= 8 && h < 15) return '1'
  if (h >= 15 && h < 24) return '2'
  return '3'
}

/* ═══════════════════════════════════════════════════════════════════════════
   SLA Countdown
   ═══════════════════════════════════════════════════════════════════════════ */
function SLACountdown({ deadline }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!deadline) return null

  const deadlineMs = new Date(deadline).getTime()
  const diff = deadlineMs - now
  const isOverdue = diff <= 0
  const absDiff = Math.abs(diff)

  const hours = Math.floor(absDiff / 3600000)
  const minutes = Math.floor((absDiff % 3600000) / 60000)
  const seconds = Math.floor((absDiff % 60000) / 1000)
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  let color = 'var(--text2)'
  if (isOverdue) color = 'var(--red)'
  else if (diff <= 3600000) color = 'var(--red)'
  else if (diff <= 14400000) color = 'var(--amber)'

  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '4px',
      color,
      background: isOverdue ? 'rgba(231,76,60,.12)' : diff <= 3600000 ? 'rgba(231,76,60,.08)' : diff <= 14400000 ? 'rgba(240,165,0,.08)' : 'rgba(148,163,184,.08)',
      border: isOverdue ? '1px solid rgba(231,76,60,.3)' : diff <= 3600000 ? '1px solid rgba(231,76,60,.2)' : diff <= 14400000 ? '1px solid rgba(240,165,0,.2)' : '1px solid var(--border)',
      animation: isOverdue ? 'sla-pulse 1.5s ease-in-out infinite' : 'none',
      display: 'inline-flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px',
    }}>
      {isOverdue ? `SLA AŞILDI +${formatted}` : formatted}
    </span>
  )
}

/* inject SLA pulse keyframes once */
if (typeof document !== 'undefined' && !document.getElementById('sla-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'sla-pulse-style'
  style.textContent = `@keyframes sla-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`
  document.head.appendChild(style)
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status Timeline
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusTimeline({ status }) {
  const currentIdx = STATUSES.findIndex(s => s.key === status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      {STATUSES.map((s, i) => {
        const isActive = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{
              width: isCurrent ? '10px' : '7px',
              height: isCurrent ? '10px' : '7px',
              borderRadius: '50%',
              background: isActive ? s.dotColor : 'var(--border2)',
              boxShadow: isCurrent ? `0 0 6px ${s.dotColor}` : 'none',
              transition: 'all .2s',
            }} title={s.label} />
            {i < STATUSES.length - 1 && (
              <div style={{
                width: '12px', height: '2px',
                background: i < currentIdx ? STATUSES[i + 1].dotColor : 'var(--border2)',
                borderRadius: '1px',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status Action Buttons
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusActions({ request, onSuccess }) {
  const qc = useQueryClient()

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
    qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    qc.invalidateQueries({ queryKey: ['maintenance-detail', request.id] })
    if (onSuccess) onSuccess()
  }

  const statusMut = useMutation({
    mutationFn: (status) => api.patch(`/maintenance/requests/${request.id}/status`, { status }),
    onSuccess: inv,
  })

  if (request.status === 'open') {
    return (
      <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); statusMut.mutate('in_progress') }}
        disabled={statusMut.isPending}
        style={{ background: 'var(--amber)', borderColor: 'var(--amber)', fontSize: '9px', letterSpacing: '1px' }}>
        {statusMut.isPending ? '...' : 'BAŞLA'}
      </button>
    )
  }

  if (request.status === 'in_progress') {
    return (
      <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); statusMut.mutate('done') }}
        disabled={statusMut.isPending}
        style={{ background: 'var(--green)', borderColor: 'var(--green)', fontSize: '9px', letterSpacing: '1px' }}>
        {statusMut.isPending ? '...' : 'TAMAMLA'}
      </button>
    )
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   Kanban View
   ═══════════════════════════════════════════════════════════════════════════ */
function KanbanView({ requests, onSelect }) {
  const qc = useQueryClient()
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/maintenance/requests/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    },
  })

  const handleDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.currentTarget.style.opacity = '0.4'
  }

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
    setDragId(null)
    setDragOver(null)
  }

  const handleDragOver = (e, statusKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(statusKey)
  }

  const handleDrop = (e, targetStatus) => {
    e.preventDefault()
    setDragOver(null)
    if (!dragId) return
    const req = requests.find(r => r.id === dragId)
    if (req && req.status !== targetStatus) {
      statusMut.mutate({ id: dragId, status: targetStatus })
    }
    setDragId(null)
  }

  return (
    <div style={{
      display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px',
    }}>
      {STATUSES.map(st => {
        const items = requests.filter(r => r.status === st.key)
        const isOver = dragOver === st.key
        return (
          <div key={st.key}
            onDragOver={e => handleDragOver(e, st.key)}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, st.key)}
            style={{
              flex: '1 0 200px', minWidth: '200px', maxWidth: '320px',
              background: isOver ? `color-mix(in srgb, ${st.dotColor} 8%, var(--surface2))` : 'var(--surface2)',
              border: isOver ? `2px dashed ${st.dotColor}` : '1px solid var(--border)',
              borderRadius: '10px',
              display: 'flex', flexDirection: 'column',
              transition: 'all .2s',
            }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.dotColor }} />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px',
                color: st.color, fontWeight: 700,
              }}>{st.label}</span>
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px',
                color: 'var(--text4)',
              }}>{items.length}</span>
            </div>
            <div style={{
              padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px',
              flex: 1, overflowY: 'auto', maxHeight: '60vh',
              minHeight: '80px',
            }}>
              {items.length === 0 && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)',
                  padding: '20px 0', textAlign: 'center',
                  border: isOver ? 'none' : '2px dashed var(--border2)',
                  borderRadius: '8px', margin: '4px',
                }}>
                  {isOver ? 'Buraya bırak' : 'Kayıt yok'}
                </div>
              )}
              {items.map(req => {
                const pri = priInfo(req.priority)
                return (
                  <div key={req.id}
                    draggable
                    onDragStart={e => handleDragStart(e, req.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(req.id)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px', cursor: 'grab',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${pri.color}`,
                      transition: 'all .15s',
                      userSelect: 'none',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        {req.location}
                      </span>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: '8px', padding: '1px 6px', borderRadius: '3px',
                        color: pri.color,
                        background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
                      }}>{pri.label}</span>
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text2)', marginBottom: '4px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{req.description}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>#{req.id}</span>
                      {req.wait_reason && (
                        <span style={{
                          padding: '1px 5px', borderRadius: '3px',
                          background: 'rgba(240,165,0,.1)', border: '1px solid rgba(240,165,0,.2)',
                          color: 'var(--amber)',
                        }}>{req.wait_reason}</span>
                      )}
                      {req.sla_deadline && req.status !== 'done' && (
                        <SLACountdown deadline={req.sla_deadline} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Photo Capture
   ═══════════════════════════════════════════════════════════════════════════ */
function PhotoCapture({ value, onChange, label = 'Fotoğraf' }) {
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const [preview, setPreview] = useState(null)

  const handleFile = (file) => {
    if (!file) return
    onChange(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const clear = () => { onChange(null); setPreview(null) }

  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      {preview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img loading="lazy" src={preview} alt="" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', border: '1px solid var(--border)', objectFit: 'cover' }} />
          <button onClick={clear} style={{
            position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', borderRadius: '50%',
            background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => cameraRef.current?.click()} style={{
            flex: 1, padding: '14px 10px', borderRadius: '8px', cursor: 'pointer',
            border: '2px dashed var(--border)', background: 'rgba(15,23,42,.3)',
            color: 'var(--text2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ fontSize: '20px' }}>📷</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>KAMERA</span>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            flex: 1, padding: '14px 10px', borderRadius: '8px', cursor: 'pointer',
            border: '2px dashed var(--border)', background: 'rgba(15,23,42,.3)',
            color: 'var(--text2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ fontSize: '20px' }}>📁</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>DOSYA</span>
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Location Picker
   ═══════════════════════════════════════════════════════════════════════════ */
function LocationPicker({ value, onChange }) {
  // Match herhangi bir blok adi (M1-M3, S1-S3, A, A1-A4, B, C, D, E, F, G, H, J)
  const match = value.match(/^([A-Z][0-9]?)\s+Kat\s*(\d)\s+Oda\s*(\d+)$/i)
  const initialBlock = match ? match[1].toUpperCase() : null
  const initialType = initialBlock ? (BLOCK_BY_NAME[initialBlock]?.type ?? 'M') : 'M'
  const [pickedType, setPickedType] = useState(initialType)
  const [pickedBlock, setPickedBlock] = useState(initialBlock)
  const [pickedFloor, setPickedFloor] = useState(match ? +match[2] : null)

  const pickType = t => { setPickedType(t); setPickedBlock(null); setPickedFloor(null); onChange('') }
  const pickBlock = b => { setPickedBlock(b); setPickedFloor(null); onChange('') }
  const pickFloor = f => { setPickedFloor(f); onChange('') }
  const pickRoom = rno => onChange(`${pickedBlock} Kat ${pickedFloor} Oda ${rno}`)

  const cfg = pickedBlock ? BLOCK_BY_NAME[pickedBlock] : null
  const floorList = cfg ? Array.from({ length: cfg.floors }, (_, i) => i + 1) : []
  const roomNos = pickedBlock && pickedFloor
    ? expectedRoomNosFromConfig(pickedBlock, pickedFloor).map(n => String(n))
    : []
  const selRoom = match ? match[3] : null

  return (
    <div>
      <label className="form-label">Konum</label>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
        {BLOCK_TYPES.map(t => (
          <button key={t} type="button" onClick={() => pickType(t)} style={{
            padding: '5px 14px', borderRadius: '5px', cursor: 'pointer',
            border: pickedType === t ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: pickedType === t ? 'rgba(99,102,241,.12)' : 'transparent',
            color: pickedType === t ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--display)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
          }}>{t} BLOK</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {BLOCKS_BY_TYPE[pickedType].map(b => (
          <button key={b} type="button" onClick={() => pickBlock(b)} style={{
            padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
            border: pickedBlock === b ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: pickedBlock === b ? 'rgba(99,102,241,.12)' : 'transparent',
            color: pickedBlock === b ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--display)', fontSize: '13px', fontWeight: 600, letterSpacing: '1px',
          }}>{b}</button>
        ))}
      </div>
      {pickedBlock && floorList.length > 0 && (
        <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
          {floorList.map(f => (
            <button key={f} type="button" onClick={() => pickFloor(f)} style={{
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer',
              border: pickedFloor === f ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: pickedFloor === f ? 'rgba(99,102,241,.12)' : 'transparent',
              color: pickedFloor === f ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>KAT {f}</button>
          ))}
        </div>
      )}
      {pickedBlock && pickedFloor && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '10px',
          background: 'rgba(15,23,42,.3)', borderRadius: '8px', border: '1px solid var(--border)',
          maxHeight: '180px', overflowY: 'auto',
        }}>
          {roomNos.map(rno => (
            <button key={rno} type="button" onClick={() => pickRoom(rno)} style={{
              width: '48px', height: '34px', borderRadius: '5px', cursor: 'pointer',
              border: selRoom === rno ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: selRoom === rno ? 'rgba(99,102,241,.15)' : 'transparent',
              color: selRoom === rno ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>{rno}</button>
          ))}
        </div>
      )}
      {value && (
        <div style={{
          marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)',
          fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{value}</span>
          <button type="button" onClick={() => { onChange(''); setPickedBlock(null); setPickedFloor(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '12px' }}>✕</button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Available Technicians Panel
   ═══════════════════════════════════════════════════════════════════════════ */
function AvailableTechnicians() {
  const { data: allTechs = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api.get('/maintenance/technicians').then(r => r.data),
    refetchInterval: 60000,
  })

  const currentShift = getCurrentShift()

  // Group by shift, current shift first
  const shiftOrder = [currentShift, ...['1', '2', '3'].filter(s => s !== currentShift)]
  const grouped = shiftOrder.map(s => ({
    shift: s,
    info: SHIFTS[s],
    techs: allTechs.filter(t => t.shift === s),
    isCurrent: s === currentShift,
  })).filter(g => g.techs.length > 0)

  if (allTechs.length === 0) return null

  return (
    <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--teal),var(--blue))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">MÜSAİT TEKNİSYENLER</div>
          <div className="panel-subtitle">Şu an: {SHIFTS[currentShift].label} ({SHIFTS[currentShift].hours})</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {grouped.map(g => (
          <div key={g.shift}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: g.isCurrent ? 'var(--green)' : 'var(--border2)',
                boxShadow: g.isCurrent ? '0 0 6px var(--green)' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px',
                color: g.isCurrent ? 'var(--text)' : 'var(--text3)',
                fontWeight: g.isCurrent ? 700 : 400,
              }}>
                {g.info.label.toUpperCase()} · {g.info.hours}
              </span>
              {g.isCurrent && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '8px', padding: '1px 6px',
                  background: 'rgba(39,201,106,.15)', border: '1px solid rgba(39,201,106,.3)',
                  borderRadius: '4px', color: 'var(--green)', letterSpacing: '1px',
                }}>AKTİF</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {g.techs.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: g.isCurrent ? 'rgba(39,201,106,.06)' : 'var(--surface2)',
                  border: g.isCurrent ? '1px solid rgba(39,201,106,.2)' : '1px solid var(--border)',
                  opacity: g.isCurrent ? 1 : 0.6,
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: g.isCurrent
                      ? 'linear-gradient(135deg,var(--teal),var(--green))'
                      : 'linear-gradient(135deg,var(--text4),var(--text3))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '11px', color: '#fff',
                  }}>{t.full_name.charAt(0)}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                      {t.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                      {SPECIALTIES[t.specialty] || t.specialty}
                      {t.phone && <span> · <a href={`tel:${t.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t.phone}</a></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Technician Manager
   ═══════════════════════════════════════════════════════════════════════════ */
function TechnicianManager() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('genel')
  const [shift, setShift] = useState('1')

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api.get('/maintenance/technicians').then(r => r.data),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-technical'],
    queryFn: () => api.get('/users').then(r => r.data.filter(u => u.role === 'technical')),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['technicians'] })

  const createMut = useMutation({
    mutationFn: (data) => api.post('/maintenance/technicians', data),
    onSuccess: () => { inv(); setShowAdd(false); setName(''); setPhone(''); setSpecialty('genel'); setShift('1') },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/maintenance/technicians/${id}`, data),
    onSuccess: inv,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/maintenance/technicians/${id}`),
    onSuccess: inv,
  })

  const linkedUserIds = new Set(technicians.map(t => t.user_id).filter(Boolean))

  return (
    <div className="panel fade-up" style={{ marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--teal),var(--blue))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">TEKNİSYEN YÖNETİMİ</div>
          <div className="panel-subtitle">{technicians.length} AKTİF TEKNİSYEN</div>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? '✕ KAPAT' : '+ EKLE'}
        </button>
      </div>
      <div className="panel-body">
        {showAdd && (
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px',
          }}>
            <div style={{ flex: 1, minWidth: '130px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>AD SOYAD</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ad Soyad" style={{ fontSize: '12px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '110px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>TELEFON</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05XX..." style={{ fontSize: '12px' }} />
            </div>
            <div style={{ minWidth: '100px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>UZMANLIK</label>
              <select className="form-select" value={specialty} onChange={e => setSpecialty(e.target.value)} style={{ fontSize: '12px' }}>
                {Object.entries(SPECIALTIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '120px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>VARDİYA</label>
              <select className="form-select" value={shift} onChange={e => setShift(e.target.value)} style={{ fontSize: '12px' }}>
                {Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.hours})</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button className="btn btn-primary btn-xs" disabled={!name.trim() || createMut.isPending}
                onClick={() => createMut.mutate({ full_name: name.trim(), phone: phone.trim(), specialty, shift })}>
                {createMut.isPending ? '...' : 'KAYDET'}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(false)}>İPTAL</button>
            </div>
          </div>
        )}

        {technicians.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px 0' }}>
            <div className="empty-icon" style={{ fontSize: '24px' }}>⚙</div>
            <div className="empty-sub">Teknisyen kaydı yok</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {technicians.map(t => {
              const si = SHIFTS[t.shift] || SHIFTS['1']
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px',
                }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--teal),var(--blue))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
                  }}>{t.full_name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{t.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>
                      {SPECIALTIES[t.specialty] || t.specialty}
                      {t.phone && ` · ${t.phone}`}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '8px', padding: '2px 7px',
                    background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${si.color} 30%, transparent)`,
                    borderRadius: '4px', color: si.color, letterSpacing: '0.5px',
                  }}>{si.label}</span>
                  <select
                    className="form-select"
                    value={t.user_id || ''}
                    onChange={e => updateMut.mutate({ id: t.id, data: { user_id: e.target.value ? +e.target.value : null } })}
                    title="Mobile uygulamada 'Bana atanmış' filtresi için kullanıcı bağlama"
                    style={{ fontSize: '10px', padding: '2px 4px', maxWidth: '120px' }}
                  >
                    <option value="">— kullanıcı yok —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id} disabled={linkedUserIds.has(u.id) && u.id !== t.user_id}>
                        {u.username}{linkedUserIds.has(u.id) && u.id !== t.user_id ? ' (bağlı)' : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost btn-xs" onClick={async () => { if (await confirmDialog({ title: 'Teknisyen Sil', body: `${t.full_name} silinsin mi?`, danger: true })) deleteMut.mutate(t.id) }} style={{ color: 'var(--red)' }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Detail Panel
   ═══════════════════════════════════════════════════════════════════════════ */
function DetailPanel({ requestId, onClose }) {
  const qc = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [commentPhoto, setCommentPhoto] = useState(null)
  const [closePhoto, setClosePhoto] = useState(null)
  const [customReason, setCustomReason] = useState('')

  const { data: request } = useQuery({
    queryKey: ['maintenance-detail', requestId],
    queryFn: () => api.get(`/maintenance/requests/${requestId}`).then(r => r.data),
  })

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
    qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    qc.invalidateQueries({ queryKey: ['maintenance-detail', requestId] })
  }

  const { data: comments = [] } = useQuery({
    queryKey: ['maintenance-comments', requestId],
    queryFn: () => api.get(`/maintenance/requests/${requestId}/comments`).then(r => r.data),
  })

  const waitReasonMut = useMutation({
    mutationFn: (wait_reason) => api.patch(`/maintenance/requests/${requestId}/wait-reason`, { wait_reason }),
    onSuccess: inv,
  })
  const priorityMut = useMutation({
    mutationFn: (priority) => api.patch(`/maintenance/requests/${requestId}/priority`, { priority }),
    onSuccess: inv,
  })
  const reopenMut = useMutation({ mutationFn: () => api.patch(`/maintenance/requests/${requestId}/reopen`), onSuccess: inv })
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/maintenance/requests/${requestId}`),
    onSuccess: () => { inv(); onClose() },
  })
  const closeMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      if (closePhoto) fd.append('photo', closePhoto)
      return api.patch(`/maintenance/requests/${requestId}/close`, fd)
    },
    onSuccess: () => { setClosePhoto(null); inv() },
  })
  const commentMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('comment', newComment.trim())
      if (commentPhoto) fd.append('photo', commentPhoto)
      return api.post(`/maintenance/requests/${requestId}/comments`, fd)
    },
    onSuccess: () => {
      setNewComment('')
      setCommentPhoto(null)
      qc.invalidateQueries({ queryKey: ['maintenance-comments', requestId] })
    },
  })

  if (!request) return <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', padding: '20px 0' }}>Yükleniyor...</div>

  const pri = priInfo(request.priority)

  return (
    <div className="panel fade-up" style={{ marginTop: '16px' }}>
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${pri.color}, var(--purple))` }} />
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="panel-title">#{request.id} — {request.location}</div>
            {(() => { const si = statusInfo(request.status); return (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '8.5px', letterSpacing: '1px', padding: '2px 8px',
                borderRadius: '4px', color: si.color,
                background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${si.color} 30%, transparent)`,
              }}>{si.label}</span>
            ) })()}
            <StatusTimeline status={request.status} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
              color: pri.color, background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${pri.color} 30%, transparent)`,
            }}>{pri.label}</span>
            {request.sla_deadline && request.status !== 'done' && (() => {
              const isOverdue = new Date(request.sla_deadline) < new Date()
              return (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                  color: isOverdue ? 'var(--red)' : 'var(--teal)',
                  background: isOverdue ? 'rgba(231,76,60,.12)' : 'rgba(26,188,156,.12)',
                  border: isOverdue ? '1px solid rgba(231,76,60,.3)' : '1px solid rgba(26,188,156,.3)',
                }}>SLA {isOverdue ? 'AŞILDI' : new Date(request.sla_deadline).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              )
            })()}
          </div>
          <div className="panel-subtitle" style={{ marginTop: '4px' }}>
            {request.reporter_name && `${request.reporter_name} · `}
            {new Date(request.opened_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', fontSize: '9px' }}
            onClick={() => { if (confirm('Bu arıza kaydı silinsin mi?')) deleteMut.mutate() }}>SİL</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="panel-body">
        {/* Description */}
        <div style={{
          padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '8px', marginBottom: '14px',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{request.description}</div>
        </div>

        {/* Workflow Actions */}
        {request.status !== 'done' && (
          <div style={{
            padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px' }}>İŞLEM:</span>
            <div style={{ position: 'relative' }}>
              <StatusActions request={request} onSuccess={() => {}} />
            </div>
            {request.technician_name && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '4px',
                background: 'rgba(52,152,219,.1)', border: '1px solid rgba(52,152,219,.2)',
                color: 'var(--blue)', marginLeft: 'auto',
              }}>Teknisyen: {request.technician_name}</span>
            )}
          </div>
        )}

        {/* Wait reason */}
        {request.status !== 'done' && (
          <div style={{
            padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', marginBottom: '14px',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '8px' }}>BEKLEME SEBEBİ</div>
            {request.wait_reason && (
              <div style={{
                padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.2)',
                fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{request.wait_reason}</span>
                <button onClick={() => waitReasonMut.mutate(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '11px',
                }}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {WAIT_REASONS.map(r => (
                <button key={r} onClick={() => waitReasonMut.mutate(r)}
                  disabled={waitReasonMut.isPending}
                  style={{
                    padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                    border: request.wait_reason === r ? '1px solid var(--amber)' : '1px solid var(--border)',
                    background: request.wait_reason === r ? 'rgba(240,165,0,.1)' : 'transparent',
                    color: request.wait_reason === r ? 'var(--amber)' : 'var(--text2)',
                    fontFamily: 'var(--sans)', transition: 'all .1s',
                  }}>{r}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <input className="form-input" value={customReason} onChange={e => setCustomReason(e.target.value)}
                placeholder="Başka bir sebep yaz..." style={{ fontSize: '11px', flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && customReason.trim()) { waitReasonMut.mutate(customReason.trim()); setCustomReason('') } }} />
              {customReason.trim() && (
                <button className="btn btn-ghost btn-xs" onClick={() => { waitReasonMut.mutate(customReason.trim()); setCustomReason('') }}>EKLE</button>
              )}
            </div>
          </div>
        )}

        {/* Priority change */}
        {request.status !== 'done' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
            padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px' }}>ÖNCELİK:</span>
            {PRIORITIES.map(p => (
              <button key={p.key} onClick={() => priorityMut.mutate(p.key)} disabled={priorityMut.isPending} style={{
                padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', border: 'none',
                background: request.priority === p.key ? `color-mix(in srgb, ${p.color} 18%, transparent)` : 'transparent',
                color: request.priority === p.key ? p.color : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
              }}>{p.label}</button>
            ))}
          </div>
        )}

        {/* Photos */}
        {(request.photo_before || request.photo_url) && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {request.photo_before && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', letterSpacing: '1.5px', marginBottom: '6px' }}>ÖNCE</div>
                <img loading="lazy" src={request.photo_before} alt="" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
            )}
            {request.photo_url && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)', letterSpacing: '1.5px', marginBottom: '6px' }}>SONRA</div>
                <img loading="lazy" src={request.photo_url} alt="" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
            )}
          </div>
        )}

        {/* Close / Complete — from in_progress status */}
        {request.status === 'in_progress' && (
          <div style={{
            padding: '12px 14px', background: 'rgba(39,201,106,.04)', border: '1px solid rgba(39,201,106,.15)',
            borderRadius: '8px', marginBottom: '14px',
          }}>
            <PhotoCapture value={closePhoto} onChange={setClosePhoto} label="Tamamlanma Fotoğrafı" />
            <button className="btn btn-primary btn-sm" disabled={closeMut.isPending}
              onClick={() => closeMut.mutate()}
              style={{ background: 'var(--green)', borderColor: 'var(--green)', marginTop: '10px' }}>
              {closeMut.isPending ? '...' : 'KAPAT'}
            </button>
          </div>
        )}

        {/* Done state */}
        {request.status === 'done' && (
          <div style={{
            padding: '10px 14px', background: 'rgba(39,201,106,.08)', border: '1px solid rgba(39,201,106,.25)',
            borderRadius: '8px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)' }}>
              Tamamlandı · {new Date(request.closed_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '9px', color: 'var(--accent)' }}
              onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending}>YENİDEN AÇ</button>
          </div>
        )}

        {/* Comments */}
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
            NOTLAR · {comments.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {comments.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '8px 0' }}>Henüz not yok</div>
            )}
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: 'linear-gradient(135deg,var(--blue),var(--purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '9px', color: '#fff',
                  }}>{(c.user_name || '?').charAt(0).toUpperCase()}</div>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{c.user_name || 'Sistem'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginLeft: 'auto' }}>
                    {new Date(c.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{c.comment}</div>
                {c.photo_url && <img loading="lazy" src={c.photo_url} alt="" style={{ marginTop: '8px', maxWidth: '200px', borderRadius: '6px', border: '1px solid var(--border)' }} />}
              </div>
            ))}
          </div>
          <div style={{
            padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <input className="form-input" value={newComment} onChange={e => setNewComment(e.target.value)}
              placeholder="Not ekle..." style={{ fontSize: '12px' }}
              onKeyDown={e => { if (e.key === 'Enter' && newComment.trim()) commentMut.mutate() }} />
            <PhotoCapture value={commentPhoto} onChange={setCommentPhoto} label="" />
            <button className="btn btn-primary btn-sm" disabled={!newComment.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate()}
              style={{ alignSelf: 'flex-start', opacity: (!newComment.trim() || commentMut.isPending) ? 0.5 : 1 }}>
              {commentMut.isPending ? '...' : 'GÖNDER'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const INIT_MAINTENANCE = { location: '', description: '', priority: 'medium' }

/* ═══════════════════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function MaintenancePage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showTechs, setShowTechs] = useState(false)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-maintenance') setShowForm(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])
  const [form, setForm] = useState(INIT_MAINTENANCE)
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:maintenance', form, setForm, INIT_MAINTENANCE)
  const [formPhoto, setFormPhoto] = useState(null)
  const [filter, setFilter] = useState('open')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'

  const { data: stats } = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: () => api.get('/maintenance/stats').then(r => r.data),
    refetchInterval: 30000,
  })

  const buildQuery = () => {
    let url = '/maintenance/requests?'
    if (filter === 'overdue') url += 'status=open&'
    else if (filter === 'all' || filter === 'kanban') { /* no status filter */ }
    else url += `status=${filter}&`
    if (searchTerm.trim()) url += `search=${encodeURIComponent(searchTerm.trim())}&`
    return url
  }

  const kanbanQuery = () => {
    let url = '/maintenance/requests?'
    if (searchTerm.trim()) url += `search=${encodeURIComponent(searchTerm.trim())}&`
    return url
  }

  const { data: rawRequests = [], isLoading } = useQuery({
    queryKey: ['maintenance-requests', viewMode === 'kanban' ? 'all' : filter, searchTerm],
    queryFn: () => api.get(viewMode === 'kanban' ? kanbanQuery() : buildQuery()).then(r => r.data),
  })

  const requests = filter === 'overdue'
    ? rawRequests.filter(r => r.sla_deadline && new Date(r.sla_deadline) < new Date())
    : rawRequests

  const createRequest = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', form.location)
      fd.append('description', form.description)
      fd.append('priority', form.priority)
      if (formPhoto) fd.append('photo_before', formPhoto)
      return api.post('/maintenance/requests', fd)
    },
    onSuccess: () => {
      onSubmitSuccess()
      setShowForm(false)
      setForm(INIT_MAINTENANCE)
      setFormPhoto(null)
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    },
  })

  return (
    <div style={{ position: 'relative', zIndex: 1 }} className="fade-up">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>
            TEKNİK SERVİS<HelpHint topic="maintenance" title="TEKNİK SERVİS" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            ARIZA BİLDİRİM VE TAKİP
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowTechs(s => !s)} className="btn btn-ghost">
            {showTechs ? '✕ TEKNİSYENLER' : '⚙ TEKNİSYENLER'}
          </button>
          <button onClick={() => setShowForm(s => !s)} className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}>
            {showForm ? '✕ KAPAT' : '+ YENİ ARIZA'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="fade-up-1" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--red)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--red)', lineHeight: 1 }}>{stats.open}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>AÇIK ARIZA</div>
          </div>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--amber)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--amber)', lineHeight: 1 }}>{stats.waiting}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BEKLEMEDE</div>
          </div>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--green)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--green)', lineHeight: 1 }}>{stats.closedToday}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BUGÜN KAPANAN</div>
            {stats.avgHours && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '2px' }}>Ort: {stats.avgHours}s</div>}
          </div>
          {stats.overdue > 0 && (
            <div style={{
              flex: 1, minWidth: '110px', padding: '14px 16px',
              background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)', borderRadius: '10px',
              borderTop: '3px solid var(--red)',
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--red)', lineHeight: 1 }}>{stats.overdue}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', letterSpacing: '1.5px', marginTop: '6px' }}>SLA AŞILDI</div>
            </div>
          )}
        </div>
      )}

      {/* Available Technicians */}
      <AvailableTechnicians />

      {/* Technician manager */}
      {showTechs && <TechnicianManager />}

      {/* New request form */}
      {showForm && (
        <div className="panel fade-up" style={{ marginBottom: '16px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--red),var(--accent))' }} />
          <div className="panel-header">
            <div className="panel-title">YENİ ARIZA KAYDI</div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
            <LocationPicker value={form.location} onChange={v => setForm(p => ({ ...p, location: v }))} />
            <div>
              <label className="form-label">Açıklama</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="form-textarea" placeholder="Arıza detayını yazın..." rows={3} />
            </div>
            <div>
              <label className="form-label">Öncelik</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => setForm(f => ({ ...f, priority: p.key }))} style={{
                    flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer',
                    border: form.priority === p.key ? `2px solid color-mix(in srgb, ${p.color} 50%, transparent)` : '1px solid var(--border)',
                    background: form.priority === p.key ? `color-mix(in srgb, ${p.color} 8%, transparent)` : 'transparent',
                    color: form.priority === p.key ? p.color : 'var(--text2)',
                    fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600, letterSpacing: '1px',
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
            <PhotoCapture value={formPhoto} onChange={setFormPhoto} label="Arıza Fotoğrafı" />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost">İPTAL</button>
              <button onClick={() => createRequest.mutate()}
                disabled={createRequest.isPending || !form.location || !form.description}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', opacity: (createRequest.isPending || !form.location || !form.description) ? 0.5 : 1 }}>
                {createRequest.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'open', label: 'AÇIK' },
          { key: 'in_progress', label: 'DEVAM EDİYOR' },
          { key: 'overdue', label: 'GECİKEN' },
          { key: 'done', label: 'TAMAMLANDI' },
          { key: 'all', label: 'TÜMÜ' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setSelectedId(null) }}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}>
            {f.label}
            {f.key === 'open' && stats?.open > 0 && (
              <span style={{
                marginLeft: '4px', background: 'var(--red)', color: '#fff',
                borderRadius: '8px', padding: '0 5px', fontSize: '8px', fontWeight: 700,
              }}>{stats.open}</span>
            )}
            {f.key === 'overdue' && stats?.overdue > 0 && (
              <span style={{
                marginLeft: '4px', background: 'var(--red)', color: '#fff',
                borderRadius: '8px', padding: '0 5px', fontSize: '8px', fontWeight: 700,
              }}>{stats.overdue}</span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          <button onClick={() => setViewMode('list')}
            style={{
              padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', border: 'none',
              background: viewMode === 'list' ? 'var(--accent)' : 'var(--surface2)',
              color: viewMode === 'list' ? '#fff' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
            }}>LİSTE</button>
          <button onClick={() => setViewMode('kanban')}
            style={{
              padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', border: 'none',
              background: viewMode === 'kanban' ? 'var(--accent)' : 'var(--surface2)',
              color: viewMode === 'kanban' ? '#fff' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
            }}>KANBAN</button>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Konum veya açıklama ile ara..."
          className="form-input" style={{ width: '100%', fontSize: '12px' }} />
      </div>

      {/* Request list */}
      {isLoading ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', padding: '20px 0' }}>Yükleniyor...</div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚙</div>
          <div className="empty-title">ARIZA YOK</div>
          <div className="empty-sub">{filter === 'open' ? 'Açık arıza kaydı bulunmuyor' : 'Bu filtrede kayıt yok'}</div>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView requests={requests} onSelect={id => setSelectedId(selectedId === id ? null : id)} />
      ) : (
        <div className="panel">
          <div style={{ padding: '4px 16px' }}>
            {requests.map(req => {
              const pri = priInfo(req.priority)
              const si = statusInfo(req.status)
              const isSelected = selectedId === req.id
              return (
                <div key={req.id}>
                  <div className="maint-row"
                    onClick={() => setSelectedId(isSelected ? null : req.id)}
                    style={{
                      opacity: req.status === 'done' ? 0.6 : 1,
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,.08)' : 'transparent',
                      borderRadius: isSelected ? '8px' : '0',
                      padding: isSelected ? '12px 8px' : '12px 0',
                      transition: 'all .15s',
                    }}>
                    {/* Priority bar */}
                    <div style={{
                      width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0,
                      background: pri.color,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          {req.location}
                        </span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: pri.color,
                          background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${pri.color} 25%, transparent)`,
                        }}>{pri.label}</span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: si.color,
                          background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${si.color} 25%, transparent)`,
                        }}>{si.label}</span>
                        {req.photo_before && <span style={{ fontSize: '11px' }} title="Fotoğraf var">📷</span>}
                        {req.sla_deadline && req.status !== 'done' && (
                          <SLACountdown deadline={req.sla_deadline} />
                        )}
                      </div>
                      <div style={{
                        fontSize: '12px', color: 'var(--text2)', marginBottom: '4px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{req.description}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{new Date(req.opened_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        <span>#{req.id}</span>
                        {req.technician_name && (
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(52,152,219,.1)', border: '1px solid rgba(52,152,219,.2)',
                            color: 'var(--blue)', fontSize: '8px',
                          }}>{req.technician_name}</span>
                        )}
                        {req.wait_reason && (
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(240,165,0,.1)', border: '1px solid rgba(240,165,0,.2)',
                            color: 'var(--amber)', fontSize: '8px',
                          }}>{req.wait_reason}</span>
                        )}
                        <StatusTimeline status={req.status} />
                      </div>
                    </div>
                    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {req.status !== 'done' && (
                        <StatusActions request={req} />
                      )}
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '16px', color: 'var(--text4)', flexShrink: 0 }}>
                        {isSelected ? '▾' : '▸'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <DetailPanel key={selectedId} requestId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
