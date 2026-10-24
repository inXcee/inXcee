import { z } from 'zod'

// Cross-cutting Zod sweep — avs-self-service (worker kiosk). Gate olarak eklenir.
export const mealSelectionSchema = z.object({
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'meal_date YYYY-AA-GG olmalı'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack'], { errorMap: () => ({ message: 'geçerli meal_type gerekli' }) }),
  attending: z.coerce.boolean().optional(),
}).passthrough()

export const maintenanceSchema = z.object({
  location: z.string().trim().min(3, 'location en az 3 karakter olmalıdır').max(200, 'Konum çok uzun'),
  description: z.string().trim().min(10, 'description en az 10 karakter olmalıdır').max(2000, 'Açıklama çok uzun'),
  priority: z.enum(['high', 'medium', 'low'], { errorMap: () => ({ message: 'Geçersiz öncelik' }) }).optional().default('medium'),
  category: z.enum(['elektrik', 'tesisat', 'klima', 'boya', 'genel'], { errorMap: () => ({ message: 'Geçersiz arıza kategorisi' }) }).optional().default('genel'),
  block: z.string().trim().min(1).max(8).nullish(),
  room_id: z.coerce.number().int().positive().nullish(),
  cleaning_task_id: z.coerce.number().int().positive().nullish(),
}).passthrough()

export const skipCleaningTaskSchema = z.object({
  reason: z.enum(['occupied', 'dnd', 'locked', 'fault', 'other'], {
    errorMap: () => ({ message: 'Geçersiz temizlenememe nedeni' }),
  }),
  note: z.string().trim().max(300, 'Not çok uzun').nullish(),
})

export const feedbackSchema = z.object({
  type: z.enum(['complaint', 'suggestion', 'other'], { errorMap: () => ({ message: 'Geçersiz tip' }) }),
  message: z.string().trim().min(20, 'Mesaj en az 20 karakter olmalıdır').max(4000, 'Mesaj çok uzun'),
}).passthrough()

// Saha ekranı oda panosu (board.js). Yer anahtarı: oda `BLOK-ODANO`, M ortak alanı `BLOK-KAT-kod`.
const fieldLocation = z.string({ required_error: 'Yer gerekli' }).trim().min(1, 'Yer gerekli').max(40, 'Geçersiz yer')

export const fieldMarkSchema = z.object({
  location: fieldLocation,
  action: z.enum(['clean', 'skip'], { errorMap: () => ({ message: 'Geçersiz işlem' }) }),
  reason: z.enum(['occupied', 'dnd', 'locked', 'fault', 'other'], {
    errorMap: () => ({ message: 'Geçersiz temizlenememe nedeni' }),
  }).optional(),
  note: z.string().trim().max(300, 'Not çok uzun').nullish(),
  // Kapıdaki QR'ın okutması (qr-scan yanıtı); çok parçalı gövdede metin gelir
  scan_id: z.coerce.number().int().positive().optional(),
})

export const fieldLocationSchema = z.object({ location: fieldLocation })

export const fieldOccupancySchema = z.object({
  occupancy: z.enum(['occupied', 'empty'], { errorMap: () => ({ message: 'Geçersiz doluluk' }) }).nullable(),
})

// dry_run zorunlu: istemci önce kuru denemeyle sayıyı gösterir, onayda açıkça false gönderir
export const fieldFloorSchema = z.object({
  block: z.string().trim().min(1, 'Blok gerekli').max(10, 'Geçersiz blok'),
  floor: z.coerce.number().int().min(0).max(20),
  dry_run: z.boolean({ required_error: 'dry_run gerekli', invalid_type_error: 'dry_run true/false olmalı' }),
})

export const fieldFloorUndoSchema = z.object({
  locations: z.array(fieldLocation).min(1, 'Yer listesi boş').max(200, 'Yer listesi çok uzun'),
})

// Kapıdaki QR (qr.js, board.js /label-verify): okutulan metin tam adres ya da çıplak token olabilir
const scannedQr = z.string({ required_error: 'QR gerekli' }).trim().min(10, 'Geçersiz QR').max(500, 'Geçersiz QR')

export const qrScanSchema = z.object({
  qr: scannedQr,
  via: z.enum(['camera', 'in_app']).optional().default('in_app'),
})

export const fieldLabelVerifySchema = z.object({ location: fieldLocation, qr: scannedQr })

// Saha ekranı çamaşır defteri (laundry.js) — oda bazında torba; istemci anahtarı çift gönderimi önler
export const fieldLaundryIntakeSchema = z.object({
  room_id: z.coerce.number({ invalid_type_error: 'Oda seçilmeli' }).int().positive('Oda seçilmeli'),
  bags: z.coerce.number().int('Torba sayısı tam sayı olmalı').min(1, 'En az 1 torba').max(20, 'En fazla 20 torba'),
  ironing: z.boolean().optional().default(false),
  urgent: z.boolean().optional().default(false),
  note: z.string().trim().max(200, 'Not çok uzun').nullish(),
  client_request_id: z.string({ required_error: 'İstek anahtarı gerekli' }).trim().min(8, 'Geçersiz istek anahtarı')
    .max(80, 'Geçersiz istek anahtarı').regex(/^[a-zA-Z0-9-]+$/, 'Geçersiz istek anahtarı'),
})

export const fieldLaundryDeliverSchema = z.object({
  name: z.string().trim().max(100, 'Ad çok uzun').nullish(),
})

export const fieldLaundryUndoSchema = z.object({
  action: z.enum(['intake', 'ready', 'deliver'], { errorMap: () => ({ message: 'Geçersiz işlem' }) }),
  ids: z.array(z.coerce.number().int().positive()).min(1, 'Torba listesi boş').max(50, 'Torba listesi çok uzun'),
})
