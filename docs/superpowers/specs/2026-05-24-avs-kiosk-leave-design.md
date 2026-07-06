# AVS Kiosk — İzin Talebi (P4) Tasarım Spec'i

> **Bağlam:** AVS kiosk (`/avs-kiosk`) canlıda; P1 (UX) + P2 (panel boşlukları) + P3 (kardeşten taşı + feedback yönetimi) bitti+deploy. Bu **P4**: net-yeni özelliklerin ilki — izin talebi. Çalışan kiosktan izin talep eder, bakiyesini ve talep durumlarını görür.

**Amaç:** Mevcut izin sistemini AVS çalışanına kiosk üzerinden açmak. Çalışan kalan iznini görür, talep oluşturur, taleplerinin durumunu (beklemede/onaylandı/reddedildi) izler.

**Önemli:** İzin sistemi **tümüyle mevcut** — şema değişikliği YOK, admin onay akışı zaten var. Sadece kiosk yüzeyi eklenir.

## Net-yeni adaylar — fizibilite kararı

| Aday | Karar | Neden |
|---|---|---|
| İzin talebi | ✅ P4 (bu spec) | `leave_requests`+`leave_balance` tabloları + `shifts` servisleri + admin onay (`PATCH /leave/:id`) hazır. AVS worker=staff. Sadece kiosk yüzeyi eksik. |
| Yemek menüsü | ⏭ Ayrı faz (P5) | `meal_logs` var ama **menü tablosu yok** → net-yeni tablo + admin girişi gerekir. |
| Bordro görüntüleme | ❌ Ertelendi | `payroll_deductions` + hesaplanan özet; hassas + karmaşık, kiosk-fit düşük. |
| Push hatırlatma | ❌ Düşürüldü | Paylaşımlı kioskta per-cihaz push subscription mantıksız (çalışan kısa süre girer). Kişisel cihaz kanalı ayrı iş. |

## Doğrulanmış kod gerçekleri

- `leave_requests(staff_id, leave_type[annual/sick/emergency/maternity/paternity/marriage/bereavement], start_date, end_date, total_days, reason, status[pending/approved/rejected], approved_by, approved_at)` — `schema.js:310`.
- `leave_balance(staff_id, year, annual_total=15, annual_used, sick_used, emergency_used)` — `schema.js:326`.
- `shifts/service.js`: `createLeaveService(data)` (zorunlu alan + total_days hesaplar → `createLeaveRequest`), `leaveListService({staff_id})` (`getLeaveRequests` staff_id filtreli), `leaveBalanceService(staffId)` (`getLeaveBalance` eksikse default satır oluşturur, her zaman döner).
- Admin onay: `shifts` `PATCH /leave/:id` (`managerOrSupervisor`) — **mevcut**, yeni admin işi yok.

## Mimari

Backend: `avs-self-service/routes.js`'e 2 endpoint, `shifts/service.js`'ten servisleri import edip **reuse** (DRY — iş mantığı tek yerde). Frontend: `AvsSelfServicePage.jsx`'e yeni "İzin" sekmesi. Şema yok, admin yok.

### Backend — `GET /my-leave`
`requireAvsKiosk`. Dönüş: `{ balance: leaveBalanceService(workerId), requests: leaveListService({ staff_id: workerId }) }`.
- `balance`: `{ annual_total, annual_used, sick_used, emergency_used, year }`.
- `requests`: çalışanın tüm talepleri (en yeni önce), `{ id, leave_type, start_date, end_date, total_days, status, reason, ... }`.

### Backend — `POST /my-leave`
`requireAvsKiosk`. Body: `{ leave_type, start_date, end_date, reason }`. **Güvenlik:** `staff_id` daima `req.user.workerId`'ye zorlanır (body'deki staff_id yok sayılır — çalışan sadece kendisi için talep eder). `createLeaveService({ leave_type, start_date, end_date, reason, staff_id: req.user.workerId })`. Hata (zorunlu alan / bitiş<başlangıç) → 400. Başarı → 201 `{ id }`. Yeni talep `status='pending'` (şema default). `audit_log` `kiosk_avs_leave` (workerId).

### Frontend — "İzin" sekmesi
- Bottom nav'a 8. sekme (`🌴 İzin`).
- **Bakiye kartı:** kalan yıllık izin = `annual_total - annual_used` (büyük), kullanılan hastalık/acil bilgisi.
- **Talep formu:** izin tipi (select — annual/sick/emergency/diğer, i18n etiketli), başlangıç + bitiş tarihi (`<input type=date>`), sebep (textarea, opsiyonel). Gönder → `POST /my-leave` → query invalidate → forma reset.
- **Taleplerim listesi:** her talep — tip + tarih aralığı + gün sayısı + durum rozeti (beklemede=amber, onaylandı=yeşil, reddedildi=kırmızı).

## Hata yönetimi
- POST validation 400 (mevcut servis hatası mesajı gösterilir).
- GET hata → 500 + log; frontend boş/uyarı.
- Tarih mantığı (bitiş<başlangıç) servis tarafında yakalanır.

## Test
- **Backend (vitest, zorunlu):** `avs-self-service.test.js`:
  - `GET /my-leave` → `balance` (annual_total) + `requests` dizi döner.
  - `POST /my-leave` geçerli → 201 + talep `leave_requests`'te `status='pending'`, `staff_id=workerId`.
  - `POST /my-leave` body'de farklı `staff_id` gönderilse bile kayıt `workerId`'ye yazılır (güvenlik).
  - Geçersiz (bitiş<başlangıç) → 400.
- **Frontend:** `npm run build`; e2e regresyon (kiosk login/nav bozulmasın).

## Kapsam dışı
- Admin onay/red akışı — **mevcut** (`shifts PATCH /leave/:id`), dokunulmaz.
- Yemek menüsü → P5 (ayrı). Bordro/push → düşürüldü.
- İzin iptali (çalışanın kendi pending talebini silmesi) — ileride (şimdilik sadece oluştur + görüntüle).

## İzole birimler
- 2 kiosk endpoint: shifts servislerini reuse, `staff_id` workerId'ye sabit (güvenlik sınırı net).
- Frontend İzin sekmesi: bağımsız panel, mevcut tab/query pattern'i.
