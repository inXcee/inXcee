import { z } from 'zod'

// Cross-cutting Zod sweep — self-service (resident kiosk). Gate olarak eklenir.
export const maintenanceSchema = z.object({
  location: z.string().trim().min(3, 'location en az 3 karakter olmalıdır').max(200, 'Konum çok uzun'),
  description: z.string().trim().min(10, 'description en az 10 karakter olmalıdır').max(2000, 'Açıklama çok uzun'),
}).passthrough()

export const feedbackSchema = z.object({
  type: z.enum(['complaint', 'suggestion', 'other'], { errorMap: () => ({ message: 'Geçersiz tip (complaint, suggestion, other)' }) }),
  message: z.string().trim().min(20, 'Mesaj en az 20 karakter olmalıdır').max(4000, 'Mesaj çok uzun'),
}).passthrough()
