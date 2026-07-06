#!/usr/bin/env node
// YYS toplu veri import aracı — roster (AVS personel) + envanter.
// API üzerinden çalışır: validation, audit log ve dept-from-role mantığı korunur.
//
// Kullanım:
//   YYS_ADMIN_USER=mudur YYS_ADMIN_PASS=*** node scripts/import/import-prod.mjs \
//     --url https://avskamp.com --roster scripts/import/roster.csv --inventory scripts/import/inventory.csv
//
//   Varsayılan DRY-RUN (hiçbir şey yazmaz, ne olacağını gösterir).
//   Gerçekten yazmak için --apply ekle.
//
// Idempotent: aynı isimli personel/ürün zaten varsa atlanır (tekrar çalıştırmak güvenli).

import { readFileSync } from 'node:fs'

// ── Argümanlar ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const has = (name) => args.includes(name)

const BASE = (getArg('--url') || 'http://localhost:3001').replace(/\/$/, '')
const ROSTER = getArg('--roster')
const INVENTORY = getArg('--inventory')
const APPLY = has('--apply')
const USER = process.env.YYS_ADMIN_USER
const PASS = process.env.YYS_ADMIN_PASS

const ALLOWED_CATEGORIES = ['housekeeping', 'maintenance', 'laundry', 'general']
// Backend ROLE_DEPT_MAP ile aynı (sadece uyarı amaçlı kontrol).
const ROLE_KEYWORDS = [/kat|meydanc|temizlik/i, /(çama|cama)şır|laundry/i, /teknik|bakım|bakim/i,
  /güvenlik|guvenlik|security/i, /mutfak|aşçı|asci/i, /idari|ofis|admin/i, /bahçe|bahce/i, /sağlık|saglik|revir/i]

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' }
const log = (m) => console.log(m)
const ok = (m) => log(`  ${C.green}✓${C.reset} ${m}`)
const skip = (m) => log(`  ${C.gray}↷ ${m}${C.reset}`)
const warn = (m) => log(`  ${C.yellow}!${C.reset} ${m}`)
const err = (m) => log(`  ${C.red}✗${C.reset} ${m}`)
const die = (m) => { console.error(`${C.red}HATA:${C.reset} ${m}`); process.exit(1) }

// ── Minimal CSV parser (tırnaklı alan + virgül destekli) ──────────────────────
function parseCsv(text) {
  const rows = []
  let field = '', row = [], inQuotes = false
  const s = text.replace(/^﻿/, '') // BOM
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(field); rows.push(row); field = ''; row = [] }
    else field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  // boş satırları at
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''))
  if (nonEmpty.length === 0) return []
  const header = nonEmpty[0].map(h => h.trim().toLowerCase())
  return nonEmpty.slice(1).map(r => {
    const o = {}; header.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim() }); return o
  })
}

// ── API helper ────────────────────────────────────────────────────────────────
// Auth httpOnly cookie tabanlı (login Set-Cookie döner, body'de token yok).
// Middleware cookie'yi kabul ettiği için login cookie'sini geri gönderiyoruz.
let cookie = null
async function api(method, path, body, raw = false) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data; try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error || text}`)
  return raw ? res : data
}

async function login() {
  if (!USER || !PASS) die('YYS_ADMIN_USER ve YYS_ADMIN_PASS env değişkenleri gerekli (admin kimliği).')
  const res = await api('POST', '/api/auth/login', { username: USER, password: PASS }, true)
  const setCookies = res.headers.getSetCookie?.() || []
  cookie = setCookies.map(c => c.split(';')[0]).join('; ')
  if (!cookie) die('Login başarılı ama session cookie dönmedi.')
}

// ── Roster import ───────────────────────────────────────────────────────────
async function importRoster() {
  log(`\n${C.cyan}━━ ROSTER (AVS personel) ━━${C.reset}  ${ROSTER}`)
  const rows = parseCsv(readFileSync(ROSTER, 'utf8'))
  if (rows.length === 0) return warn('Roster dosyası boş.')

  const existing = await api('GET', '/api/avs-workers')
  const byName = new Map(existing.map(w => [w.full_name.trim().toLowerCase(), w]))
  const pickups = await api('GET', '/api/transport/pickup-points').catch(() => [])
  const pickupByName = new Map((pickups || []).map(p => [String(p.name).trim().toLowerCase(), p.id]))

  let created = 0, skipped = 0, errors = 0
  for (const row of rows) {
    const full_name = row.full_name || row.ad || row['ad soyad'] || ''
    if (!full_name || full_name.length < 2) { err(`Geçersiz ad atlandı: "${full_name}"`); errors++; continue }
    if (byName.has(full_name.toLowerCase())) { skip(`${full_name} (zaten var)`); skipped++; continue }

    const role_label = row.role_label || row.gorev || row.görev || ''
    const pin = (row.pin || '').trim()
    const phone = row.phone || row.telefon || ''
    const pickupRaw = (row.pickup_point || row.pickup || row.servis || '').trim()

    // Uyarılar (engellemez)
    if (role_label && !ROLE_KEYWORDS.some(rx => rx.test(role_label)))
      warn(`${full_name}: role_label "${role_label}" hiçbir departmana eşleşmiyor → envanter/vardiya erişimi olmayabilir`)
    if (pin && !/^\d{4}$/.test(pin)) { err(`${full_name}: PIN 4 haneli rakam olmalı ("${pin}") → atlandı`); errors++; continue }

    let pickup_point_id = null
    if (pickupRaw) {
      if (/^\d+$/.test(pickupRaw)) pickup_point_id = +pickupRaw
      else if (pickupByName.has(pickupRaw.toLowerCase())) pickup_point_id = pickupByName.get(pickupRaw.toLowerCase())
      else warn(`${full_name}: pickup "${pickupRaw}" bulunamadı → boş bırakıldı`)
    }

    if (!APPLY) {
      ok(`[dry] OLUŞTUR ${full_name}${role_label ? ` (${role_label})` : ''}${pin ? ' +PIN' : ''}${pickup_point_id ? ` pickup#${pickup_point_id}` : ''}`)
      created++; continue
    }
    try {
      const w = await api('POST', '/api/avs-workers', { full_name, role_label: role_label || null, pickup_point_id, phone: phone || null })
      if (pin) await api('PUT', `/api/avs-workers/${w.id}/pin`, { new_pin: pin })
      ok(`${full_name} oluşturuldu (id ${w.id}, dept ${w.department_name || '-'})${pin ? ' +PIN' : ''}`)
      created++
    } catch (e) { err(`${full_name}: ${e.message}`); errors++ }
  }
  log(`  ${C.cyan}Özet:${C.reset} ${created} oluştur${APPLY ? 'uldu' : '(dry)'}, ${skipped} atlandı, ${errors} hata`)
}

// ── Inventory import ──────────────────────────────────────────────────────────
async function importInventory() {
  log(`\n${C.cyan}━━ ENVANTER ━━${C.reset}  ${INVENTORY}`)
  const rows = parseCsv(readFileSync(INVENTORY, 'utf8'))
  if (rows.length === 0) return warn('Envanter dosyası boş.')

  const existing = await api('GET', '/api/inventory')
  const list = Array.isArray(existing) ? existing : (existing.data || [])
  const byName = new Set(list.map(i => String(i.item_name).trim().toLowerCase()))

  let created = 0, skipped = 0, errors = 0
  for (const row of rows) {
    const item_name = row.item_name || row.urun || row.ürün || row.ad || ''
    const unit = row.unit || row.birim || ''
    const category = (row.category || row.kategori || '').toLowerCase()
    if (!item_name || !unit || !category) { err(`Eksik alan (ad/birim/kategori): ${JSON.stringify(row)}`); errors++; continue }
    if (byName.has(item_name.trim().toLowerCase())) { skip(`${item_name} (zaten var)`); skipped++; continue }
    if (!ALLOWED_CATEGORIES.includes(category))
      warn(`${item_name}: kategori "${category}" kiosk gating dışı (beklenen: ${ALLOWED_CATEGORIES.join('/')}) → yine de eklenir`)

    const payload = {
      item_name, unit, category,
      quantity: row.quantity ? Number(row.quantity) : 0,
      reorder_threshold: row.reorder_threshold ? Number(row.reorder_threshold) : 0,
      unit_price: row.unit_price ? Number(row.unit_price) : 0,
      location: row.location || null,
      track_locations: ['1', 'true', 'evet'].includes(String(row.track_locations || '').toLowerCase()) ? 1 : 0,
    }
    if (!APPLY) { ok(`[dry] EKLE ${item_name} (${payload.quantity} ${unit}, ${category})`); created++; continue }
    try {
      const r = await api('POST', '/api/inventory', payload)
      ok(`${item_name} eklendi (id ${r.id}, ${payload.quantity} ${unit}, ${category})`)
      created++
    } catch (e) { err(`${item_name}: ${e.message}`); errors++ }
  }
  log(`  ${C.cyan}Özet:${C.reset} ${created} eklen${APPLY ? 'di' : '(dry)'}, ${skipped} atlandı, ${errors} hata`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  if (!ROSTER && !INVENTORY) die('En az --roster veya --inventory ver.')
  log(`${C.cyan}YYS Import${C.reset} → ${BASE}  ${APPLY ? `${C.red}[APPLY — gerçek yazma]${C.reset}` : `${C.yellow}[DRY-RUN]${C.reset}`}`)
  await login()
  ok(`Login OK (${USER})`)
  if (ROSTER) await importRoster()
  if (INVENTORY) await importInventory()
  if (!APPLY) log(`\n${C.yellow}Bu bir DRY-RUN'dı. Gerçekten yazmak için komuta --apply ekle.${C.reset}`)
})().catch(e => die(e.message))
