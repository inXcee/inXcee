import { z } from 'zod'

// Cross-cutting Zod sweep — personnel modülü yazma uçları.
// routes.js bunları validate() ile bağlar; req.validated tek kaynak olur.

const CATEGORY_ENUM = z.enum([
  'general', 'document', 'attendance', 'performance', 'safety',
  'equipment', 'onboarding', 'offboarding', 'transport', 'dormitory',
])

export const addNoteSchema = z.object({
  note: z.string().trim().min(1, 'Not boş olamaz').max(4000, 'Not çok uzun (max 4000)'),
  // pinned form/JSON'dan bool ya da "true"/"false" gelebilir; coerce + varsayılan.
  pinned: z.coerce.boolean().optional().default(false),
  category: CATEGORY_ENUM.optional(),
  visibility: z.enum(['operational', 'sensitive']).optional(),
})

export const updateNoteSchema = z.object({
  note: z.string().trim().min(1).max(4000).optional(),
  category: CATEGORY_ENUM.optional(),
  visibility: z.enum(['operational', 'sensitive']).optional(),
})

export const createFollowupSchema = z.object({
  title: z.string().trim().min(1, 'Görev başlığı gerekli').max(300, 'Başlık çok uzun'),
  description: z.string().trim().max(2000).nullish(),
  category: CATEGORY_ENUM.optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_user_id: z.coerce.number().int().positive().nullish(),
  due_at: z.string().trim().max(40).nullish(),
})

export const updateFollowupSchema = createFollowupSchema.partial()

const DOCUMENT_KIND_ENUM = z.enum([
  'identity', 'contract', 'social_security', 'health_report', 'certificate',
  'training', 'kvkk', 'bank', 'payroll', 'discipline', 'work_accident', 'other',
])

export const createRequirementSchema = z.object({
  document_kind: DOCUMENT_KIND_ENUM,
  display_name: z.string().trim().min(1, 'Görünen ad gerekli').max(120, 'Ad çok uzun'),
  department_id: z.coerce.number().int().positive().nullish(),
  role_id: z.coerce.number().int().positive().nullish(),
  requires_expiry: z.coerce.boolean().optional().default(false),
  visibility: z.enum(['operational', 'sensitive']).optional(),
})

export const updateRequirementSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  requires_expiry: z.coerce.boolean().optional(),
  visibility: z.enum(['operational', 'sensitive']).optional(),
  is_active: z.coerce.boolean().optional(),
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

// Excel toplu içe aktarım — kanonik satırlar (frontend parser çıktısı).
// tcNo/phone/roomNo Excel'den sayı olarak gelebilir → union, backend normalize eder.
export const importPersonnelSchema = z.object({
  rows: z.array(z.object({
    fullName: z.string().trim().min(1, 'İsim gerekli').max(200, 'İsim çok uzun'),
    tcNo: z.union([z.string().max(30), z.number()]).nullish(),
    passportNo: z.string().max(30).nullish(),
    company: z.string().max(200).nullish(),
    phone: z.union([z.string().max(50), z.number()]).nullish(),
    hometown: z.string().max(100).nullish(),
    jobTitle: z.string().max(100).nullish(),
    gender: z.string().max(20).nullish(),
    block: z.string().max(10).nullish(),
    roomNo: z.union([z.string().max(20), z.number()]).nullish(),
    checkInDate: z.string().max(30).nullish(),
  })).min(1, 'En az bir satır gerekli').max(2000, 'Tek seferde en çok 2000 satır'),
})
