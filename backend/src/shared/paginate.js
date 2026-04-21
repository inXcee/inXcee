export function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}
