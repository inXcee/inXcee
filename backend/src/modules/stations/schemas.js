import { z } from 'zod'

// Cross-cutting Zod sweep — stations admin CRUD (scan/manual cihaz uçları hariç).
const typeEnum = z.enum(['entry', 'exit', 'cafeteria', 'transport', 'generic'], {
  errorMap: () => ({ message: 'Geçersiz istasyon tipi' }),
})

export const createStationSchema = z.object({
  name: z.string().trim().min(2, 'İsim gerekli').max(120, 'İsim çok uzun'),
  station_type: typeEnum,
  location: z.string().trim().max(200, 'Konum çok uzun').nullish(),
  capture_photo: z.coerce.boolean().optional(),
})

export const updateStationSchema = z.object({
  name: z.string().trim().min(2, 'İsim çok kısa').max(120, 'İsim çok uzun').optional(),
  station_type: typeEnum.optional(),
  location: z.string().trim().max(200, 'Konum çok uzun').nullish(),
  capture_photo: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
})
