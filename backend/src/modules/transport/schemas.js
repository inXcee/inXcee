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
