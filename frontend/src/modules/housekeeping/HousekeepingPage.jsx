import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import {
  BLOCKS,
  BLOCKS_BY_TYPE,
  BLOCK_BY_NAME,
  expectedRoomNos as expectedRoomNosFromConfig,
  getFloorLabel,
} from '../../shared/blocks.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_BLOCK_NAMES = BLOCKS.map(b => b.block)
const TODAY      = new Date().toISOString().split('T')[0]

const CHECKLIST_ITEMS = [
  { id: 'zemin',    label: 'Zemin süpürüldü / silindi',    icon: '🧹' },
  { id: 'yuzeyler', label: 'Yüzeyler / mobilyalar silindi', icon: '🧽' },
  { id: 'cop',      label: 'Çöp boşaltıldı',               icon: '🗑'  },
  { id: 'yatak',    label: 'Yatak / yorgan düzenlendi',     icon: '🛏'  },
  { id: 'cam',      label: 'Pencere / cam silindi',         icon: '🪟' },
  { id: 'banyo',    label: 'Banyo temizlendi',              icon: '🚿', privateOnly: true },
  { id: 'tuvalet',  label: 'Tuvalet temizlendi',            icon: '🚽', privateOnly: true },
]

const SKIP_REASONS = [
  'Oda kilitli',
  'Personel odada — istemedi',
  'Zaten temiz',
  'Bakımda / onarımda',
  'Diğer',
]

function roomNoFromQr(qr) {
  if (!qr) return null
  const parts = qr.split('-')
  return parts.length >= 2 ? parts[parts.length - 1] : null
}

// ── Progress strip ────────────────────────────────────────────────────────────
function ProgressStrip({ tasks, onGenerate, generating }) {
  const done    = tasks.filter(t => t.completed_at).length
  const skipped = tasks.filter(t => t.skipped).length
  const total   = tasks.length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0
  const barCls  = pct === 100 ? 'prog-green' : pct >= 60 ? 'prog-amber' : 'prog-red'

  return (
    <div className="panel fade-up-1" style={{ marginBottom: '20px' }}>
      <div style={{ height: '3px', background: pct === 100
        ? 'linear-gradient(90deg,var(--green),var(--teal))'
        : 'linear-gradient(90deg,var(--accent),var(--accent3))' }} />
      <div style={{ padding: '14px 20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
        {[
          { label: 'TOPLAM',    value: total,             color: 'var(--text)'   },
          { label: 'TAMAM',     value: done,               color: 'var(--green)'  },
          { label: 'ATLANDI',   value: skipped,            color: 'var(--text3)'  },
          { label: 'BEKLEYEN',  value: total-done-skipped, color: (total-done-skipped)>0 ? 'var(--accent)' : 'var(--text3)' },
          { label: 'TAMAMLAMA', value: `%${pct}`,          color: pct===100 ? 'var(--green)' : pct>=60 ? 'var(--accent)' : 'var(--red)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: '52px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '3px' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1, padding: '0 8px' }}>
          <div className="prog-bar" style={{ height: '7px', borderRadius: '4px' }}>
            <div className={`prog-fill ${barCls}`} style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', transition: 'width .8s ease' }} />
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>
          {new Date().toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' })}
        </div>
        <button className="btn btn-primary" onClick={onGenerate} disabled={generating}
          style={{ flexShrink: 0, opacity: generating ? 0.6 : 1 }}>
          {generating ? '...' : '+ GÖREV OLUŞTUR'}
        </button>
      </div>
    </div>
  )
}

// ── Ghost Tile (missing room) ────────────────────────────────────────────────
function GhostTile({ rno }) {
  return (
    <div style={{
      width: '58px', height: '74px', borderRadius: '7px', flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed var(--border)', gap: '2px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', fontWeight: 600 }}>{rno}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)' }}>—</div>
    </div>
  )
}

// ── Room Tile ─────────────────────────────────────────────────────────────────
// State priority: done > skipped > DND > noClean > pending > noTask
function RoomTile({ rno, task, roomInfo, isDnd, dndInfo, isM, isS2Floor2, selected, onSelect, faultCount }) {
  const isDone    = !!task?.completed_at
  const isSkipped = task?.skipped === 1
  const noClean   = roomInfo?.no_clean === 1
  const hasTask   = !!task
  const hasNote   = !!roomInfo?.notes
  const hasFault  = (faultCount || 0) > 0
  const showBath  = !isM  // S bloklarda her odada özel banyo/tuvalet

  // ── Visual state ──
  let stripe, bg, borderCol, roomNoColor, statusIcon, statusLabel, statusColor

  if (isDone) {
    stripe      = '#27c96a'
    bg          = 'rgba(39,201,106,.18)'
    borderCol   = 'rgba(39,201,106,.5)'
    roomNoColor = 'var(--green)'
    statusIcon  = '✓'
    statusLabel = 'TEMİZ'
    statusColor = 'var(--green)'
  } else if (isSkipped) {
    stripe      = '#3d4e6a'
    bg          = 'rgba(61,78,106,.15)'
    borderCol   = 'rgba(61,78,106,.4)'
    roomNoColor = 'var(--text3)'
    statusIcon  = '⊘'
    statusLabel = 'ATLANDI'
    statusColor = 'var(--text3)'
  } else if (isDnd && !isDone) {
    stripe      = '#f0a500'
    bg          = 'rgba(240,165,0,.14)'
    borderCol   = 'rgba(240,165,0,.45)'
    roomNoColor = 'var(--accent)'
    statusIcon  = '🚫'
    statusLabel = 'DND'
    statusColor = 'var(--accent)'
  } else if (noClean) {
    stripe      = '#2a3650'
    bg          = 'rgba(42,54,80,.2)'
    borderCol   = 'var(--border2)'
    roomNoColor = 'var(--text4)'
    statusIcon  = '⊘'
    statusLabel = 'TEMİZLİK YOK'
    statusColor = 'var(--text4)'
  } else if (hasTask) {
    stripe      = '#3b8cf0'
    bg          = 'rgba(59,140,240,.1)'
    borderCol   = 'rgba(59,140,240,.35)'
    roomNoColor = 'var(--blue)'
    statusIcon  = '○'
    statusLabel = 'BEKLİYOR'
    statusColor = 'var(--blue)'
  } else {
    stripe      = 'transparent'
    bg          = 'rgba(255,255,255,.02)'
    borderCol   = 'var(--border)'
    roomNoColor = 'var(--text4)'
    statusIcon  = '—'
    statusLabel = ''
    statusColor = 'var(--text4)'
  }

  return (
    <div
      onClick={() => onSelect(selected ? null : rno)}
      title={`Oda ${rno} — ${statusLabel || 'Görev yok'}`}
      style={{
        width: '58px', height: '74px', borderRadius: '7px', flexShrink: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: selected ? `2px solid var(--accent)` : `1px solid ${borderCol}`,
        background: bg,
        boxShadow: selected ? '0 0 0 3px rgba(240,165,0,.25)' : 'none',
        cursor: 'pointer',
        transition: 'transform .12s, box-shadow .12s',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.16)'; e.currentTarget.style.zIndex = '20' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '1' }}
    >
      {/* Status stripe at top */}
      <div style={{ height: '4px', background: stripe, width: '100%', flexShrink: 0 }} />

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px', padding: '2px' }}>
        {/* Room number — strikethrough if skipped/noClean */}
        <div style={{
          fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
          color: roomNoColor, lineHeight: 1,
          textDecoration: (isSkipped || noClean) ? 'line-through' : 'none',
        }}>
          {rno}
        </div>

        {/* Status icon — large and clear */}
        <div style={{ fontSize: '13px', lineHeight: 1, marginTop: '1px' }}>{statusIcon}</div>

        {/* Bottom row: bath icon (S only) + S2 label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
          {showBath && (
            <span style={{ fontSize: '9px', opacity: isDone ? 0.7 : 0.5, lineHeight: 1 }} title="Özel banyo + tuvalet">🚿</span>
          )}
          {isS2Floor2 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--accent)', background: 'rgba(240,165,0,.2)', borderRadius: '2px', padding: '0 2px', lineHeight: 1.5 }}>4K</span>
          )}
        </div>
      </div>

      {/* Note dot indicator */}
      {hasNote && (
        <div style={{ position: 'absolute', top: '6px', right: '4px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} title="Oda notu var" />
      )}
      {/* DND badge */}
      {isDnd && !isDone && (
        <div style={{ position: 'absolute', top: '5px', left: '3px', fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--accent)', background: 'rgba(240,165,0,.3)', borderRadius: '2px', padding: '0 2px', lineHeight: 1.5 }}
          title="Gece vardiyası uyuyor"
        >☾DND</div>
      )}
      {/* noClean badge */}
      {noClean && !isDone && (
        <div style={{ position: 'absolute', top: '5px', left: '3px', fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--text4)', background: 'var(--surface3)', borderRadius: '2px', padding: '0 2px', lineHeight: 1.5 }}>⊘</div>
      )}
      {/* Fault indicator */}
      {hasFault && (
        <div style={{
          position: 'absolute', bottom: '3px', left: '3px',
          width: '14px', height: '14px', borderRadius: '50%',
          background: 'var(--red)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
          boxShadow: '0 0 0 1.5px var(--surface)',
        }} title={`${faultCount} açık arıza`}>
          {faultCount > 9 ? '!' : faultCount}
        </div>
      )}
      {/* Skip reason tooltip indicator */}
      {isSkipped && task?.skip_reason && (
        <div style={{ position: 'absolute', bottom: '3px', right: '3px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--border2)' }} title={task.skip_reason} />
      )}
    </div>
  )
}

// ── Facility Cell (M blocks — shared WC/shower) ──────────────────────────────
function FacilityCell({ type, height = 74 }) {
  const isWC = type === 'WC'
  return (
    <div style={{
      height, width: '34px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
      background: isWC ? 'rgba(59,140,240,.08)' : 'rgba(26,188,156,.08)',
      border: `1px solid ${isWC ? 'rgba(59,140,240,.25)' : 'rgba(26,188,156,.25)'}`,
      borderRadius: '5px',
    }}>
      <span style={{ fontSize: '11px' }}>{isWC ? '🚽' : '🚿'}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '5.5px', letterSpacing: '0.3px', color: isWC ? 'var(--blue)' : 'var(--teal)', fontWeight: 700 }}>{type}</span>
    </div>
  )
}

// ── Ortak Alan Card (M blocks) ────────────────────────────────────────────────
function OrtakAlanCard({ task, onComplete, onUncomplete, onSkip }) {
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const done    = !!task?.completed_at
  const skipped = task?.skipped === 1

  return (
    <div style={{
      borderRadius: '8px', marginBottom: '16px', overflow: 'hidden',
      border: `1px solid ${done ? 'rgba(39,201,106,.4)' : skipped ? 'var(--border2)' : 'rgba(59,140,240,.35)'}`,
      background: done ? 'rgba(39,201,106,.08)' : skipped ? 'rgba(61,78,106,.1)' : 'rgba(59,140,240,.06)',
    }}>
      {/* Top stripe */}
      <div style={{ height: '3px', background: done ? 'var(--green)' : skipped ? 'var(--border2)' : 'var(--blue)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          background: done ? 'rgba(39,201,106,.15)' : skipped ? 'rgba(61,78,106,.2)' : 'rgba(59,140,240,.12)',
        }}>
          {done ? '✅' : skipped ? '⊘' : '🏢'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px',
            color: done ? 'var(--green)' : skipped ? 'var(--text3)' : 'var(--text)',
            textDecoration: skipped ? 'line-through' : 'none',
          }}>
            ORTAK ALAN — KORİDOR · WC · BANYO · MERDİVEN
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
            {done && task?.assignee_name && `✓ ${task.assignee_name} · ${new Date(task.completed_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}`}
            {skipped && task?.skip_reason && `Atlandı: ${task.skip_reason}`}
            {!done && !skipped && 'Kat koridoru, WC ve banyo ortak alanlarını kapsar'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {!task && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>Görev yok</span>}
          {task && done && <button className="btn btn-ghost btn-xs" onClick={() => onUncomplete(task.id)}>↩ Geri Al</button>}
          {task && skipped && <button className="btn btn-ghost btn-xs" onClick={() => onSkip(task.id, null, true)}>↩ Geri Al</button>}
          {task && !done && !skipped && (
            <>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(!showSkip)}>⊘ Atla</button>
              <button className="btn btn-primary btn-xs" onClick={() => onComplete(task.id, null)}>✓ Tamam</button>
            </>
          )}
        </div>
      </div>
      {showSkip && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select className="form-select" style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
            value={skipReason} onChange={e => setSkipReason(e.target.value)}>
            <option value="">Sebep seçin...</option>
            {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { onSkip(task.id, skipReason); setShowSkip(false) }} disabled={!skipReason}>
            ⊘ Atla
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(false)}>İptal</button>
        </div>
      )}
    </div>
  )
}

// ── Room Detail Panel ─────────────────────────────────────────────────────────
function RoomDetailPanel({ block, floor, roomNo, task, isPrivateBath, onComplete, onUncomplete, onSkip, onClose, onInvalidateRooms }) {
  const qc = useQueryClient()
  const [checkedItems, setCheckedItems] = useState(() => {
    if (task?.checklist) {
      try { return new Set(JSON.parse(task.checklist)) } catch { return new Set() }
    }
    return new Set()
  })
  const [showSkip, setShowSkip]   = useState(false)
  const [skipReason, setSkipReason] = useState(task?.skip_reason || '')
  const [faultDesc, setFaultDesc] = useState('')
  const [faultPriority, setFaultPriority] = useState('medium')
  const [faultPhoto, setFaultPhoto] = useState(null)
  const [faultPreview, setFaultPreview] = useState(null)
  const [faultSent, setFaultSent] = useState(false)
  const faultCameraRef = useRef(null)
  const faultFileRef = useRef(null)
  const [noCleanLocal, setNoCleanLocal] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [noteInited, setNoteInited] = useState(false)

  const done    = !!task?.completed_at
  const skipped = task?.skipped === 1
  const isM     = BLOCK_BY_NAME[block]?.type === 'M'

  const visibleChecklist = CHECKLIST_ITEMS.filter(i => !i.privateOnly || isPrivateBath)
  const checkedCount = [...checkedItems].filter(id => visibleChecklist.some(i => i.id === id)).length

  const { data: details, isLoading: detailLoading, refetch: refetchDetails } = useQuery({
    queryKey: ['hk-room-details', block, roomNo],
    queryFn: () => api.get(`/housekeeping/room-details?block=${block}&room_no=${roomNo}`).then(r => r.data),
    staleTime: 15000,
  })
  const room   = details?.room
  const faults = details?.faults || []
  const noClean = noCleanLocal !== null ? noCleanLocal : (room?.no_clean === 1)

  // Init note text from room data once loaded
  if (room && !noteInited) {
    setNoteText(room.notes || '')
    setNoteInited(true)
  }

  const mutNoClean = useMutation({
    mutationFn: (val) => api.patch(`/housekeeping/rooms/${room.id}/no-clean`, { no_clean: val }),
    onSuccess: (_, val) => {
      setNoCleanLocal(val)
      qc.invalidateQueries(['capacity-rooms', block])
      onInvalidateRooms?.()
    },
  })

  const mutNotes = useMutation({
    mutationFn: (n) => api.patch(`/housekeeping/rooms/${room.id}/notes`, { notes: n }),
    onSuccess: () => {
      qc.invalidateQueries(['hk-room-details', block, roomNo])
      qc.invalidateQueries(['capacity-rooms', block])
    },
  })

  const handleFaultPhoto = (file) => {
    if (!file) return
    setFaultPhoto(file)
    const reader = new FileReader()
    reader.onload = e => setFaultPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const clearFaultPhoto = () => {
    setFaultPhoto(null)
    setFaultPreview(null)
    if (faultCameraRef.current) faultCameraRef.current.value = ''
    if (faultFileRef.current) faultFileRef.current.value = ''
  }

  const mutFault = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', `${block} Kat ${floor} Oda ${roomNo}`)
      fd.append('description', faultDesc)
      fd.append('priority', faultPriority)
      if (faultPhoto) fd.append('photo', faultPhoto)
      return api.post('/housekeeping/fault-report', fd)
    },
    onSuccess: () => {
      setFaultDesc(''); setFaultPriority('medium'); clearFaultPhoto()
      setFaultSent(true); refetchDetails()
    },
  })

  function toggleItem(id) {
    if (done || skipped) return
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() { setCheckedItems(new Set(visibleChecklist.map(i => i.id))) }
  function clearAll()  { setCheckedItems(new Set()) }

  const side = Number(roomNo) % 2 !== 0 ? 'SOL · TEK' : 'SAĞ · ÇİFT'
  const accentLine = done
    ? 'linear-gradient(90deg,var(--green),var(--teal))'
    : skipped
      ? 'linear-gradient(90deg,var(--border),var(--border2))'
      : 'linear-gradient(90deg,var(--accent),var(--accent3))'

  return (
    <div className="panel fade-up" style={{ marginTop: '16px' }}>
      <div style={{ height: '3px', background: accentLine }} />

      {/* Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ fontSize: '20px' }}>
            ODA {roomNo}
            {isPrivateBath && <span style={{ marginLeft: '8px', fontSize: '14px' }}>🚿🚽</span>}
            <span style={{ marginLeft: '10px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', verticalAlign: 'middle', letterSpacing: '1px' }}>
              {block} · KAT {floor} · {side}
            </span>
          </div>
          {room && (
            <div className="panel-subtitle">
              {room.occupied || 0}/{room.active_beds || room.capacity} KİŞİ
              {isPrivateBath ? ' · ÖZEL BANYO + TUVALET' : ' · ORTAK BANYO/WC'}
              {noClean && ' · ⊘ TEMİZLİK İSTEMİYOR'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {done    && <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ TEMİZLENDİ</span>}
          {skipped && <span className="badge badge-gray"  style={{ fontSize: '11px' }}>⊘ ATLANDI</span>}
          {!done && !skipped && task && <span className="badge badge-blue" style={{ fontSize: '11px' }}>○ BEKLİYOR</span>}
          {!task  && <span className="badge badge-gray"  style={{ fontSize: '11px' }}>— GÖREV YOK</span>}
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', borderTop: '1px solid var(--border)' }}>

        {/* ── LEFT: Checklist + Actions ── */}
        <div style={{ padding: '18px 20px', borderRight: '1px solid var(--border)' }}>

          {/* Room note - editable */}
          {room && (
            <div style={{ background: 'rgba(240,165,0,.07)', border: '1px solid rgba(240,165,0,.2)', borderRadius: '7px', padding: '10px 13px', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--accent)', letterSpacing: '2px', marginBottom: '6px' }}>ODA NOTU</div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Bu oda hakkında not ekleyin..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                style={{ marginBottom: '6px', fontSize: '12px', background: 'rgba(0,0,0,.15)', border: '1px solid rgba(240,165,0,.15)' }}
              />
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => mutNotes.mutate(noteText)}
                  disabled={mutNotes.isPending || noteText === (room.notes || '')}
                  style={{ fontSize: '9px' }}
                >
                  {mutNotes.isPending ? '...' : '✎ NOTU KAYDET'}
                </button>
                {noteText && noteText !== (room.notes || '') && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setNoteText(room.notes || '')} style={{ fontSize: '9px' }}>İPTAL</button>
                )}
                {mutNotes.isSuccess && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)' }}>Kaydedildi</span>
                )}
              </div>
            </div>
          )}

          {/* no_clean toggle */}
          {room && (
            <div
              onClick={() => !mutNoClean.isPending && mutNoClean.mutate(!noClean)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                padding: '9px 12px', borderRadius: '7px', marginBottom: '16px',
                background: noClean ? 'rgba(61,78,106,.18)' : 'var(--surface2)',
                border: `1px solid ${noClean ? 'var(--border2)' : 'var(--border)'}`,
                transition: 'all .15s', opacity: mutNoClean.isPending ? 0.6 : 1,
              }}
            >
              {/* Toggle switch visual */}
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                background: noClean ? 'var(--border2)' : 'var(--surface3)',
                border: '1px solid var(--border2)', position: 'relative', transition: 'background .2s',
              }}>
                <div style={{
                  position: 'absolute', top: '3px',
                  left: noClean ? '17px' : '3px',
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: noClean ? 'var(--text2)' : 'var(--text4)',
                  transition: 'left .2s',
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: noClean ? 'var(--text2)' : 'var(--text3)', letterSpacing: '0.5px' }}>
                  Bu oda temizlik istemiyor
                </div>
                {noClean && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '2px' }}>Görevler yine de oluşturulur, atlanabilir</div>}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: noClean ? 'var(--text2)' : 'var(--text4)' }}>
                {noClean ? 'AKTİF' : 'PASİF'}
              </span>
            </div>
          )}

          {/* Checklist header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>
              TEMİZLİK KONTROLLİSTESİ
              {isPrivateBath && <span style={{ marginLeft: '6px', color: 'var(--teal)' }}>· ÖZEL BANYO + TUVALET</span>}
            </div>
            {!done && !skipped && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-xs" onClick={selectAll}>Tümü</button>
                <button className="btn btn-ghost btn-xs" onClick={clearAll}>Temizle</button>
              </div>
            )}
          </div>

          {/* Checklist items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
            {visibleChecklist.map(item => {
              const checked    = checkedItems.has(item.id)
              const isReadOnly = done || skipped
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 11px', borderRadius: '7px',
                    cursor: isReadOnly ? 'default' : 'pointer',
                    background: checked ? 'rgba(39,201,106,.1)' : 'var(--surface2)',
                    border: `1px solid ${checked ? 'rgba(39,201,106,.3)' : 'var(--border)'}`,
                    opacity: isReadOnly && !checked ? 0.35 : 1,
                    transition: 'all .12s',
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                    background: checked ? 'var(--green)' : 'transparent',
                    border: `2px solid ${checked ? 'var(--green)' : 'var(--border2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .12s',
                  }}>
                    {checked && <span style={{ fontSize: '10px', color: '#000', fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: '12px' }}>{item.icon}</span>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '12.5px', color: checked ? 'var(--text)' : 'var(--text2)', flex: 1 }}>
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Progress */}
          {!done && !skipped && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>KONTROL LİSTESİ</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: checkedCount === visibleChecklist.length ? 'var(--green)' : 'var(--text3)' }}>
                  {checkedCount}/{visibleChecklist.length}
                </span>
              </div>
              <div className="prog-bar">
                <div className={`prog-fill ${checkedCount === visibleChecklist.length ? 'prog-green' : 'prog-amber'}`}
                  style={{ width: `${(checkedCount / visibleChecklist.length) * 100}%` }} />
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          {!task && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '8px 0', textAlign: 'center' }}>
              Bu kat için görev oluşturulmamış.
            </div>
          )}

          {task && done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {task.checklist && (() => {
                try {
                  const saved = JSON.parse(task.checklist)
                  if (!saved.length) return null
                  return (
                    <div style={{ background: 'rgba(39,201,106,.07)', border: '1px solid rgba(39,201,106,.2)', borderRadius: '6px', padding: '8px 12px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)', letterSpacing: '1px', marginBottom: '5px' }}>TAMAMLANAN İŞLER</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {saved.map(id => {
                          const item = CHECKLIST_ITEMS.find(i => i.id === id)
                          return item ? (
                            <span key={id} style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)', background: 'rgba(39,201,106,.12)', borderRadius: '4px', padding: '2px 7px' }}>
                              {item.icon} {item.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    </div>
                  )
                } catch { return null }
              })()}
              {task.assignee_name && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  ✓ {task.assignee_name} · {new Date(task.completed_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onUncomplete(task.id)}>
                ↩ TEMİZLİĞİ GERİ AL
              </button>
            </div>
          )}

          {task && skipped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: 'rgba(61,78,106,.15)', border: '1px solid var(--border2)', borderRadius: '7px', padding: '10px 13px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>ATLANMA SEBEBİ</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{task.skip_reason || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onSkip(task.id, null, true)}>
                  ↩ ATLAMAYI GERİ AL
                </button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onComplete(task.id, [...checkedItems])}>
                  ✓ Yine de Tamamla
                </button>
              </div>
            </div>
          )}

          {task && !done && !skipped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', padding: '10px' }}
                onClick={() => onComplete(task.id, [...checkedItems])}
              >
                ✓ TEMİZLİK TAMAMLANDI
                {checkedCount > 0 && <span style={{ opacity: 0.75, marginLeft: '6px', fontSize: '9px' }}>({checkedCount} madde)</span>}
              </button>
              {!showSkip ? (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => setShowSkip(true)}>
                  ⊘ BU ODAYI ATLA
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '2px' }}>ATLANMA SEBEBİ</div>
                  <select className="form-select" value={skipReason} onChange={e => setSkipReason(e.target.value)}>
                    <option value="">Seçin...</option>
                    {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                      onClick={() => { onSkip(task.id, skipReason); setShowSkip(false) }}
                      disabled={!skipReason}>
                      ⊘ Atla
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(false)}>İptal</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Occupants + Faults ── */}
        <div style={{ padding: '18px 20px' }}>

          {/* Occupants */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ODADAKI KİŞİLER
              {!detailLoading && (
                <span style={{ background: 'var(--surface3)', color: 'var(--text2)', borderRadius: '10px', padding: '1px 7px', fontSize: '9px', fontFamily: 'var(--mono)' }}>
                  {details?.personnel?.length || 0}
                </span>
              )}
            </div>
            {detailLoading ? (
              <SkeletonTable rows={2} cols={3} />
            ) : !details?.personnel?.length ? (
              <div style={{ padding: '10px 12px', borderRadius: '7px', background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>
                Odada kimse yok
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {details.personnel.map((p, i) => (
                  <div key={p.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 11px', borderRadius: '7px',
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                      background: p.shift_type === 'night' ? 'rgba(99,102,241,.25)' : 'rgba(240,165,0,.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--display)', fontSize: '11px',
                      color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)',
                    }}>
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.full_name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '1px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {p.company && <span>{p.company}</span>}
                        {p.phone_number && <span style={{ color: 'var(--teal)' }}>📞 {p.phone_number}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', background: 'var(--surface3)', borderRadius: '3px', padding: '1px 5px' }}>
                        YATAK {p.bed_no}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                        {p.shift_type === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginBottom: '14px' }} />

          {/* Faults header */}
          {(() => {
            const openFaults = faults.filter(f => f.status !== 'done')
            const closedFaults = faults.filter(f => f.status === 'done')
            return (<>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>ARIZALAR</div>
                {openFaults.length > 0 && (
                  <span style={{ background: 'var(--red)', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700 }}>
                    {openFaults.length} açık
                  </span>
                )}
              </div>

              {detailLoading ? (
                <SkeletonTable rows={2} cols={3} />
              ) : faults.length === 0 ? (
                <div style={{ padding: '12px', borderRadius: '7px', textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: '14px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>Arıza kaydı yok</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px', maxHeight: '340px', overflowY: 'auto' }}>
                  {faults.map(f => {
                    const isDone = f.status === 'done'
                    const borderColor = isDone ? 'rgba(39,201,106,.25)' : 'rgba(231,76,60,.2)'
                    const bgColor = isDone ? 'rgba(39,201,106,.04)' : 'rgba(231,76,60,.06)'
                    return (
                      <div key={f.id} style={{ padding: '10px 13px', borderRadius: '7px', background: bgColor, border: `1px solid ${borderColor}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span className={`badge badge-${isDone ? 'green' : f.status === 'open' ? 'red' : 'amber'}`} style={{ fontSize: '8px', padding: '1px 6px' }}>
                            {isDone ? 'KAPANDI' : f.status === 'open' ? 'YENİ' : 'İŞLEMDE'}
                          </span>
                          {f.priority && (
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: '7px', padding: '1px 4px', borderRadius: '3px',
                              color: f.priority === 'high' ? 'var(--red)' : f.priority === 'medium' ? 'var(--accent)' : 'var(--blue)',
                              background: f.priority === 'high' ? 'rgba(231,76,60,.1)' : f.priority === 'medium' ? 'rgba(240,165,0,.1)' : 'rgba(59,140,240,.1)',
                            }}>
                              {f.priority === 'high' ? 'YÜKSEK' : f.priority === 'medium' ? 'ORTA' : 'DÜŞÜK'}
                            </span>
                          )}
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>
                            #{f.id} · {new Date(f.opened_at).toLocaleDateString('tr-TR')}
                            {isDone && f.closed_at && ` → ${new Date(f.closed_at).toLocaleDateString('tr-TR')}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.4 }}>{f.description}</div>
                        {/* Before / After photos */}
                        {(f.photo_before || f.photo_url) && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {f.photo_before && (
                              <div style={{ flex: 1, minWidth: '80px' }}>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--red)', letterSpacing: '1px', marginBottom: '3px' }}>ÖNCE</div>
                                <img loading="lazy" src={f.photo_before} alt="" style={{ width: '100%', maxHeight: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                              </div>
                            )}
                            {f.photo_url && (
                              <div style={{ flex: 1, minWidth: '80px' }}>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--green)', letterSpacing: '1px', marginBottom: '3px' }}>SONRA</div>
                                <img loading="lazy" src={f.photo_url} alt="" style={{ width: '100%', maxHeight: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>)
          })()}

          {/* Report fault */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>ARIZA BİLDİR</div>
          {faultSent ? (
            <div className="alert alert-success" style={{ margin: 0 }}>
              <span>✓</span>
              <div>
                <div style={{ fontWeight: 600 }}>Arıza teknik servise iletildi</div>
                <button className="btn btn-ghost btn-xs" style={{ marginTop: '6px' }}
                  onClick={() => setFaultSent(false)}>+ Yeni arıza bildir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', padding: '5px 10px', background: 'var(--surface2)', borderRadius: '5px', border: '1px solid var(--border)' }}>
                📍 {block} Kat {floor} Oda {roomNo}
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Arızayı kısaca açıklayın..."
                value={faultDesc}
                onChange={e => setFaultDesc(e.target.value)}
                style={{ minHeight: '56px' }}
              />
              {/* Priority */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { key: 'high', label: 'YÜKSEK', color: 'var(--red)' },
                  { key: 'medium', label: 'ORTA', color: 'var(--accent)' },
                  { key: 'low', label: 'DÜŞÜK', color: 'var(--blue)' },
                ].map(p => (
                  <button key={p.key} type="button" onClick={() => setFaultPriority(p.key)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '5px', cursor: 'pointer',
                      border: faultPriority === p.key ? `2px solid ${p.color}` : '1px solid var(--border)',
                      background: faultPriority === p.key ? `color-mix(in srgb, ${p.color} 12%, transparent)` : 'transparent',
                      color: faultPriority === p.key ? p.color : 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                      transition: 'all .1s',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Camera / Photo */}
              {faultPreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img loading="lazy" src={faultPreview} alt="" style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '6px', border: '1px solid var(--border)', objectFit: 'cover' }} />
                  <button onClick={clearFaultPhoto} style={{
                    position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '50%',
                    background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={() => faultCameraRef.current?.click()} style={{
                    flex: 1, padding: '10px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: '1px dashed var(--border)', background: 'rgba(15,23,42,.3)',
                    color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontFamily: 'var(--mono)', fontSize: '9px', transition: 'all .1s',
                  }}>
                    📷 KAMERA
                  </button>
                  <button type="button" onClick={() => faultFileRef.current?.click()} style={{
                    flex: 1, padding: '10px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: '1px dashed var(--border)', background: 'rgba(15,23,42,.3)',
                    color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontFamily: 'var(--mono)', fontSize: '9px', transition: 'all .1s',
                  }}>
                    📁 DOSYA
                  </button>
                  <input ref={faultCameraRef} type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={e => handleFaultPhoto(e.target.files?.[0])} />
                  <input ref={faultFileRef} type="file" accept="image/*"
                    style={{ display: 'none' }} onChange={e => handleFaultPhoto(e.target.files?.[0])} />
                </div>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => mutFault.mutate()}
                disabled={mutFault.isPending || !faultDesc.trim()}
                style={{ opacity: (mutFault.isPending || !faultDesc.trim()) ? 0.5 : 1 }}
              >
                {mutFault.isPending ? 'GÖNDERİLİYOR...' : '⚙ ARIZA BİLDİR'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Corridor grid ─────────────────────────────────────────────────────────────
function BlockFloorView({ block, floor, tasks, dndRooms, blockRooms, selectedRoomNo, onSelect }) {
  const isM  = BLOCK_BY_NAME[block]?.type === 'M'
  const isS2Floor2 = block === 'S2' && floor === 2

  const roomTaskMap = {}
  tasks
    .filter(t => t.block === block && t.floor === floor && t.task_type === 'room')
    .forEach(t => {
      const rno = roomNoFromQr(t.qr_location)
      if (rno) roomTaskMap[rno] = t
    })

  const roomInfoMap = {}
  blockRooms.filter(r => r.floor === floor).forEach(r => { roomInfoMap[r.room_no] = r })

  const floorDnd = dndRooms.filter(r => r.block === block && r.floor === floor)
  const dndSet = new Set(floorDnd.filter(r => r.occupied_count > 0).map(r => r.room_no))
  const dndMap = {}
  floorDnd.forEach(r => { dndMap[r.room_no] = r })

  const allRoomNos  = expectedRoomNosFromConfig(block, floor).map(n => String(n))
  const roomTasks   = Object.values(roomTaskMap)
  const doneTasks   = roomTasks.filter(t => t.completed_at)
  const skippedTasks = roomTasks.filter(t => t.skipped)
  const pct         = roomTasks.length > 0 ? Math.round((doneTasks.length / roomTasks.length) * 100) : 0

  const oddNos  = allRoomNos.filter(n => Number(n) % 2 !== 0)
  const evenNos = allRoomNos.filter(n => Number(n) % 2 === 0)

  const legend = [
    { stripe: 'var(--green)',   label: 'TEMİZLENDİ' },
    { stripe: 'var(--blue)',    label: 'BEKLİYOR' },
    { stripe: 'var(--accent)',  label: 'DND' },
    { stripe: 'var(--border2)', label: 'ATLANDI' },
    { stripe: 'transparent',    label: 'GÖREV YOK' },
    { stripe: 'var(--red)',      label: 'ARIZA VAR', isFault: true },
  ]

  return (
    <div>
      {/* Stats + legend */}
      {roomTasks.length > 0 && (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
          {legend.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {l.isFault ? (
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#fff', fontWeight: 700 }}>!</div>
              ) : (
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', borderTop: `3px solid ${l.stripe}`, background: 'var(--surface2)', border: '1px solid var(--border)', borderTopColor: l.stripe }} />
              )}
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text3)' }}>{l.label}</span>
            </div>
          ))}
          {!isM && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>🚿</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--teal)' }}>ÖZEL BANYO + TUVALET</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
            {doneTasks.length}/{roomTasks.length}
            {skippedTasks.length > 0 && ` · ${skippedTasks.length} atlandı`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '80px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct===100 ? 'var(--green)' : 'var(--accent)', transition: 'width .5s' }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pct===100 ? 'var(--green)' : 'var(--accent)' }}>%{pct}</span>
          </div>
        </div>
      )}

      {dndSet.size > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: '10px' }}>
          <span>🚫</span>
          <div>
            <strong>{dndSet.size} oda DND</strong>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px' }}>
              ☾ Gece vardiyası uyuyor: {floorDnd.map(r => r.room_no).sort().join(', ')}
            </div>
            {floorDnd.some(r => r.occupied_count === 0) && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px', color: 'var(--green)' }}>
                ✓ Boş odalar (temizlenebilir): {floorDnd.filter(r => r.occupied_count === 0).map(r => r.room_no).sort().join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {roomTasks.length === 0 ? (
        <div className="empty-state" style={{ padding: '20px 0' }}>
          <div className="empty-icon" style={{ fontSize: '28px' }}>◈</div>
          <div className="empty-sub">Görev yok — "Görev Oluştur" butonuna basın</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
          <div style={{ minWidth: 'max-content', userSelect: 'none' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '52px' }}>GİRİŞ →</div>
            {/* SOL — odd */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <div style={{ width: '44px', flexShrink: 0, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', lineHeight: 1.6 }}>SOL<br/>TEK</div>
              {isM && <FacilityCell type="BANYO" />}
              <div style={{ display: 'flex', gap: '3px' }}>
                {oddNos.map(n => {
                  const hasRoom = !!roomInfoMap[n]
                  const hasTask = !!roomTaskMap[n]
                  if (!hasRoom && !hasTask) return <GhostTile key={n} rno={n} />
                  return (
                    <RoomTile key={n} rno={n} task={roomTaskMap[n]} roomInfo={roomInfoMap[n]}
                      isDnd={dndSet.has(n)} dndInfo={dndMap[n]} isM={isM} isS2Floor2={isS2Floor2}
                      selected={selectedRoomNo === n} onSelect={onSelect}
                      faultCount={roomInfoMap[n]?.open_fault_count || 0} />
                  )
                })}
              </div>
              {isM && <FacilityCell type="WC" />}
            </div>
            {/* Corridor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '24px', margin: '4px 0' }}>
              <div style={{ width: '44px', flexShrink: 0 }} />
              {isM && (
                <div style={{ width: '34px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.12)', border: '1px solid rgba(26,188,156,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.12)', border: '1px solid rgba(59,140,240,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                </div>
              )}
              <div style={{ flex: 1, height: '100%', background: 'linear-gradient(90deg,rgba(0,0,0,.25),rgba(35,45,63,.4),rgba(0,0,0,.25))', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '6px' }}>KORİDOR</span>
              </div>
              {isM && (
                <div style={{ width: '34px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.12)', border: '1px solid rgba(59,140,240,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.12)', border: '1px solid rgba(26,188,156,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                </div>
              )}
            </div>
            {/* SAĞ — even */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              <div style={{ width: '44px', flexShrink: 0, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', lineHeight: 1.6 }}>SAĞ<br/>ÇİFT</div>
              {isM && <FacilityCell type="WC" />}
              <div style={{ display: 'flex', gap: '3px' }}>
                {evenNos.map(n => {
                  const hasRoom = !!roomInfoMap[n]
                  const hasTask = !!roomTaskMap[n]
                  if (!hasRoom && !hasTask) return <GhostTile key={n} rno={n} />
                  return (
                    <RoomTile key={n} rno={n} task={roomTaskMap[n]} roomInfo={roomInfoMap[n]}
                      isDnd={dndSet.has(n)} dndInfo={dndMap[n]} isM={isM} isS2Floor2={isS2Floor2}
                      selected={selectedRoomNo === n} onSelect={onSelect}
                      faultCount={roomInfoMap[n]?.open_fault_count || 0} />
                  )
                })}
              </div>
              {isM && <FacilityCell type="BANYO" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function HousekeepingPage() {
  const qc = useQueryClient()
  const [blockType, setBlockType]   = useState('M')
  const [block, setBlock]           = useState('M1')
  const [floor, setFloor]           = useState(1)
  const [selectedRoomNo, setSelected] = useState(null)
  const [uncleanedOnly, setUncleanedOnly] = useState(false)

  const cfg = BLOCK_BY_NAME[block]
  const isM = cfg?.type === 'M'

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['cleaning-tasks', TODAY, uncleanedOnly],
    queryFn: () => api.get(`/housekeeping/tasks?date=${TODAY}${uncleanedOnly ? '&uncleaned=true' : ''}`).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: dndRooms = [] } = useQuery({
    queryKey: ['dnd-rooms'],
    queryFn: () => api.get('/housekeeping/dnd-rooms').then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: blockRooms = [] } = useQuery({
    queryKey: ['capacity-rooms', block],
    queryFn: () => api.get(`/capacity/rooms?block=${block}`).then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: allStaff = [] } = useQuery({
    queryKey: ['cleaning-staff'],
    queryFn: () => api.get('/housekeeping/staff').then(r => r.data),
  })

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editBlock, setEditBlock] = useState('')
  const [editFloor, setEditFloor] = useState(1)

  const invStaff = () => qc.invalidateQueries({ queryKey: ['cleaning-staff'] })

  const createStaff = useMutation({
    mutationFn: (data) => api.post('/housekeeping/staff', data),
    onSuccess: () => { invStaff(); setShowStaffForm(false); setStaffName(''); setStaffPhone('') },
  })
  const updateStaff = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/housekeeping/staff/${id}`, data),
    onSuccess: () => { invStaff(); setEditingStaffId(null) },
  })
  const deleteStaff = useMutation({
    mutationFn: (id) => api.delete(`/housekeeping/staff/${id}`),
    onSuccess: invStaff,
  })

  const floorStaff = allStaff.filter(s => s.assigned_block === block && s.assigned_floor === floor)
  const unassignedStaff = allStaff.filter(s => !s.assigned_block)

  const inv = () => qc.invalidateQueries({ queryKey: ['cleaning-tasks'] })

  const generateTasks = useMutation({ mutationFn: () => api.post('/housekeeping/tasks/generate-daily'), onSuccess: inv })

  // Optimistic update yardımcısı: cache'deki cleaning-tasks listelerini in-place günceller,
  // hata olursa snapshot ile geri alır. Mutation pending iken UI anında tepki verir.
  const optimisticTaskUpdate = (updater) => ({
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['cleaning-tasks'] })
      const snapshots = qc.getQueriesData({ queryKey: ['cleaning-tasks'] })
      qc.setQueriesData({ queryKey: ['cleaning-tasks'] }, (old) => {
        if (!Array.isArray(old)) return old
        return old.map(t => updater(t, vars))
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshots) for (const [key, val] of ctx.snapshots) qc.setQueryData(key, val)
    },
    onSettled: inv,
  })

  const completeTask = useMutation({
    mutationFn: ({ id, checklist }) => api.post(`/housekeeping/tasks/${id}/complete`, { checklist }),
    ...optimisticTaskUpdate((t, vars) =>
      t.id === vars.id ? { ...t, completed_at: new Date().toISOString(), skipped: 0 } : t
    ),
    onSuccess: () => setSelected(null),
  })

  const uncompleteTask = useMutation({
    mutationFn: (id) => api.patch(`/housekeeping/tasks/${id}/uncomplete`),
    ...optimisticTaskUpdate((t, id) =>
      t.id === id ? { ...t, completed_at: null } : t
    ),
  })

  const skipTask = useMutation({
    mutationFn: ({ id, reason, undo }) => undo
      ? api.patch(`/housekeeping/tasks/${id}/unskip`)
      : api.patch(`/housekeeping/tasks/${id}/skip`, { reason }),
    ...optimisticTaskUpdate((t, vars) =>
      t.id === vars.id
        ? { ...t, skipped: vars.undo ? 0 : 1, skip_reason: vars.undo ? null : vars.reason }
        : t
    ),
  })

  const completeFloor = useMutation({
    mutationFn: () => api.post('/housekeeping/tasks/complete-floor', { block, floor: String(floor), date: TODAY }),
    onSuccess: inv,
  })

  const blockFloorTasks = tasks.filter(t => t.block === block && t.floor === floor)
  const bDone    = blockFloorTasks.filter(t => t.completed_at).length
  const bSkipped = blockFloorTasks.filter(t => t.skipped).length
  const bTotal   = blockFloorTasks.length
  const allDone  = bTotal > 0 && (bDone + bSkipped) === bTotal

  const selectedTask = selectedRoomNo
    ? tasks.find(t => t.block === block && t.floor === floor && t.task_type === 'room' && roomNoFromQr(t.qr_location) === selectedRoomNo)
    : null

  const commonTask = isM
    ? tasks.find(t => t.block === block && t.floor === floor && t.task_type === 'common_area')
    : null

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '4px', color: 'var(--text)' }}>
            HOUSEKEEPING<HelpHint topic="housekeeping" title="TEMİZLİK" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            GÜNLÜK TEMİZLİK YÖNETİMİ
          </p>
        </div>
        {dndRooms.length > 0 && <span className="badge badge-amber">🚫 {dndRooms.length} DND ODA</span>}
      </div>

      {/* Progress */}
      {isLoading
        ? <SkeletonTable rows={4} cols={5} />
        : <ProgressStrip tasks={tasks} onGenerate={() => generateTasks.mutate()} generating={generateTasks.isPending} />
      }

      {/* Block type switcher (M / S / Y) + Block + Floor selectors */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: '8px',
          padding: '3px', border: '1px solid var(--border)',
        }}>
          {['M', 'S', 'Y'].map(t => (
            <button
              key={t}
              onClick={() => {
                setBlockType(t)
                const firstBlock = BLOCKS_BY_TYPE[t][0]
                setBlock(firstBlock)
                setFloor(1)
                setSelected(null)
              }}
              style={{
                padding: '6px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--display)', fontSize: '13px', fontWeight: 700, letterSpacing: '2px',
                transition: 'all 0.15s',
                background: blockType === t ? 'var(--accent)' : 'transparent',
                color: blockType === t ? '#000' : 'var(--text2)',
              }}
            >
              {t} BLOK
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {BLOCKS_BY_TYPE[blockType].map(b => {
            const bT  = tasks.filter(t => t.block === b)
            const bD  = bT.filter(t => t.completed_at).length
            const bSk = bT.filter(t => t.skipped).length
            const ok  = bT.length > 0 && (bD + bSk) === bT.length
            return (
              <button key={b}
                onClick={() => { setBlock(b); setFloor(1); setSelected(null) }}
                className={`filter-chip${block === b ? ' active' : ''}`}
                style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>
                {b}{ok && <span style={{ marginLeft: '4px', fontSize: '9px', color: 'var(--green)' }}>✓</span>}
              </button>
            )
          })}
        </div>
        {(() => {
          const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
          if (floorList.length <= 1) return null
          return (
            <div style={{ display: 'flex', gap: '5px' }}>
              {floorList.map(f => (
                <button key={f} onClick={() => { setFloor(f); setSelected(null) }}
                  className={`filter-chip${floor === f ? ' active' : ''}`}>
                  KAT {f}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
                    {getFloorLabel(block, f)}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
        <button
          onClick={() => setUncleanedOnly(v => !v)}
          className={`filter-chip${uncleanedOnly ? ' active' : ''}`}
          style={{ background: uncleanedOnly ? 'var(--red)' : undefined, borderColor: uncleanedOnly ? 'var(--red)' : undefined, color: uncleanedOnly ? '#fff' : undefined }}
        >
          {uncleanedOnly ? '✓ ' : ''}Temizlenmemiş
        </button>
        {/* Task stats summary */}
        {tasks.length > 0 && (() => {
          const done = tasks.filter(t => t.completed_at).length
          const skipped = tasks.filter(t => t.skipped).length
          const pending = tasks.length - done - skipped
          const pct = Math.round((done / tasks.length) * 100)
          return (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '8px' }}>
              <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', borderRadius: '3px', transition: 'width .4s' }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                %{pct} · {done}✓ {pending > 0 ? `${pending}◻` : ''} {skipped > 0 ? `${skipped}⊘` : ''}
              </span>
            </div>
          )
        })()}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {bTotal > 0 && (
            <>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: allDone ? 'var(--green)' : 'var(--text3)' }}>
                {bDone}/{bTotal}{bSkipped > 0 && ` · ${bSkipped} atlandı`}
              </span>
              {!allDone
                ? <button className="btn btn-primary btn-sm" onClick={() => completeFloor.mutate()} disabled={completeFloor.isPending}>
                    {completeFloor.isPending ? '...' : '✓ KATI TAMAMLA'}
                  </button>
                : <span className="badge badge-green">✓ KAT TAMAM</span>
              }
            </>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="panel">
        <div style={{ height: '2px', background: isM ? 'linear-gradient(90deg,var(--blue),var(--purple))' : 'linear-gradient(90deg,var(--purple),var(--teal))' }} />
        <div className="panel-header">
          <div>
            <div className="panel-title">{block} BLOK — KAT {floor}</div>
            <div className="panel-subtitle">
              {isM
                ? `ORTAK ALANLAR + ODA TEMİZLİĞİ · ${floor===1?'ODA 101–130':'ODA 201–230'}`
                : `ODA TEMİZLİĞİ · 🚿 HER ODADA ÖZEL BANYO + TUVALET · ${floor===1?'ODA 101–124':'ODA 201–224'}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className={`tag tag-${isM ? 'm' : 's'}`}>{isM ? 'M' : 'S'}</span>
            {!isM && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--teal)', background: 'rgba(26,188,156,.1)', border: '1px solid rgba(26,188,156,.3)', borderRadius: '4px', padding: '2px 7px' }}>🚿 ÖZEL BANYO</span>}
            {block === 'S2' && floor === 2 && <span className="tag tag-exc">4K</span>}
            {selectedRoomNo && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', letterSpacing: '1px' }}>ODA {selectedRoomNo} SEÇİLİ</span>}
          </div>
        </div>
        {/* Floor staff section */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: floorStaff.length > 0 || showStaffForm ? '10px' : '0' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>
              TEMİZLİK PERSONELİ
              {floorStaff.length > 0 && <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>· {floorStaff.length} KİŞİ</span>}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowStaffForm(!showStaffForm)}>
              {showStaffForm ? '✕ KAPAT' : '+ PERSONEL EKLE'}
            </button>
          </div>

          {/* Inline add form */}
          {showStaffForm && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>AD SOYAD</label>
                <input className="form-input" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Ad Soyad" style={{ fontSize: '12px' }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>TELEFON</label>
                <input className="form-input" value={staffPhone} onChange={e => setStaffPhone(e.target.value)} placeholder="05XX..." style={{ fontSize: '12px' }} />
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button className="btn btn-primary btn-xs" disabled={!staffName.trim() || createStaff.isPending}
                  onClick={() => createStaff.mutate({ full_name: staffName.trim(), phone: staffPhone.trim() })}>
                  {createStaff.isPending ? '...' : 'KAYDET'}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => { setShowStaffForm(false); setStaffName(''); setStaffPhone('') }}>İPTAL</button>
              </div>
            </div>
          )}

          {/* Staff list for this floor */}
          {floorStaff.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {floorStaff.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px',
                }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--accent),var(--purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
                  }}>{s.full_name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{s.full_name}</div>
                    {s.phone && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{s.phone}</div>}
                  </div>
                  {editingStaffId === s.id ? (
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <select className="form-select" value={editBlock} onChange={e => setEditBlock(e.target.value)} style={{ width: '65px', fontSize: '11px' }}>
                        <option value="">—</option>
                        {ALL_BLOCK_NAMES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <select className="form-select" value={editFloor} onChange={e => setEditFloor(+e.target.value)} style={{ width: '72px', fontSize: '11px' }}>
                        {Array.from({ length: BLOCK_BY_NAME[editBlock]?.floors ?? 2 }, (_, i) => i + 1).map(f => (
                          <option key={f} value={f}>Kat {f}</option>
                        ))}
                      </select>
                      <button className="btn btn-primary btn-xs" disabled={updateStaff.isPending}
                        onClick={() => updateStaff.mutate({ id: s.id, assigned_block: editBlock || null, assigned_floor: editBlock ? editFloor : null })}>
                        {updateStaff.isPending ? '...' : '✓'}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingStaffId(null)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 7px', background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.3)', borderRadius: '4px', color: 'var(--accent)' }}>
                        {s.assigned_block} · KAT {s.assigned_floor}
                      </span>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditingStaffId(s.id); setEditBlock(s.assigned_block || ''); setEditFloor(s.assigned_floor || 1) }} title="Düzenle">✎</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => deleteStaff.mutate(s.id)} title="Kaldır" style={{ color: 'var(--red)' }}>✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Unassigned staff quick-assign */}
          {unassignedStaff.length > 0 && (
            <div style={{ marginTop: floorStaff.length > 0 ? '8px' : '0' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1.5px', marginBottom: '6px' }}>
                ATANMAMIŞ PERSONEL — tıklayarak bu kata ata
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {unassignedStaff.map(s => (
                  <button key={s.id} className="btn btn-ghost btn-xs"
                    style={{ fontSize: '10px', border: '1px dashed var(--border2)', borderRadius: '6px', padding: '4px 10px' }}
                    disabled={updateStaff.isPending}
                    onClick={() => updateStaff.mutate({ id: s.id, assigned_block: block, assigned_floor: floor })}>
                    + {s.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {floorStaff.length === 0 && !showStaffForm && unassignedStaff.length === 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '4px 0' }}>
              Bu kata henüz personel atanmamış
            </div>
          )}
        </div>

        <div className="panel-body">
          {isM && (
            <OrtakAlanCard
              task={commonTask}
              onComplete={(id, cl) => completeTask.mutate({ id, checklist: cl })}
              onUncomplete={(id) => uncompleteTask.mutate(id)}
              onSkip={(id, reason, undo) => skipTask.mutate({ id, reason, undo })}
            />
          )}
          {!isLoading && (
            <BlockFloorView
              key={`${block}-${floor}`}
              block={block} floor={floor}
              tasks={tasks} dndRooms={dndRooms} blockRooms={blockRooms}
              selectedRoomNo={selectedRoomNo} onSelect={setSelected}
            />
          )}
        </div>
      </div>

      {/* Room detail panel */}
      {selectedRoomNo && (
        <RoomDetailPanel
          key={`${block}-${floor}-${selectedRoomNo}`}
          block={block} floor={floor} roomNo={selectedRoomNo}
          task={selectedTask} isPrivateBath={!isM}
          onComplete={(id, cl) => completeTask.mutate({ id, checklist: cl })}
          onUncomplete={(id) => uncompleteTask.mutate(id)}
          onSkip={(id, reason, undo) => skipTask.mutate({ id, reason, undo })}
          onClose={() => setSelected(null)}
          onInvalidateRooms={() => qc.invalidateQueries(['capacity-rooms', block])}
        />
      )}
    </div>
  )
}
