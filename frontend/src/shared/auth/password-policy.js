export const MIN_LENGTH = 10

export const PASSWORD_HINT = `En az ${MIN_LENGTH} karakter · büyük + küçük harf + rakam`

const COMMON = new Set([
  'admin1234!', 'admin1234', 'password', 'password1', 'password123', 'p@ssw0rd',
  'qwerty123', 'qwerty1234', '12345678', '123456789', '1234567890',
  'admin123', 'admin@123', 'admin@1234', 'welcome1', 'welcome123',
  'iloveyou', 'monkey123', 'dragon123', 'master123', 'sunshine',
  'sifre1234', 'sifre123', 'parola123', 'parola1234',
])

export function validatePassword(password, { username } = {}) {
  const errors = []
  if (!password) return { ok: false, errors: ['Şifre gerekli'] }
  if (password.length < MIN_LENGTH) errors.push(`En az ${MIN_LENGTH} karakter olmalı`)
  if (!/[a-zçğıöşü]/.test(password)) errors.push('Küçük harf eksik')
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) errors.push('Büyük harf eksik')
  if (!/[0-9]/.test(password)) errors.push('Rakam eksik')
  if (COMMON.has(password.toLowerCase())) errors.push('Çok yaygın bir şifre')
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    errors.push('Kullanıcı adını içeremez')
  }
  return { ok: errors.length === 0, errors }
}

export function passwordStrength(password) {
  if (!password) return { score: 0, label: 'çok zayıf', color: '#666' }
  let score = 0
  if (password.length >= MIN_LENGTH) score++
  if (password.length >= 14) score++
  if (/[a-zçğıöşü]/.test(password) && /[A-ZÇĞİÖŞÜ]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/.test(password)) score++
  const meta = [
    { label: 'çok zayıf', color: '#ef4444' },
    { label: 'zayıf', color: '#f97316' },
    { label: 'orta', color: '#eab308' },
    { label: 'iyi', color: '#84cc16' },
    { label: 'güçlü', color: '#22c55e' },
    { label: 'çok güçlü', color: '#16a34a' },
  ]
  return { score, ...meta[Math.min(score, 5)] }
}
