/**
 * Input sanitization middleware — strips HTML tags and trims strings in req.body
 * Prevents stored XSS without breaking legitimate data
 */
function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val.replace(/<[^>]*>/g, '').trim()
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
    // Skip base64 fields (signatures, photos)
    if (key === 'digital_signature' || key === 'photo_url' || key === 'photo_before') {
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
