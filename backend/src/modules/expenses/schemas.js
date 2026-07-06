import { z } from 'zod'

// Tek kaynak: routes.js bunu import eder, summary kategori dağılımı vs. tutarlı kalsın.
export const VALID_CATEGORIES = ['food', 'cleaning', 'laundry', 'maintenance', 'utilities', 'staff', 'other']

// expense_date YYYY-MM-DD (SQLite date() ile uyumlu, strftime grupları için zorunlu).
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')

export const createExpenseSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  description: z.string().trim().min(2, 'Açıklama gerekli').max(500),
  // amount string ya da number gelebilir (form/JSON); coerce + sınır.
  amount: z.coerce.number().nonnegative('Tutar negatif olamaz').max(100_000_000, 'Tutar çok büyük'),
  expense_date: dateStr,
  invoice_no: z.string().trim().max(100).nullish(),
  company_id: z.coerce.number().int().positive().nullish(),
  document_id: z.coerce.number().int().positive().nullish(),
  notes: z.string().trim().max(2000).nullish(),
})
