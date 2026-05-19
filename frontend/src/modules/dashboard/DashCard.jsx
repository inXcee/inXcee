import { useState } from 'react'
import { card, cardHead, cardTitle, cardBody, cardShadowHover } from './dashStyles.js'

export default function DashCard({ title, action, accent, children, bodyStyle, style, headStyle, interactive, onClick }) {
  const [hover, setHover] = useState(false)
  const clickable = !!onClick

  const composedStyle = {
    ...card,
    ...style,
    ...(clickable || interactive ? { cursor: 'pointer' } : null),
    ...(hover && (clickable || interactive)
      ? { transform: 'translateY(-1px)', boxShadow: cardShadowHover, borderColor: 'var(--border2)' }
      : null),
    position: 'relative',
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={composedStyle}
    >
      {accent && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px',
          background: accent, borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px',
        }} />
      )}
      {(title || action) && (
        <div style={{ ...cardHead, ...headStyle }}>
          {title && <div style={cardTitle}>{title}</div>}
          {action}
        </div>
      )}
      <div style={{ ...cardBody, ...bodyStyle }}>{children}</div>
    </div>
  )
}
