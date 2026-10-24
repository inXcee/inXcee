import { unlinkSync } from 'node:fs'

// Kiosk yüklemeleri (multer) için ortak yardımcılar — routes.js ve saha panosu (board.js) kullanır.
export function uploadedFiles(req) {
  if (req.files) return Object.values(req.files).flat()
  return req.file ? [req.file] : []
}

export function removeUploadedFiles(req) {
  for (const file of uploadedFiles(req)) {
    try { unlinkSync(file.path) } catch { /* already removed or unavailable */ }
  }
}

// validate() gibi, ama multipart istekte doğrulama düşerse yüklenen dosyaları da siler
export function validateUploadBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      removeUploadedFiles(req)
      const details = parsed.error.issues.map(issue => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      }))
      return res.status(400).json({ error: details[0]?.message || 'Geçersiz istek', details })
    }
    req.validated = parsed.data
    next()
  }
}
