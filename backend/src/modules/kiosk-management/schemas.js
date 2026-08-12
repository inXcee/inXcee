import { z } from 'zod'

export const deviceTypeSchema = z.enum([
  'laundry_terminal',
  'avs_shared',
  'avs_personal',
  'resident_shared',
  'scan_station',
  'display_general',
  'display_kitchen',
])

export const deviceModeSchema = z.enum(['shared', 'personal', 'unattended', 'display'])

const jsonObject = z.record(z.string(), z.unknown())

const expectedMode = {
  laundry_terminal: 'shared',
  avs_shared: 'shared',
  avs_personal: 'personal',
  resident_shared: 'shared',
  scan_station: 'unattended',
  display_general: 'display',
  display_kitchen: 'display',
}

export const enrollmentCodeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  device_type: deviceTypeSchema,
  mode: deviceModeSchema,
  location: z.string().trim().max(200).nullish(),
  expires_minutes: z.coerce.number().int().min(5).max(1440).default(30),
}).strict().superRefine((value, context) => {
  if (expectedMode[value.device_type] !== value.mode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mode'],
      message: 'Cihaz türü ile kullanım modu uyumsuz',
    })
  }
})

export const enrollDeviceSchema = z.object({
  code: z.string().trim().min(8).max(80),
  app_version: z.string().trim().max(80).nullish(),
  capabilities: jsonObject.optional().default({}),
}).strict()

export const heartbeatSchema = z.object({
  app_version: z.string().trim().max(80).nullish(),
  capabilities: jsonObject.optional(),
  health: jsonObject.optional(),
  queue_count: z.coerce.number().int().min(0).max(100000).optional(),
  error_count: z.coerce.number().int().min(0).max(100000).optional(),
  last_sync_at: z.string().datetime({ offset: true }).nullish(),
  current_principal: z.object({
    kind: z.enum(['staff', 'personnel', 'user']),
    id: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(160),
  }).strict().nullish(),
}).strict()

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['active', 'locked', 'maintenance']).optional(),
}).strict()

export const commandSchema = z.object({
  command_type: z.enum(['lock', 'config_refresh', 'app_reload', 'rotate_key']),
  payload: jsonObject.optional().default({}),
}).strict()

export const commandAckSchema = z.object({
  status: z.enum(['completed', 'failed']),
  result: jsonObject.optional().default({}),
}).strict()
