// Dashboard tasarım tokenları — soft elevation + güçlü tipografi
// Tek noktadan stil yönetimi (inline-style projesi olduğu için JS obje).

// Yumuşak gölge — neon yok, sadece derinlik
export const cardShadow = '0 1px 2px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.12)'
export const cardShadowHover = '0 2px 4px rgba(0,0,0,.22), 0 8px 24px rgba(0,0,0,.20)'

export const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  overflow: 'hidden',
  boxShadow: cardShadow,
  transition: 'transform .18s ease, box-shadow .18s ease',
}

export const cardHead = {
  padding: '18px 22px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderBottom: '1px solid var(--border)',
}

export const cardTitle = {
  fontFamily: 'var(--sans)',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text)',
  letterSpacing: '-0.005em',
  textTransform: 'none',
}

export const cardBody = {
  padding: '16px 22px 20px',
}

// Büyük sayılar: tabular-nums + sıkı tracking + ağır weight
export const numBig = {
  fontFamily: 'var(--sans)',
  fontWeight: 700,
  fontSize: '34px',
  lineHeight: 1,
  color: 'var(--text)',
  letterSpacing: '-0.025em',
  fontVariantNumeric: 'tabular-nums',
}

export const numMid = {
  fontFamily: 'var(--sans)',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: 1,
  color: 'var(--text)',
  letterSpacing: '-0.015em',
  fontVariantNumeric: 'tabular-nums',
}

export const numSm = {
  fontFamily: 'var(--sans)',
  fontWeight: 600,
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
}

// Etiketler
export const label = {
  fontSize: '12px',
  color: 'var(--text2)',
  fontWeight: 500,
}

export const caption = {
  fontSize: '11px',
  color: 'var(--text3)',
  fontWeight: 400,
}

// Section başlık (gruplar arası ayırıcı)
export const sectionHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px',
  marginTop: '4px',
}

export const sectionTitle = {
  fontSize: '11px',
  color: 'var(--text3)',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

export const sectionLine = {
  flex: 1,
  height: '1px',
  background: 'var(--border)',
}
