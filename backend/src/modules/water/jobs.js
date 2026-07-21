import * as q from './queries.js'
import { composeAndSend, sendEmail } from '../email/service.js'

function permanentError(error) {
  error.permanent = true
  return error
}

function isPermanentMailError(error) {
  if (error?.statusCode === 400) return true
  // Yanlış şifre / kapalı SMTP AUTH tekrar denemekle düzelmez: 5 deneme boşa yanmasın,
  // hata mesajı kuyrukta hemen görünsün.
  if (error?.smtpKind === 'auth' || error?.smtpKind === 'config') return true
  return /SMTP_HOST tanımlı değil|SMTP kullanıcı tanımlı değil|SMTP şifre tanımlı değil|alıcı .* gerekli|geçersiz e-posta|konu boş|mesaj boş/i.test(error?.message || '')
}

export async function sendTruckArrivalMailJob({
  truckArrivalId,
  requestedBy,
  to,
  subject,
  body,
  mailVersion,
}) {
  const id = Number(truckArrivalId)
  if (!Number.isInteger(id) || id <= 0) throw permanentError(new Error('Tır maili: geçersiz kayıt kimliği'))

  const truck = q.getTruckArrival(id)
  if (!truck) throw permanentError(new Error('Tır maili: kayıt bulunamadı'))
  if (truck.mail_sent_at) return { skipped: 'already_sent' }

  try {
    const result = await composeAndSend({ to, subject, body })
    if (!q.setTruckMailSent(id, requestedBy, {
      messageId: result?.messageId || null,
      expectedVersion: mailVersion,
    })) {
      throw permanentError(new Error('Tır maili gönderildi ancak kayıt kapatılamadı'))
    }
    return result
  } catch (error) {
    if (error?.permanent || isPermanentMailError(error)) throw permanentError(error)
    throw error
  }
}

export async function sendDailyDigestMailJob({ deliveryId, to, subject, html, text }) {
  const id = Number(deliveryId)
  if (!Number.isInteger(id) || id <= 0) throw permanentError(new Error('Günlük su özeti: geçersiz teslim kimliği'))

  const delivery = q.getDailyDigestDelivery(id)
  if (!delivery) throw permanentError(new Error('Günlük su özeti: teslim kaydı bulunamadı'))
  if (delivery.sent_at) return { skipped: 'already_sent' }
  if (!to) throw permanentError(new Error('Günlük su özeti: alıcı gerekli'))

  q.markDailyDigestSending(id)
  try {
    const result = await sendEmail({ to, subject, html, text })
    if (!q.markDailyDigestSent(id, result?.messageId)) {
      throw permanentError(new Error('Günlük su özeti gönderildi ancak teslim kaydı kapatılamadı'))
    }
    return result
  } catch (error) {
    const message = error?.message || String(error)
    if (error?.permanent || isPermanentMailError(error)) {
      q.markDailyDigestFailed(id, message)
      throw permanentError(error)
    }
    const attemptsExhausted = Number(delivery.job_max_attempts) > 0
      && Number(delivery.job_attempts) >= Number(delivery.job_max_attempts)
    if (attemptsExhausted) q.markDailyDigestFailed(id, message)
    else q.markDailyDigestRetrying(id, message)
    throw error
  }
}
