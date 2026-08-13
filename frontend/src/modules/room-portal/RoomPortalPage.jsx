import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../../shared/api/client.js'
import LanguageSwitcher from '../../shared/components/LanguageSwitcher.jsx'
import { useTranslation } from '../../shared/i18n/index.js'
import './RoomPortalPage.css'

const COPY = {
  tr: {
    brand: 'AVS Oda Hizmetleri', scan: 'Güvenli oda QR portalı', loading: 'Oda hizmetleri açılıyor…',
    disabledTitle: 'Oda hizmetleri şu anda kapalı', disabledText: 'Bu QR geçerli. Hizmetler açıldığında aynı etiketi kullanabilirsiniz.',
    unavailable: 'Bu QR kullanılamıyor', retry: 'Tekrar dene', floor: 'Kat', online: 'Çevrimiçi', offline: 'Bağlantı yok — yalnız taslak hazırlanabilir',
    choose: 'Nasıl yardımcı olabiliriz?', privacy: 'QR yalnız konumu seçer. Kimliğiniz izniniz olmadan paylaşılmaz.',
    fault: 'Arıza bildir', faultText: 'Odada veya ortak alanda oluşan sorunu iletin.',
    laundry: 'Çamaşır alınmasını iste', laundryText: 'Çamaşırhane ekibine odadan alma talebi gönderin.',
    cleaning: 'Temizlik durumu', cleaningText: 'Temizliği görüntüleyin, onaylayın veya eksik bildirin.',
    survey: 'Memnuniyet anketi', surveyText: 'Oda ve hizmetlerle ilgili görüşünüzü paylaşın.',
    pinRequired: 'Bu işlem için oda sakini doğrulaması gerekir', optionalIdentity: 'İsterseniz kimliğinizle, isterseniz anonim devam edin.',
    anonymous: 'Anonim devam et', withPin: 'PIN ile devam et', identityTitle: 'Oda sakini doğrulaması',
    identifier: 'TC / Pasaport No', pin: '4 haneli kalıcı PIN', verify: 'Doğrula ve devam et', cancel: 'Vazgeç',
    verified: 'doğrulandı', readyTitle: 'Güvenli işlem alanı hazır', readyText: 'Bu hizmetin formu ilgili uygulama fazında burada açılacak.',
    back: 'Hizmetlere dön', authFailed: 'Bilgiler doğrulanamadı', sessionExpired: 'Oturum süresi doldu. Tekrar doğrulayın.',
  },
  en: {
    brand: 'AVS Room Services', scan: 'Secure room QR portal', loading: 'Opening room services…',
    disabledTitle: 'Room services are currently closed', disabledText: 'This QR is valid. You can use the same label when services are enabled.',
    unavailable: 'This QR cannot be used', retry: 'Try again', floor: 'Floor', online: 'Online', offline: 'No connection — drafts only',
    choose: 'How can we help?', privacy: 'The QR only selects the location. Your identity is not shared without permission.',
    fault: 'Report a fault', faultText: 'Tell us about a problem in the room or common area.',
    laundry: 'Request laundry pickup', laundryText: 'Send a room pickup request to the laundry team.',
    cleaning: 'Cleaning status', cleaningText: 'View, approve or report a cleaning issue.',
    survey: 'Satisfaction survey', surveyText: 'Share feedback about the room and services.',
    pinRequired: 'Resident verification is required for this action', optionalIdentity: 'Continue with your identity or anonymously.',
    anonymous: 'Continue anonymously', withPin: 'Continue with PIN', identityTitle: 'Resident verification',
    identifier: 'ID / Passport No', pin: '4-digit permanent PIN', verify: 'Verify and continue', cancel: 'Cancel',
    verified: 'verified', readyTitle: 'Secure action area is ready', readyText: 'The service form will open here in its implementation phase.',
    back: 'Back to services', authFailed: 'Details could not be verified', sessionExpired: 'Session expired. Please verify again.',
  },
  ar: {
    brand: 'خدمات غرف AVS', scan: 'بوابة الغرفة الآمنة عبر QR', loading: 'جارٍ فتح خدمات الغرفة…',
    disabledTitle: 'خدمات الغرفة مغلقة حالياً', disabledText: 'رمز QR صالح ويمكن استخدام الملصق نفسه عند تفعيل الخدمات.',
    unavailable: 'لا يمكن استخدام رمز QR هذا', retry: 'حاول مجدداً', floor: 'الطابق', online: 'متصل', offline: 'لا يوجد اتصال — يمكن حفظ مسودة فقط',
    choose: 'كيف يمكننا مساعدتك؟', privacy: 'يحدد رمز QR الموقع فقط، ولا تتم مشاركة هويتك دون إذنك.',
    fault: 'الإبلاغ عن عطل', faultText: 'أبلغ عن مشكلة في الغرفة أو المنطقة المشتركة.',
    laundry: 'طلب استلام الغسيل', laundryText: 'أرسل طلب استلام من الغرفة إلى فريق الغسيل.',
    cleaning: 'حالة التنظيف', cleaningText: 'اعرض التنظيف أو وافق عليه أو أبلغ عن نقص.',
    survey: 'استبيان الرضا', surveyText: 'شارك رأيك حول الغرفة والخدمات.',
    pinRequired: 'يلزم التحقق من ساكن الغرفة لهذه العملية', optionalIdentity: 'تابع بهويتك أو بشكل مجهول.',
    anonymous: 'المتابعة بشكل مجهول', withPin: 'المتابعة برمز PIN', identityTitle: 'التحقق من ساكن الغرفة',
    identifier: 'رقم الهوية / جواز السفر', pin: 'رمز PIN دائم من 4 أرقام', verify: 'تحقق وتابع', cancel: 'إلغاء',
    verified: 'تم التحقق', readyTitle: 'منطقة العملية الآمنة جاهزة', readyText: 'سيظهر نموذج الخدمة هنا في مرحلة التنفيذ الخاصة به.',
    back: 'العودة إلى الخدمات', authFailed: 'تعذر التحقق من البيانات', sessionExpired: 'انتهت الجلسة. يرجى التحقق مجدداً.',
  },
}

const ACTIONS = [
  { key: 'fault', icon: '🔧', tone: 'red' },
  { key: 'laundry', icon: '🧺', tone: 'teal' },
  { key: 'cleaning', icon: '✨', tone: 'green' },
  { key: 'survey', icon: '💬', tone: 'blue' },
]

function readSession(token) {
  try {
    const value = JSON.parse(sessionStorage.getItem(`room-portal:${token}`) || 'null')
    if (!value?.session_token || new Date(value.expires_at).getTime() <= Date.now()) return null
    return value
  } catch { return null }
}

function storeSession(token, value) {
  try { sessionStorage.setItem(`room-portal:${token}`, JSON.stringify(value)) } catch { /* private mode */ }
}

function ensureRequestId(token, action) {
  const key = `room-portal-request:${token}:${action}`
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, value)
    return value
  } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

export default function RoomPortalPage() {
  const { token = '' } = useParams()
  const { locale } = useTranslation()
  const c = COPY[locale] || COPY.tr
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [selectedAction, setSelectedAction] = useState(null)
  const [mode, setMode] = useState(null)
  const [session, setSession] = useState(() => readSession(token))
  const [showAuth, setShowAuth] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  const loadPortal = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/room-portal/${encodeURIComponent(token)}`)
      setPortal(response.data)
    } catch (requestError) {
      setError({
        status: requestError.response?.status,
        code: requestError.response?.data?.code,
        message: requestError.response?.data?.error || c.unavailable,
      })
    } finally { setLoading(false) }
  }

  useEffect(() => { loadPortal() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSession(readSession(token))
    setSelectedAction(null)
    setMode(null)
    setShowAuth(false)
    setAuthError('')
  }, [token])
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const enabledActions = useMemo(() => ACTIONS.filter(action => portal?.actions?.[action.key]?.enabled), [portal])

  const selectAction = action => {
    ensureRequestId(token, action.key)
    setSelectedAction(action)
    setAuthError('')
    const policy = portal.actions[action.key]
    const validSession = session && new Date(session.expires_at).getTime() > Date.now() ? session : null
    if (session && !validSession) {
      setSession(null)
      try { sessionStorage.removeItem(`room-portal:${token}`) } catch { /* private mode */ }
    }
    if (policy.pin_required && !validSession) {
      setShowAuth(true)
      setMode(null)
    } else if (policy.pin_required) {
      setMode('resident_pin')
    } else {
      setShowAuth(false)
      setMode(null)
    }
  }

  const authenticate = async event => {
    event.preventDefault()
    setAuthError('')
    if (!online) return setAuthError(c.offline)
    setAuthBusy(true)
    try {
      const response = await api.post(`/room-portal/${encodeURIComponent(token)}/auth`, { identifier, pin })
      storeSession(token, response.data)
      setSession(response.data)
      setMode('resident_pin')
      setShowAuth(false)
      setPin('')
    } catch (requestError) {
      setAuthError(requestError.response?.data?.error || c.authFailed)
    } finally { setAuthBusy(false) }
  }

  const resetAction = () => {
    setSelectedAction(null)
    setMode(null)
    setShowAuth(false)
    setAuthError('')
  }

  const header = (
    <header className="rp-header">
      <div className="rp-brand"><span className="rp-mark">AVS</span><div><strong>{c.brand}</strong><small>{c.scan}</small></div></div>
      <LanguageSwitcher compact />
    </header>
  )

  if (loading) return <main className="room-portal-page">{header}<section className="rp-state"><span className="rp-spinner" /><h1>{c.loading}</h1></section></main>
  if (error) return (
    <main className="room-portal-page">{header}<section className="rp-state rp-error-state">
      <span className="rp-state-icon">{error.status === 410 ? '⛔' : '⚠️'}</span><h1>{c.unavailable}</h1><p>{error.message}</p>
      {error.status !== 410 && <button type="button" className="rp-primary" onClick={loadPortal}>{c.retry}</button>}
    </section></main>
  )

  const location = portal.location
  return (
    <main className="room-portal-page">
      {header}
      <section className="rp-location" aria-label={location.display_name}>
        <div><span className="rp-location-kind">{location.type === 'room' ? 'ODA / ROOM' : 'ORTAK ALAN / COMMON AREA'}</span><h1>{location.display_name}</h1></div>
        <div className="rp-floor"><small>{c.floor}</small><strong>{location.floor}</strong></div>
      </section>
      <div className={`rp-connectivity ${online ? 'online' : 'offline'}`} role="status"><span />{online ? c.online : c.offline}</div>

      {portal.portal_status === 'disabled' ? (
        <section className="rp-state rp-disabled"><span className="rp-state-icon">🛡️</span><h2>{c.disabledTitle}</h2><p>{c.disabledText}</p></section>
      ) : selectedAction ? (
        <section className="rp-action-flow">
          <button type="button" className="rp-back" onClick={resetAction}>← {c.back}</button>
          <div className={`rp-action-heading ${selectedAction.tone}`}><span>{selectedAction.icon}</span><div><h2>{c[selectedAction.key]}</h2><p>{c[`${selectedAction.key}Text`]}</p></div></div>

          {showAuth ? (
            <form className="rp-auth-card" onSubmit={authenticate}>
              <h3>{c.identityTitle}</h3><p>{c.pinRequired}</p>
              <label>{c.identifier}<input value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" inputMode="text" maxLength={32} required /></label>
              <label>{c.pin}<input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="current-password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required /></label>
              {authError && <div className="rp-alert" role="alert">{authError}</div>}
              <div className="rp-auth-actions"><button type="button" onClick={() => portal.actions[selectedAction.key].pin_required ? resetAction() : setShowAuth(false)}>{c.cancel}</button><button type="submit" className="rp-primary" disabled={authBusy || pin.length !== 4}>{c.verify}</button></div>
            </form>
          ) : mode ? (
            <div className="rp-ready"><span>✓</span><h3>{c.readyTitle}</h3>{mode === 'resident_pin' && session?.resident && <strong>{session.resident.display_name} {c.verified}</strong>}<p>{c.readyText}</p></div>
          ) : (
            <div className="rp-mode-card"><p>{c.optionalIdentity}</p><button type="button" className="rp-primary" onClick={() => setMode('anonymous')}>{c.anonymous}</button><button type="button" onClick={() => setShowAuth(true)}>{c.withPin}</button></div>
          )}
        </section>
      ) : (
        <section className="rp-services">
          <div className="rp-section-title"><h2>{c.choose}</h2><p>{c.privacy}</p></div>
          <div className="rp-service-grid">
            {enabledActions.map(action => <button type="button" key={action.key} className={`rp-service-card ${action.tone}`} onClick={() => selectAction(action)}>
              <span className="rp-service-icon">{action.icon}</span><span><strong>{c[action.key]}</strong><small>{c[`${action.key}Text`]}</small></span><b aria-hidden="true">›</b>
            </button>)}
          </div>
        </section>
      )}
      <footer className="rp-footer">AVS · {location.block} · <span>{c.privacy}</span></footer>
    </main>
  )
}
