# AVS Kiosk Panel Boşlukları — Tasarım Spec'i (P2)

> **Bağlam:** AVS kiosk (`/avs-kiosk`) canlıda. P1 (UX temeli) bitti+deploy. Bu **P2**: mevcut panellerin fonksiyonel boşluklarını kapatmak. P3 (kardeşten taşı) ve P4 (net-yeni) ayrı.

**Amaç:** Üç panelin en çok eksik bilgisini/aksiyonunu eklemek: Servisim'e **servis saati + sürücü + harita**, Görevlerim'e **"tamamla" aksiyonu**, Hızlı Arıza'ya **fotoğraf**.

**Önemli:** Şema/migration değişikliği YOK — gereken her şey mevcut tablolarda (`route_assignments`, `route_stops.scheduled_time`, `routes`, `cleaning_tasks.completed_at`, foto pipeline) var.

## Doğrulanmış kod gerçekleri

| Konu | Gerçek |
|---|---|
| Servis saati | `route_stops.scheduled_time TEXT`; `route_assignments(staff_id, work_date, route_id, stop_id)` UNIQUE(staff_id, work_date); `routes(name, vehicle_plate, driver_name, driver_phone)` |
| Görev tamamlama | `cleaning_tasks.completed_at DATETIME`, `block`, `task_type`; worker `staff.assigned_block` ile eşleşir |
| Foto | `upload.single` + `verifyMagicBytes` (`shared/uploads/middleware.js`); `createRequest({...photoBefore})` (`maintenance/queries.js:9`) zaten `photo_before` yazar; `/uploads` auth'lu static (`app.js:151`) |
| Mevcut my-transport | `staff.pickup_point_id` → `pickup_points(name,district,neighborhood,notes,lat,lng)` döner; saat/sürücü yok |

## Mimari

Backend: 3 dokunuş, hepsi `backend/src/modules/avs-self-service/routes.js`. Frontend: 3 panel güncellemesi, `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`. Şema yok.

### 1. Servisim — saat + sürücü + harita

**Backend** `GET /my-transport` (zenginleştir):
- Önce bugünün ataması: `route_assignments ra JOIN routes r ON r.id=ra.route_id LEFT JOIN route_stops rs ON rs.id=ra.stop_id WHERE ra.staff_id=? AND ra.work_date=date('now')` → `schedule = { time: rs.scheduled_time, route_name: r.name, driver_name, driver_phone, plate: r.vehicle_plate }`.
- Atama yoksa fallback: mevcut `staff.pickup_point_id` → pickup bilgisi + o durağın **herhangi aktif route_stop**'undan saat/route (varsa): `route_stops rs JOIN routes r ON r.id=rs.route_id AND r.is_active=1 WHERE rs.pickup_point_id=? LIMIT 1`.
- Dönüş şekli: `{ pickup, schedule }` — `pickup` aynen korunur (geriye uyumlu), `schedule` yoksa `null`.

**Frontend** Servisim paneli:
- `schedule.time` varsa durak adının üstünde büyük saat (`🕐 07:30`).
- `schedule` varsa sürücü + plaka satırı (`driver_name · plate`), telefon varsa `tel:` linki.
- `pickup.lat && pickup.lng` varsa **"🗺 Haritada aç"** → `window.open('https://www.google.com/maps?q='+lat+','+lng, '_blank')`.
- Hiçbiri yoksa mevcut "servis atanmamış" mesajı.

### 2. Görevlerim — "tamamla" aksiyonu

**Backend** yeni `POST /tasks/:id/complete`:
- `requireAvsKiosk`. Task'ı çek: `SELECT id, block, completed_at FROM cleaning_tasks WHERE id=?`. Yoksa 404.
- **Yetki:** worker'ın `staff.assigned_block` ile task `block` eşleşmeli; eşleşmezse 403. (assigned_block null ise 403 — blok atanmamış worker tamamlayamaz.)
- Zaten `completed_at` doluysa idempotent 200 (no-op).
- Aksi halde `UPDATE cleaning_tasks SET completed_at=datetime('now') WHERE id=?`. `audit_log`'a `kiosk_avs_task_complete` yaz (workerId + taskId). `{ ok: true, completed_at }` dön.
- Tek yön — geri alma yok (kapsam dışı).

**Frontend** housekeeping görev kartı:
- `completed_at` yoksa **"Tamamla" butonu**; tıkla → `useMutation` POST → başarıda `queryClient.invalidateQueries(['avs-tasks'])`.
- `completed_at` varsa mevcut "✓ Tamamlandı" rozeti (değişmez).
- Mutation pending'de buton disabled + spinner metni.

### 3. Hızlı Arıza — foto

**Backend** `POST /maintenance` (multer ekle):
- Route imzası: `upload.single('photo'), verifyMagicBytes` middleware'lerini `requireAvsKiosk`'tan sonra ekle (import: `shared/uploads/middleware.js`).
- `photoBefore = req.file ? '/uploads/' + req.file.filename : null` → `createRequest({...mevcut, photoBefore})`.
- Mevcut validation (location≥3, description≥10) ve audit (`kiosk_avs_maintenance`) korunur. Multipart'ta `req.body` alanları string gelir — aynı.

**Frontend** Hızlı Arıza formu:
- `<input type="file" accept="image/*" capture="environment">` (mobilde arka kamera). Seçilince küçük önizleme (`URL.createObjectURL`) + "kaldır".
- Gönderim: artık JSON değil **`FormData`** — `location, description, priority` + varsa `photo`. `avsApi.post` `Content-Type` axios tarafından multipart set edilir (FormData verilince elle header verme).
- Foto **opsiyonel**. Başarı/temizleme akışı aynı (önizleme de temizlenir).

## Hata yönetimi
- Transport: schedule sorgusu hata verirse `schedule:null` (pickup yine döner) — panel bozulmaz.
- Task complete: 404 (yok), 403 (blok uyumsuz) — frontend mutation `onError` toast.
- Foto: `verifyMagicBytes` geçersiz dosyada reddeder (mevcut davranış); büyük dosya multer limitine takılır (mevcut limit).

## Test
- **Backend (vitest, zorunlu — proje kuralı):** `avs-self-service.test.js`'e ekle: (a) my-transport route_assignment'lı worker → `schedule.time` döner; (b) tasks/:id/complete kendi bloğu → 200 + completed_at; başka blok → 403; (c) maintenance foto'suz hâlâ 201 (regresyon). Foto'lu multipart testi opsiyonel (supertest `.attach`).
- **Frontend:** `npm run build -w frontend`; mevcut/yeni Playwright e2e'ye Görevlerim "Tamamla" + Servisim saat görünürlüğü eklenebilir (veri seed gerektirir — opsiyonel).

## Kapsam dışı (sonraki fazlar)
- QR/çamaşır/disiplin/feedback → **P3**
- Yemek/izin/bordro/push → **P4**
- Dönüş servisi (akşam), foto görüntüleme kioskta, görev tamamlamayı geri alma → ileride.

## İzole birimler
- `my-transport` zenginleştirme: tek sorgu değişikliği, dönüş `pickup` korunur (geriye uyumlu).
- `POST /tasks/:id/complete`: bağımsız, blok-scope'lu, idempotent.
- `POST /maintenance` foto: mevcut akışa additive middleware; foto'suz davranış değişmez.
