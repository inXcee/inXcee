# Saha Ekranı — oda temizliği, doluluk ve çamaşır defteri

Kat hizmetleri ve çamaşırhane personeli telefondan (ya da ortak tabletten) oda başına **temizlendi /
temizlenemedi / dolu-boş** ve **çamaşır al → hazır → teslim et** girer. Panel doluluğu ve temizlik sayısı
bu kayıtlardan gelir. Tasarım: `docs/superpowers/specs/2026-10-23-saha-ekrani-design.md`.

## Adresler ve oturum

| Adres | Kimin cihazı | Oturum |
|---|---|---|
| `/saha` | personelin kendi telefonu | **kişisel**: hareketsizlikte kilitlenmez, `kiosk_personal_session_days` gün (varsayılan 30) açık kalır; ana ekrana "YYS Saha" olarak eklenir (`manifest-saha.json`) |
| `/avs-kiosk` | ortak tablet (ör. çamaşırhane) | **ortak**: `kiosk_shared_idle_minutes` (2 dk) hareketsizlikte kilit |

- Aynı uygulama (`AvsSelfServicePage`); `/saha` girişte `device_mode:'personal'` gönderir ve oturumu
  `saha-session` anahtarında tutar (ortak kiosktan ayrı).
- **Kayıtlı kiosk cihazı** anahtarı varsa cihazın kuralı önceliklidir; `device_mode` yok sayılır.
- `kiosk_device_required=1` ise kayıtlı cihazı olmayan telefon **giriş yapamaz** — `/saha` için bu ayar kapalı olmalı.
- Giriş: isim + PIN (mevcut kiosk girişi). İlk girişte fişteki 6 haneli geçici PIN girilir ve kişi orada kendine
  4 haneli kalıcı PIN belirler; o belirlenene kadar saha uçları 423 döner.

## Kimler kullanır

Departmanı `avsRoleGroup` ile **housekeeping** (temizlik / meydan / housekeep) ya da **laundry**
(çama / cama / laundry) grubuna düşen personel. Diğerleri 403 *"Bu ekran kat hizmetleri ve çamaşırhane içindir"*.
Sekme sırası: temizlik → Ana Sayfa · **Odalar** · Çamaşır · Arıza; çamaşırhane → Ana Sayfa · **Çamaşır** · Odalar · Vardiya.
Eski "Görevler" sekmesi yalnız teknik grupta görünür.

`staff.assigned_block` dolu personel yalnız o bloğu görür ve işaretler (canlıda atama yok).

## Kurulum (canlıya alındıktan sonra)

1. **PIN:** Ayarlar → Kiosk PIN → AVS personeli → Kat Hizmetleri + Çamaşırhane (+ arızalar için Teknik Servis)
   personelini seç → *Geçici PIN üret* → yazdır ve teslim et. İlk girişte kişi kendi PIN'ini belirler. (Kişiye dokunan
   işlem — yönetici onayıyla.) Geçici PIN tek kullanımlıktır ve **verildiği anda** "Geçici PIN süresi" (varsayılan
   24 sa) kadar geçerli kalır. Toplu dağıtımda süreyi aynı sayfanın Ayarlar sekmesinden geçici olarak 168 saate
   (en çok, 7 gün — her vardiya bir kez gelir) alıp PIN'leri üretin, sonra 24'e döndürün; tek tek verilenler 24 sa kalır.
2. **Afiş:** aynı sayfada *🖨 Saha afişi yazdır* — bu sunucunun `/saha` adresinin QR'ı + 3 adımlık kullanım.
3. Bağlantıyı (`avskamp.com/saha`) personelin WhatsApp grubuna ve panoya koy. Bot gerekmez.

## Odalar

- Blok → kat → kutucuk. Kutucuk: yeşil ✓ temizlendi · turuncu ⊘ temizlenemedi · nötr işaretsiz; köşede 👤 dolu / ○ boş;
  kapalı ⛔ soluk (işaretlenemez), kilitli 🔒, gececi ☾. M bloklarında kat başında 4 ortak alan (Koridor, WC, Banyo, Merdiven).
- Dokun → alt sayfa: **Temizlendi** · **Temizlenemedi** (oda kullanımda / rahatsız etmeyin / kapı kilitli / arıza / diğer+not) ·
  **Dolu / Boş / Bilinmiyor** · isteğe bağlı fotoğraf (en çok 3) · **Arıza bildir**.
- **Katın hepsi temizlendi:** önce kuru deneme sayıyı ve dışarıda kalanları söyler (kapalı, kilitli, temizlik istemiyor,
  gececi, boş, zaten işaretli); onaydan sonra işaretler; dönen yer listesiyle tek dokunuşla geri alınır.
- Her işlemden sonra 6 sn **Geri al**.

### Kurallar (`backend/src/modules/housekeeping/field.js`)

- Temizlik kaydı **istendiğinde açılır**: o günün `cleaning_tasks` satırı yoksa `origin='field'` ile oluşturulur
  (anahtar oda `BLOK-ODANO`, ortak alan `BLOK-KAT-kod` — üretimle aynı; gececi oda 19:00 planlı). Günlük toplu üretim kapalı kalır.
- İkinci "temizlendi" ilk temizleyeni ve saatini ezmez (`already:true`). Tamamlanmış yerde "temizlenemedi" 409.
  Kapalı odada her işlem 409 *"Oda kapalı"*.
- **Geri al** yalnız işareti yapan kişi (`field_worker_id`, yoksa `completed_by_worker_id`); başkasınınkini müdür/amir
  webden ya da Hermes'ten düzeltir. Sahadan açılmış, fotoğrafsız ve **hiçbir kayda bağlı olmayan** görev silinir
  (arıza `maintenance_requests.cleaning_task_id`, sakin değerlendirmesi `cleaning_task_reviews` — bağlıysa silinmez,
  yerinde işaretsiz yapılır).
- Doluluk oda bazlıdır (`rooms.occupancy`: `occupied` / `empty` / NULL = bilinmiyor); kişi sayısı tutulmaz.
  Kapalı odada ayarlanamaz. Aynı değer yeniden verilince yalnız zaman tazelenir, denetime satır düşmez.

## Çamaşır (`backend/src/modules/laundry/field-ledger.js`)

- Hermes `/camasir` ile aynı anlam: her `laundry_items` satırı bir **torba** (`item_count=1`, parça sayılmaz).
  Not: `Defter (Saha ekranı) · parça sayısı yazılmadı`. Kayıt kiosk sistem kullanıcısı (`avs_kiosk_system`) adına açılır;
  gerçek kişi `last_modified_worker_id` + geçmiş satırının `worker_id`'si + `audit_log`.
- **Çamaşır al:** blok → oda → torba sayısı (1–20) → ütü / acil → not. İstemci anahtarı (`client_request_id = <anahtar>#<sıra>`)
  çift gönderimi önler: aynı anahtar ikinci kez gelirse yeni torba açılmaz.
- **Hazır / Teslim et** oda bazındadır (odanın uygun bütün torbaları). Teslim alan yazılmazsa "Odaya bırakıldı".
- Kart okutma zorunluyken saha ekranı **"Saha ekranı" gerekçesiyle** geçer; okutma kaydı personelle düşer.
- Tekil kıyafet takipli (`tracking_mode='individual'`) torbalar bu akışa girmez.
- **Geri al** (24 saat, hepsi ya da hiçbiri) yetkisi torbanın **geçmişinden** okunur — `last_modified_worker_id` başka
  akışlarca da yazıldığı için tek başına yetki sayılmaz: hazır/teslim için son geçmiş satırı o adım ve o kişi olmalı;
  alım için torba sahadan o kişi tarafından açılmış ve bütün geçmişi onun olmalı (başkası işlediyse açan bile silemez —
  çamaşırhane ekranından silinir).

## Kapıdaki QR (oda QR'ı ile takip)

Tasarım: `docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md`. Etiketler oda QR portalınınkidir
(`docs/room-qr-portal.md`); konum anahtarı saha anahtarıyla aynıdır (`M1-101`, `M1-1-corridor`).

- **Okutma:** telefon kamerası ya da Odalar'da **📷 QR okut**. Kamera yolu: etiket `/r/<token>` açar; cihazda `/saha` oturumu
  varsa portal hiç yüklenmeden `/saha?qr=<token>`'a döner, `?qr` adresten hemen silinir ve girişten sonra işlenir. Okutma
  `location_portal_events`'e `field_scan` (`actor_mode='worker'`) olarak yazılır; sakin analitiğinin `scan` sayısına girmez.
  Temizlik/çamaşırhane → o yerin alt sayfası; teknik/diğer → konumu dolu arıza formu.
- **Kanıtlı işaret:** aynı kişinin aynı yerdeki son **60 dk** okutmasıyla verilen temizlendi / temizlenemedi
  `verified_by_qr=1` + `verified_scan_event_id` olur. Başkasının ya da eski okutma doğrulamaz (sessizce doğrulamasız sayılır).
  Panoda 📍, kat başlığında "· N QR", alt sayfada "📍 QR ile doğrulandı · 10:42".
- **Zorunluluk** `system_settings.saha_qr_enforcement`: `off` (varsayılan) | `verified_labels`. Açıkken yalnız etiketi
  **doğrulanmış ve güncel** (asılı QR = aktif QR) kapıda okutmasız temizlendi/temizlenemedi 409 `qr_scan_required` döner;
  kat toplusu bu yerleri dışarıda bırakır (`excluded.qr_required`). Etiketsiz kapı engellenmez; geri alma ve doluluk
  okutma istemez. Web: Temizlik → **📍 SAHA TAKİBİ** (yalnız müdür değiştirir; denetim `saha_qr_enforcement_change`).
- **Etiket doğrulama sahadan:** alt sayfada **🏷 Etiketi doğrula** → okut; beklenen yer = açık yer. Yanlış kapı / iptal etiket
  `location_qr_verify_mismatches`'e (`reported_by_staff_id`), doğru kapı `verified_by_staff_id` ile `verified` yazılır.
- **Sakin talepleri:** açık çamaşır talebi panoda 🧺, Çamaşır sekmesinde **Talepler**; odaya saha alımı talebi `collected`
  yapar (ilk torbaya bağlanır), alım geri alınırsa talep yeniden açılır (o arada yeni talep açıldıysa eskisi iptal). Sakin
  şikayetinin takip görevi panoda ⚠ ve yorumla görünür; "Temizlendi" takip görevini kapatır (geçerli görev = günün **son**
  görevi; pano, işaret, geri alma, kat toplusu ve blok sayaçları hep bunu görür).
- **Sakin sayfası:** okutulan yerin alt sayfasında bağlantı (`/r/<token>?sakin=1`, yalnız kendi adresimizden); `?sakin=1`
  saha yönlendirmesini atlar — kampta kalan görevli kendi odası için sakin hizmetlerini kullanabilir.

### Etiketleri kapıya asma (kullanıcı)

1. Ayarlar → **QR Basım & Kurulum** → parti aç (önce pilot blok; ör. M1: 60 oda + 8 ortak alan = 68 etiket, 9 sayfa) →
   PDF → **99,1 × 67,7 mm 8'li A4 etiket kâğıdı**, yazıcıda **%100 / sayfaya sığdır kapalı** → "basıldı".
2. Etiketleri kapılara göz hizasında yapıştır.
3. Görevli `/saha`'da odayı açar → **🏷 Etiketi doğrula** → okutur (yanlış kapı burada yakalanır).
4. Blok doğrulanınca web Saha Takibi'nden **QR zorunluluğu: doğrulanmış etiketli kapılarda zorunlu**.

## API (kiosk token, `requireAvsKiosk` + `requireFieldGroup`)

| Uç | İş |
|---|---|
| `GET /api/avs-self-service/board/blocks` | bloklar + bugünkü sayaçlar, `assigned_block` |
| `GET /api/avs-self-service/board/rooms?block=` | katlar → ortak alanlar + odalar (durum, doluluk, bugünkü işaret, son temizlik; `verified_by_qr`, `qr_label`, `qr_required`, `pickup_request`, `complaint`) + `enforcement` |
| `POST /api/avs-self-service/board/mark` | `{location, action:'clean'\|'skip', reason?, note?, scan_id?}` + isteğe bağlı `photos` (multipart) |
| `POST /api/avs-self-service/board/label-verify` | `{location, qr}` — sahadan etiket doğrulama |
| `POST /api/avs-self-service/qr-scan` | `{qr, via:'camera'\|'in_app'}` — **bütün kiosk personeli**; konum, `group`, `qr_label` döner, token dönmez |
| `POST /api/avs-self-service/board/undo` | `{location}` |
| `PATCH /api/avs-self-service/board/rooms/:id/occupancy` | `{occupancy}` |
| `POST /api/avs-self-service/board/floor` | `{block, floor, dry_run}` — **dry_run zorunlu** |
| `POST /api/avs-self-service/board/floor-undo` | `{locations}` |
| `GET /api/avs-self-service/laundry` | yıkamada · hazır · bugün teslim (oda bazında) + `requests` (sakin talepleri) |
| `POST /api/avs-self-service/laundry` | `{room_id, bags, ironing, urgent, note?, client_request_id}` |
| `POST /api/avs-self-service/laundry/rooms/:roomId/ready` · `/deliver` `{name?}` | oda bazında |
| `POST /api/avs-self-service/laundry/undo` | `{action:'intake'\|'ready'\|'deliver', ids}` |
| `PATCH /api/housekeeping/rooms/:id/occupancy` | web, müdür + amir |
| `GET /api/housekeeping/field-report?date=` | web, müdür + amir: kişi başı temizlik / QR, blok etiket kapsaması, açık yanlış kapı |
| `PUT /api/housekeeping/field-qr-enforcement` | web, yalnız müdür: `{mode:'off'\|'verified_labels'}` |
| `POST /api/housekeeping/rooms/occupancy-bulk` | müdür + amir (Telegram `/oda`): `{block, floor?, room_nos?, occupancy:'occupied'\|'empty'\|null}` → `{updated, unchanged, skipped_closed, not_found}` |
| `GET /api/housekeeping/rooms/state-summary` | blok başına `occupied/empty/unknown/occupancy_pct` + toplam `occupancy {pct, coverage, yesterday_pct, change_1d, stale}` |
| `GET /api/housekeeping/rooms/state?occupancy=` | odaların `occupancy`, `occupancy_updated_at`; süzgeç `occupied` \| `empty` \| `unknown` |
| `GET /api/housekeeping/occupancy/trend?days=&block=` | müdür + amir: günlük seri (1..180 gün, bugün canlı) + `summary {pct, change_7d, avg, min, max, days_with_data}` |
| `GET /api/housekeeping/evening-summary?date=&format=` | müdür + amir: akşam saha özeti JSON; `format=text` Telegram'a hazır düz metin |

Servis hatası `statusCode`'uyla (ve varsa `code`'uyla, ör. `qr_scan_required`) döner (400/403/404/409); beklenmeyen hata genel
işleyicide *"Sunucu hatası"* + hata kaydı.

## Panel

- Herhangi bir odada saha doluluk bilgisi varsa **KPI doluluk** oda bazlı: `dolu / (dolu + boş)`, kapalı odalar hariç
  (`occupancy_source:'field'`, `rooms_occupied/empty/unknown`; alt satır "412 dolu / 840 oda · 214 bilinmiyor").
  Saha verisi yoksa yatak bazlı eski hesap aynen. Saha modunda 7 gün öncesiyle karşılaştırma o günün anlık
  görüntüsünden; görüntü yoksa karşılaştırma yok.
- Sağlık skorunun DOLULUK bileşeni aynı yüzdeyi kullanır (bileşen kaldırılmadı).
- Isı haritası ve blok doluluk paneli bloğa göre: saha bilgisi olan blok oda bazlı, olmayan blok yatak bazlı.
- Doluluk trend grafiği panelle aynı kaynaktan: saha bilgisi varsa oda bazlı günlük görüntüler ("Doluluk · oda bazlı"),
  görüntüsüz gün boş; yoksa yatak bazlı.
- Web oda paneli (Temizlik → oda) DOLULUK satırı yalnız müdür ve amire görünür; kutucukta 👤 / ○ rozeti.

## Doluluk geçmişi (`backend/src/modules/housekeeping/occupancy-history.js`)

- `rooms.occupancy` anlıktır; günün durumu `room_occupancy_daily`'ye (gün × blok: `rooms, closed, occupied, empty,
  unknown`) yazılır. Cron her saat **:55**'te günün satırlarını yeniden yazar — günün son yazımı (23:55) gün sonu durumudur;
  sunucu gece kapalı kalsa da gün boş geçmez. Geçmiş günlere dokunulmaz.
- **Bugün her zaman canlı** okunur, geçmiş gün görüntüden. Görüntüsü olmayan gün `null` döner ve grafikte boş kalır —
  sıfır diye çizilmez (kayıt başlamadan önceki günler böyle).
- Oran her yerde aynı: `dolu / (dolu + boş)`, kapalı oda paydaya girmez. **Kapsama** = durumu bilinen / kapalı olmayan oda.
- **Bayat**: durumu bilinen ama 14 gündür kimsenin teyit etmediği oda (`occupancy_updated_at`). Aynı değer yeniden
  verilince teyit zamanı tazelenir (denetime satır düşmez).
- Gün içi değişiklikler `audit_log.room_occupancy_change`'ten sayılır (dolu oldu / boş oldu / ilk kez girildi / silindi).
- Web: Temizlik → **📍 Saha takibi** → "Doluluk trendi" (blok, 14/30/90 gün; çizgi oran, gri çubuk bilinmeyen oda).

## Hermes akşam özeti (`backend/src/modules/housekeeping/evening-summary.js`)

`GET /api/housekeeping/evening-summary` günün saha durumunu tek yanıtta verir; **metin sunucuda kurulur** (`text`), Hermes
olduğu gibi gönderir — web önizlemesi (Saha takibi → "Akşam özeti") aynı metni gösterir. Hiçbir şey yazmaz.

| Bölüm | İçerik |
|---|---|
| `occupancy` | oran, dolu/boş/bilinmiyor, düne göre fark (dünkü görüntü), gün içi değişiklikler, en çok bilinmeyen 3 blok, bayat oda (yalnız bugün) |
| `cleaning` | temizlendi / temizlenemedi (sebebe göre), QR oranı, **işaretsiz** oda (blok başına), çalışan sayısı ve en çok temizleyen 3 kişi |
| `laundry` | o gün alınan / hazırlanan / teslim edilen torba; **şu an** yıkamada (acil), hazırda, 24 saati aşan hazır, açık alma talebi |
| `complaints` | günün sakin onay / şikayet sayısı ve ortalama puanı; takip temizliği yapılmamış şikayet (gün fark etmez) |
| `alerts` | dikkat satırları: kapsama < %50, bayat oda, işaretsiz oda, açık yanlış kapı, 24 saati aşan hazır torba, 48 saati aşan açık torba, 12 saati aşan alma talebi, açık şikayet |

- Temizlik sayımlarında **her işaretli görev ayrı iştir** (saha raporuyla aynı: şikayet sonrası yeniden temizlik ilk
  temizliği silmez). **İşaretsiz** ise yer başına geçerli (son) göreve bakar: açık, temizlik istenmeyen değil, boş bilinmeyen
  ve geçerli görevi işaretsiz oda. Kilitli, kapalı ve boş oda beklenmez.
- Geçmiş gün (`?date=`): doluluk o günün görüntüsünden (yoksa "bu gün için kayıt yok"); bayatlık söylenmez; "işaretsiz"
  bugünkü oda durumuyla hesaplanır; çamaşırın "şu an bekleyen" satırı her zaman şimdiki durumdur. Gelecek gün 400.
- Sıfır tek başına yazılmaz: "henüz dolu/boş bilgisi girilmedi", "saha işareti yok (beklenen N oda)" ayrı cümlelerdir.

### Hermes'te kurulum (sunucuda, repo dışı)

Hermes'in YYS'ye bağlandığı vardiya amiri hesabıyla (Telegram botunun mevcut kimliği) zamanlanmış görev:

```
Her gün 20:30 (Europe/Istanbul):
  GET https://avskamp.com/api/housekeeping/evening-summary?format=text   (Authorization: Bearer <amir oturumu>)
  → yanıtı olduğu gibi sahibin Telegram sohbetine gönder (parse_mode yok — düz metin).
  Hata ya da 5xx → bir kez 10 dk sonra dene; yine olmazsa "Akşam özeti alınamadı: <durum>" yaz.
```

`/oda` komutunda doluluk: `GET rooms/state-summary` yanıtındaki `occupancy` (toplam oran, düne göre fark, bayat) ve blok
satırlarındaki `occupied/empty/unknown/occupancy_pct` gösterilir; `/oda <blok> <odalar> dolu|boş|bilinmiyor` →
`POST rooms/occupancy-bulk` (kapalı odalar atlanır, bulunmayan numara söylenir); `/oda trend [blok]` →
`GET occupancy/trend?days=14`. Hermes betikleri `~/.hermes/` altındadır, bu repoda değildir.

## Veri ve denetim

- Migration 125: `rooms.occupancy`, `occupancy_updated_at`, `occupancy_updated_by_worker`, `occupancy_updated_by_user`;
  `cleaning_tasks.origin`, `cleaning_tasks.field_worker_id`.
- Migration 126: `cleaning_tasks.verified_scan_event_id`; `location_qr_deployments.installed_by_staff_id`,
  `verified_by_staff_id`; `location_qr_verify_mismatches.reported_by_staff_id`; `saha_qr_enforcement='off'`.
- Migration 127: `room_occupancy_daily` (gün × blok doluluk anlık görüntüsü, PK `(day, block)`).
- `audit_log` (`module='avs-self-service'`, `user_id=NULL`, kişi `detail.workerId`): `field_clean`, `field_skip`, `field_undo`,
  `room_occupancy_change`, `field_laundry_intake`, `field_laundry_ready`, `field_laundry_deliver`, `field_laundry_undo`.
  Webden doluluk: `module='housekeeping'`, `user_id` = kullanıcı.

## Neden bot değil

Personelin Telegram kurup hesap bağlaması gerekir; WhatsApp Business API Meta doğrulaması ve mesaj başı ücret ister;
yapılandırılmış veri (oda × durum) için dokunmatik ızgara yazmaktan hızlıdır. Yöneticinin kanalı Hermes (Telegram) olarak
kalır; Hermes `/temizlik`, `/oda`, `/camasir` aynı kayıtları görür.
