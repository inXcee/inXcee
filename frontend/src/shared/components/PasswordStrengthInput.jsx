import { useMemo, useState } from 'react'
import { validatePassword, passwordStrength, PASSWORD_HINT } from '../auth/password-policy.js'

export default function PasswordStrengthInput({
  value,
  onChange,
  username,
  placeholder,
  className = 'form-input',
  style,
  autoFocus,
  required,
  showHint = true,
}) {
  const [touched, setTouched] = useState(false)
  const strength = useMemo(() => passwordStrength(value), [value])
  const check = useMemo(() => validatePassword(value, { username }), [value, username])

  const bars = 5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        type="password"
        className={className}
        style={style}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        autoComplete="new-password"
      />
      {value && (
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: bars }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i < strength.score ? strength.color : 'var(--border, #333)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
      )}
      {value && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono, monospace)', color: strength.color }}>
          Güç: {strength.label}
        </div>
      )}
      {touched && !check.ok && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono, monospace)', color: '#ef4444' }}>
          {check.errors.join(' · ')}
        </div>
      )}
      {showHint && !value && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono, monospace)', color: 'var(--text3, #888)' }}>
          {PASSWORD_HINT}
        </div>
      )}
    </div>
  )
}
