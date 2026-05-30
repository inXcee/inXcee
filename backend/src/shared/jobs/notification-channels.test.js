import { describe, it, expect, beforeAll, vi } from 'vitest'
import { initDB } from '../db/index.js'

// nodemailer'ı mock'la — gerçek SMTP'ye gitmeden sendMail'i doğrula
const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'msg-1' })
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock, verify: vi.fn() }) },
}))

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
})

describe('job handler: email.send', () => {
  it('SMTP ayarlıyken e-posta gönderir', async () => {
    process.env.SMTP_HOST = 'smtp.x'; process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'; process.env.SMTP_FROM = 'from@x'
    const { handlers } = await import('./handlers.js')
    sendMailMock.mockClear()
    await handlers['email.send']({ to: 'a@b.c', subject: 'Selam', text: 'gövde' })
    expect(sendMailMock).toHaveBeenCalledOnce()
    expect(sendMailMock.mock.calls[0][0].to).toBe('a@b.c')
    expect(sendMailMock.mock.calls[0][0].subject).toBe('Selam')
  })

  it('to eksikse kalıcı hata (retry yok)', async () => {
    const { handlers } = await import('./handlers.js')
    let caught
    try { await handlers['email.send']({ subject: 'x' }) } catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
  })
})

describe('job handler: whatsapp.send', () => {
  it('yapılandırılmamışsa retry etmez (skipped döner)', async () => {
    const { handlers } = await import('./handlers.js')
    const r = await handlers['whatsapp.send']({ phone: '05321234567', message: 'merhaba' })
    expect(r.skipped).toBe('not_configured')
  })

  it('telefon/mesaj eksikse kalıcı hata', async () => {
    const { handlers } = await import('./handlers.js')
    let caught
    try { await handlers['whatsapp.send']({ phone: '', message: 'x' }) } catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
  })
})
