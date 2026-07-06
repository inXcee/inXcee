import { z } from 'zod'

const id = z.coerce.number().int().positive()

// Kimlik: TC opsiyonel (pasaportlu yabancı işçi olabilir) ama varsa 11 hane.
const tcNo = z.string().regex(/^\d{11}$/, 'TC kimlik no 11 haneli olmalı').optional().nullable()

// İSG/duty-of-care: acil durum iletişimi zorunlu (mevcut inline kuralla aynı).
// passthrough() — company/hometown/job_title gibi alanlar registerService'e geçsin.
export const registerSchema = z.object({
  full_name: z.string({ error: 'Ad soyad en az 3 karakter olmalı' }).trim().min(3, 'Ad soyad en az 3 karakter olmalı'),
  tc_no: tcNo,
  emergency_name: z.string({ error: 'Acil durum iletişim kişisi zorunludur (İSG)' }).trim().min(2, 'Acil durum iletişim kişisi zorunludur (İSG)'),
  emergency_phone: z.string({ error: 'Geçerli bir acil durum telefonu zorunludur' }).trim().regex(/^[\d+\s()-]{7,}$/, 'Geçerli bir acil durum telefonu zorunludur'),
}).passthrough()

const zimmetItem = z.object({
  item_name: z.string().trim().min(1, 'Her kalemin item_name değeri gerekli'),
  quantity: z.coerce.number().positive('Geçersiz miktar').default(1),
}).passthrough()

export const zimmetSchema = z.object({
  personnel_id: id,
  items: z.array(zimmetItem).min(1, 'En az bir kalem gerekli'),
})

export const placeholderBatchSchema = z.object({
  room_id: id,
  count: z.coerce.number().int().min(1).max(10),
})

// C1a: kalan mutation uçları (search/lookup lenient kalır — kasıtlı validate edilmedi).
export const assignRoomSchema = z.object({
  personnel_id: id,
  room_id: id,
})

export const setShiftSchema = z.object({
  personnel_id: id,
  shift_type: z.enum(['day', 'night'], { error: 'Geçersiz vardiya tipi' }),
})

export const zimmetSignSchema = z.object({
  personnel_id: id,
  signature: z.string().regex(/^data:image\//, 'Geçersiz imza formatı'),
})

const condition = z.string().trim().optional().nullable()

export const zimmetReturnSchema = z.object({
  zimmet_id: id,
  condition,
})

export const zimmetReturnAllSchema = z.object({
  personnel_id: id,
  condition,
})
