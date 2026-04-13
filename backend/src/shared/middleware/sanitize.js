/**
 * Input sanitization middleware — strips HTML tags and trims strings in req.body
 * Prevents stored XSS without breaking legitimate data
 */

// Base64/binary alanlar — HTML sanitizasyonundan muaf
const SKIP_FIELDS = new Set([
  'digital_signature',
  'photo_url',
  'photo_before',
  'signature_data',
  'occupant_signature',
  'intake_signature',
  'photo_after',
  'damage_photo',
])

function sanitizeValue(val) {
  if (typeof val === 'string') {
    // Remove HTML tags and their contents, then trim
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue)
  }
  if (val && typeof val === 'object') {
    return sanitizeObject(val)
  }
  return val
}

function sanitizeObject(obj) {
  const cleaned = {}
  for (const [key, val] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(key)) {
      cleaned[key] = val
    } else {
      cleaned[key] = sanitizeValue(val)
    }
  }
  return cleaned
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  next()
}
