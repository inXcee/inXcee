import { Router } from 'express'
import { loginMobile, getMobileMe } from './service.js'
import { requireMobile } from './middleware.js'
import { refreshToken } from '../../shared/auth/service.js'
import { getRegistrationOptions, verifyRegistration, getAuthOptions, verifyAuthentication } from './webauthn.js'

export const mobileAuthRouter = Router()

mobileAuthRouter.post('/login', (req, res) => {
  try {
    const { pin, role } = req.body
    const result = loginMobile(pin, role)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    console.error('[MobileAuth]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

mobileAuthRouter.post('/refresh', (req, res) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  const result = refreshToken(h.slice(7))
  if (result.error) return res.status(result.status).json({ error: result.error })
  if (!['housekeeper', 'technical'].includes(result.user?.role)) {
    return res.status(403).json({ error: 'Yetkisiz' })
  }
  res.json(result)
})

mobileAuthRouter.get('/me', requireMobile(), (req, res) => {
  const user = getMobileMe(req.user.id)
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })
  res.json(user)
})

// WebAuthn — registration (authenticated user)
mobileAuthRouter.post('/webauthn/register-options', requireMobile(), async (req, res) => {
  const result = await getRegistrationOptions(req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

mobileAuthRouter.post('/webauthn/register', requireMobile(), async (req, res) => {
  const result = await verifyRegistration(req.user.id, req.body)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

// WebAuthn — authentication (public, no token needed)
mobileAuthRouter.post('/webauthn/auth-options', async (req, res) => {
  const { credentialId } = req.body
  if (!credentialId) return res.status(400).json({ error: 'credentialId gerekli' })
  const result = await getAuthOptions(credentialId)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

mobileAuthRouter.post('/webauthn/authenticate', async (req, res) => {
  const { credentialId, response } = req.body
  if (!credentialId || !response) return res.status(400).json({ error: 'credentialId ve response gerekli' })
  const result = await verifyAuthentication(credentialId, response)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
