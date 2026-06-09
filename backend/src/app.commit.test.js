import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { initDB } from './shared/db/index.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

describe('GET /api/health — commit bilgisi', () => {
  it('env yokken git rev-parse fallback ile commit döndürür (7 hex)', async () => {
    // Test ortamı git checkout içinde koşar → fallback çalışmalı, null olmamalı.
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.commit).toMatch(/^[0-9a-f]{7,12}$/)
  })
})
