// Sesli Hermes API'si — yalnız SAHİP (users.is_owner=1, campus_manager). Diğer herkes her uçta 404 alır
// (özel finans kasasıyla aynı görünmezlik). Hermes'in anahtarı tarayıcıya hiç inmez; sayfa yalnız bu vekille konuşur.
// Soru/yanıt içeriği firma denetim günlüğüne YAZILMAZ (kişisel asistan); Hermes kendi oturum geçmişini tutar.
import { Router } from 'express'
import { logger } from '../../shared/logger.js'
import { sessionUser, isOwner } from '../../shared/auth/owner.js'
import {
  SAFE_ID, hermesConfig, hermesHealth, createHermesSession, hermesChatStream, hermesRunApproval, hermesRunStop,
} from './client.js'
import { VOICE_INSTRUCTIONS, MAX_INPUT, beginAsk, endAsk, relayHermesStream } from './service.js'

export const hermesVoiceRouter = Router()

const hide = res => res.status(404).json({ error: 'Bulunamadı' })

// Hermes'e ulaşılamaması / meşgul olması kullanıcı durumudur, sunucu hatası değil: anlaşılır mesajla döner,
// hata kaydına (ve oradan Telegram bekçisine) düşmez. Beklenmeyen hata global işleyiciye gider.
function reply(res, next, e) {
  if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message })
  return next(e)
}

// nginx auth_request alt isteği (/hermes/ sayfası). Doğrudan çağrı 404: kapının varlığı dışarıdan anlaşılmaz.
hermesVoiceRouter.get('/gate', (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (!req.get('x-original-uri')) return hide(res)
  const user = sessionUser(req)
  if (!user) return res.status(401).end()
  return isOwner(user) ? res.status(204).end() : res.status(403).end()
})

function ownerOnly(req, res, next) {
  res.set('Cache-Control', 'no-store')
  const user = sessionUser(req)
  if (!isOwner(user)) return hide(res)
  req.owner = user
  next()
}

hermesVoiceRouter.get('/status', ownerOnly, async (req, res) => {
  const { configured } = hermesConfig()
  res.json({ configured, reachable: configured ? await hermesHealth() : false })
})

// Yeni sohbet: Hermes'te boş oturum açar. Sayfa kimliği saklar; aynı oturumdaki sorular bağlamı paylaşır.
hermesVoiceRouter.post('/session', ownerOnly, async (req, res, next) => {
  try {
    const stamp = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short',
    }).format(new Date())
    res.json({ session_id: await createHermesSession(`Sesli asistan · ${stamp}`) })
  } catch (e) { reply(res, next, e) }
})

// Bir soru → Hermes turu; yanıt SSE akışı (event: run|tool|note|delta|approval|answer|done|error|cancelled).
hermesVoiceRouter.post('/ask', ownerOnly, async (req, res, next) => {
  const text = String(req.body?.text ?? '').trim()
  const sessionId = String(req.body?.session_id ?? '')
  if (!text) return res.status(400).json({ error: 'Soru boş' })
  if (text.length > MAX_INPUT) return res.status(400).json({ error: `Soru en fazla ${MAX_INPUT} karakter olabilir` })
  if (!SAFE_ID.test(sessionId)) return res.status(400).json({ error: 'Geçersiz oturum' })
  if (!beginAsk(req.owner.id)) return res.status(409).json({ error: 'Önceki soru hâlâ yanıtlanıyor' })

  let upstream
  try {
    upstream = await hermesChatStream(sessionId, { input: text, instructions: VOICE_INSTRUCTIONS })
  } catch (e) {
    endAsk(req.owner.id)
    return reply(res, next, e)
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
  // Sayfa kapanırsa Hermes turu YARIDA KESİLMEZ (ör. bir kayıt yazılıyor olabilir): akış sonuna dek okunur,
  // yalnız sayfaya yazım durur. Sonuç Hermes oturum geçmişinde kalır.
  let open = true
  res.on('close', () => { open = false })
  const send = evt => { if (open) res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`) }
  const started = Date.now()
  try {
    const { terminal } = await relayHermesStream(upstream.body, send)
    if (!terminal) send({ type: 'error', message: 'Hermes akışı yarıda kesildi' })
    logger.info({ ms: Date.now() - started, chars: text.length, terminal }, '[HermesVoice] tur bitti')
  } catch (e) {
    logger.warn({ err: e.message }, '[HermesVoice] akış koptu')
    send({ type: 'error', message: 'Hermes bağlantısı koptu' })
  } finally {
    endAsk(req.owner.id)
    if (open) res.end()
  }
})

// Hermes riskli bir komut için onay isterse: sesli arayüzden yalnız "bir kez izin ver" ya da "reddet"
// (kalıcı izin — session/always — bilinçli olarak yok; o kararlar Telegram'da verilsin).
hermesVoiceRouter.post('/runs/:runId/approval', ownerOnly, async (req, res, next) => {
  const { runId } = req.params
  const choice = String(req.body?.choice ?? '')
  const requestId = req.body?.request_id == null ? null : String(req.body.request_id)
  if (!SAFE_ID.test(runId)) return res.status(400).json({ error: 'Geçersiz çalıştırma' })
  if (!['once', 'deny'].includes(choice)) return res.status(400).json({ error: 'Seçim once ya da deny olmalı' })
  if (requestId !== null && !SAFE_ID.test(requestId)) return res.status(400).json({ error: 'Geçersiz onay isteği' })
  try {
    res.json(await hermesRunApproval(runId, { choice, request_id: requestId }))
  } catch (e) { reply(res, next, e) }
})

hermesVoiceRouter.post('/runs/:runId/stop', ownerOnly, async (req, res, next) => {
  const { runId } = req.params
  if (!SAFE_ID.test(runId)) return res.status(400).json({ error: 'Geçersiz çalıştırma' })
  try {
    res.json(await hermesRunStop(runId))
  } catch (e) { reply(res, next, e) }
})
