import { z } from 'zod'

// Cross-cutting Zod sweep — inventory ana modülü.
// Service katmanı sayısal/array alanları işliyor; .passthrough() ile onlar
// dokunulmadan geçer, sadece metin alanlarına sınır + zorunluluk eklenir.

export const createItemSchema = z.object({
  item_name: z.string().trim().min(1, 'Ad gerekli').max(200, 'Ad çok uzun'),
  unit: z.string().trim().min(1, 'Birim gerekli').max(40, 'Birim çok uzun'),
  category: z.string().trim().min(1, 'Kategori gerekli').max(60, 'Kategori çok uzun'),
  location: z.string().trim().max(200, 'Konum çok uzun').nullish(),
  sku: z.string().trim().max(100, 'SKU çok uzun').nullish(),
}).passthrough()

// Düzenleme — alanlar opsiyonel; gönderilenler sınırlanır (davranış korunur).
export const editItemSchema = z.object({
  item_name: z.string().trim().min(1, 'Ad boş olamaz').max(200, 'Ad çok uzun').optional(),
  unit: z.string().trim().min(1, 'Birim boş olamaz').max(40, 'Birim çok uzun').optional(),
  category: z.string().trim().min(1, 'Kategori boş olamaz').max(60, 'Kategori çok uzun').optional(),
  location: z.string().trim().max(200, 'Konum çok uzun').nullish(),
  sku: z.string().trim().max(100, 'SKU çok uzun').nullish(),
}).passthrough()

export const checkoutSchema = z.object({
  item_id: z.coerce.number({ invalid_type_error: 'Ürün gerekli' }).int().positive('Ürün gerekli'),
  staff_id: z.coerce.number({ invalid_type_error: 'AVS personeli gerekli' }).int().positive('AVS personeli gerekli'),
  quantity: z.coerce.number({ invalid_type_error: 'Miktar gerekli' }).positive('Miktar gerekli'),
  note: z.string().trim().max(500, 'Not çok uzun').nullish(),
  from_location_id: z.coerce.number().int().positive().nullish(),
}).passthrough()

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Tedarikçi adı gerekli').max(200, 'Ad çok uzun'),
}).passthrough()

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(120, 'Ad çok uzun'),
  block: z.string().trim().max(10, 'Blok geçersiz').nullish(),
  notes: z.string().trim().max(1000, 'Not çok uzun').nullish(),
})

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(120, 'Ad çok uzun'),
  block: z.string().trim().max(10, 'Blok geçersiz').nullish(),
  notes: z.string().trim().max(1000, 'Not çok uzun').nullish(),
  is_active: z.coerce.number().int().min(0).max(1).nullish(),
})

export const createReceiptSchema = z.object({
  supplier: z.string().trim().min(1, 'Tedarikçi gerekli').max(200, 'Tedarikçi çok uzun'),
  invoice_no: z.string().trim().max(100, 'Fatura no çok uzun').nullish(),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı').optional(),
  notes: z.string().trim().max(2000, 'Not çok uzun').nullish(),
  items: z.array(z.any()).min(1, 'En az bir kalem gerekli'),
}).passthrough()
