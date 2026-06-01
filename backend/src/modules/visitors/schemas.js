import { z } from 'zod'

// Cross-cutting Zod sweep — visitors yazma uçları.
export const createVisitorSchema = z.object({
  full_name: z.string().trim().min(2, 'Ziyaretçi adı gerekli').max(200, 'İsim çok uzun'),
  tc_no: z.string().trim().max(20, 'TC No çok uzun').nullish(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  purpose: z.string().trim().max(500, 'Ziyaret amacı çok uzun').nullish(),
  visiting_personnel_id: z.coerce.number().int().positive().nullish(),
  visiting_block: z.string().trim().max(50, 'Blok çok uzun').nullish(),
  notes: z.string().trim().max(2000, 'Not çok uzun').nullish(),
})
