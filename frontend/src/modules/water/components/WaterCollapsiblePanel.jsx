import { forwardRef } from 'react'

const WaterCollapsiblePanel = forwardRef(function WaterCollapsiblePanel({
  id,
  open,
  onToggle,
  title,
  subtitle,
  headerLead,
  beforeToggle,
  afterToggle,
  openLabel = 'Aç',
  closeLabel = 'Gizle',
  className = 'panel',
  style,
  headerClassName = 'panel-header',
  headerStyle,
  children,
}, ref) {
  const bodyId = id ? `${id}-body` : undefined

  return (
    <div ref={ref} id={id} className={className || undefined} style={style}>
      <div
        className={headerClassName || undefined}
        style={{ alignItems: 'center', gap: '10px', ...headerStyle }}
      >
        {headerLead || (
          <div style={{ minWidth: 0 }}>
            <div className="panel-title">{title}</div>
            {subtitle != null && <div className="panel-subtitle">{subtitle}</div>}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {beforeToggle}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            {open ? `▲ ${closeLabel}` : `▼ ${openLabel}`}
          </button>
          {afterToggle}
        </div>
      </div>
      {open && <div id={bodyId} style={{ display: 'contents' }}>{children}</div>}
    </div>
  )
})

export default WaterCollapsiblePanel
