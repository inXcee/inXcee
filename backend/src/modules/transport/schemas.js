import { z } from 'zod'

// Cross-cutting Zod sweep — transport yazma uçları.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')
const timeStr = z.string().trim().max(10, 'Saat çok uzun').nullish()
const coord = z.coerce.number().min(-180).max(180).nullish()
const flag = z.coerce.number().int().min(0).max(1).nullish()

export const createPickupPointSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(200, 'Ad çok uzun'),
  district: z.string().trim().max(120).nullish(),
  neighborhood: z.string().trim().max(120).nullish(),
  lat: coord,
  lng: coord,
  notes: z.string().trim().max(2000).nullish(),
  is_active: flag,
})

export const pickupPointUpdateSchema = createPickupPointSchema.partial()

export const createRouteSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(200, 'Ad çok uzun'),
  vehicle_plate: z.string().trim().max(20).nullish(),
  capacity: z.coerce.number().int().positive().max(200).nullish(),
  driver_name: z.string().trim().max(120).nullish(),
  driver_phone: z.string().trim().max(40).nullish(),
  shift_def_id: z.coerce.number().int().positive().nullish(),
  color: z.string().trim().max(30).nullish(),
  is_active: flag,
  notes: z.string().trim().max(2000).nullish(),
})

export const routeUpdateSchema = createRouteSchema.partial()

export const addStopSchema = z.object({
  pickup_point_id: z.coerce.number({ invalid_type_error: 'pickup_point_id gerekli' }).int().positive('pickup_point_id gerekli'),
  sequence_order: z.coerce.number().int().min(0).nullish(),
  scheduled_time: timeStr,
})

export const stopUpdateSchema = z.object({
  pickup_point_id: z.coerce.number().int().positive().optional(),
  sequence_order: z.coerce.number().int().min(0).nullish(),
  scheduled_time: timeStr,
})

export const setPickupSchema = z.object({
  pickup_point_id: z.coerce.number().int().positive().nullable().optional(),
})

export const assignSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  route_id: z.coerce.number({ invalid_type_error: 'route_id gerekli' }).int().positive('route_id gerekli'),
  stop_id: z.coerce.number().int().positive().nullish(),
  work_date: dateStr,
})

// QR ile servise biniş — kiosk QR kartındaki 'AVS:' öneki backend'de soyulur.
export const boardQrSchema = z.object({
  qr_token: z.string().trim().min(1, 'qr_token gerekli').max(120, 'qr_token çok uzun'),
  work_date: dateStr.optional(),
})

export const workSiteSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

export const saveViaPointsSchema = z.object({
  via_points: z.array(z.object({
    after_stop_id: z.coerce.number().int().positive(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })).max(50, 'En fazla 50 uğrak'),
})

const resourceStatus = z.enum(['active', 'out_of_service', 'inactive'])
const driverStatus = z.enum(['active', 'unavailable', 'inactive'])
const positiveId = z.coerce.number().int().positive()

export const vehicleCreateSchema = z.object({
  plate: z.string().trim().min(2).max(20),
  label: z.string().trim().max(120).nullish(),
  capacity: z.coerce.number().int().positive().max(200),
  status: resourceStatus.optional(),
  notes: z.string().trim().max(2000).nullish(),
})
export const vehicleUpdateSchema = vehicleCreateSchema.partial()

export const driverCreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).nullish(),
  status: driverStatus.optional(),
  notes: z.string().trim().max(2000).nullish(),
})
export const driverUpdateSchema = driverCreateSchema.partial()

export const unavailabilitySchema = z.object({
  vehicle_id: positiveId.nullish(),
  driver_id: positiveId.nullish(),
  starts_at: z.string().min(16).max(30),
  ends_at: z.string().min(16).max(30),
  reason: z.string().trim().max(500).nullish(),
}).superRefine((value, ctx) => {
  if (!!value.vehicle_id === !!value.driver_id) {
    ctx.addIssue({ code: 'custom', message: 'Araç veya şoförden yalnızca biri seçilmeli' })
  }
  if (value.ends_at <= value.starts_at) {
    ctx.addIssue({ code: 'custom', message: 'Bitiş başlangıçtan sonra olmalı' })
  }
})

const templateFields = z.object({
  name: z.string().trim().min(2).max(160),
  route_id: positiveId,
  shift_def_id: positiveId.nullish(),
  direction: z.enum(['outbound', 'inbound']),
  departure_time: z.string().regex(/^\d{2}:\d{2}$/),
  days_of_week: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  default_vehicle_id: positiveId.nullish(),
  default_driver_id: positiveId.nullish(),
  valid_from: dateStr.nullish(),
  valid_to: dateStr.nullish(),
  is_active: flag,
})
const validateTemplateDates = (value, ctx) => {
  if (value.valid_from && value.valid_to && value.valid_to < value.valid_from) {
    ctx.addIssue({ code: 'custom', message: 'Geçerlilik bitişi başlangıçtan önce olamaz' })
  }
}
export const templateCreateSchema = templateFields.superRefine(validateTemplateDates)
export const templateUpdateSchema = templateFields.partial().superRefine(validateTemplateDates)

export const planPreviewSchema = z.object({
  start_date: dateStr,
  end_date: dateStr,
  template_ids: z.array(positiveId).max(100).optional(),
}).superRefine((value, ctx) => {
  const start = new Date(`${value.start_date}T00:00:00Z`)
  const end = new Date(`${value.end_date}T00:00:00Z`)
  const days = (end - start) / 86400000
  if (days < 0 || days > 31) {
    ctx.addIssue({ code: 'custom', message: 'Plan aralığı 1-32 gün olmalı' })
  }
})

export const planPublishSchema = planPreviewSchema.safeExtend({
  base_revision: z.coerce.number().int().min(0),
  selected_trip_keys: z.array(z.string().max(100)).max(200).optional(),
  warning_reason: z.string().trim().max(1000).optional(),
})
