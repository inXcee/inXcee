import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('sentry', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.SENTRY_DSN
  })

  it('initSentry no-op when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test'
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/2'
    const sentry = await import('./sentry.js')
    expect(sentry.initSentry()).toBe(false)
  })

  it('initSentry no-op when SENTRY_DSN missing', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SENTRY_DSN
    const sentry = await import('./sentry.js')
    expect(sentry.initSentry()).toBe(false)
    process.env.NODE_ENV = 'test'
  })

  it('captureError no-op when not initialized', async () => {
    const sentry = await import('./sentry.js')
    expect(() => sentry.captureError(new Error('boom'))).not.toThrow()
  })

  it('setupExpressErrorHandler no-op when not initialized', async () => {
    const sentry = await import('./sentry.js')
    expect(() => sentry.setupExpressErrorHandler({ use: () => {} })).not.toThrow()
  })

  it('_scrubEvent strips PII fields', async () => {
    const sentry = await import('./sentry.js')
    const event = {
      request: {
        data: { password: 'secret', name: 'Ali' },
        headers: { authorization: 'Bearer xxx', 'user-agent': 'test' },
        cookies: 'session=abc',
      },
      user: { id: 'u1', ip_address: '1.2.3.4', email: 'a@b.com', username: 'ali' },
      tags: { module: 'checkin' },
    }
    const out = sentry._scrubEvent(event)
    expect(out.request.data).toBeUndefined()
    expect(out.request.headers).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(out.user.ip_address).toBeUndefined()
    expect(out.user.email).toBeUndefined()
    expect(out.user.username).toBeUndefined()
    expect(out.user.id).toBe('u1')
    expect(out.tags.module).toBe('checkin')
  })

  it('_scrubEvent handles missing fields gracefully', async () => {
    const sentry = await import('./sentry.js')
    expect(() => sentry._scrubEvent({})).not.toThrow()
    expect(sentry._scrubEvent({})).toEqual({})
  })
})
