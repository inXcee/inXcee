/**
 * Request validation middleware — zod schema'ya göre body/query/params doğrular.
 *
 * Kullanım:
 *   import { z } from 'zod'
 *   import { validate } from '../../shared/middleware/validate.js'
 *
 *   const loginSchema = z.object({
 *     username: z.string().min(1).max(64),
 *     password: z.string().min(1).max(256),
 *   })
 *
 *   router.post('/login', validate(loginSchema), (req, res) => {
 *     const { username, password } = req.validated  // garanti tipli
 *   })
 */

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source]
    const result = schema.safeParse(data)
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      }))
      return res.status(400).json({
        error: 'Geçersiz istek',
        details: issues,
      })
    }
    req.validated = result.data
    next()
  }
}
