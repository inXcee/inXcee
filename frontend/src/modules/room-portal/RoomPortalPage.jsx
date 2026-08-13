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
    verified: 'doğrulandı', readyTitle: 'Güvenli işlem alanı hazır', readyText: 'Bu hizmetin işlemleri sonraki uygulama fazında burada açılacak.',
    back: 'Hizmetlere dön', authFailed: 'Bilgiler doğrulanamadı', sessionExpired: 'Oturum süresi doldu. Tekrar doğrulayın.',
    category: 'Arıza türü', description: 'Sorunu anlatın', descriptionHint: 'En az 5 karakter; ekip sorunu bulabilecek kadar açık yazın.',
    photos: 'Fotoğraf ekle (isteğe bağlı)', photoHint: 'En fazla 3 fotoğraf; JPEG, PNG veya WebP, dosya başına 10 MB.',
    sendFault: 'Arıza bildirimini gönder', sending: 'Gönderiliyor…', required: 'Bu alan zorunludur.',
    draftSaved: 'Bağlantı olmadığı için taslak bu cihazda saklandı. Sunucuya gönderilmedi.', photoDraft: 'Güvenlik nedeniyle fotoğraflar taslağa kaydedilmez; çevrimiçi olduğunuzda yeniden seçin.',
    sendFailed: 'İşlem gönderilemedi', success: 'İşleminiz alındı', tracking: 'Takip numarası', newInfo: 'Bilginiz mevcut açık arızaya eklendi.',
    surveyIntro: '1 çok düşük, 5 çok iyi. Yalnız değerlendirmek istediğiniz alanları puanlayabilirsiniz.',
    roomScore: 'Oda', cleaningScore: 'Temizlik', foodScore: 'Yemek', laundryScore: 'Çamaşırhane', overallScore: 'Genel memnuniyet',
    comment: 'Ek görüşünüz (isteğe bağlı)', sendSurvey: 'Anketi gönder', thanks: 'Görüşünüz için teşekkür ederiz.',
    score: 'puan', selectScore: 'Puan seçin', categories: { elektrik: 'Elektrik', tesisat: 'Su / tesisat', klima: 'Isıtma / klima', boya: 'Boya / yüzey', genel: 'Diğer' },
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
    verified: 'verified', readyTitle: 'Secure action area is ready', readyText: 'This service will be enabled here in its implementation phase.',
    back: 'Back to services', authFailed: 'Details could not be verified', sessionExpired: 'Session expired. Please verify again.',
    category: 'Fault type', description: 'Describe the problem', descriptionHint: 'At least 5 characters; include enough detail for the team to locate the issue.',
    photos: 'Add photos (optional)', photoHint: 'Up to 3 JPEG, PNG or WebP photos; 10 MB each.',
    sendFault: 'Send fault report', sending: 'Sending…', required: 'This field is required.',
    draftSaved: 'You are offline, so the draft was saved on this device. It was not sent to the server.', photoDraft: 'Photos are not stored in drafts for security. Select them again when online.',
    sendFailed: 'Could not send the action', success: 'Your action was received', tracking: 'Tracking number', newInfo: 'Your information was added to the existing open fault.',
    surveyIntro: '1 is very low and 5 is excellent. Rate only the areas you want to review.',
    roomScore: 'Room', cleaningScore: 'Cleaning', foodScore: 'Food', laundryScore: 'Laundry', overallScore: 'Overall satisfaction',
    comment: 'Additional feedback (optional)', sendSurvey: 'Send survey', thanks: 'Thank you for your feedback.',
    score: 'points', selectScore: 'Select a score', categories: { elektrik: 'Electricity', tesisat: 'Water / plumbing', klima: 'Heating / AC', boya: 'Paint / surface', genel: 'Other' },
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
    verified: 'تم التحقق', readyTitle: 'منطقة العملية الآمنة جاهزة', readyText: 'ستتوفر هذه الخدمة هنا في مرحلة التنفيذ الخاصة بها.',
    back: 'العودة إلى الخدمات', authFailed: 'تعذر التحقق من البيانات', sessionExpired: 'انتهت الجلسة. يرجى التحقق مجدداً.',
    category: 'نوع العطل', description: 'صف المشكلة', descriptionHint: 'خمسة أحرف على الأقل مع تفاصيل تساعد الفريق على تحديد المشكلة.',
    photos: 'إضافة صور (اختياري)', photoHint: 'حتى 3 صور JPEG أو PNG أو WebP، بحد 10 ميغابايت للصورة.',
    sendFault: 'إرسال بلاغ العطل', sending: 'جارٍ الإرسال…', required: 'هذا الحقل مطلوب.',
    draftSaved: 'لا يوجد اتصال؛ تم حفظ المسودة على هذا الجهاز ولم تُرسل إلى الخادم.', photoDraft: 'لا تُحفظ الصور في المسودة لأسباب أمنية. اخترها مجدداً عند الاتصال.',
    sendFailed: 'تعذر إرسال العملية', success: 'تم استلام العملية', tracking: 'رقم المتابعة', newInfo: 'تمت إضافة معلوماتك إلى العطل المفتوح.',
    surveyIntro: '1 منخفض جداً و5 ممتاز. قيّم المجالات التي تريدها فقط.',
    roomScore: 'الغرفة', cleaningScore: 'التنظيف', foodScore: 'الطعام', laundryScore: 'الغسيل', overallScore: 'الرضا العام',
    comment: 'رأي إضافي (اختياري)', sendSurvey: 'إرسال الاستبيان', thanks: 'شكراً لمشاركتك.',
    score: 'نقاط', selectScore: 'اختر تقييماً', categories: { elektrik: 'الكهرباء', tesisat: 'المياه / السباكة', klima: 'التدفئة / التكييف', boya: 'الطلاء / السطح', genel: 'أخرى' },
  },
}

const ACTIONS = [
  { key: 'fault', icon: '🔧', tone: 'red' },
  { key: 'laundry', icon: '🧺', tone: 'teal' },
  { key: 'cleaning', icon: '✨', tone: 'green' },
  { key: 'survey', icon: '💬', tone: 'blue' },
]
const SURVEY_FIELDS = ['room_score', 'cleaning_score', 'food_score', 'laundry_score', 'overall_score']

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

function requestKey(token, action) { return `room-portal-request:${token}:${action}` }
function draftKey(token, action) { return `room-portal-draft:${token}:${action}` }

function ensureRequestId(token, action) {
  const key = requestKey(token, action)
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, value)
    return value
  } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

function readDraft(token, action, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(draftKey(token, action)) || '{}') } } catch { return fallback }
}
function saveDraft(token, action, value) {
  try { localStorage.setItem(draftKey(token, action), JSON.stringify(value)) } catch { /* storage unavailable */ }
}
function clearSubmission(token, action) {
  try {
    localStorage.removeItem(draftKey(token, action))
    sessionStorage.removeItem(requestKey(token, action))
  } catch { /* storage unavailable */ }
}

function ReceiptCard({ c, result, action }) {
  return <div className="rp-receipt" role="status">
    <span>✓</span><h3>{c.success}</h3>
    <p>{action === 'survey' ? c.thanks : result.merged ? c.newInfo : result.summary?.message}</p>
    <small>{c.tracking}</small><strong>{result.receipt}</strong>
  </div>
}

function FaultForm({ c, token, mode, session, online, onSessionExpired }) {
  const initial = readDraft(token, 'fault', { category: 'genel', description: '' })
  const [category, setCategory] = useState(initial.category)
  const [description, setDescription] = useState(initial.description)
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)

  const submit = async event => {
    event.preventDefault()
    setMessage('')
    if (description.trim().length < 5) return setMessage(c.descriptionHint)
    if (photos.length > 3 || photos.some(file => file.size > 10 * 1024 * 1024)) return setMessage(c.photoHint)
    if (!online) {
      saveDraft(token, 'fault', { category, description })
      return setMessage(`${c.draftSaved} ${photos.length ? c.photoDraft : ''}`)
    }
    const data = new FormData()
    data.append('client_request_id', ensureRequestId(token, 'fault'))
    data.append('category', category)
    data.append('description', description.trim())
    photos.forEach(file => data.append('photos', file))
    setBusy(true)
    try {
      const headers = mode === 'resident_pin' ? { 'X-Room-Portal-Session': session?.session_token } : {}
      const response = await api.post(`/room-portal/${encodeURIComponent(token)}/faults`, data, { headers })
      clearSubmission(token, 'fault')
      setResult(response.data)
    } catch (error) {
      if (error.response?.status === 401) onSessionExpired()
      setMessage(error.response?.data?.error || c.sendFailed)
    } finally { setBusy(false) }
  }

  if (result) return <ReceiptCard c={c} result={result} action="fault" />
  return <form className="rp-public-form" onSubmit={submit}>
    {mode === 'resident_pin' && session?.resident && <div className="rp-verified">✓ {session.resident.display_name} {c.verified}</div>}
    <label>{c.category}<select aria-label={c.category} value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(c.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>{c.description}<textarea aria-label={c.description} value={description} onChange={event => setDescription(event.target.value)} minLength={5} maxLength={2000} rows={5} required /><small>{c.descriptionHint}</small></label>
    <label className="rp-file-label">{c.photos}<input aria-label={c.photos} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setPhotos(Array.from(event.target.files || []))} /><small>{c.photoHint}</small></label>
    {message && <div className="rp-alert" role="alert">{message}</div>}
    <button type="submit" className="rp-primary rp-submit" disabled={busy}>{busy ? c.sending : c.sendFault}</button>
  </form>
}

function ScorePicker({ c, label, value, onChange }) {
  return <fieldset className="rp-score"><legend>{label}</legend><div aria-label={`${label}: ${c.selectScore}`}>{[1, 2, 3, 4, 5].map(score => <button type="button" key={score} className={value === score ? 'selected' : ''} aria-pressed={value === score} aria-label={`${label}: ${score} ${c.score}`} onClick={() => onChange(score)}>{score}</button>)}</div></fieldset>
}

function SurveyForm({ c, token, mode, session, online, onSessionExpired }) {
  const initial = readDraft(token, 'survey', { scores: {}, comment: '' })
  const [scores, setScores] = useState(initial.scores || {})
  const [comment, setComment] = useState(initial.comment || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const labels = { room_score: c.roomScore, cleaning_score: c.cleaningScore, food_score: c.foodScore, laundry_score: c.laundryScore, overall_score: c.overallScore }

  const submit = async event => {
    event.preventDefault()
    setMessage('')
    if (!Object.keys(scores).length && !comment.trim()) return setMessage(c.required)
    if (!online) {
      saveDraft(token, 'survey', { scores, comment })
      return setMessage(c.draftSaved)
    }
    setBusy(true)
    try {
      const headers = mode === 'resident_pin' ? { 'X-Room-Portal-Session': session?.session_token } : {}
      const response = await api.post(`/room-portal/${encodeURIComponent(token)}/surveys`, {
        client_request_id: ensureRequestId(token, 'survey'),
        ...scores,
        comment: comment.trim() || null,
      }, { headers })
      clearSubmission(token, 'survey')
      setResult(response.data)
    } catch (error) {
      if (error.response?.status === 401) onSessionExpired()
      setMessage(error.response?.data?.error || c.sendFailed)
    } finally { setBusy(false) }
  }

  if (result) return <ReceiptCard c={c} result={result} action="survey" />
  return <form className="rp-public-form" onSubmit={submit}>
    {mode === 'resident_pin' && session?.resident && <div className="rp-verified">✓ {session.resident.display_name} {c.verified}</div>}
    <p className="rp-form-intro">{c.surveyIntro}</p>
    {SURVEY_FIELDS.map(field => <ScorePicker key={field} c={c} label={labels[field]} value={scores[field]} onChange={value => setScores(current => ({ ...current, [field]: value }))} />)}
    <label>{c.comment}<textarea aria-label={c.comment} value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={4} /></label>
    {message && <div className="rp-alert" role="alert">{message}</div>}
    <button type="submit" className="rp-primary rp-submit" disabled={busy}>{busy ? c.sending : c.sendSurvey}</button>
  </form>
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
    setLoading(true); setError(null)
    try { setPortal((await api.get(`/room-portal/${encodeURIComponent(token)}`)).data) }
    catch (requestError) { setError({ status: requestError.response?.status, message: requestError.response?.data?.error || c.unavailable }) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPortal() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSession(readSession(token)); setSelectedAction(null); setMode(null); setShowAuth(false); setAuthError('') }, [token])
  useEffect(() => {
    const goOnline = () => setOnline(true); const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  const enabledActions = useMemo(() => ACTIONS.filter(action => portal?.actions?.[action.key]?.enabled), [portal])
  const resetSession = () => {
    setSession(null); setMode(null); setAuthError(c.sessionExpired)
    try { sessionStorage.removeItem(`room-portal:${token}`) } catch { /* private mode */ }
    if (selectedAction && portal.actions[selectedAction.key].pin_required) setShowAuth(true)
  }
  const selectAction = action => {
    ensureRequestId(token, action.key); setSelectedAction(action); setAuthError('')
    const policy = portal.actions[action.key]
    const validSession = session && new Date(session.expires_at).getTime() > Date.now() ? session : null
    if (session && !validSession) resetSession()
    if (policy.pin_required && !validSession) { setShowAuth(true); setMode(null) }
    else if (policy.pin_required) setMode('resident_pin')
    else { setShowAuth(false); setMode(null) }
  }
  const authenticate = async event => {
    event.preventDefault(); setAuthError('')
    if (!online) return setAuthError(c.offline)
    setAuthBusy(true)
    try {
      const response = await api.post(`/room-portal/${encodeURIComponent(token)}/auth`, { identifier, pin })
      storeSession(token, response.data); setSession(response.data); setMode('resident_pin'); setShowAuth(false); setPin('')
    } catch (requestError) { setAuthError(requestError.response?.data?.error || c.authFailed) }
    finally { setAuthBusy(false) }
  }
  const resetAction = () => { setSelectedAction(null); setMode(null); setShowAuth(false); setAuthError('') }
  const choosePinMode = () => {
    if (session && new Date(session.expires_at).getTime() > Date.now()) setMode('resident_pin')
    else setShowAuth(true)
  }

  const header = <header className="rp-header"><div className="rp-brand"><span className="rp-mark">AVS</span><div><strong>{c.brand}</strong><small>{c.scan}</small></div></div><LanguageSwitcher compact /></header>
  if (loading) return <main className="room-portal-page">{header}<section className="rp-state"><span className="rp-spinner" /><h1>{c.loading}</h1></section></main>
  if (error) return <main className="room-portal-page">{header}<section className="rp-state rp-error-state"><span className="rp-state-icon">{error.status === 410 ? '⛔' : '⚠️'}</span><h1>{c.unavailable}</h1><p>{error.message}</p>{error.status !== 410 && <button type="button" className="rp-primary" onClick={loadPortal}>{c.retry}</button>}</section></main>

  const location = portal.location
  let actionBody = null
  if (mode && selectedAction?.key === 'fault') actionBody = <FaultForm c={c} token={token} mode={mode} session={session} online={online} onSessionExpired={resetSession} />
  else if (mode && selectedAction?.key === 'survey') actionBody = <SurveyForm c={c} token={token} mode={mode} session={session} online={online} onSessionExpired={resetSession} />
  else if (mode) actionBody = <div className="rp-ready"><span>✓</span><h3>{c.readyTitle}</h3>{mode === 'resident_pin' && session?.resident && <strong>{session.resident.display_name} {c.verified}</strong>}<p>{c.readyText}</p></div>

  return <main className="room-portal-page">
    {header}
    <section className="rp-location" aria-label={location.display_name}><div><span className="rp-location-kind">{location.type === 'room' ? 'ODA / ROOM' : 'ORTAK ALAN / COMMON AREA'}</span><h1>{location.display_name}</h1></div><div className="rp-floor"><small>{c.floor}</small><strong>{location.floor}</strong></div></section>
    <div className={`rp-connectivity ${online ? 'online' : 'offline'}`} role="status"><span />{online ? c.online : c.offline}</div>
    {portal.portal_status === 'disabled' ? <section className="rp-state rp-disabled"><span className="rp-state-icon">🛡️</span><h2>{c.disabledTitle}</h2><p>{c.disabledText}</p></section> : selectedAction ? <section className="rp-action-flow">
      <button type="button" className="rp-back" onClick={resetAction}>← {c.back}</button>
      <div className={`rp-action-heading ${selectedAction.tone}`}><span>{selectedAction.icon}</span><div><h2>{c[selectedAction.key]}</h2><p>{c[`${selectedAction.key}Text`]}</p></div></div>
      {showAuth ? <form className="rp-auth-card" onSubmit={authenticate}><h3>{c.identityTitle}</h3><p>{c.pinRequired}</p><label>{c.identifier}<input value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" maxLength={32} required /></label><label>{c.pin}<input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="current-password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required /></label>{authError && <div className="rp-alert" role="alert">{authError}</div>}<div className="rp-auth-actions"><button type="button" onClick={() => portal.actions[selectedAction.key].pin_required ? resetAction() : setShowAuth(false)}>{c.cancel}</button><button type="submit" className="rp-primary" disabled={authBusy || pin.length !== 4}>{c.verify}</button></div></form> : actionBody || <div className="rp-mode-card"><p>{c.optionalIdentity}</p><button type="button" className="rp-primary" onClick={() => setMode('anonymous')}>{c.anonymous}</button><button type="button" onClick={choosePinMode}>{c.withPin}</button></div>}
    </section> : <section className="rp-services"><div className="rp-section-title"><h2>{c.choose}</h2><p>{c.privacy}</p></div><div className="rp-service-grid">{enabledActions.map(action => <button type="button" key={action.key} className={`rp-service-card ${action.tone}`} onClick={() => selectAction(action)}><span className="rp-service-icon">{action.icon}</span><span><strong>{c[action.key]}</strong><small>{c[`${action.key}Text`]}</small></span><b aria-hidden="true">›</b></button>)}</div></section>}
    <footer className="rp-footer">AVS · {location.block} · <span>{c.privacy}</span></footer>
  </main>
}
