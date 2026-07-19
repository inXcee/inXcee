// Koridor grid'inde tek bir oda kutucuğu. Saf presentational — tüm görsel durum
// (temiz/atlandı/DND/temizlik-yok/bekliyor/görev-yok) priority sırasıyla hesaplanır.
// State priority: done > skipped > DND > noClean > pending > noTask

export default function RoomTile({ rno, task, roomInfo, isDnd, dndInfo, isM, isS2Floor2, selected, onSelect, faultCount }) {
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
      {task?.photo_url && (
        <div style={{
          position: 'absolute', top: '6px', right: hasNote ? '12px' : '4px',
          fontSize: '8px', lineHeight: 1, padding: '2px', borderRadius: '3px',
          background: 'rgba(39,201,106,.2)', color: 'var(--green)',
        }} title="Temizlik kanıt fotoğrafı var">📷</div>
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
