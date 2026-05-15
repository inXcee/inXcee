const MIN_LENGTH = 10

const COMMON_PASSWORDS = new Set([
  'admin1234!', 'admin1234', 'password', 'password1', 'password123', 'p@ssw0rd',
  'qwerty123', 'qwerty1234', '12345678', '123456789', '1234567890',
  'admin123', 'admin@123', 'admin@1234', 'welcome1', 'welcome123',
  'iloveyou', 'monkey123', 'dragon123', 'master123', 'sunshine',
  'sifre1234', 'sifre123', 'parola123', 'parola1234',
])

export function validatePassword(password, { username } = {}) {
  const errors = []
  if (!password || typeof password !== 'string') {
    return { ok: false, errors: ['Şifre gerekli'] }
  }
  if (password.length < MIN_LENGTH) {
    errors.push(`Şifre en az ${MIN_LENGTH} karakter olmalı`)
  }
  if (!/[a-zçğıöşü]/.test(password)) {
    errors.push('En az bir küçük harf içermeli')
  }
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) {
    errors.push('En az bir büyük harf içermeli')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('En az bir rakam içermeli')
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Bu şifre çok yaygın, başka bir şifre seçin')
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    errors.push('Şifre kullanıcı adını içeremez')
  }
  return { ok: errors.length === 0, errors }
}

export function passwordStrength(password) {
  if (!password) return { score: 0, label: 'çok zayıf' }
  let score = 0
  if (password.length >= 10) score++
  if (password.length >= 14) score++
  if (/[a-zçğıöşü]/.test(password) && /[A-ZÇĞİÖŞÜ]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/.test(password)) score++
  const labels = ['çok zayıf', 'zayıf', 'orta', 'iyi', 'güçlü', 'çok güçlü']
  return { score, label: labels[Math.min(score, 5)] }
}

export const PASSWORD_POLICY = {
  minLength: MIN_LENGTH,
  requireLower: true,
  requireUpper: true,
  requireDigit: true,
  description: `En az ${MIN_LENGTH} karakter, büyük harf, küçük harf ve rakam içermeli`,
}
