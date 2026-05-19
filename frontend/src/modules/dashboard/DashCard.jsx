import { card, cardHead, cardTitle, cardBody } from './dashStyles.js'

export default function DashCard({ title, action, children, bodyStyle, style, headStyle }) {
  return (
    <div style={{ ...card, ...style }}>
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
