# Maintenance SLA Eskalasyon — Tasarım

**Tarih:** 2026-06-04
**Modül:** `maintenance`
**Kaynak:** 1 Haz maintenance-improvements spec'i M2a ("SLA eskalasyon") — implementasyon-düzeyi tasarım.

## Bağlam

Maintenance modülünde SLA **takibi + gösterimi zaten tam**:
- `maintenance_requests.sla_deadline` kolonu, oluşturmada `opened_at + SLA_HOURS_BY_PRIORITY[priority]` (high:4h, medium:24h, low:72h).
- `getStats().overdue` — `status='open'` & deadline geçmiş sayısı.
- Frontend: `DetailPanel` SLA badge (AŞILDI/deadline), `KanbanView` `SLACountdown`, `MaintenancePage` overdue filtresi + stat kartı.

**Eksik olan:** SLA aşımında **otomatik bildirim/eskalasyon**. Maintenance için cron yok (sadece laundry'de `checkSlaViolations` var). Bu feature o boşluğu kapatır.

**Statü değerleri:** `open`, `in_progress`, `done`. Çözülmemiş = `status != 'done'`.

## Amaç

SLA deadline'ı aşan (veya aşmak üzere olan) çözülmemiş arıza talepleri için otomatik in-app bildirim üretmek; böylece geciken işler gözden kaçmasın.

## Yaklaşım (onaylı)

Laundry `modules/laundry/sla.js` pattern'i birebir izlenir: dedicated checker + cron + `createNotification`.

**Reddedilen alternatif:** Spec M2a "automation evaluator'a `sla_overdue` trigger bağla" diyordu. Reddedildi — `automation` modülü kullanıcı-yapılandırmalı **eşik tabanlı** kurallar motoru (ör. `occupancy_high` threshold); SLA ise **per-request** deadline. Dedicated checker daha doğru, izole ve test edilebilir.

## Bileşenler

### `backend/src/modules/maintenance/sla.js` (yeni)
- **`findSlaBreaches(db)`** — `status != 'done'` AND `sla_deadline IS NOT NULL` AND `sla_deadline < datetime('now')` talepleri döner (id, location, priority, sla_deadline).
- **`findSlaPreWarnings(db)`** — `status != 'done'` AND `sla_deadline` henüz geçmemiş AND deadline'a `< PRE_WARN_HOURS` (sabit, varsayılan 1 saat) kalan talepleri döner.
- **`checkMaintenanceSla()`** — ikisini sorgular; her satır için `createNotification` çağırır:
  - **Breach:** `{ message, severity:'critical', module:'maintenance', target_role:'shift_supervisor', dedup_key:`maint_sla_breach_${id}`, entity_type:'maintenance_request', entity_id:id }`
  - **Pre-warning:** `{ message, severity:'warning', module:'maintenance', target_role:'technical', dedup_key:`maint_sla_warn_${id}` }`
  - Dönüş: `{ breaches: N, warnings: M }` (test/log için).

`PRE_WARN_HOURS` sabiti dosya başında (1). Mesaj formatı: breach → `"SLA AŞILDI: <location> (<priority>) — <X> saattir bekliyor"`; warning → `"SLA yaklaşıyor: <location> — <X> saat kaldı"`.

### `backend/src/shared/cron/index.js` (değişiklik)
- Mevcut 15-dk SLA cron bloğuna `checkMaintenanceSla()` çağrısı eklenir, `withLock('maintenance-sla', ...)` ile (laundry-sla ile aynı kalıp). Import: `import { checkMaintenanceSla } from '../../modules/maintenance/sla.js'`.

## De-dup / şema
- `createNotification` `dedup_key` ile aynı-gün tekilleştirme yapar (+ 60s pencere). Cron 15 dk'da bir çalışsa da **talep başına günde 1 breach + 1 warning bildirimi**. **Yeni kolon / migration YOK.**

## Bildirim akışı
- `checkMaintenanceSla` yalnızca `createNotification` çağırır. SSE in-app teslimat + kanal/quiet-hours tercihleri notification servisinde otomatik uygulanır. Push (varsa) job queue üzerinden downstream — bu feature ek bir şey yapmaz.

## Hata / sınır durumları
- `sla_deadline IS NULL` talepler atlanır (eski kayıtlar).
- `done` talepler hiçbir zaman bildirilmez.
- Bir talep aşmışsa pre-warning'e değil breach'e girer (sorgular ayrık: warning yalnız deadline > now).
- Cron hata verirse `withLock`/try-catch ile diğer kontrolleri etkilemez (laundry pattern).

## Kapsam dışı (bilinçli — YAGNI)
- Automation engine trigger bağlama (reddedilen alternatif).
- WhatsApp bildirimi (laundry'de var; maintenance MVP = in-app/SSE).
- `escalated_at` / `sla_escalated` kolonu (dedup_key yeterli — durum doğru katmanda).
- Yapılandırılabilir SLA saatleri (mevcut high:4/medium:24/low:72 sabitleri kalır).
- Teknisyen performans metriği (spec M2d — ayrı feature).
- SLA hesabını ortak saf modüle çıkarma (frontend zaten inline yapıyor — ilgisiz refactor).

## Test stratejisi
`backend/src/modules/maintenance/sla.test.js` (vitest, :memory: DB, seedDev):
- **findSlaBreaches:** geçmiş-deadline `open` ve `in_progress` talepleri döner; `done` olanı ve gelecek-deadline'ı dönmez; `sla_deadline NULL` dönmez.
- **findSlaPreWarnings:** deadline'a < PRE_WARN_HOURS kalan döner; aşmış olanı (breach) dönmez; çok ileride olanı dönmez.
- **checkMaintenanceSla:** doğru `dedup_key`'lerle bildirim üretir (notifications tablosunda `maint_sla_breach_*` satırı oluşur); **ikinci çağrıda aynı gün duplicate oluşmaz** (dedup doğrulama); dönüş sayıları doğru.

Mevcut `cron.test.js` ve `maintenance.test.js` kırılmamalı.

## Önerilen uygulama sırası
1. `maintenance/sla.js` — `findSlaBreaches` + test (TDD).
2. `findSlaPreWarnings` + test.
3. `checkMaintenanceSla` (createNotification + dedup) + test.
4. Cron'a bağla + tüm maintenance/cron testleri + build.
5. Manuel doğrulama: geçmiş-deadline talep oluştur → checkMaintenanceSla çağır → bildirim düştü mü.
