import { z } from 'zod'

const id = z.coerce.number().int().positive()

// Çıkış işlemi: her zimmet aksiyonu return/damaged/lost (processCheckout queries.js).
// passthrough() — item_name/note gibi sunum alanları korunur.
const zimmetAction = z.object({
  zimmet_id: id,
  action: z.enum(['return', 'damaged', 'lost']).default('return'),
  note: z.string().trim().optional().nullable(),
}).passthrough()

export const processSchema = z.object({
  personnel_id: id,
  zimmet_actions: z.array(zimmetAction).optional().default([]),
})
