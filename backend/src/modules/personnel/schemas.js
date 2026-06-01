import { z } from 'zod'

// Cross-cutting Zod sweep — personnel modülü yazma uçları.
// routes.js bunları validate() ile bağlar; req.validated tek kaynak olur.

export const addNoteSchema = z.object({
  note: z.string().trim().min(1, 'Not boş olamaz').max(4000, 'Not çok uzun (max 4000)'),
  // pinned form/JSON'dan bool ya da "true"/"false" gelebilir; coerce + varsayılan.
  pinned: z.coerce.boolean().optional().default(false),
})

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'İsim gerekli').max(200, 'İsim çok uzun'),
  relationship: z.string().trim().max(100, 'Yakınlık çok uzun').nullish(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  address: z.string().trim().max(500, 'Adres çok uzun').nullish(),
})

// PUT — kısmi güncelleme; gönderilen alanlar doğrulanır, gerisi dokunulmaz.
export const emergencyContactUpdateSchema = emergencyContactSchema.partial()

export const archiveSchema = z.object({
  reason: z.string().trim().max(500, 'Gerekçe çok uzun').nullish(),
})
