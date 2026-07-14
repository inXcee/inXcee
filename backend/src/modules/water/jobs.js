import * as q from './queries.js'
import { composeAndSend } from '../email/service.js'

function permanentError(error) {
  error.permanent = true
  return error
}

function isPermanentMailError(error) {
  if (error?.statusCode === 400) return true
  return /SMTP_HOST tanımlı değil|SMTP kullanıcı tanımlı değil|SMTP şifre tanımlı değil|alıcı .* gerekli|geçersiz e-posta|konu boş|mesaj boş/i.test(error?.message || '')
}

export async function sendTruckArrivalMailJob({ truckArrivalId, requestedBy, to, subject, body }) {
  const id = Number(truckArrivalId)
  if (!Number.isInteger(id) || id <= 0) throw permanentError(new Error('Tır maili: geçersiz kayıt kimliği'))

  const truck = q.getTruckArrival(id)
  if (!truck) throw permanentError(new Error('Tır maili: kayıt bulunamadı'))
  if (truck.mail_sent_at) return { skipped: 'already_sent' }

  try {
    const result = await composeAndSend({ to, subject, body })
    if (!q.setTruckMailSent(id, requestedBy)) {
      throw permanentError(new Error('Tır maili gönderildi ancak kayıt kapatılamadı'))
    }
    return result
  } catch (error) {
    if (error?.permanent || isPermanentMailError(error)) throw permanentError(error)
    throw error
  }
}
