// ColorPatternPicker.jsx — çoklu renk + desen seçici bileşeni
// Kullanım: PremiumGarmentList, NewItemModal, PremiumIntakeModal

const COLOR_PALETTE = [
  { name: 'Beyaz',     hex: '#f0f0f0' },
  { name: 'Siyah',     hex: '#222222' },
  { name: 'Gri',       hex: '#888888' },
  { name: 'Füme',      hex: '#4a4a4a' },
  { name: 'Lacivert',  hex: '#1a2e5e' },
  { name: 'Mavi',      hex: '#2563eb' },
  { name: 'Açık Mavi', hex: '#7ec8e3' },
  { name: 'Kırmızı',   hex: '#dc2626' },
  { name: 'Yeşil',     hex: '#16a34a' },
  { name: 'Sarı',      hex: '#eab308' },
  { name: 'Turuncu',   hex: '#ea580c' },
  { name: 'Kahve',     hex: '#92400e' },
  { name: 'Bej',       hex: '#d4b896' },
  { name: 'Mor',       hex: '#7c3aed' },
  { name: 'Pembe',     hex: '#ec4899' },
]

const PATTERNS = [
  { name: 'Çizgili', icon: '▤' },
  { name: 'Kareli',  icon: '▦' },
  { name: 'Desenli', icon: '✦' },
  { name: 'Renkli',  icon: '◈' },
]

// ── Yardımcı exportlar ────────────────────────────────────────────────────────

export function colorHex(name) {
  const entry = COLOR_PALETTE.find(c => c.name === name)
  return entry ? entry.hex : '#888'
}

export function parseColors(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return []
  return colorStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

// ── ColorPatternDisplay — salt okunur görünüm ─────────────────────────────────

export function ColorPatternDisplay({ color, pattern, style }) {
  const colorNames = parseColors(color)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {colorNames.map(name => (
        <span
          key={name}
          title={name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: colorHex(name),
              border: '1px solid rgba(0,0,0,0.2)',
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{name}</span>
        </span>
      ))}
      {pattern && (
        <span
          style={{
            fontSize: 11,
            background: 'rgba(124,58,237,0.15)',
            color: '#7c3aed',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 4,
            padding: '1px 5px',
            marginLeft: colorNames.length ? 2 : 0,
          }}
        >
          {pattern}
        </span>
      )}
    </span>
  )
}

// ── ColorPatternPicker — interaktif seçici ────────────────────────────────────

export default function ColorPatternPicker({ colors = [], pattern = '', onChange, compact = false }) {
  const dotSize = compact ? 18 : 22

  function toggleColor(name) {
    const next = colors.includes(name)
      ? colors.filter(c => c !== name)
      : [...colors, name]
    onChange({ colors: next, pattern })
  }

  function togglePattern(name) {
    onChange({ colors, pattern: pattern === name ? '' : name })
  }

  function removeColor(name) {
    onChange({ colors: colors.filter(c => c !== name), pattern })
  }

  function removePattern() {
    onChange({ colors, pattern: '' })
  }

  const hasSelection = colors.length > 0 || pattern !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Renk paleti */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6 }}>
        {COLOR_PALETTE.map(({ name, hex }) => {
          const active = colors.includes(name)
          return (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => toggleColor(name)}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                background: hex,
                border: active
                  ? '2px solid var(--accent)'
                  : '2px solid var(--border)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
                transform: active ? 'scale(1.18)' : 'scale(1)',
                boxShadow: active
                  ? '0 0 0 2px var(--accent), 0 2px 6px rgba(0,0,0,0.18)'
                  : '0 1px 3px rgba(0,0,0,0.15)',
                transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
              }}
              aria-pressed={active}
              aria-label={name}
            />
          )
        })}
      </div>

      {/* Desen seçici */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {!compact && (
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.04em' }}>
            DESEN:
          </span>
        )}
        {PATTERNS.map(({ name, icon }) => {
          const active = pattern === name
          return (
            <button
              key={name}
              type="button"
              onClick={() => togglePattern(name)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: compact ? '2px 7px' : '3px 9px',
                borderRadius: 6,
                border: active ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                background: active ? 'rgba(var(--accent-rgb, 37,99,235),0.1)' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text2)',
                fontSize: compact ? 11 : 12,
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                transition: 'all 0.12s',
              }}
              aria-pressed={active}
            >
              <span style={{ fontSize: compact ? 11 : 13 }}>{icon}</span>
              {name}
            </button>
          )
        })}
      </div>

      {/* Seçili özetler */}
      {hasSelection && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {colors.map(name => (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px 2px 4px',
                borderRadius: 12,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--text)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: colorHex(name),
                  border: '1px solid rgba(0,0,0,0.2)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {name}
              <button
                type="button"
                onClick={() => removeColor(name)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text3)',
                  fontSize: 13,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  marginLeft: 1,
                }}
                aria-label={`${name} kaldır`}
              >
                ×
              </button>
            </span>
          ))}
          {pattern && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px 2px 7px',
                borderRadius: 12,
                background: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.3)',
                fontSize: 11,
                color: '#7c3aed',
                fontWeight: 500,
              }}
            >
              {pattern}
              <button
                type="button"
                onClick={removePattern}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: '#7c3aed',
                  fontSize: 13,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.7,
                  marginLeft: 1,
                }}
                aria-label="Deseni kaldır"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
