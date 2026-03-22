/**
 * Response caching middleware — adds Cache-Control headers for read-only endpoints
 * Usage: router.get('/stats', cacheFor(300), handler) — cache 5 minutes
 */
export function cacheFor(seconds) {
  return (req, res, next) => {
    res.set('Cache-Control', `public, max-age=${seconds}`)
    next()
  }
}

export function noCache(req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}
