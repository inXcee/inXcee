// Yetki kapsaması: uygulamadaki HER uca token'sız istek atılır. Yetki kontrolü
// route bazında yazıldığı için yeni bir uçta requireRole/requireAuth unutulursa
// bu test yakalar. Bilinçli herkese açık uçlar PUBLIC listesinde, gerekçesiyle.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
})

// Express 4 router ağacını gezip "METHOD /yol" listesi çıkarır.
function mountPath(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return ''
  const src = layer.regexp.source
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
  // Parametreli mount (/:id) regexp'e (?:([^\/]+?)) olarak gömülür
  return src.replace(/\(\?:\(\[\^\/\]\+\?\)\)/g, ':param').replace(/\$$/, '').replace(/^\^/, '')
}

function collectRoutes(stack, prefix = '', out = []) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(m => m !== '_all')
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]
      for (const p of paths) {
        if (typeof p !== 'string') continue
        for (const m of methods) out.push({ method: m.toUpperCase(), path: `${prefix}${p}`.replace(/\/+/g, '/') })
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collectRoutes(layer.handle.stack, `${prefix}${mountPath(layer)}`, out)
    }
  }
  return out
}

const concrete = path => path
  .replace(/:([A-Za-z_]+)\([^)]*\)/g, '1')
  .replace(/:([A-Za-z_]+)\??/g, (_m, name) => (/date|day/i.test(name) ? '2026-01-01' : /month|period|ym/i.test(name) ? '2026-01' : '1'))
  .replace(/\*/g, 'x')

// Bilinçli herkese açık uçlar. Desen "METHOD /yol" (route tanımındaki hâliyle).
const PUBLIC = [
  // Giriş / oturum açma akışları
  /^POST \/api\/auth\//,
  /^GET \/api\/auth\//,
  /^POST \/api\/mobile\/auth\/(login|refresh|webauthn\/auth-options|webauthn\/auth)$/,
  /^(GET|POST) \/api\/setup/,
  // Sağlık / izleme
  /^GET \/api\/health/,
  /^GET \/api\/system\/(health|version|metrics)/,
  // Giriş öncesi güvenli toplu sayılar ve kamuya açık sayfalar
  /^GET \/api\/public\//,
  /^(GET|POST) \/public\//,
]

const isPublic = r => PUBLIC.some(re => re.test(`${r.method} ${r.path}`))

describe('yetki kapsaması', () => {
  it('token\'sız istek hiçbir korumalı uçta 2xx/3xx dönmez', async () => {
    const routes = collectRoutes(app._router.stack)
    expect(routes.length).toBeGreaterThan(100)
    const leaks = []
    for (const r of routes) {
      if (isPublic(r)) continue
      const url = concrete(r.path)
      const res = await request(app)[r.method.toLowerCase()](url).send({}).timeout(10000).catch(e => ({ status: `ERR ${e.code || e.message}` }))
      if (typeof res.status !== 'number' || res.status < 400) leaks.push(`${r.method} ${r.path} → ${res.status}`)
    }
    expect(leaks, `Token'sız erişilebilen uçlar:\n${leaks.join('\n')}`).toEqual([])
  }, 300000)
})
