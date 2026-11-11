// API kataloğu — ajan (Hermes) "YYS'de bunu hangi uçla yaparım?" sorusunu buradan yanıtlar.
// Elle tutulan bir liste DEĞİLDİR: uçlar, yetki kuralları ve gövde şemaları çalışan Express uygulamasından,
// açıklamalar route dosyalarındaki uç üstü yorumlardan okunur. Yeni uç eklenince katalog kendiliğinden güncellenir.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { agentBlockReason } from './gate.js'

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAFF_ROLES = ['campus_manager', 'shift_supervisor', 'technical', 'laundry', 'housekeeper']
const METHODS = ['get', 'post', 'put', 'patch', 'delete']

// '/^\/api\/water\/?(?=\/|$)/i' → '/api/water' (Express 4 mount katmanı)
function mountPath(layer) {
  if (layer.regexp?.fast_slash) return ''
  const m = String(layer.regexp).match(/^\/\^((?:\\\/[^\\/?()[\]*+]+)*)\\\/\?\(\?=\\\/\|\$\)\/i$/)
  return m ? m[1].replace(/\\\//g, '/') : null
}

function walk(stack, prefix, inherited, out) {
  const guards = [...inherited]
  for (const layer of stack) {
    if (layer.route) {
      const handles = layer.route.stack.map(l => l.handle)
      const routeGuards = [...guards, ...handles.map(h => h.guard).filter(Boolean)]
      const validation = handles.map(h => h.validation).filter(Boolean)
      for (const sub of [].concat(layer.route.path)) {
        if (typeof sub !== 'string') continue
        for (const method of METHODS) {
          if (!layer.route.methods[method]) continue
          out.push({ method: method.toUpperCase(), path: `${prefix}${sub}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1'), guards: routeGuards, validation })
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mount = mountPath(layer)
      if (mount == null) continue
      // yol verilmeden bağlanan alt router'ın guard'ı kardeşlerine sızmaz; kendi kapsamında kalır
      walk(layer.handle.stack, prefix + mount, guards, out)
    } else if (layer.handle?.guard && mountPath(layer) === '') {
      guards.push(layer.handle.guard) // router.use(requireX) — sonraki tüm uçlara uygulanır
    }
  }
}

// Guard listesi → kimler çağırabilir. roles=null: personel oturumuyla çağrılmaz (kiosk/cihaz) ya da kural uç içinde.
function accessOf(guards) {
  let roles = null
  let kind = guards.length ? 'auth' : 'custom'
  for (const g of guards) {
    if (g.kind === 'kiosk' || g.kind === 'device') return { kind: g.kind, roles: [] }
    if (g.kind === 'role') { roles = roles ? roles.filter(r => g.roles.includes(r)) : [...g.roles]; kind = 'role' }
    else if (g.kind === 'staff') { roles = roles ? roles.filter(r => STAFF_ROLES.includes(r)) : [...STAFF_ROLES]; kind = kind === 'role' ? kind : 'staff' }
    else if (g.kind === 'laundry_operator') { roles = ['campus_manager']; kind = 'role' }
    else if (g.kind === 'kiosk_or_staff' && !roles) { roles = [...STAFF_ROLES]; kind = 'staff' }
  }
  if (kind === 'auth') roles = [...STAFF_ROLES]
  return { kind, roles }
}

// ── Açıklamalar: route dosyalarında ucun hemen üstündeki // yorum satırları ─────────────────────────
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) { if (name !== 'migrations' && name !== 'node_modules') sourceFiles(full, out) }
    else if (name.endsWith('.js') && !name.endsWith('.test.js')) out.push(full)
  }
  return out
}

const ROUTE_RE = /^[ \t]*(\w+)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`\n]+)\3/gm

function leadingComment(text, index) {
  const lines = text.slice(0, index).split('\n')
  lines.pop()
  const picked = []
  for (let i = lines.length - 1; i >= 0 && picked.length < 6; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('//')) break
    const body = line.replace(/^\/\/+\s?/, '').trim()
    if (/^[─═\-=*\s]*$/.test(body)) break
    picked.unshift(body.replace(/^[─═]+\s*|\s*[─═]+$/g, ''))
  }
  return picked.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400)
}

// (METHOD, alt yol) → [{file, text}] — tam yol statik bilinmediği için alt yol + dosya modülüyle eşlenir.
function scanDescriptions() {
  const index = new Map()
  for (const file of sourceFiles(SRC_ROOT)) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    if (!text.includes('Router')) continue
    const rel = relative(SRC_ROOT, file).split('\\').join('/')
    for (const m of text.matchAll(ROUTE_RE)) {
      const key = `${m[2].toUpperCase()} ${m[4]}`
      const entry = { file: rel, index: m.index, text: leadingComment(text, m.index) }
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(entry)
    }
  }
  return index
}

// Bir alt yol birden çok dosyada varsa: tam yolun parçalarıyla en çok örtüşen dosya kazanır.
function pickDescription(candidates, fullPath) {
  if (!candidates?.length) return null
  if (candidates.length === 1) return candidates[0]
  const segs = fullPath.toLowerCase().split('/').filter(Boolean)
  let best = null
  let bestScore = -1
  for (const c of candidates) {
    const f = c.file.toLowerCase()
    const score = segs.reduce((n, s) => n + (s.length > 2 && !s.startsWith(':') && f.includes(s) ? 1 : 0), 0)
    if (score > bestScore) { best = c; bestScore = score }
  }
  return bestScore > 0 ? best : null
}

function moduleOf(path) {
  const segs = path.split('/').filter(Boolean)
  if (segs[0] !== 'api') return segs[0] || ''
  return segs[1] === 'settings' && segs[2] ? segs[2] : (segs[1] || '')
}

function jsonSchema(schema) {
  try { return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) } catch { return null }
}

let cache = null

export function buildCatalog(app) {
  if (cache) return cache
  const raw = []
  walk(app._router?.stack || [], '', [], raw)
  let descriptions = new Map()
  try { descriptions = scanDescriptions() } catch { /* kaynak okunamazsa açıklamasız katalog */ }
  const seen = new Set()
  const entries = []
  for (const r of raw) {
    const id = `${r.method} ${r.path}`
    if (seen.has(id) || !r.path.startsWith('/api/')) continue
    seen.add(id)
    // Yorumlar router'a göre alt yolla yazılı: tam yolun en uzun ekinden başlayarak eşleşen ilk alt yol alınır
    // ('/api/water/zones/:id' → '/zones/:id'); kök uç ('/api/users' → '/') en sona kalır.
    const parts = r.path.split('/').filter(Boolean)
    let candidates = null
    for (let i = 1; i < parts.length && !candidates; i++) {
      candidates = descriptions.get(`${r.method} /${parts.slice(i).join('/')}`) || null
    }
    if (!candidates) candidates = descriptions.get(`${r.method} /`) || null
    const desc = pickDescription(candidates, r.path)
    const access = accessOf(r.guards)
    const apiPath = r.path.slice(4).toLowerCase()
    entries.push({
      method: r.method,
      path: r.path,
      module: moduleOf(r.path),
      description: desc?.text || '',
      source: desc?.file || null,
      source_index: desc?.index ?? null,
      access: access.kind,
      roles: access.roles,
      agent_blocked: agentBlockReason(apiPath, r.method),
      validation: r.validation,
    })
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  cache = entries
  return cache
}

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
const fold = s => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => TR_MAP[c])

// Yollar İngilizce, konuşma Türkçe: arama sözcüğü yoldaki karşılıklarıyla genişletilir (ön ek eşleşmesi —
// 'dagitimlar' da 'dagitim'i bulur). Eksik bir sözcük aramayı bozmaz, yalnız genişletmez.
const GLOSSARY = {
  su: ['water'], damacana: ['water'], tir: ['truck'], dagitim: ['distribut'], sayim: ['count'], iade: ['return'],
  stok: ['stock', 'inventory'], depo: ['inventory', 'locations'], envanter: ['inventory'], malzeme: ['inventory', 'supplies'],
  tedarik: ['supplier'], siparis: ['/po'], urun: ['product'], bolge: ['zone'], hareket: ['movement'],
  camasir: ['laundry'], torba: ['bag'], makine: ['machine'], utu: ['ironing'], kiyafet: ['garment', 'uniform'], teslim: ['deliver', 'pickup'],
  temizlik: ['housekeeping', 'cleaning'], gorev: ['task'], oda: ['room'], blok: ['block'], kat: ['floor'], doluluk: ['occupancy', 'capacity'],
  kapasite: ['capacity'], yatak: ['capacity', 'bed'], giris: ['checkin', 'intake', 'arrival'], cikis: ['checkout'], konaklama: ['checkin', 'capacity'],
  sakin: ['personnel', 'self-service'], personel: ['personnel', 'staff', 'workers'], calisan: ['staff', 'workers', 'personnel'], kadro: ['roster', 'staff'],
  isci: ['personnel', 'staff'], firma: ['compan'], sirket: ['compan'], proje: ['project'], bolum: ['department'], departman: ['department'],
  vardiya: ['shift'], cizelge: ['schedule'], puantaj: ['puantaj', 'attendance'], devam: ['attendance'], izin: ['leave'], mesai: ['overtime'],
  foy: ['signature'], imza: ['signature'], tatil: ['holiday'], takas: ['swap'], rotasyon: ['rotation'],
  ariza: ['maintenance', 'fault'], bakim: ['maintenance'], teknik: ['maintenance', 'technician'], tamir: ['maintenance'],
  disiplin: ['discipline'], ceza: ['discipline'], tutanak: ['discipline', 'incident'], guvenlik: ['safety'], isg: ['safety'],
  kaza: ['accident'], olay: ['incident'], tatbikat: ['drill'], kkd: ['kkd'], zimmet: ['zimmet', 'assign'],
  yemek: ['meal'], yemekhane: ['meal'], mutfak: ['kitchen', 'meal'], servis: ['transport'], ulasim: ['transport'], sefer: ['trip'],
  arac: ['vehicle'], sofor: ['driver'], durak: ['stop'], guzergah: ['route'], ziyaretci: ['visitor'], misafir: ['visitor'],
  rapor: ['report'], ozet: ['summary', 'overview', 'dashboard'], istatistik: ['stats', 'analytics'], analiz: ['analytics'], pano: ['dashboard', 'board'],
  duyuru: ['announcement'], bildirim: ['notification', 'push'], mesaj: ['message', 'comms', 'whatsapp'], mail: ['email'], eposta: ['email'],
  anket: ['survey'], sikayet: ['feedback', 'review'], oneri: ['suggestion', 'feedback'], geribildirim: ['feedback'],
  kullanici: ['user'], yetki: ['role', 'access'], kart: ['card'], istasyon: ['station'], cihaz: ['device', 'kiosk'], qr: ['qr', 'location-portal'],
  etiket: ['label', 'location-portal'], belge: ['document'], evrak: ['document'], masraf: ['expense'], gider: ['expense'], harcama: ['expense'],
  yedek: ['backup'], hata: ['error'], ayar: ['setting', 'config', 'prefs'], otomasyon: ['automation'], kural: ['rule', 'automation'],
  performans: ['performance'], puan: ['point'], hedef: ['goal'], harita: ['map'], kampus: ['campus'], gecmis: ['history', 'log'],
  toplu: ['bulk', 'batch'], sablon: ['template'], fotograf: ['photo'], yazdir: ['print', 'pdf'], indir: ['download', 'export'], disa: ['export'],
  ice: ['import'], aktar: ['import', 'export'], onay: ['approv'], iptal: ['cancel', 'revoke'], ara: ['search'], ik: ['/hr'], ozluk: ['/hr', 'document'],
  kvkk: ['kvkk'], durum: ['state', 'status'], liste: ['list'], kilit: ['lock'], ogun: ['meal'], menu: ['meal', 'menu'], sozlesme: ['document', 'contract'], avans: ['expense'], denetim: ['audit', 'integrity', 'activity'],
}

function expandTerm(term) {
  const out = [term]
  for (const [tr, en] of Object.entries(GLOSSARY)) {
    if (term === tr || (tr.length >= 4 && term.startsWith(tr))) out.push(...en)
  }
  return out
}

function callableBy(entry, user) {
  if (entry.agent_blocked && user?.agent) return false
  if (entry.roles == null) return null // kural uç içinde — denemeden bilinmez
  return entry.roles.includes(user?.role)
}

// q: boşlukla ayrılmış sözcüklerin HEPSİ yol/açıklama/modülde geçmeli. Sonuç en ilgiliden başlar.
export function searchCatalog(app, { q = '', module = '', method = '', only_callable = false, schema = false, limit = 60, offset = 0 } = {}, user = null) {
  const all = buildCatalog(app)
  const terms = fold(q).split(/\s+/).filter(Boolean).map(expandTerm)
  const mod = fold(module)
  const meth = String(method || '').toUpperCase()
  const scored = []
  for (const e of all) {
    if (mod && fold(e.module) !== mod) continue
    if (meth && e.method !== meth) continue
    const callable = callableBy(e, user)
    if (only_callable && callable === false) continue
    const hayPath = fold(e.path)
    const hay = `${hayPath} ${fold(e.description)} ${fold(e.module)}`
    // Sözcüklerin hepsi şart değil: en çok sözcüğü karşılayan (ve yolda karşılayan) uç en üste gelir.
    let matched = 0
    let score = 0
    for (const variants of terms) {
      if (variants.some(t => hayPath.includes(t))) { matched++; score += 2 }
      else if (variants.some(t => hay.includes(t))) { matched++; score += 1 }
    }
    if (terms.length && !matched) continue
    score = matched * 10 + score - e.path.length / 1000
    scored.push({ e, callable, score })
  }
  if (terms.length) scored.sort((a, b) => b.score - a.score)
  const cap = Math.min(Math.max(Number(limit) || 60, 1), 500)
  const start = Math.max(Number(offset) || 0, 0)
  const items = scored.slice(start, start + cap).map(({ e, callable }) => {
    const item = {
      method: e.method, path: e.path, module: e.module, description: e.description,
      access: e.access, roles: e.roles, callable, source: e.source,
      ...(e.agent_blocked ? { agent_blocked: e.agent_blocked } : {}),
      has_schema: e.validation.length > 0,
    }
    if (schema && e.validation.length) {
      item.schemas = e.validation.map(v => ({ in: v.source, schema: jsonSchema(v.schema) }))
    }
    return item
  })
  return { total: scored.length, offset: start, count: items.length, items }
}

// Ucun kaynak kodu (üstündeki yorumla, bir sonraki uca kadar): şeması olmayan uçta gövde alanları buradan okunur.
export function endpointSource(app, method, path) {
  const meth = String(method || '').toUpperCase()
  const entry = buildCatalog(app).find(e => e.method === meth && e.path === path)
  if (!entry) return null
  if (!entry.source || entry.source_index == null) return { method: meth, path, source: null, code: null }
  const text = readFileSync(join(SRC_ROOT, entry.source), 'utf8')
  const before = text.slice(0, entry.source_index).split('\n')
  before.pop()
  let start = entry.source_index
  for (let i = before.length - 1; i >= 0 && before[i].trim().startsWith('//'); i--) start -= before[i].length + 1
  ROUTE_RE.lastIndex = 0
  let end = text.length
  for (const m of text.matchAll(ROUTE_RE)) { if (m.index > entry.source_index) { end = m.index; break } }
  const code = text.slice(start, end).replace(/(\n[ \t]*\/\/[^\n]*)+\s*$/, '').trimEnd()
  return {
    method: meth, path, source: entry.source, line: before.length + 1,
    code: code.length > 6000 ? `${code.slice(0, 6000)}\n// … (kesildi)` : code,
    schemas: entry.validation.map(v => ({ in: v.source, schema: jsonSchema(v.schema) })),
  }
}

// Backend kaynak dosyası okuma (yalnız src altındaki .js): gövde alanları çoğu uçta service katmanında
// çözülür; ajan kuralı tahmin etmek yerine koddan okur. grep verilirse yalnız eşleşen satırlar döner.
export function readSource(file, { from = 1, lines = 200, grep = '' } = {}) {
  const rel = String(file || '').split('\\').join('/')
  const full = join(SRC_ROOT, rel)
  const inside = relative(SRC_ROOT, full)
  if (!rel.endsWith('.js') || inside.startsWith('..') || inside.includes('..')) return null
  let text
  try { text = readFileSync(full, 'utf8') } catch { return null }
  const all = text.split('\n')
  if (grep) {
    const needle = fold(grep)
    const hits = []
    for (let i = 0; i < all.length && hits.length < 200; i++) {
      if (fold(all[i]).includes(needle)) hits.push({ line: i + 1, text: all[i].slice(0, 300) })
    }
    return { file: rel, total_lines: all.length, matches: hits }
  }
  const start = Math.max(Number(from) || 1, 1)
  const count = Math.min(Math.max(Number(lines) || 200, 1), 400)
  return { file: rel, total_lines: all.length, from: start, to: Math.min(start + count - 1, all.length), code: all.slice(start - 1, start - 1 + count).join('\n') }
}

export function catalogModules(app) {
  const counts = new Map()
  for (const e of buildCatalog(app)) counts.set(e.module, (counts.get(e.module) || 0) + 1)
  return [...counts].map(([module, endpoints]) => ({ module, endpoints })).sort((a, b) => a.module.localeCompare(b.module))
}

export function _resetCatalogForTests() { cache = null }
