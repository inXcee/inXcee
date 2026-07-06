import { z } from 'zod'

const id = z.coerce.number().int().positive()

// Bulk dizileri: her eleman pozitif int olmalı, üst sınır DoS/yanlış kullanım koruması.
const idArray = z.array(id).min(1, 'En az bir kayıt gerekli').max(2000, 'Çok fazla kayıt')

export const ROOM_STATUSES = ['active', 'quarantine', 'maintenance']

export const swapSchema = z.object({
  person_a_id: id,
  person_b_id: id,
})

export const reassignSchema = z.object({
  personnel_id: id,
  room_id: id,
})

export const removeFromRoomSchema = z.object({
  personnel_id: id,
})

export const bulkAssignSchema = z.object({
  personnel_ids: idArray,
  room_id: id,
})

export const bulkRemoveSchema = z.object({
  personnel_ids: idArray,
})

export const bulkRoomStatusSchema = z.object({
  room_ids: idArray,
  status: z.enum(ROOM_STATUSES),
})

export const bulkCheckoutSchema = z.object({
  personnel_ids: idArray,
  force: z.coerce.boolean().optional().default(false),
})
