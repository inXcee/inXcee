import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { validate } from './validate.js'

function makeApp(schema, source = 'body', method = 'post', path = '/test') {
  const app = express()
  app.use(express.json())
  app[method](path, validate(schema, source), (req, res) => {
    res.json({ ok: true, validated: req.validated })
  })
  return app
}

describe('validate middleware', () => {
  it('uyumlu body geçer ve req.validated dolar', async () => {
    const schema = z.object({ name: z.string().min(2), age: z.number().int().nonnegative() })
    const app = makeApp(schema)
    const res = await request(app).post('/test').send({ name: 'Ali', age: 30 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.validated).toEqual({ name: 'Ali', age: 30 })
  })

  it('eksik alanda 400 + details döner, error ilk issue mesajı', async () => {
    const schema = z.object({ username: z.string().min(1), password: z.string().min(1, 'Şifre gerekli') })
    const app = makeApp(schema)
    const res = await request(app).post('/test').send({ username: 'admin' })
    expect(res.status).toBe(400)
    // error artık ilk issue mesajını taşır (frontend tek-satır toast'ı için)
    expect(typeof res.body.error).toBe('string')
    expect(res.body.error.length).toBeGreaterThan(0)
    expect(res.body.details).toBeInstanceOf(Array)
    expect(res.body.details.some(d => d.path === 'password')).toBe(true)
  })

  it('yanlış tipte 400 döner', async () => {
    const schema = z.object({ count: z.number() })
    const app = makeApp(schema)
    const res = await request(app).post('/test').send({ count: 'on' })
    expect(res.status).toBe(400)
    expect(res.body.details[0].path).toBe('count')
  })

  it('boş body de 400 döner (zod object null ise hata verir)', async () => {
    const schema = z.object({ x: z.string() })
    const app = makeApp(schema)
    const res = await request(app).post('/test').send({})
    expect(res.status).toBe(400)
  })

  it('query string için kullanılabilir (source="query")', async () => {
    const schema = z.object({ q: z.string().min(2) })
    const app = makeApp(schema, 'query', 'get')
    const ok = await request(app).get('/test?q=ab')
    expect(ok.status).toBe(200)
    expect(ok.body.validated).toEqual({ q: 'ab' })
    const bad = await request(app).get('/test?q=a')
    expect(bad.status).toBe(400)
  })

  it('strict mode olmayan schema fazla alanları yutar', async () => {
    // default zod object passthrough değil, strict değil — extra alanlar düşer
    const schema = z.object({ a: z.string() })
    const app = makeApp(schema)
    const res = await request(app).post('/test').send({ a: 'x', b: 'y' })
    expect(res.status).toBe(200)
    expect(res.body.validated).toEqual({ a: 'x' })
  })
})
