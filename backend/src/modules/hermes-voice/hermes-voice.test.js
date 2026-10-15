import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { mapHermesEvent, toolLabel, VOICE_INSTRUCTIONS, _resetForTests } from './service.js'
import { readSse } from './sse.js'

const KEY = 'test-hermes-api-key-0123456789abcdef'
let fake, fakeUrl, keyDir, keyFile
let ownerToken, managerToken
const seen = []           // sahte Hermes'e gelen istekler
let streamGate = null     // doluysa sohbet akışı bu söz çözülene dek bekler
let chatStatus = 200      // sohbet akışı HTTP durumu (hata senaryoları)

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function fakeHermes(req, res) {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', async () => {
    const parsed = body ? JSON.parse(body) : null
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: parsed })
    if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401).end('{}'); return }
    if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok' }))
    if (req.method === 'POST' && req.url === '/api/sessions') {
      return res.end(JSON.stringify({ object: 'hermes.session', session: { id: 'api_1_abc', title: parsed.title } }))
    }
    if (req.method === 'POST' && /^\/api\/sessions\/[^/]+\/chat\/stream$/.test(req.url)) {
      if (chatStatus !== 200) { res.writeHead(chatStatus, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"busy"}}') }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const run = { run_id: 'run_42', session_id: 'api_1_abc' }
      res.write(sse('run.started', { ...run, user_message: { content: parsed.input } }))
      res.write(': keepalive\n\n')
      res.write(sse('message.started', { ...run, message: { id: 'm1' } }))
      res.write(sse('tool.started', { ...run, tool_name: 'skill_view', preview: 'avs-personnel' }))
      res.write(sse('tool.completed', { ...run, tool_name: 'skill_view' }))
      // olay iki TCP parçasına bölünür: ayrıştırıcı yarım bloğu beklemeli
      const half = sse('tool.started', { ...run, tool_name: 'terminal', preview: '/home/hermes/.local/bin/avs-ops tg bolum teknik' })
      res.write(half.slice(0, 25))
      await new Promise(r => setTimeout(r, 15))
      res.write(half.slice(25))
      res.write(sse('tool.completed', { ...run, tool_name: 'terminal' }))
      if (streamGate) await streamGate
      res.write(sse('tool.progress', { ...run, tool_name: '_thinking', delta: 'gizli düşünce' }))
      res.write(sse('assistant.delta', { ...run, delta: 'Bugün ' }))
      res.write(sse('assistant.delta', { ...run, delta: 'dokuz kişi çalışıyor.' }))
      res.write(sse('assistant.completed', { ...run, content: 'Bugün dokuz kişi çalışıyor.' }))
      res.write(sse('run.completed', { ...run, completed: true }))
      res.write(sse('done', run))
      return res.end()
    }
    if (req.method === 'POST' && /^\/v1\/runs\/[^/]+\/approval$/.test(req.url)) return res.end(JSON.stringify({ resolved: 1 }))
    if (req.method === 'POST' && /^\/v1\/runs\/[^/]+\/stop$/.test(req.url)) return res.end(JSON.stringify({ status: 'stopping' }))
    res.writeHead(404).end('{}')
  })
}

const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
const as = (token, r) => (token ? r.set('Authorization', `Bearer ${token}`) : r)

// supertest SSE yanıtını metin olarak toplar → olay listesi
async function eventsOf(text) {
  const out = []
  for await (const e of readSse([text])) out.push(e)
  return out
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  db.prepare(`INSERT INTO users(username, password_hash, role, full_name)
    SELECT 'patron', password_hash, 'campus_manager', 'Patron' FROM users WHERE username='mudur'`).run()
  db.prepare("UPDATE users SET is_owner=1 WHERE username='patron'").run()
  ownerToken = await login('patron')
  managerToken = await login('mudur')

  fake = http.createServer(fakeHermes)
  await new Promise(r => fake.listen(0, '127.0.0.1', r))
  fakeUrl = `http://127.0.0.1:${fake.address().port}`
  keyDir = mkdtempSync(join(tmpdir(), 'hermes-key-'))
  keyFile = join(keyDir, 'hermes-api.key')
  writeFileSync(keyFile, `${KEY}\n`)
  process.env.HERMES_API_URL = fakeUrl
  process.env.HERMES_API_KEY_FILE = keyFile
})

afterAll(async () => {
  await new Promise(r => fake.close(r))
  rmSync(keyDir, { recursive: true, force: true })
  delete process.env.HERMES_API_URL
  delete process.env.HERMES_API_KEY_FILE
})

beforeEach(() => {
  seen.length = 0
  streamGate = null
  chatStatus = 200
  _resetForTests()
  process.env.HERMES_API_KEY_FILE = keyFile
})

describe('Sesli Hermes — görünmezlik ve kapı', () => {
  it('oturumsuz ve sahip olmayan müdür her uçta 404 alır; Hermes\'e hiç istek gitmez', async () => {
    for (const token of [null, managerToken]) {
      for (const [m, url] of [['get', '/api/hermes/status'], ['post', '/api/hermes/session'], ['post', '/api/hermes/ask'],
        ['post', '/api/hermes/runs/run_42/approval'], ['post', '/api/hermes/runs/run_42/stop']]) {
        const r = await as(token, request(app)[m](url)).send({ text: 'x', session_id: 'api_1_abc', choice: 'once' })
        expect(r.status, `${m} ${url}`).toBe(404)
        expect(r.body).toEqual({ error: 'Bulunamadı' })
      }
    }
    expect(seen).toEqual([])
  })

  it('gate: doğrudan çağrı 404; nginx alt isteğinde sahip 204, müdür 403, oturumsuz 401', async () => {
    expect((await as(ownerToken, request(app).get('/api/hermes/gate'))).status).toBe(404)
    const gate = t => as(t, request(app).get('/api/hermes/gate')).set('X-Original-URI', '/hermes/')
    expect((await gate(ownerToken)).status).toBe(204)
    expect((await gate(managerToken)).status).toBe(403)
    expect((await gate(null)).status).toBe(401)
  })
})

describe('Sesli Hermes — durum ve oturum', () => {
  it('status: anahtar dosyası varsa yapılandırılmış ve erişilebilir; yanıt önbelleğe alınmaz', async () => {
    const r = await as(ownerToken, request(app).get('/api/hermes/status'))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ configured: true, reachable: true })
    expect(r.headers['cache-control']).toBe('no-store')
    expect(seen[0]).toMatchObject({ url: '/health', auth: `Bearer ${KEY}` })
  })

  it('anahtar dosyası yoksa özellik kapalı: status configured=false, oturum 503 anlaşılır mesajla', async () => {
    process.env.HERMES_API_KEY_FILE = join(keyDir, 'yok.key')
    expect((await as(ownerToken, request(app).get('/api/hermes/status'))).body).toEqual({ configured: false, reachable: false })
    const r = await as(ownerToken, request(app).post('/api/hermes/session'))
    expect(r.status).toBe(503)
    expect(r.body.error).toMatch(/yapılandırılmamış/)
    expect(seen).toEqual([])
  })

  it('yeni sohbet Hermes\'te "Sesli asistan" başlıklı oturum açar', async () => {
    const r = await as(ownerToken, request(app).post('/api/hermes/session'))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ session_id: 'api_1_abc' })
    expect(seen[0].body.title).toMatch(/^Sesli asistan · /)
  })
})

describe('Sesli Hermes — soru akışı', () => {
  it('Hermes akışını sade olaylara çevirir: düşünce/keepalive sızmaz, parçalı olay doğru okunur', async () => {
    const r = await as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'Teknikte kimler var?', session_id: 'api_1_abc' })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/text\/event-stream/)
    const events = await eventsOf(r.text)
    expect(events.map(e => e.event)).toEqual(['run', 'tool', 'tool', 'tool', 'tool', 'delta', 'delta', 'answer', 'done'])
    expect(events[0].data).toEqual({ type: 'run', run_id: 'run_42', session_id: 'api_1_abc' })
    expect(events[1].data.label).toBe('Beceri: avs-personnel')
    expect(events[3].data.label).toBe('AVS / YYS kayıtlarına bakıyor')
    expect(events[7].data).toEqual({ type: 'answer', text: 'Bugün dokuz kişi çalışıyor.' })
    expect(r.text).not.toContain('gizli düşünce')

    const chat = seen.find(s => s.url.endsWith('/chat/stream'))
    expect(chat.body).toEqual({ input: 'Teknikte kimler var?', instructions: VOICE_INSTRUCTIONS })
  })

  it('doğrulama: boş soru, uzun soru, geçersiz oturum kimliği 400; Hermes\'e gitmez', async () => {
    for (const body of [{ text: '  ', session_id: 'api_1_abc' }, { text: 'x'.repeat(2001), session_id: 'api_1_abc' },
      { text: 'merhaba', session_id: '../../v1/runs' }, { text: 'merhaba' }]) {
      expect((await as(ownerToken, request(app).post('/api/hermes/ask')).send(body)).status).toBe(400)
    }
    expect(seen).toEqual([])
  })

  it('aynı anda ikinci soru 409; ilk bitince yeni soru kabul edilir', async () => {
    let release
    streamGate = new Promise(r => { release = r })
    const first = as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'bir', session_id: 'api_1_abc' }).then(x => x)
    await new Promise(r => setTimeout(r, 80))
    const second = await as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'iki', session_id: 'api_1_abc' })
    expect(second.status).toBe(409)
    release()
    expect((await first).status).toBe(200)
    streamGate = null
    expect((await as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'üç', session_id: 'api_1_abc' })).status).toBe(200)
  })

  it('Hermes meşgulse (429) anlaşılır mesaj; kilit bırakılır', async () => {
    chatStatus = 429
    const r = await as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'bir', session_id: 'api_1_abc' })
    expect(r.status).toBe(429)
    expect(r.body.error).toMatch(/meşgul/)
    chatStatus = 200
    expect((await as(ownerToken, request(app).post('/api/hermes/ask')).send({ text: 'iki', session_id: 'api_1_abc' })).status).toBe(200)
  })
})

describe('Sesli Hermes — onay ve durdurma', () => {
  it('onay yalnız once/deny; kalıcı izin (always/session) sesli arayüzden verilemez', async () => {
    for (const choice of ['always', 'session', '', 'evet']) {
      expect((await as(ownerToken, request(app).post('/api/hermes/runs/run_42/approval')).send({ choice })).status).toBe(400)
    }
    const ok = await as(ownerToken, request(app).post('/api/hermes/runs/run_42/approval')).send({ choice: 'once', request_id: 'req_7' })
    expect(ok.status).toBe(200)
    expect(seen.at(-1)).toMatchObject({ url: '/v1/runs/run_42/approval', body: { choice: 'once', request_id: 'req_7' } })
  })

  it('durdurma Hermes\'e iletilir; geçersiz çalıştırma kimliği 400', async () => {
    expect((await as(ownerToken, request(app).post('/api/hermes/runs/run_42/stop'))).body).toEqual({ status: 'stopping' })
    expect((await as(ownerToken, request(app).post('/api/hermes/runs/a%2Fb/stop'))).status).toBe(400)
  })
})

describe('Sesli Hermes — olay eşleme ve SSE ayrıştırıcı', () => {
  it('iç araçlar (_thinking) ve bilinmeyen olaylar iletilmez; onay ve hata eşlenir', () => {
    expect(mapHermesEvent('tool.started', { tool_name: '_thinking' })).toBeNull()
    expect(mapHermesEvent('message.started', {})).toBeNull()
    expect(mapHermesEvent('approval.request', { run_id: 'r', request_id: 'q', command: 'rm -rf /tmp/x', choices: ['once', 'deny'] }))
      .toEqual({ type: 'approval', run_id: 'r', request_id: 'q', command: 'rm -rf /tmp/x', description: null, choices: ['once', 'deny'] })
    expect(mapHermesEvent('run.failed', { error: 'kota doldu' })).toEqual({ type: 'error', message: 'kota doldu' })
    expect(toolLabel('web_search')).toBe('Web\'de arıyor')
    expect(toolLabel('bilinmeyen_arac')).toBe('Araç: bilinmeyen_arac')
  })

  it('readSse: CRLF, yorum satırı, çok satırlı data ve parça sınırları', async () => {
    const parts = ['event: a\r\ndata: {"x":', '1}\r\n\r\n: keepalive\n\n', 'event: b\ndata: satır1\ndata: satır2\n\n', 'data: {"son":true}']
    const out = []
    for await (const e of readSse(parts)) out.push(e)
    expect(out).toEqual([
      { event: 'a', data: { x: 1 } },
      { event: 'b', data: 'satır1\nsatır2' },
      { event: 'message', data: { son: true } },
    ])
  })
})
