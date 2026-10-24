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
- Giriş: isim + 4 haneli PIN (mevcut kiosk girişi).

## Kimler kullanır

Departmanı `avsRoleGroup` ile **housekeeping** (temizlik / meydan / housekeep) ya da **laundry**
(çama / cama / laundry) grubuna düşen personel. Diğerleri 403 *"Bu ekran kat hizmetleri ve çamaşırhane içindir"*.
Sekme sırası: temizlik → Ana Sayfa · **Odalar** · Çamaşır · Arıza; çamaşırhane → Ana Sayfa · **Çamaşır** · Odalar · Vardiya.
Eski "Görevler" sekmesi yalnız teknik grupta görünür.

`staff.assigned_block` dolu personel yalnız o bloğu görür ve işaretler (canlıda atama yok).

## Kurulum (canlıya alındıktan sonra)

1. **PIN:** Ayarlar → Kiosk PIN → AVS personeli → Kat Hizmetleri + Çamaşırhane personelini seç → *Geçici PIN üret* →
   yazdır ve teslim et. İlk girişte kişi kendi PIN'ini belirler. (Kişiye dokunan işlem — yönetici onayıyla.)
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

## API (kiosk token, `requireAvsKiosk` + `requireFieldGroup`)

| Uç | İş |
|---|---|
| `GET /api/avs-self-service/board/blocks` | bloklar + bugünkü sayaçlar, `assigned_block` |
| `GET /api/avs-self-service/board/rooms?block=` | katlar → ortak alanlar + odalar (durum, doluluk, bugünkü işaret, son temizlik) |
| `POST /api/avs-self-service/board/mark` | `{location, action:'clean'\|'skip', reason?, note?}` + isteğe bağlı `photos` (multipart) |
| `POST /api/avs-self-service/board/undo` | `{location}` |
| `PATCH /api/avs-self-service/board/rooms/:id/occupancy` | `{occupancy}` |
| `POST /api/avs-self-service/board/floor` | `{block, floor, dry_run}` — **dry_run zorunlu** |
| `POST /api/avs-self-service/board/floor-undo` | `{locations}` |
| `GET /api/avs-self-service/laundry` | yıkamada · hazır · bugün teslim (oda bazında) |
| `POST /api/avs-self-service/laundry` | `{room_id, bags, ironing, urgent, note?, client_request_id}` |
| `POST /api/avs-self-service/laundry/rooms/:roomId/ready` · `/deliver` `{name?}` | oda bazında |
| `POST /api/avs-self-service/laundry/undo` | `{action:'intake'\|'ready'\|'deliver', ids}` |
| `PATCH /api/housekeeping/rooms/:id/occupancy` | web, müdür + amir |

Servis hatası `statusCode`'uyla döner (400/403/404/409); beklenmeyen hata genel işleyicide *"Sunucu hatası"* + hata kaydı.

## Panel

- Herhangi bir odada saha doluluk bilgisi varsa **KPI doluluk** oda bazlı: `dolu / (dolu + boş)`, kapalı odalar hariç
  (`occupancy_source:'field'`, `rooms_occupied/empty/unknown`; alt satır "412 dolu / 840 oda · 214 bilinmiyor").
  Saha verisi yoksa yatak bazlı eski hesap aynen. Saha modunda 7 gün öncesiyle karşılaştırma yok.
- Sağlık skorunun DOLULUK bileşeni aynı yüzdeyi kullanır (bileşen kaldırılmadı).
- Isı haritası ve blok doluluk paneli bloğa göre: saha bilgisi olan blok oda bazlı, olmayan blok yatak bazlı.
- Doluluk trend grafiği şimdilik yatak bazlı (günlük doluluk anlık görüntüsü yok).
- Web oda paneli (Temizlik → oda) DOLULUK satırı yalnız müdür ve amire görünür; kutucukta 👤 / ○ rozeti.

## Veri ve denetim

- Migration 125: `rooms.occupancy`, `occupancy_updated_at`, `occupancy_updated_by_worker`, `occupancy_updated_by_user`;
  `cleaning_tasks.origin`, `cleaning_tasks.field_worker_id`.
- `audit_log` (`module='avs-self-service'`, `user_id=NULL`, kişi `detail.workerId`): `field_clean`, `field_skip`, `field_undo`,
  `room_occupancy_change`, `field_laundry_intake`, `field_laundry_ready`, `field_laundry_deliver`, `field_laundry_undo`.
  Webden doluluk: `module='housekeeping'`, `user_id` = kullanıcı.

## Neden bot değil

Personelin Telegram kurup hesap bağlaması gerekir; WhatsApp Business API Meta doğrulaması ve mesaj başı ücret ister;
yapılandırılmış veri (oda × durum) için dokunmatik ızgara yazmaktan hızlıdır. Yöneticinin kanalı Hermes (Telegram) olarak
kalır; Hermes `/temizlik`, `/oda`, `/camasir` aynı kayıtları görür.
