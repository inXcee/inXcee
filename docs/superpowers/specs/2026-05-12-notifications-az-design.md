# Bildirim Sistemi A→Z — Tasarım

**Tarih:** 2026-05-12
**Kapsam:** Uygulama genelinde bildirim altyapısının olgunlaştırılması, eksik akışların bağlanması, in-app aktivite akışı, gelişmiş tercihler, çoklu kanal (in-app/desktop/push/WhatsApp).
**Slogan:** "Log'lara bakmadan ne olduğunu görebileyim."

## Amaç

1. **Tam görünürlük** — Sistemde her modülde olan anlamlı her olay bildirime düşsün; bildirim merkezi aynı zamanda **canlı aktivite akışı** olarak işlev görsün.
2. **Çoklu kanal** — Aynı olay: in-app dropdown + ayrı sayfa, desktop browser, mobile push, opsiyonel WhatsApp.
3. **Granüler kontrol** — Kullanıcı: modül × kanal × kritiklik eşiği + sessiz saatler.
4. **Aranabilir/filtrelenebilir geçmiş** — Modül, tip, tarih aralığı, okunma, serbest metin.
5. **Dedup & rate-limit** — Aynı olay tekrar etmesin; bombardıman olmasın.

## Kapsam Dışı

- E-posta kanalı (ihtiyaç olursa Faz 11+ ayrı spec)
- Telegram bot (kullanıcı "fark etmez WhatsApp" dedi — WhatsApp baz)
- Bildirim için ML/anomaly detection
- Dış sistemler (Slack/Teams entegrasyonu)

## Mevcut Durum (Referans)

| Bileşen | Durum |
|---|---|
| `notifications` tablosu (message, type, module, target_role, target_user_id, dedup_key, is_read) | ✓ |
| `createNotification` → SSE + Web Push + WhatsApp (sadece critical+user) | ✓ |
| `notification_preferences` (user × module enable/disable, 10 modül) | ✓ |
| Web Push (VAPID + sw.js + notificationclick deep-link) | ✓ |
| SSE: heartbeat, per-user limit (4), global limit (500) | ✓ |
| Frontend: `useNotifications` hook + browser Notification + ses + tag | ✓ |
| `createNotification` kullanım: 36 yerde — capacity, checkin, housekeeping, inventory(+req+PO), laundry(+sla), maintenance, cron | ✓ |
| WhatsApp Cloud API: `sendWhatsAppToUser` + outbound log | ✓ |

### Boşluklar

1. **Coverage** — şu olaylar bildirim üretmiyor:
   - Inventory: stok hareketi (yalnız düşük-stok eşiği var; ekleme/çıkarma/transfer sessiz)
   - Laundry: yeni mesaj (LaundryChat) — SSE'de var ama notifications'a düşmüyor
   - Disiplin: yeni kayıt, gözden geçirme
   - Announcements: yeni duyuru
   - Room-history: oda değişikliği, atama/çıkış
   - Self-service, shifts, checkout, kvkk olayları
   - Backup: başarı/başarısızlık
   - System errors: kritik hatalar (error-log modülünde tutuluyor — bildirim yok)
2. **Kullanıcı tercihleri:**
   - Kanal bazında ayrı tercih yok (SSE+push+WhatsApp birlikte)
   - Sessiz saatler yok
   - Kritiklik eşiği yok (info/warning/critical)
3. **UI:**
   - Sadece dropdown var; ayrı arşiv sayfası yok
   - Filtre (modül, tip, tarih, okunma) yok
   - Arama (metin) yok
   - Toplu işaretle / sil yok
4. **WhatsApp:**
   - Sadece `type==='critical' && target_user_id` ile gönderiliyor; per-modül seçim yok
5. **Dedup/rate-limit:**
   - `dedup_key` aynı gün için var; saatlik/dakikalık rate-limit yok
6. **Yönetici görünürlüğü:**
   - Hangi modüllerde ne hacimde bildirim gidiyor istatistik yok

---

## Mimari Karar Özetleri

### Aktivite vs. Bildirim ayrımı
Tek tablo (`notifications`) kalır ama yeni alan `severity` (`info` | `warning` | `critical`) + `event_kind` (event isimlendirme — örn. `inventory.movement.added`, `laundry.message.sent`) eklenir. Tüm anlamlı olaylar buraya yazılır. Kullanıcı tercihleri filtreyi belirler — `info` çoğunlukla aktivite akışı, `warning+` dikkat çekici.

### Olay isimlendirme (`event_kind`)
`<module>.<entity>.<action>` formatı:
- `inventory.movement.added`, `inventory.stock.low`
- `laundry.bag.created`, `laundry.bag.ready`, `laundry.message.sent`
- `housekeeping.task.completed`, `housekeeping.deficiency.reported`
- `maintenance.request.created`, `maintenance.request.resolved`
- `checkin.checkin`, `checkin.checkout`
- `discipline.record.created`
- `announcement.published`
- `system.backup.success`, `system.error.critical`

### Kanallar (channels)
Sabit liste: `in_app`, `desktop`, `push`, `whatsapp`.
- `in_app` her zaman yazılır (DB satırı).
- `desktop` browser Notification (SSE'den).
- `push` web-push (PWA).
- `whatsapp` opsiyonel, kullanıcının telefonu olmalı.

### Tercihler
Mevcut `notification_preferences` (user, module, enabled) yetersiz. Yeni şema:

```sql
notification_preferences_v2 (
  user_id, module, channel, min_severity, enabled,
  PRIMARY KEY(user_id, module, channel)
)
-- min_severity: 'info' | 'warning' | 'critical' (bu eşiğin altı bu kanaldan gitmez)

notification_quiet_hours (
  user_id PRIMARY KEY, start_minute INT, end_minute INT, allow_critical INT
)
-- 00:00 = 0, 23:59 = 1439. allow_critical: sessiz saatte critical yine gelsin mi
```

Eski `notification_preferences` Faz 3'te migrate edilir, geriye uyumluluk.

---

## Fazlar

Her faz tek commit, backend dokunulduysa `npx vitest run` yeşil olmalı.

### Faz 1 — Şema genişletme + event_kind/severity backfill
**Backend:**
- Migration: `notifications` tablosuna `event_kind TEXT`, `severity TEXT DEFAULT 'info'`, `entity_type TEXT`, `entity_id INTEGER`, `link TEXT` ekle (NULLable).
- `createNotification` imzasına yeni alanlar; eski çağrılar default'larla çalışmaya devam.
- `event_kind` enum dökümantasyonu `backend/src/shared/notifications/events.js` — sabit liste.
- `severity` mapping: eski `type` (info/warning/critical) → `severity` aynı değer (alias). Yeni kod `severity` kullanır.
**Test:** Mevcut testler kırılmamalı + yeni alanların create/list'te göründüğü test.
**Tahmini:** Backend ~80 satır + test ~30.

### Faz 2 — Coverage I: Inventory + Laundry mesaj + Housekeeping eksikleri
**Backend:**
- `inventory/movements`: ekleme/çıkarma/transfer için `event_kind: inventory.movement.added/removed/transferred`, severity `info`, target_role `campus_manager` (modül kapalıysa düşmez).
- `inventory/lots`: lot oluşturma, son kullanma yaklaşıyor (cron — `inventory.lot.expiring`).
- `laundry/messages` (`sendMessageService`): yeni mesaj → `laundry.message.sent`, target_role kapsamı `laundry,campus_manager,shift_supervisor`; mesaj `urgent` ise severity `warning`.
- `housekeeping`: defisit raporu, görev iptal, görev gecikme — eksik olanlar bağlanır.
**Test:** Her yeni event_kind için 1 smoke test.

### Faz 3 — Coverage II: Disiplin + Duyuru + Checkin/Checkout + Room-history
**Backend:**
- `discipline`: kayıt oluşturma → `discipline.record.created`, severity `warning`, target `campus_manager`.
- `announcements`: yeni duyuru → `announcement.published`, target_role her rol (broadcast — `target_role IS NULL`). Module key `announcement`.
- `checkin/checkout`: bağlı olan mevcut çağrılar `event_kind`'a uygun hale getirilir.
- `room-history`: oda değişikliği bildirimini opt-in modül olarak ekle (`room_history` modülü — çok gürültülü olabileceği için default kapalı).
**Test:** Akış başına 1 smoke.

### Faz 4 — Coverage III: System events (backup, errors, cron)
**Backend:**
- `backup`: başarılı tamamlanma `system.backup.success` (severity `info`); başarısızlık `system.backup.failed` (`critical`, target `campus_manager`).
- `error-log`: aynı `event_kind` (yeni satır eklendiğinde) `code >= 500` veya `level=critical` ise bildirim → severity `critical`, dedup_key `error.<error_id>` (aynı hata tekrarda yazmasın).
- `cron`: SLA tarama gibi mevcut zaten bildirim üretiyor; isimlendirme uydurulur.
**Test:** Backup başarı/başarısızlık, error-log → notification.

### Faz 5 — Tercih sistemi v2 (kanal × severity × sessiz saat)
**Backend:**
- Yeni tablo `notification_preferences_v2` + `notification_quiet_hours` migration.
- Eski `notification_preferences` → v2'ye otomatik backfill (her kanal için `enabled` aynı, `min_severity='info'`).
- `createNotification` dispatch'i her kanal için tek tek tercih + sessiz saat kontrolü yapar.
- Yeni servisler: `getPreferencesV2Service`, `setPreferencesV2Service`, `getQuietHoursService`, `setQuietHoursService`.
- Eski endpoint'ler geriye uyumlu kalır (matrix yansıtması: tüm kanalları aynı değere set'ler).
**Test:** Sessiz saatte info düşmesin, critical düşsün (allow_critical=1); kanal bazında filter; eski endpoint'in matrix etkisi.
**Tahmini:** Backend ~250 satır + test ~80. **En büyük faz.**

### Faz 6 — Frontend: tercihler ekranı yeniden
**Frontend:**
- Mevcut tercihler ekranını matrix tabloya çevir: satır = modül, sütun = kanal, hücre = açık/eşik chip'i.
- Sessiz saatler bölümü (saat aralığı + "kritik bildirimler hariç" toggle).
- Test/Önizleme butonu: "Bu modülden bir test bildirim gönder" — sadece kendine.
**Test:** Yeni UI manuel + 1 hook test (matrix state).

### Faz 7 — Bildirim merkezi v2 (dropdown + ayrı sayfa)
**Frontend:**
- Dropdown: son 10 + "Hepsini göster" → `/notifications` sayfası.
- Yeni sayfa: filtre çubuğu (modül, severity, tarih aralığı, okunma, arama), liste sayfalama (20'şer), her satırda deep-link (event'in `link` alanı), toplu okundu / sil.
- "Aktivite görünümü" sekmesi: severity=info dahil her şey, kronolojik (default sekme).
- "Önemli" sekmesi: severity warning+critical.
**Backend:**
- `GET /api/notifications` parametreleri: `module`, `severity`, `from`, `to`, `unread_only`, `q`, `page`, `limit`. Mevcut 50 limit'ini paginate'e çevir.
- `POST /api/notifications/mark-all-read` (mevcut, kontrol et)
- `DELETE /api/notifications/:id` (yeni — sadece sahibi/admin)
- `POST /api/notifications/clear-read` (kullanıcı kendi okunmuşlarını temizler)
**Test:** Backend filtre/arama/paginate testleri.

### Faz 8 — Push & desktop iyileştirmeleri
**Backend & frontend:**
- Web Push payload'a `link`, `severity`, `module` ekle (sw.js zaten kısmen kullanıyor).
- Push action butonları (sw.js): "Aç", "Okundu işaretle" — limited support but progressive.
- Desktop Notification için aynı: `requireInteraction=true` severity=critical iken.
- Yeni `/api/notifications/:id/read-via-push` endpoint (auth: notification kendi sahibine).
**Test:** sw.js manuel; backend endpoint testi.

### Faz 9 — WhatsApp/Telegram per-modül + opt-in
**Backend:**
- WhatsApp artık Faz 5 tercih matrix'inden besleniyor (`channel='whatsapp'` enabled olan kullanıcılara).
- Kullanıcının `phone` zorunlu — yoksa skip.
- Rate-limit: aynı kullanıcıya 1 dakikada en fazla 3 WhatsApp; aşılırsa "X yeni bildirim daha var, panele bakınız" özet mesajı.
- Test: phone yok → skip; rate-limit → özet mesaj.
**Telegram (opsiyonel, scope dışı):** Plan dokümante edilir, kod yapılmaz.

### Faz 10 — Yönetici dashboard + dedup/rate-limit güçlendirme
**Backend:**
- `GET /api/notifications/stats` — son N gün modül × severity matrix, dağıtım istatistikleri (sadece campus_manager).
- `createNotification` dispatch'i memory cache ile aynı `dedup_key`'i N saniyede tek seferden fazla yazmaz (default 60s; konfigure edilebilir).
**Frontend:**
- Manager panel bildirim sekmesi: matrix grafik + "son 24 saat olay sayısı", en aktif modüller.
**Test:** Stats endpoint + dedup time-window.

---

## Çapraz konular

### Dedup stratejisi
- `dedup_key`: aynı entity için tekrar; gün bazlı.
- Yeni: time-window dedup (in-memory `Map<key, expiresAt>`). Default 60s. SLA bildirimleri için 3600s gibi config'lenir.

### Performans
- Notifications tablosu büyür; index gerek: `(target_user_id, created_at)`, `(target_role, created_at)`, `(module, severity)`.
- Eski bildirim temizliği: cron — 90 günden eski okunmuş bildirimleri sil; okunmamışları 365 gün sakla.
- SSE broadcast 500+ client'ta yavaşlayabilir; mevcut limit aynı kalır.

### Güvenlik
- `target_user_id` set'li bildirimi sadece sahibi okur (zaten var).
- Push subscription tablosu user_id'ye bağlı, logout'ta endpoint silinir (sw.js mesaj zaten temizliyor).
- WhatsApp opt-in yoksa gönderme; kullanıcı opt-out edebilsin.
- `event_kind` enum dışı değer rejected (whitelist).

### Geriye uyumluluk
- Eski `createNotification({message, type, module})` çağrıları çalışmaya devam.
- Eski `/api/notifications/preferences` endpoint'i v2'yi matrix olarak yansıtır.
- DB migration idempotent — `IF NOT EXISTS` ile.

### Hedefleme matrisi
| Olay türü | target_role | target_user_id | severity |
|---|---|---|---|
| Stok düştü | campus_manager | — | warning |
| Çamaşır hazır | — | sakin (user_id varsa) | info |
| SLA ihlali | laundry,campus_manager | — | critical |
| Backup başarısız | campus_manager | — | critical |
| Yeni mesaj | laundry,manager | — | info/warning |
| Disiplin kaydı | campus_manager | — | warning |
| Duyuru | — | — (broadcast) | info |
| Error-log critical | campus_manager | — | critical |

---

## Tamamlama Kriterleri

- 10 commit `main` üstüne sıralı atılır (her faz ayrı).
- Backend testleri her faz sonunda yeşil.
- Manuel doğrulama:
  - 4 farklı modülde olay tetikle → bildirim merkezi dropdown + sayfa görür
  - Sessiz saat aralığında info gelmez, critical gelir (allow_critical=1 ile)
  - Push: PWA'da gelir, click deep-link doğru sayfa açar
  - Yönetici dashboard'da matrix güncel
- Eski testler kırılmaz; geriye uyumluluk korunur.

## Risk / Tartışma

1. **WhatsApp maliyeti** — Per-modül açık olursa bombardıman olabilir; Faz 9'daki rate-limit ve özet mesaj zorunlu.
2. **SSE ölçekleme** — 500 client limiti şimdilik yeterli; ileride Redis pub/sub gerekirse ayrı spec.
3. **`event_kind` whitelist disipini** — Yeni event eklenince merkezi enum güncellenmeli; aksi halde dışlanır.
4. **Tercih matrisi karmaşıklığı** — 10 modül × 4 kanal × 3 severity = 120 ayar. UI default değerleri sade tutmalı, "varsayılana sıfırla" butonu olmalı.
5. **Notifications tablosu büyüme** — Tüm aktiviteler yazılırsa 30 günde milyonlarca satır olabilir. Faz 10 cleanup + Faz 1 index zorunlu.

## Çalışma Akışı

1. Faz N başlamadan önce TaskUpdate `in_progress`.
2. Backend değişiklik → `cd backend && npx vitest run` yeşil olmadan commit yok.
3. Semantic commit (`feat(notif): ...` veya `feat(<module>): ...`).
4. TaskUpdate `completed`, bir sonraki faza geç.
5. **Her faz arası kullanıcıya geri dön.** Bu spec 10 faz — tek oturumda bitirme. Kullanıcı her commit sonrası onaylasın.
