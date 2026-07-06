import { z } from 'zod'

// Cross-cutting Zod sweep — drills.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')
const count = z.coerce.number().int().nonnegative('Geçersiz sayı').max(100000).nullish()

export const createDrillSchema = z.object({
  drill_type: z.enum(['fire', 'earthquake', 'security', 'evacuation', 'other'], {
    errorMap: () => ({ message: 'Geçersiz tatbikat tipi' }),
  }),
  drill_date: dateStr,
  expected_count: count,
  actual_count: count,
  duration_minutes: z.coerce.number().int().nonnegative().max(100000).nullish(),
  missing_names: z.string().trim().max(4000).nullish(),
  findings: z.string().trim().max(4000).nullish(),
  next_action: z.string().trim().max(2000).nullish(),
  next_drill_date: dateStr.nullish(),
})
