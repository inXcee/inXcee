# HR Sözleşme Bitiş Uyarısı — Tasarım

**Tarih:** 2026-06-04
**Modül:** `hr`
**Kaynak:** 1 Haz people-compliance-group spec'i Faz 3 ("hr: sözleşme bitiş uyarısı") — implementasyon-düzeyi tasarım.

## Bağlam

Personel sözleşme-bitiş **takibi + gösterimi zaten var**:
- `staff.contract_end` kolonu (TEXT, ISO tarih).
- `hr/queries.js getExpiringContracts({ days })` — aktif personel, `contract_end <= bugün + days`.
- `GET /hr/expiring-contracts?days=N` endpoint (manager/supervisor guard).
- Frontend `HrPage` "⏰ SÖZLEŞME BİTİYOR" sekmesi — liste + gün-kaldı.

**Eksik olan:** mevcut akış **pull-only** (HR sayfası açılmalı). Proaktif **otomatik bildirim** yok — yaklaşan bitiş gözden kaçabilir. Spec mimari notu: *"HR sözleşme uyarısı cron/job queue + dashboard anomali kalıbı."* Bu feature o boşluğu kapatır (SLA eskalasyon kalıbının aynısı).

**Çakışma yok:** `automation` modülünün `contract_expiring` trigger'ı yalnızca **şirket** (`companies.contract_end`) sözleşmelerini değerlendirir. Bu feature **personel** sözleşmeleridir — ayrı kaynak, ayrı hedef.

## Amaç

Sözleşmesi yaklaşan (veya süresi geçmiş) aktif personel için otomatik in-app bildirim üretmek; böylece yenileme/işlem zamanında yapılsın.

## Yaklaşım (onaylı)

Maintenance SLA (`modules/maintenance/sla.js`) pattern'i izlenir: dedicated checker + günlük cron + `createNotification` (dedup_key ile gün-içi tekil). Reddedilen alternatif: automation evaluator'a `staff_contract_expiring` trigger eklemek — automation eşik-tabanlı kurallar motoru; sözleşme uyarısı per-personel deadline. Dedicated checker daha izole ve test edilebilir (SLA ile aynı gerekçe).

## Bileşenler

### `backend/src/modules/hr/contractAlerts.js` (yeni)
- Sabit: `CONTRACT_WARN_DAYS = 30` (uyarı penceresi), `CONTRACT_CRITICAL_DAYS = 7` (kritik eşik).
- **`findExpiringContracts(db)`** — `is_active = 1` AND `contract_end IS NOT NULL` AND `contract_end <= date('now', '+CONTRACT_WARN_DAYS days')` personeli döner; her satırda `days_left` = `contract_end` − bugün (gün, negatif = geçmiş). Departman adıyla join. (Not: mevcut `getExpiringContracts` `days_left` döndürmüyor; bu fonksiyon bildirim mesajı için onu hesaplar — ayrı tutulur, mevcut endpoint'e dokunulmaz.)
- **`checkExpiringContracts()`** — `findExpiringContracts` sonucu için her personele `createNotification`:
  - `days_left <= CONTRACT_CRITICAL_DAYS` → `severity: 'critical'`, değilse `'warning'`.
  - `module: 'hr'`, `target_role: 'campus_manager'`.
  - `dedup_key: hr_contract_expiry_${staff_id}` → gün-içi tekil (personel başına günde 1 bildirim).
  - mesaj: `days_left >= 0` → `"Sözleşme bitiyor: <ad> (<departman>) — <days_left> gün kaldı"`; `days_left < 0` → `"Sözleşme süresi doldu: <ad> (<departman>) — <|days_left|> gün önce"`.
  - dönüş: `{ count }` (test/log).

`departman` null ise mesajda `'—'` ya da parantez atlanır (basit: `(departman)` yalnız varsa).

### `backend/src/shared/cron/index.js` (değişiklik)
- Yeni **günlük** schedule (sözleşmeler dakika-dakika değişmez; SLA gibi 15-dk gereksiz). Saat 07:00 TR (`'0 7 * * *'`), lot-expiry 06:00'dan sonra. `withLock('hr-contract-expiry', () => checkExpiringContracts())`. Import: `import { checkExpiringContracts } from '../../modules/hr/contractAlerts.js'`.

## De-dup / şema
- `createNotification` `dedup_key` ile aynı-gün tekilleştirme + 60s pencere. Günlük cron → personel başına günde 1 bildirim. **Yeni kolon / migration YOK.**

## Bildirim akışı
- `checkExpiringContracts` yalnızca `createNotification` çağırır; SSE in-app teslimat + kanal/quiet-hours tercihleri notification servisinde otomatik. Push (varsa) downstream — bu feature ek bir şey yapmaz.

## Hata / sınır durumları
- `contract_end IS NULL` personel atlanır.
- `is_active = 0` (pasif/ayrılmış) personel atlanır.
- Süresi geçmiş (days_left < 0) ama hâlâ aktif personel: bildirilir ("süresi doldu" mesajı) — yöneticinin işlem yapması için.
- Cron hata verirse `withLock`/try-catch ile izole (diğer cron'ları etkilemez).

## Kapsam dışı (bilinçli — YAGNI)
- Dashboard widget/anomali kartı (mevcut HR "SÖZLEŞME BİTİYOR" sekmesi + bildirim feed'i görünürlüğü sağlıyor).
- WhatsApp/SMS bildirimi (in-app/SSE MVP).
- Belge yönetimi (vize/sağlık raporu son-kullanma) — spec'te ayrı kalem, ayrı feature.
- Yapılandırılabilir uyarı günü (sabit 30/7; gerekirse ileride).
- `automation` trigger entegrasyonu (reddedilen alternatif).
- Mevcut `getExpiringContracts`/endpoint/HrPage'e dokunma (çalışıyor).

## Test stratejisi
`backend/src/modules/hr/contractAlerts.test.js` (vitest, :memory: + seedDev):
- **findExpiringContracts:** yaklaşan (≤30g) aktif personel döner; çok ileri (>30g) dönmez; `contract_end NULL` dönmez; `is_active=0` dönmez; süresi-geçmiş aktif döner; `days_left` doğru hesaplanır (yaklaşan +, geçmiş −).
- **checkExpiringContracts:** kritik (≤7g) `critical`, uzak (8-30g) `warning` severity; doğru `dedup_key` ile bildirim üretir; **ikinci çağrıda aynı gün duplicate yok**; dönüş count doğru.

Mevcut `hr.test.js` ve `cron.test.js` kırılmamalı.

## Önerilen uygulama sırası
1. `contractAlerts.js` — `findExpiringContracts` + test (TDD).
2. `checkExpiringContracts` (createNotification + dedup + severity) + test.
3. Cron'a bağla (günlük 07:00, `hr-contract-expiry` lock) + tüm hr/cron testleri + build.
4. Manuel doğrulama: yaklaşan + süresi-geçmiş contract_end personel seed → checkExpiringContracts çağır → bildirim düştü mü.
5. Deploy (onayla).
