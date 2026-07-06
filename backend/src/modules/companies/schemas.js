import { z } from 'zod'

// Cross-cutting Zod sweep — companies. Service zorunlu alanı (name) doğruluyor;
// .passthrough() ile diğer alanlar korunur, sadece sınır eklenir.
export const companySchema = z.object({
  name: z.string().trim().min(2, 'Firma adı en az 2 karakter olmalı').max(200, 'Ad çok uzun'),
}).passthrough()
