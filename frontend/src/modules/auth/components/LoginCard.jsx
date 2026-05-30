import { useState, useRef } from 'react'
import { useTranslation, setLocale } from '../../../shared/i18n/index.js'

// 6 haneli TOTP girişi — auto-advance, paste, backspace ile geri, shake hata.
function TwoFactorInput({ value, onChange, shake, disabled }) {
  const refs = useRef([])

  const onCharChange = (i, raw) => {
    const c = (raw || '').replace(/\D/g, '').slice(-1)
    const arr = (value + '      ').split('').slice(0, 6)
    arr[i] = c
    const next = arr.join('').trimEnd().replace(/\s/g, '')
    onChange(next)
    if (c && i < 5) refs.current[i + 1]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus() }
    else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  const onPaste = (e) => {
    const t = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    if (!t) return
    e.preventDefault()
    onChange(t)
    refs.current[Math.min(t.length, 5)]?.focus()
  }

  return (
    <div className={`tfa-boxes ${shake ? 'shake' : ''}`} onPaste={onPaste} role="group" aria-label="6 haneli doğrulama kodu">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          className="tfa-box"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => onCharChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          onFocus={e => e.target.select()}
          disabled={disabled}
          autoFocus={i === 0}
          aria-label={`Hane ${i + 1}`}
        />
      ))}
    </div>
  )
}

// Demo kullanıcılar paneli — yalnızca DEV ortamında render edilir
function DemoPanel({ demoUsers, onPickDemo }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="demo">
      <button type="button" className="demo-toggle" onClick={() => setOpen(o => !o)}>
        <span>{open ? '▾' : '▸'} DEMO KULLANICILAR</span><span>geliştirme</span>
      </button>
      {open && (
        <div className="demo-list">
          {demoUsers.map(u => (
            <button key={u.username} type="button" className="demo-item" onClick={() => onPickDemo(u)}>
              <span><span className="u">{u.username}</span> <span className="r">{u.role}</span></span>
              <span className="r">{u.password}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// mSub içeriği loginData.js'den gelir — sabit string, kullanıcı girdisi değil.
// dangerouslySetInnerHTML yalnızca bu sabit içerik için kullanılır.
function ModeSub({ html }) {
  const safe = html.replaceAll('<b>', '<strong>').replaceAll('</b>', '</strong>')
  // eslint-disable-next-line react/no-danger
  return <div className="sub" dangerouslySetInnerHTML={{ __html: safe }} />
}

export function LoginCard({
  mode, onModeChange, modeOrder, modeTitles, isForm,
  username, setUsername, password, setPassword, showPw, setShowPw,
  capsLock, setCapsLock, error, loading, isLocked, cooldownLeft,
  onSubmit, twoFA, code, setCode, shake, onVerify2fa, onCancel2fa,
  onForgot, kiosks, onKioskNav, demoUsers, onPickDemo, isDev,
}) {
  const { locale } = useTranslation()
  const [mTitle, mSub] = modeTitles[mode] || modeTitles.standard

  return (
    <aside className="login">
      <div className="card">
        {/* Dil seçici */}
        <div className="ctop">
          <div className="lang" role="group" aria-label="Dil">
            {['tr', 'en', 'ar'].map(l => (
              <button
                key={l}
                type="button"
                className={`lang-b ${locale === l ? 'on' : ''}`}
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="modes" role="tablist" aria-label="Giriş türü">
          {modeOrder.map(([k, ic, lb]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              className={`mode ${mode === k ? 'on' : ''}`}
              onClick={() => onModeChange(k)}
            >
              <span className="mode-ico">{ic}</span><span>{lb}</span>
            </button>
          ))}
        </div>

        {isForm ? (
          twoFA ? (
            <form className="body" onSubmit={onVerify2fa}>
              <div className="head">
                <div className="title">İki Faktörlü Doğrulama</div>
                <div className="sub">Authenticator uygulamasındaki <strong>6 haneli kodu</strong> girin.</div>
              </div>
              <div className="field">
                <label className="label" id="lp-2fa-label">
                  <span>Doğrulama Kodu</span><span className="hint">TOTP · Google / Authy</span>
                </label>
                <TwoFactorInput value={code} onChange={setCode} shake={shake} disabled={loading} />
              </div>
              {error && (
                <div id="lp-2fa-err" className="alert" role="alert">⚠️ <span>{error}</span></div>
              )}
              <button
                className="btn"
                type="submit"
                disabled={loading || code.length !== 6}
                style={{ marginTop: 6 }}
              >
                {loading ? 'DOĞRULANIYOR…' : 'Doğrula →'}
              </button>
              <button className="btn-ghost" type="button" onClick={onCancel2fa}>İptal</button>
            </form>
          ) : (
            <form className="body" onSubmit={onSubmit}>
              <div className="head">
                <div className="title">{mTitle}</div>
                <ModeSub html={mSub} />
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-username">
                  <span>Kullanıcı Adı</span><span className="hint">SİCİL / TC / E-POSTA</span>
                </label>
                <div className="wrap">
                  <span className="ico" aria-hidden="true">👤</span>
                  <input
                    id="lp-username"
                    className="input"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoFocus
                    autoComplete="username"
                    placeholder="örn. selam.aydin"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'lp-login-err' : undefined}
                    disabled={isLocked}
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-password">
                  <span>Şifre</span>
                  <span className={`hint ${capsLock ? 'warn' : ''}`} aria-live="polite">
                    {capsLock ? '⇪ CAPS-LOCK AÇIK' : 'CAPS-LOCK KAPALI'}
                  </span>
                </label>
                <div className="wrap">
                  <span className="ico" aria-hidden="true">🔒</span>
                  <input
                    id="lp-password"
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                    onKeyUp={e => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'lp-login-err' : undefined}
                    disabled={isLocked}
                  />
                  <button
                    className="eye"
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    aria-pressed={showPw}
                    aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  >
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="row">
                <span className="row-pad" />
                <button type="button" className="forgot" onClick={onForgot}>Şifremi unuttum</button>
              </div>
              <button className="btn" type="submit" disabled={loading || isLocked}>
                {loading ? 'GİRİŞ YAPILIYOR…' : isLocked ? `${cooldownLeft} sn bekleyin` : 'Sisteme Giriş Yap →'}
              </button>
              {error && (
                <div id="lp-login-err" className="alert" role="alert">
                  ⚠️ <span>{error}</span>
                  {isLocked && (
                    <span className="alert-sub"> · Çok fazla başarısız deneme — {cooldownLeft} sn sonra tekrar deneyin.</span>
                  )}
                </div>
              )}

              {isDev && (
                <DemoPanel demoUsers={demoUsers} onPickDemo={onPickDemo} />
              )}
            </form>
          )
        ) : (
          <div className="body">
            <div className="kiosk-head">Login gerektirmez — doğrudan PIN/QR ekranı</div>
            <div className="sec-grid">
              {kiosks.map(k => (
                <button key={k.path} type="button" className="sec" onClick={() => onKioskNav(k.path)}>
                  <span style={{ fontSize: 20 }}>{k.icon}</span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 600 }}>{k.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k.desc}</span>
                  </span>
                  <span className="arr">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
