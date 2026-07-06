import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import jwt from 'jsonwebtoken'
import { getDB } from '../../shared/db/index.js'

const RP_NAME = 'YYS'
// Prod'da .env'e gerek kalmasın diye NODE_ENV'e göre makul varsayılanlar;
// env her zaman üstün gelir (staging gibi farklı origin'ler için).
const isProd = () => process.env.NODE_ENV === 'production'
const rpID = () => process.env.WEBAUTHN_RP_ID || (isProd() ? 'avskamp.com' : 'localhost')
const origin = () => process.env.WEBAUTHN_ORIGIN || (isProd() ? 'https://avskamp.com' : 'http://localhost:5173')

function toB64(buf) { return Buffer.from(buf).toString('base64url') }
function fromB64(str) { return Buffer.from(str, 'base64url') }

export async function getRegistrationOptions(userId) {
  const db = getDB()
  const user = db.prepare('SELECT id, full_name FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(),
    userID: Buffer.from(String(user.id)),
    userName: user.full_name,
    userDisplayName: user.full_name,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  })

  db.prepare('UPDATE users SET webauthn_challenge=? WHERE id=?').run(options.challenge, userId)
  return options
}

export async function verifyRegistration(userId, response) {
  const db = getDB()
  const user = db.prepare('SELECT webauthn_challenge FROM users WHERE id=?').get(userId)
  if (!user?.webauthn_challenge) return { error: 'Challenge bulunamadı', status: 400 }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.webauthn_challenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
    })
  } catch (e) {
    return { error: e.message, status: 400 }
  }

  if (!verification.verified) return { error: 'Kayıt doğrulaması başarısız', status: 400 }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo
  const credId = toB64(credentialID)

  db.prepare(`UPDATE users SET
    webauthn_credential_id=?, webauthn_public_key=?, webauthn_counter=?, webauthn_challenge=NULL
    WHERE id=?`
  ).run(credId, toB64(credentialPublicKey), counter, userId)

  return { ok: true, credentialId: credId }
}

export async function getAuthOptions(credentialId) {
  const db = getDB()
  const user = db.prepare('SELECT id FROM users WHERE webauthn_credential_id=?').get(credentialId)
  if (!user) return { error: 'Kayıtlı cihaz bulunamadı', status: 404 }

  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    userVerification: 'required',
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
  })

  db.prepare('UPDATE users SET webauthn_challenge=? WHERE id=?').run(options.challenge, user.id)
  return options
}

// allowedRoles: null = tüm roller (desktop login); mobil route kendi
// kısıtlı listesini geçirir (housekeeper/technical) — davranış korunur.
export async function verifyAuthentication(credentialId, response, { allowedRoles = null } = {}) {
  const db = getDB()
  const user = db.prepare('SELECT * FROM users WHERE webauthn_credential_id=?').get(credentialId)
  if (!user) return { error: 'Kayıtlı cihaz bulunamadı', status: 404 }
  if (!user.webauthn_challenge) return { error: 'Challenge bulunamadı', status: 400 }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.webauthn_challenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
      authenticator: {
        credentialID: fromB64(user.webauthn_credential_id),
        credentialPublicKey: fromB64(user.webauthn_public_key),
        counter: user.webauthn_counter,
      },
    })
  } catch (e) {
    return { error: e.message, status: 400 }
  }

  if (!verification.verified) return { error: 'Biyometrik doğrulama başarısız', status: 401 }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { error: 'Yetkisiz', status: 403 }
  }

  db.prepare('UPDATE users SET webauthn_counter=?, webauthn_challenge=NULL WHERE id=?')
    .run(verification.authenticationInfo.newCounter, user.id)

  const token = jwt.sign(
    { id: user.id, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )
  return { token, user: { id: user.id, role: user.role, full_name: user.full_name } }
}
