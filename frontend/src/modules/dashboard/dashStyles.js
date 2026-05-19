// Dashboard sade tasarım tokenları — tek noktadan stil yönetimi
// Inline-style projesi olduğu için CSS class değil, JS objesi.

export const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
}

export const cardHead = {
  padding: '16px 20px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
}

export const cardTitle = {
  fontFamily: 'var(--sans)',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text)',
  letterSpacing: 0,
  textTransform: 'none',
}

export const cardBody = {
  padding: '4px 20px 20px',
}

// Sayılar — tek font, normal letter-spacing
export const num = {
  fontFamily: 'var(--sans)',
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1,
}

// Küçük etiket — sentence case, normal weight, küçük
export const muted = {
  fontFamily: 'var(--sans)',
  fontSize: '12px',
  color: 'var(--text2)',
  fontWeight: 400,
}

export const mutedSm = {
  fontFamily: 'var(--sans)',
  fontSize: '11px',
  color: 'var(--text3)',
  fontWeight: 400,
}

// Hücre kenarlığı (row separator) — daha yumuşak
export const rowDivider = '1px solid var(--border)'
