# Mobile PWA Completion — Design Spec

**Date:** 2026-04-26  
**Sub-project:** 1 of 7  
**Status:** Approved

---

## Kapsam

Mobile PWA'nın kalan 8 eksikliğini kapatır. Tüm maddeler mevcut backend endpoint'lerine karşı UI/logic fix'tir; schema değişikliği yoktur (`reporter_user_id` filtre kaldırması hariç, 1 satır routes.js).

---

## 1. TechnicianHome — Filtre Düzeltmesi

**Sorun:** `GET /maintenance/requests?reporter_user_id=me` yanlış — teknisyen kendi bildirdiği talepleri görüyor, kendine atananları değil.

**Çözüm:** `reporter_user_id=me` parametresini kaldır, tüm aktif talepleri getir. Sekme toggle ekle:

- **Tüm Aktif** — status in (open, assigned, in_progress, review)
- **Atanmış** — client-side: `technician_name !== null` olan kartlar
- **Atanmamış** — `technician_name === null` (üstlenilecek açık işler)

`assigned_to` ve `technician_name` zaten response'da geliyor (`getRequests` query JOIN yapıyor). Backend değişikliği gerekmez, sadece `reporter_user_id=me` query param kaldırılır.

> **Kapsam notu:** `users` tablosuyla `technicians` tablosu arasında foreign key yok — "bana atandı" yerine "atanmış/atanmamış" toggle yapılır. Gerçek kişi bazlı filtre Sub-project 3'te (technicians.user_id FK) ele alınır.

**Kart üzerindeki değişiklikler:**
- Atanmış taleplerde `technician_name` mavi chip olarak gösterilir
- Üç sekme: Tüm Aktif / Atanmış / Tamamlandı

---

## 2. TaskDetail — Checklist Form

**Sorun:** `POST /housekeeping/tasks/:id/complete` endpoint'i `checklist` array param kabul ediyor ama TaskDetail'de checkbox UI yok.

**Çözüm:**

- `GET /housekeeping/tasks/:id` response'undaki `checklist` alanı varsa (array of strings), her item için checkbox göster
- Checkbox state'leri `checklist: [{item, done}]` olarak tutulur
- Complete butonuna basmadan önce checklistin tümü tamamlanmamışsa uyarı göster (zorunlu değil, sadece confirm)
- `complete` endpoint'e `checklist` array gönderilir

---

## 3. HousekeeperHome — DnD Odaları

**Sorun:** `/api/housekeeping/dnd-rooms` endpoint var ama HousekeeperHome'da gösterilmiyor.

**Çözüm:**

- HousekeeperHome'a "Rahatsız Etme" kartı ekle — kırmızı kenarlı küçük section
- `GET /housekeeping/dnd-rooms` ile DnD oda listesini çek (staleTime: 60_000)
- Oda numaralarını chip olarak listele
- Görev listesi üzerinde, task kartlarından önce gösterilir

---

## 4. QR Scan — Görev Tamamlama

**Sorun:** Backend `via_qr=true` ve `verified_by_qr=true` alanlarını destekliyor ama frontend'de kamera QR akışı yok.

**Çözüm:**

- TaskDetail'e "QR ile Tamamla" butonu ekle (`@zxing/browser` veya `html5-qrcode`)
- Kamera açılır, oda QR kodunu okur, oda numarasıyla eşleşirse `complete` çağrısına `via_qr: true` eklenir
- QR match başarısızsa manuel tamamlama akışına düşer
- QR kütüphanesi yoksa `<input capture="environment">` ile photo+QR fallback kabul edilir

> **Not:** QR kütüphane bağımlılığı `@zxing/browser` (~120KB gzipped). Alternatif: native `BarcodeDetector` API (Chrome 83+, iOS Safari 17+). Native API önce denenir, yoksa kütüphane yüklenir.

---

## 5. React Query Optimizasyonu

**Sorun:** Tüm mobile query'lerde `staleTime` tanımlı değil — her window focus'ta gereksiz refetch.

**Çözüm:** Tüm `useQuery` çağrılarına ekle:

```js
staleTime: 30_000,   // 30 saniye — bu süre içinde cache fresh sayılır
gcTime: 300_000,     // 5 dakika — unmount sonrası cache tutulur
```

Etkilenen dosyalar: `HousekeeperHome`, `TechnicianHome`, `TaskDetail`, `RequestDetail`, `TaskHistory`.

Kural: SSE event geldiğinde `qc.invalidateQueries` zaten tetikleniyor — staleTime ile SSE event çakışmaz.

---

## 6. PIN Modal — 4 Hane Zorunluluğu

**Sorun:** UsersPage'deki PIN set modalında "Kaydet" butonu 1-3 hane girildiğinde de aktif.

**Çözüm:** `disabled={pin.length !== 4}` — tek satır fix.

---

## 7. UsersPage — PIN Durumu Badge

**Sorun:** Kullanıcı listesinde hangi kullanıcıda PIN tanımlı olduğu görülmüyor.

**Çözüm:**

- `GET /api/users` response'unda `mobile_pin` null/non-null durumu geliyor
- Kullanıcı satırına `mobile_pin ? "PIN ✓" : "PIN —"` chip ekle (yeşil/gri)
- Bu badge PIN set modalını tetikleyen butonun yanında gösterilir

---

## 8. Token Silent Refresh

**Sorun:** Mobile token 8 saatte hard-expire oluyor — saha kullanıcısı çalışırken aniden çıkış yaşıyor.

**Çözüm:**

- `useMobileAuth` hook'unda token decode edilerek `exp` okunur
- Token süresinin 7. saatine (yani 1 saat kala) `setTimeout` kurulur
- `POST /api/mobile/auth/refresh` çağrılır, yeni token store'a yazılır
- Refresh başarısız olursa (401) normal logout akışı işletilir

Token decode için `jwt-decode` (`npm install jwt-decode`) veya manuel `atob(token.split('.')[1])` kullanılır.

---

## Dosya Değişim Listesi

| Dosya | Değişim |
|-------|---------|
| `frontend/src/modules/mobile/technician/TechnicianHome.jsx` | reporter_user_id kaldır, sekme toggle, badge |
| `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx` | Checklist UI |
| `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx` | DnD odaları kartı |
| `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx` | QR scan butonu |
| Tüm mobile useQuery çağrıları (5 dosya) | staleTime/gcTime |
| `frontend/src/modules/admin/UsersPage.jsx` | PIN badge + modal disable fix |
| `frontend/src/modules/mobile/auth/useMobileAuth.js` | Silent refresh |

---

## Test Stratejisi

- TechnicianHome: tüm talepler geliyor mu, toggle çalışıyor mu
- Checklist: tamamlama endpoint'e doğru payload gidiyor mu
- DnD: endpoint yanıt veriyor mu, kart render oluyor mu
- PIN modal: 3 hane → buton disabled
- Silent refresh: 8. saatte logout yok, 7. saatte refresh çalışıyor
- Backend: 387 test geçmeli (backend değişikliği yok, 1 satır routes hariç)

---

## Bağımlılıklar

- QR scan: `BarcodeDetector` API (native, Chrome 83+, iOS Safari 17.4+) önce denenir; yoksa `@zxing/browser` lazy-import edilir
- Token exp: `atob(token.split('.')[1])` native — harici bağımlılık yok

---

## Kapsam Dışı

- `technicians` tablosuna `user_id` ekleme — Sub-project 3'e bırakılıyor
- Offline queue genişletme — zaten tamamlandı
- WebAuthn (biometrik) — düşük öncelik, Sub-project 6
