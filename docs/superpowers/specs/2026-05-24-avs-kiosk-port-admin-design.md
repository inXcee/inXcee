# AVS Kiosk — Kardeşten Taşıma + Geri Bildirim Yönetimi (P3) Tasarım Spec'i

> **Bağlam:** AVS kiosk (`/avs-kiosk`) canlıda; P1 (UX) + P2 (panel boşlukları) bitti+deploy. Bu **P3**: kardeş `self-service`'ten AVS çalışanına UYGULANABİLİR özellikleri taşı + gelen geri bildirimleri yöneticinin görüp yönetebileceği admin tarafını ekle (döngüyü kapat). P4 (net-yeni) ayrı.

**Amaç:** Çalışan için QR kart, bildirdiği arızaların durumu, geri bildirim gönderimi; yönetici için gelen geri bildirimleri görme/çözme.

## Uygulanabilirlik analizi (staff vs personnel)

Kardeş `self-service` **personnel/sakin** için; AVS kiosk **staff/çalışan** için. Backend incelemesi:

| Aday | Karar | Neden |
|---|---|---|
| QR kart | ✅ TAŞI | `staff.qr_token` kolonu var; AVS worker = staff. `SELECT qr_token FROM staff WHERE id=workerId`. |
| Bildirdiğim arızalar | ✅ TAŞI (uyarla) | AVS arızası `reporter_personnel_id=null`; sahip `audit_log`'da (`kiosk_avs_maintenance`, detail.workerId). |
| Geri bildirim | ✅ TAŞI (uyarla) | `feedback.personnel_id` nullable → AVS için null + audit_log workerId. |
| Disiplin | ❌ DÜŞÜR | `discipline_records.personnel_id` — sakin'e özel, staff disiplin yok. |
| Çamaşır durumu | ❌ DÜŞÜR | Oda/`laundry_bags` sakin'e ait; AVS çalışanı çamaşırı işler, kendi torbası yok. |

**Yönetim boşluğu:** Feedback için HİÇ admin görünümü yok (`POST /feedback` var, GET/sayfa yok) → gönderilen feedback görülemiyor. P3 bu döngüyü kapatır.

## Mimari

**Backend:**
- Kiosk (worker): `avs-self-service/routes.js`'e 3 endpoint — `GET /my-qr`, `GET /my-maintenance`, `POST /feedback`.
- Admin (manager): yeni izole modül `backend/src/modules/feedback/routes.js` — `GET /` (liste+filtre+gönderen adı), `PATCH /:id/resolve`. Mount `/api/feedback`, `requireRole('campus_manager')`. (Hem AVS hem personnel feedback'ini gösterir — genel döngü de kapanır.)
- Migration: `feedback` tablosuna `resolved_at TEXT` — db/index.js'deki idempotent ALTER pattern'i (try/catch duplicate-column). Tek kolon.

**Frontend:**
- Kiosk: yeni "QR" sekmesi (bottom nav 6→7); Bildirdiğim Arızalar → Hızlı Arıza paneli içinde liste; Geri Bildirim formu → Profil paneli içinde.
- Admin: `frontend/src/modules/admin/FeedbackPage.jsx` + `App.jsx` route `/settings/feedback` + `SettingsLayout` YÖNETİM grubuna sekme (`{ to:'/settings/feedback', label:'Geri Bildirim', icon:'💬', roles:<MGMT> }`).

## Endpoint tasarımı

### Kiosk — `GET /my-qr`
`SELECT qr_token, full_name FROM staff WHERE id=?` (workerId). `{ qr_token, full_name }`. qr_token null ise frontend "QR tanımlı değil, yöneticine başvur" gösterir.

### Kiosk — `GET /my-maintenance`
AVS arızaları audit_log üzerinden:
```sql
SELECT m.id, m.location, m.description, m.status, m.priority, m.opened_at, m.closed_at
FROM maintenance_requests m
JOIN audit_log a ON a.target_id = m.id
  AND a.action='kiosk_avs_maintenance'
  AND json_extract(a.detail,'$.workerId') = ?
ORDER BY m.opened_at DESC LIMIT 20
```
Dizi döner.

### Kiosk — `POST /feedback`
`{ type, message }`. type ∈ {complaint, suggestion, other}, message≥20 (kardeşle aynı). `INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,?,?)` + `audit_log` `kiosk_avs_feedback` (workerId). `{ ok:true, id }`.

### Admin — `GET /api/feedback`
`requireRole('campus_manager')`. Query: opsiyonel `?type=` ve `?resolved=0|1` filtresi. Her satıra **gönderen** ekle: `personnel_id` doluysa personnel.full_name; null ise audit_log'dan (`kiosk_avs_feedback`, target_id=feedback.id) workerId → staff.full_name; bulunamazsa "Anonim/AVS". Dönüş: `[{ id, type, message, created_at, resolved_at, source_name }]`, `created_at DESC`.
> Not: AVS feedback için audit_log'a `target_id = feedback.id` yazılmalı (POST /feedback insert'ten sonra lastInsertRowid ile).

### Admin — `PATCH /api/feedback/:id/resolve`
`requireRole('campus_manager')`. `{ resolved: true|false }` → `UPDATE feedback SET resolved_at = (resolved ? datetime('now') : NULL) WHERE id=?`. `{ ok:true }`.

## Frontend tasarımı

- **QR sekmesi:** `qrcode` lib (mevcut dep) ile token'ı `<canvas>`/dataURL QR olarak büyük çiz; altında çalışan adı. Token yoksa bilgi mesajı.
- **Bildirdiğim Arızalar:** Hızlı Arıza panelinde, form (başarı değilken) altında "Bildirdiklerim" başlıklı liste (`GET /my-maintenance`, `activeTab==='quick_fault'` enabled); durum rozeti (open/assigned/in_progress/closed renk). Foto gönderildikten sonra invalidate.
- **Geri Bildirim formu:** Profil panelinde "Geri Bildirim" bölümü — tip seçimi (3 buton) + textarea (≥20) + gönder; başarı mesajı + temizle.
- **Admin FeedbackPage:** liste (kart/tablo), tip + çözüldü filtresi, "Çözüldü" toggle (PATCH), gönderen + tarih; çözülmemiş sayısı başlıkta.

## Hata yönetimi
- my-qr/my-maintenance hata → 500 + log; frontend boş/uyarı.
- feedback validation 400 (tip/uzunluk).
- Admin endpoint'leri rol yoksa requireRole 403.

## Test
- **Backend (vitest, zorunlu):**
  - `avs-self-service.test.js`: my-qr (qr_token set edilmiş worker → döner), my-maintenance (P2 maintenance POST sonrası → kendi arızası listede), feedback (geçerli → 201/ok + audit_log; kısa mesaj → 400).
  - Yeni `feedback.test.js`: admin GET (campus_manager → liste, gönderen adı dahil), rol yoksa 403, PATCH resolve → resolved_at dolar.
- **Frontend:** `npm run build`; mevcut Playwright e2e regresyon (kiosk login/nav bozulmasın).

## Kapsam dışı (P4 / ileride)
- Yemek/izin/bordro/push → P4
- Feedback'e e-posta bildirimi, kategori bazlı raporlama, QR'ın gerçek turnike entegrasyonu → ileride.

## İzole birimler
- Kiosk 3 endpoint: bağımsız okuma/yazma, mevcut `avs-self-service` pattern'i.
- `feedback` admin modülü: tek sorumluluk (feedback listele/çöz), `requireRole`'lü, kendi test'i.
- `FeedbackPage`: bağımsız admin sayfası, mevcut admin sayfa pattern'i.
- Migration: tek idempotent kolon, geriye uyumlu (eski satırlar `resolved_at=NULL`).
