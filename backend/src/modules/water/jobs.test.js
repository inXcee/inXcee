import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../email/service.js', () => ({
  composeAndSend: vi.fn(),
  sendEmail: vi.fn(),
}))

import { initDB, getDB } from '../../shared/db/index.js'
import { enqueue, tickOnce } from '../../shared/jobs/index.js'
import { handlers } from '../../shared/jobs/handlers.js'
import { composeAndSend, sendEmail } from '../email/service.js'
import { sendDailyDigestMailJob, sendTruckArrivalMailJob } from './jobs.js'

function createTruck(plate = '34 TEST 050') {
  return getDB().prepare(`
    INSERT INTO water_truck_arrivals(arrival_date, mail_deadline_date, plate, center_email)
    VALUES('2027-03-20', '2027-03-19', ?, 'merkez@example.com')
  `).run(plate).lastInsertRowid
}

function payload(truckArrivalId) {
  return {
    truckArrivalId,
    requestedBy: null,
    to: 'merkez@example.com',
    subject: 'Su nakliye girişi',
    body: 'Personel ve araç girişi için yardımlarınızı rica ederiz.',
  }
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
})

beforeEach(() => {
  getDB().exec('DELETE FROM water_daily_digest_deliveries; DELETE FROM job_queue; DELETE FROM water_truck_arrivals;')
  composeAndSend.mockReset()
  sendEmail.mockReset()
  handlers['water.truck-mail'] = sendTruckArrivalMailJob
  handlers['water.daily-digest-mail'] = sendDailyDigestMailJob
})

describe('water.truck-mail job', () => {
  it('geçici SMTP hatasını yeniden dener ve başarıda tır kaydını kapatır', async () => {
    const truckId = createTruck()
    composeAndSend
      .mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { statusCode: 502 }))
      .mockResolvedValueOnce({ ok: true, messageId: 'mail-050' })
    const jobId = enqueue('water.truck-mail', payload(truckId), { maxAttempts: 5 })

    await tickOnce()
    let job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    expect(job.status).toBe('pending')
    expect(job.attempts).toBe(1)
    expect(job.last_error).toContain('ECONNRESET')

    getDB().prepare("UPDATE job_queue SET run_after=strftime('%s','now') WHERE id=?").run(jobId)
    await tickOnce()

    job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    const truck = getDB().prepare('SELECT * FROM water_truck_arrivals WHERE id=?').get(truckId)
    expect(job.status).toBe('done')
    expect(job.attempts).toBe(2)
    expect(truck.status).toBe('mail_sent')
    expect(truck.mail_sent_at).toBeTruthy()
    expect(composeAndSend).toHaveBeenCalledTimes(2)
  })

  it('SMTP yapılandırma hatasını kalıcı sayar ve tekrar göndermez', async () => {
    const truckId = createTruck('34 CONFIG 50')
    composeAndSend.mockRejectedValue(Object.assign(new Error('SMTP_HOST tanımlı değil'), { statusCode: 502 }))
    const jobId = enqueue('water.truck-mail', payload(truckId), { maxAttempts: 5 })

    await tickOnce()

    const job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    const truck = getDB().prepare('SELECT * FROM water_truck_arrivals WHERE id=?').get(truckId)
    expect(job.status).toBe('done')
    expect(job.attempts).toBe(1)
    expect(job.last_error).toContain('SMTP_HOST')
    expect(truck.mail_sent_at).toBeNull()
    expect(composeAndSend).toHaveBeenCalledTimes(1)
  })
})

describe('water.daily-digest-mail job', () => {
  function createDelivery() {
    return getDB().prepare(`
      INSERT INTO water_daily_digest_deliveries(
        digest_date, status, recipients, subject, summary_json
      ) VALUES('2027-03-20', 'queued', '["yonetim@example.com"]', 'Günlük özet', '{}')
    `).run().lastInsertRowid
  }

  function digestPayload(deliveryId) {
    return {
      deliveryId,
      to: 'yonetim@example.com',
      subject: 'Günlük özet',
      html: '<p>Özet</p>',
      text: 'Özet',
    }
  }

  it('geçici hatayı kuyrukta yeniden dener ve başarıda teslimi kapatır', async () => {
    const deliveryId = createDelivery()
    sendEmail
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce({ messageId: 'digest-053' })
    const jobId = enqueue('water.daily-digest-mail', digestPayload(deliveryId), { maxAttempts: 5 })
    getDB().prepare('UPDATE water_daily_digest_deliveries SET job_id=? WHERE id=?').run(jobId, deliveryId)

    await tickOnce()
    let job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    let delivery = getDB().prepare('SELECT * FROM water_daily_digest_deliveries WHERE id=?').get(deliveryId)
    expect(job.status).toBe('pending')
    expect(delivery.status).toBe('retrying')
    expect(delivery.last_error).toContain('ETIMEDOUT')

    getDB().prepare("UPDATE job_queue SET run_after=strftime('%s','now') WHERE id=?").run(jobId)
    await tickOnce()

    job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    delivery = getDB().prepare('SELECT * FROM water_daily_digest_deliveries WHERE id=?').get(deliveryId)
    expect(job.status).toBe('done')
    expect(delivery.status).toBe('sent')
    expect(delivery.message_id).toBe('digest-053')
    expect(delivery.sent_at).toBeTruthy()
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('kalıcı SMTP yapılandırma hatasını teslim kaydında görünür bırakır', async () => {
    const deliveryId = createDelivery()
    sendEmail.mockRejectedValue(new Error('SMTP_HOST tanımlı değil'))
    const jobId = enqueue('water.daily-digest-mail', digestPayload(deliveryId), { maxAttempts: 5 })
    getDB().prepare('UPDATE water_daily_digest_deliveries SET job_id=? WHERE id=?').run(jobId, deliveryId)

    await tickOnce()

    const job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    const delivery = getDB().prepare('SELECT * FROM water_daily_digest_deliveries WHERE id=?').get(deliveryId)
    expect(job.status).toBe('done')
    expect(job.attempts).toBe(1)
    expect(job.last_error).toContain('SMTP_HOST')
    expect(delivery.status).toBe('failed')
    expect(delivery.last_error).toContain('SMTP_HOST')
  })

  it('son geçici hata denemesinde teslim kaydını da başarısız olarak kapatır', async () => {
    const deliveryId = createDelivery()
    sendEmail.mockRejectedValue(new Error('ETIMEDOUT'))
    const jobId = enqueue('water.daily-digest-mail', digestPayload(deliveryId), { maxAttempts: 1 })
    getDB().prepare('UPDATE water_daily_digest_deliveries SET job_id=? WHERE id=?').run(jobId, deliveryId)

    await tickOnce()

    const job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(jobId)
    const delivery = getDB().prepare('SELECT * FROM water_daily_digest_deliveries WHERE id=?').get(deliveryId)
    expect(job.status).toBe('failed')
    expect(delivery.status).toBe('failed')
    expect(delivery.last_error).toContain('ETIMEDOUT')
  })
})
