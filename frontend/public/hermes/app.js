// Sesli Hermes — telefondaki sesli asistan. "Hey Google, Hermes'i aç" → sayfa açılır → dinler → Hermes'e sorar →
// yanıtı yazar ve sesli okur → (sohbet modu) yine dinler. Ses tanıma ve seslendirme tarayıcının kendi motoru
// (Chrome / Android: Google, Türkçe). Sunucu tarafı: YYS /api/hermes/* (yalnız sahip) → Hermes Agent.
import {
  readSse, streamChunks, speakable, plainText, splitForSpeech, isStopPhrase, initialTurn, reduceTurn, sessionValid,
} from './core.js'

const $ = id => document.getElementById(id)
const el = {
  dot: $('dot'), newChat: $('newChat'), settingsBtn: $('settingsBtn'), notice: $('notice'),
  mic: $('mic'), hint: $('hint'), live: $('live'),
  turn: $('turn'), question: $('question'), steps: $('steps'), answer: $('answer'),
  approval: $('approval'), approvalCmd: $('approvalCmd'), approveOnce: $('approveOnce'), approveDeny: $('approveDeny'),
  stop: $('stop'), speakAgain: $('speakAgain'),
  typeForm: $('typeForm'), typeInput: $('typeInput'), history: $('history'), settings: $('settings'),
}

// ── Kalıcı tercihler (yalnız bu cihaz) ──
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* özel pencere */ } },
}
const DEFAULTS = { autoListen: true, speak: true, conversation: true, keepAwake: true }
let settings = { ...DEFAULTS, ...store.get('hermes.settings', {}) }

// ── Durum ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
let phase = 'idle'            // idle | listening | thinking | speaking
let recognition = null
let turn = null
let speakingCancelled = false
let wakeLock = null
let conversationLive = false  // sohbet modunda bir yanıt bitince yeniden dinlenecek mi

// ── Yardımcılar ──
// Düz metin (sunucu hata mesajları da buradan geçer → asla HTML olarak yorumlanmaz); bağlantı gerekiyorsa DOM ile.
function notice(text, link) {
  if (!text) { el.notice.hidden = true; el.notice.replaceChildren(); return }
  el.notice.hidden = false
  el.notice.replaceChildren(document.createTextNode(text))
  if (link) {
    const a = document.createElement('a')
    a.href = link.href
    a.textContent = link.text
    el.notice.append(' ', a)
  }
}

async function api(path, { method = 'GET', body, retried = false } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404 && !retried && await refreshSession()) return api(path, { method, body, retried: true })
  if (res.status === 404) throw Object.assign(new Error('Oturumun kapanmış.'), { auth: true })
  let data = null
  try { data = await res.json() } catch { /* gövde yok */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Hata ${res.status}`), { status: res.status })
  return data
}

// Sahip olmayan / süresi geçmiş oturum her uçta 404 alır → bir kez yenilemeyi dene.
async function refreshSession() {
  try {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    return r.ok
  } catch { return false }
}

function authLost() {
  notice('Oturumun kapanmış. Giriş yapıp Hermes\'i yeniden aç:', { href: '/', text: 'avskamp.com\'a giriş yap' })
  el.dot.className = 'dot bad'
}

async function keepAwake(on) {
  try {
    if (on && settings.keepAwake && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => { wakeLock = null })
    } else if (!on && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch { /* desteklenmiyor / reddedildi */ }
}

function setPhase(next, hint) {
  phase = next
  el.mic.className = `mic ${next === 'idle' ? '' : next}`.trim()
  el.mic.setAttribute('aria-label', { idle: 'Konuş', listening: 'Dinlemeyi bitir', thinking: 'Hermes düşünüyor', speaking: 'Okumayı durdur' }[next])
  el.hint.textContent = hint ?? {
    idle: SR ? 'Dokun ve konuş' : 'Bu tarayıcı sesle yazmayı desteklemiyor — yazarak sor',
    listening: 'Dinliyorum…',
    thinking: 'Hermes düşünüyor…',
    speaking: 'Okuyorum — durdurmak için dokun',
  }[next]
  el.stop.hidden = next !== 'thinking' || !turn?.runId
  keepAwake(next !== 'idle')
}

// ── Oturum (sohbet bağlamı) ──
async function ensureSession(fresh = false) {
  const saved = store.get('hermes.session', null)
  if (!fresh && sessionValid(saved)) {
    store.set('hermes.session', { id: saved.id, at: Date.now() })
    return saved.id
  }
  const { session_id: id } = await api('/api/hermes/session', { method: 'POST' })
  store.set('hermes.session', { id, at: Date.now() })
  store.set('hermes.history', { session: id, items: [] })
  renderHistory()
  return id
}

// ── Geçmiş (bu sohbet, bu cihaz) ──
function historyItems() {
  const saved = store.get('hermes.session', null)
  const h = store.get('hermes.history', null)
  return h && saved && h.session === saved.id ? h.items : []
}
function pushHistory(q, a) {
  const saved = store.get('hermes.session', null)
  if (!saved) return
  const items = [...historyItems(), { q, a, at: Date.now() }].slice(-30)
  store.set('hermes.history', { session: saved.id, items })
}
function renderHistory() {
  const all = historyItems()
  const items = (turn ? all.slice(0, -1) : all).reverse()   // ekrandaki tur listede tekrar edilmez
  el.history.replaceChildren(...items.map(({ q, a }) => {
    const li = document.createElement('li')
    const qe = document.createElement('div'); qe.className = 'q'; qe.textContent = q
    const ae = document.createElement('div'); ae.className = 'a'; ae.textContent = plainText(a)
    li.append(qe, ae)
    return li
  }))
  el.history.parentElement.hidden = items.length === 0
}

// ── Tur ekranı ──
function renderTurn() {
  if (!turn) { el.turn.hidden = true; return }
  el.turn.hidden = false
  el.steps.replaceChildren(...turn.steps.map(s => {
    const li = document.createElement('li')
    li.textContent = s.label
    if (s.state !== 'start') li.className = s.state
    return li
  }))
  el.approval.hidden = !turn.approval
  if (turn.approval) el.approvalCmd.textContent = turn.approval.command
  const text = turn.phase === 'error' ? turn.error : plainText(turn.answer || turn.draft)
  el.answer.textContent = text || ''
  el.answer.className = turn.phase === 'error' ? 'answer error' : 'answer'
  el.stop.hidden = phase !== 'thinking' || !turn.runId
  el.speakAgain.hidden = !(turn.answer && (turn.phase === 'done') && 'speechSynthesis' in window)
}

// ── Dinleme ──
function listen() {
  if (!SR) { setPhase('idle'); el.typeInput.focus(); return }
  if (phase === 'listening' || phase === 'thinking') return
  stopSpeaking()
  notice('')
  recognition = new SR()
  recognition.lang = 'tr-TR'
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.continuous = false
  let finalText = ''
  let failed = false
  recognition.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) finalText += t
      else interim += t
    }
    el.live.textContent = (finalText + interim).trim()
  }
  recognition.onerror = (e) => {
    failed = true
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      notice('Mikrofon izni kapalı. Tarayıcıda bu site için mikrofona izin ver, sonra mikrofona dokun.')
    } else if (e.error === 'network') {
      notice('Ses tanıma için internet bağlantısı gerekiyor.')
    } else if (e.error === 'audio-capture') {
      notice('Mikrofon bulunamadı ya da başka bir uygulama kullanıyor.')
    }
  }
  recognition.onend = () => {
    recognition = null
    const text = finalText.trim()
    el.live.textContent = ''
    if (!text) {
      conversationLive = false
      if (phase === 'listening') setPhase('idle', failed ? undefined : 'Duymadım — tekrar dokun')
      return
    }
    if (conversationLive && isStopPhrase(text)) {
      conversationLive = false
      setPhase('idle', 'Tamam — dokununca yine dinlerim')
      return
    }
    ask(text)
  }
  try {
    recognition.start()
    setPhase('listening')
  } catch {
    recognition = null
    setPhase('idle')
  }
}

function stopListening() {
  if (recognition) { try { recognition.stop() } catch { /* zaten durdu */ } }
}

// ── Seslendirme ──
let trVoice = null
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  const tr = voices.filter(v => /^tr(-|_|$)/i.test(v.lang))
  trVoice = tr.find(v => /google/i.test(v.name)) || tr[0] || null
}
if ('speechSynthesis' in window) {
  pickVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

function speakChunk(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'
    if (trVoice) u.voice = trVoice
    u.rate = 1.03
    // Bazı Android sürümlerinde 'end' gelmeyebiliyor → metin uzunluğuna göre güvenlik süresi
    const guard = setTimeout(resolve, 4000 + text.length * 110)
    u.onend = () => { clearTimeout(guard); resolve() }
    u.onerror = () => { clearTimeout(guard); resolve() }
    window.speechSynthesis.speak(u)
  })
}

async function speak(text) {
  if (!('speechSynthesis' in window)) return false
  const parts = splitForSpeech(speakable(text))
  if (!parts.length) return false
  speakingCancelled = false
  setPhase('speaking')
  window.speechSynthesis.cancel()
  for (const p of parts) {
    if (speakingCancelled) break
    await speakChunk(p)
  }
  const finished = !speakingCancelled
  if (phase === 'speaking') setPhase('idle')
  return finished
}

function stopSpeaking() {
  speakingCancelled = true
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

// ── Soru ──
async function ask(text) {
  const question = String(text || '').trim()
  if (!question || phase === 'thinking') return
  stopSpeaking()
  turn = initialTurn()
  el.question.textContent = `“${question}”`
  setPhase('thinking')
  renderTurn()
  let res
  try {
    const sessionId = await ensureSession()
    res = await fetch('/api/hermes/ask', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: question, session_id: sessionId }),
    })
    if (res.status === 404 && await refreshSession()) {
      res = await fetch('/api/hermes/ask', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: question, session_id: sessionId }),
      })
    }
    if (res.status === 404) throw Object.assign(new Error('Oturumun kapanmış.'), { auth: true })
    if (!res.ok || !res.body) {
      let msg = `Hata ${res.status}`
      try { msg = (await res.json()).error || msg } catch { /* gövde yok */ }
      throw new Error(msg)
    }
    for await (const { data } of readSse(streamChunks(res.body))) {
      if (!data || typeof data !== 'object') continue
      const before = turn.approval
      turn = reduceTurn(turn, data)
      if (turn.approval && !before && settings.speak) {
        speakChunk('Hermes bir işlem için onay istiyor. Ekrandan onayla ya da reddet.')
      }
      renderTurn()
    }
    if (turn.phase === 'thinking') turn = reduceTurn(turn, { type: 'error', message: 'Yanıt yarıda kesildi' })
  } catch (e) {
    turn = reduceTurn(turn, { type: 'error', message: e.message || 'Bağlantı hatası' })
    if (e.auth) authLost()
  }
  setPhase('idle')
  renderTurn()
  if (turn.phase === 'done') {
    pushHistory(question, turn.answer)
    renderHistory()
    if (settings.speak) {
      const finished = await speak(turn.answer)
      if (finished && settings.conversation && document.visibilityState === 'visible') {
        conversationLive = true
        listen()
      }
    }
  } else {
    conversationLive = false
  }
}

// ── Olaylar ──
el.mic.addEventListener('click', () => {
  if (phase === 'listening') return stopListening()
  if (phase === 'speaking') { conversationLive = false; stopSpeaking(); return setPhase('idle') }
  if (phase === 'thinking') return
  conversationLive = settings.conversation
  listen()
})

el.typeForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const text = el.typeInput.value.trim()
  if (!text) return
  el.typeInput.value = ''
  el.typeInput.blur()
  conversationLive = false
  ask(text)
})

el.stop.addEventListener('click', async () => {
  if (!turn?.runId) return
  el.stop.disabled = true
  try { await api(`/api/hermes/runs/${encodeURIComponent(turn.runId)}/stop`, { method: 'POST' }) } catch (e) { notice(e.message) }
  el.stop.disabled = false
})

async function decide(choice) {
  const a = turn?.approval
  if (!a) return
  el.approveOnce.disabled = true
  el.approveDeny.disabled = true
  try {
    await api(`/api/hermes/runs/${encodeURIComponent(a.runId)}/approval`, {
      method: 'POST', body: { choice, request_id: a.requestId },
    })
    turn = { ...turn, approval: null }
    renderTurn()
  } catch (e) { notice(e.message) }
  el.approveOnce.disabled = false
  el.approveDeny.disabled = false
}
el.approveOnce.addEventListener('click', () => decide('once'))
el.approveDeny.addEventListener('click', () => decide('deny'))

el.speakAgain.addEventListener('click', () => { if (turn?.answer) speak(turn.answer) })

el.newChat.addEventListener('click', async () => {
  if (phase === 'thinking') return
  stopSpeaking()
  try {
    await ensureSession(true)
    turn = null
    renderTurn()
    notice('Yeni sohbet başladı.')
    setTimeout(() => notice(''), 2500)
  } catch (e) { e.auth ? authLost() : notice(e.message) }
})

// Ayarlar
const form = el.settings.querySelector('form')
el.settingsBtn.addEventListener('click', () => {
  for (const [k, v] of Object.entries(settings)) { if (form.elements[k]) form.elements[k].checked = Boolean(v) }
  el.settings.showModal()
})
form.addEventListener('change', () => {
  settings = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, Boolean(form.elements[k]?.checked)]))
  store.set('hermes.settings', settings)
})

// Arka plana geçince mikrofon ve ses kapanır (telefon cebe girdi / başka uygulama)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    conversationLive = false
    if (recognition) { try { recognition.abort() } catch { /* yok */ } }
    stopSpeaking()
    if (phase !== 'thinking') setPhase('idle')
  } else if (settings.autoListen && phase === 'idle') {
    // Uygulama yeniden öne gelince ("Hey Google, Hermes'i aç" tekrar) hemen dinle
    conversationLive = settings.conversation
    listen()
  }
})

// ── Açılış ──
async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/hermes/sw.js', { scope: '/hermes/' }).catch(() => { /* çevrimdışı önbellek opsiyonel */ })
  }
  setPhase('idle')
  renderHistory()
  try {
    const s = await api('/api/hermes/status')
    if (!s.configured) {
      el.dot.className = 'dot bad'
      notice('Sesli Hermes bu sunucuda henüz kurulmamış.')
      return
    }
    el.dot.className = s.reachable ? 'dot ok' : 'dot bad'
    if (!s.reachable) notice('Hermes şu an yanıt vermiyor; birazdan tekrar dene.')
  } catch (e) {
    if (e.auth) return authLost()
    el.dot.className = 'dot bad'
    notice(e.message)
    return
  }
  if (!SR) notice('Bu tarayıcı sesle yazmayı desteklemiyor. Android\'de Chrome ile aç ya da yazarak sor.')
  if (settings.autoListen && SR) {
    conversationLive = settings.conversation
    listen()
  }
}

boot()
