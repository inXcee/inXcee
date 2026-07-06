import { z } from 'zod'

// Cross-cutting Zod sweep — avs-workers (pin route'u kendi 4-hane kontrolünü tutar).
export const workerSchema = z.object({
  full_name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(200, 'Ad çok uzun'),
  role_label: z.string().trim().max(100, 'Görev çok uzun').nullish(),
  pickup_point_id: z.coerce.number().int().positive().nullish(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
}).passthrough()
