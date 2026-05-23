import { useTranslation } from '../i18n/index.js'

// Üç dil için minimal flag picker. Kiosk/login gibi public ekranlar için.
// Compact prop true ise sadece flag, false ise flag + dil kodu görünür.
export default function LanguageSwitcher({ compact = false, style }) {
  const { locale, setLocale, locales } = useTranslation()

  return (
    <div style={{ display: 'inline-flex', gap: 4, ...style }}>
      {Object.values(locales).map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          aria-pressed={locale === l.code}
          aria-label={`Dil: ${l.label}`}
          title={l.label}
          style={{
            padding: compact ? '4px 8px' : '6px 12px',
            background: locale === l.code ? 'var(--accent)' : 'transparent',
            color: locale === l.code ? '#000' : 'var(--text2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: compact ? 12 : 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: compact ? 14 : 16 }}>{l.flag}</span>
          {!compact && <span style={{ fontSize: 10, letterSpacing: 1 }}>{l.code.toUpperCase()}</span>}
        </button>
      ))}
    </div>
  )
}
