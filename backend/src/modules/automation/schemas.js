import { z } from 'zod'

// Cross-cutting Zod sweep — automation kuralları (PUT önceden doğrulanmıyordu).
const triggerEnum = z.enum(
  ['occupancy_high', 'contract_expiring', 'maintenance_backlog', 'drill_overdue', 'no_recent_drill', 'access_overdue_inside'],
  { errorMap: () => ({ message: 'Geçersiz trigger' }) },
)
const actionEnum = z.enum(['log', 'notify_group'], { errorMap: () => ({ message: 'Geçersiz action' }) })

export const ruleSchema = z.object({
  name: z.string().trim().min(2, 'Kural adı gerekli').max(120, 'Ad çok uzun'),
  trigger_type: triggerEnum,
  trigger_threshold: z.coerce.number({ invalid_type_error: 'Eşik değeri gerekli' }),
  action_type: actionEnum,
  action_target: z.coerce.number().int().positive().nullish(),
  cooldown_hours: z.coerce.number().int().nonnegative().max(100000).nullish(),
  is_active: z.coerce.boolean().optional(),
})
