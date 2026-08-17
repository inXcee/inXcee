# Oda ve Ortak Alan QR Hizmet Portalı

Her oda, koridor, WC, banyo ve merdiven alanına asılan bir QR etiketi. Sakin
telefonuyla okutur; arıza bildirir, çamaşırının alınmasını ister, temizliği
değerlendirir, anket doldurur. Görevli aynı QR'ı okutarak temizlik görevini
kapatır.

Bu dosya modülün **tek güncel kaynağıdır**. Kod ile burası çelişirse kod
doğrudur ve burası güncellenmelidir.

---

## Kavramlar

| Kavram | Nerede | Anlamı |
|---|---|---|
| **Konum** (`service_locations`) | migration 105 | Oda veya ortak alan. Odalar `rooms` tablosundan trigger ile türetilir. |
| **QR / token** (`location_qr_codes`) | migration 105 | Konum başına **tek aktif** token (kısmi UNIQUE index). Token 43+ karakter, DB'de ayrıca `token_hash` tutulur. |
| **Etiket** | fiziksel | Kâğıt. Üstünde QR ve insan-okur seri (`RQ-M1-101-A7K3`) vardır; **token basılmaz**. |
| **Basım partisi** (`location_qr_print_batches`) | migration 110 | Bir seferde basılan etiket kümesi. `BP-00007` gibi numaralanır ve kapak sayfasına yazılır. |
| **Kurulum** (`location_qr_deployments`) | migration 110 | Konum başına tek satır: etiketin **fiziksel** durumu. |

### Üç durum birbirinden ayrıdır

`basıldı` ≠ `asıldı` ≠ `doğru kapıya asıldı`. Kurulum durumları:

`printed` · `installed` · `verified` · `damaged` · `replaced` · `removed`

Buna ek olarak **türetilen** iki durum vardır (saklanmaz):

- **`stale`** — asılı etiketin QR'ı artık aktif değil (token döndürülmüş).
  Kayıttaki `qr_code_id` ile konumun aktif QR'ı karşılaştırılarak bulunur.
  Denormalize edilmemesinin sebebi: rotate yolunu güncellemeyi atlayan bir
  değişiklik sessizce "etiket güncel" derdi.
- **`unknown`** — kurulum kaydı hiç yok.

> **Kayıt yoksa "kurulmadı" DENMEZ.** Bu tablolar canlıda 1078 QR üretildikten
> sonra eklendi. Kayıtsız konumu "kurulmadı" saymak, çoktan asılmış etiketleri
> yeniden asmak için birini 19 bloğu gezmeye göndermek olurdu. Rapor
> `unknown`'ı ayrı kovada tutar ve kurulum oranının paydasına **yalnız durumu
> bilinen konumları** alır.

---

## Ayarlar

`system_settings` içinde, hepsi varsayılan **kapalı** (üretimde otomatik açılmaz):

| Anahtar | Etkisi |
|---|---|
| `location_portal_enabled` | Ana anahtar. Kapalıyken tüm QR'lar kapalı sayfaya düşer. |
| `location_portal_fault_enabled` | Arıza bildirimi |
| `location_portal_laundry_enabled` | Çamaşır alma talebi |
| `location_portal_cleaning_enabled` | Temizlik doğrulama + sakin değerlendirmesi |
| `location_portal_survey_enabled` | Anket |
| `location_portal_fault_pin_required` | Arıza için sakin PIN'i zorunlu |
| `location_portal_laundry_pin_required` | Çamaşır talebi için PIN zorunlu |
| `location_portal_cleaning_review_pin_required` | Değerlendirme için PIN zorunlu |
| `location_qr_label_template` | Varsayılan etiket şablonu (`a4_8`) |
| `location_qr_label_calibration` | Varsayılan yazıcı kalibrasyonu |

Ekran: **Ayarlar → QR Portal Yönetimi**. Portal açılmadan önce dağıtım kapsama
uyarısı gösterilir — etiketi kapıda olmayan portal, açık olsa da kimsenin
ulaşamayacağı bir hizmettir.

**PIN uyarısı:** PIN zorunluluğu açıksa yalnız kiosk PIN'i olan sakin işlem
yapabilir. Canlıda sakinlerin çoğunda PIN yok; dağıtım tamamlanmadan açmayın.

---

## Roller

| Rol | Yetki |
|---|---|
| `campus_manager` | Ayarlar, token üretme/döndürme/iptal, basım partileri, tüm kurulum işlemleri |
| `shift_supervisor` | Görüntüleme, raporlar, saha kurulum doğrulaması |
| `housekeeper`, `technical` | Saha: yerinde doğrulama, "asıldı" işaretleme, hasar bildirimi |
| Sakin | Girişsiz, `/r/:token` üzerinden yalnız kendi konumunun hizmetleri |

---

## API

### Sakin tarafı (girişsiz, `/api/room-portal`)

| Uç | Not |
|---|---|
| `GET /:token` | Portal durumu ve açık hizmetler |
| `POST /:token/auth` | Sakin PIN doğrulaması (oturum başlatır) |
| `POST /:token/faults` | Arıza (fotoğraf opsiyonel, kategori: `elektrik`, `tesisat`, `klima`, `boya`, `genel`) |
| `POST /:token/laundry-requests` | Çamaşır alma talebi — **teslim değildir** |
| `POST /:token/surveys` | Anket |
| `GET/POST /:token/cleaning…` | Görevli PIN'i ile temizlik tamamlama, sakin değerlendirmesi |
| `GET /receipts/:code` | Makbuz |

**Rate limit:** `portalLimiter` 180/10dk, `authLimiter` 30/15dk,
`actionLimiter` 30/15dk. Fotoğraflar `fileTypeFromBuffer` ile sihirli bayt
kontrolünden geçer ve sharp ile yeniden kodlanır (EXIF temizlenir).

**İptal edilmiş token `410` döner** (`revoked_qr`), pasif konum da `410`.

### Yönetim tarafı (`/api/location-portal`)

| Uç | Rol |
|---|---|
| `GET/PUT /settings` | oku / yönetici |
| `GET /locations`, `GET /coverage` | oku |
| `POST /locations/sync`, `/generate-missing` | yönetici |
| `POST /locations/:id/rotate`, `/revoke` | yönetici |
| `GET /locations/:id/label.pdf \| .svg \| .png` | oku — tekli etiket |
| `GET /label-templates` | oku |
| `POST /print-batches` | yönetici — parti açar |
| `GET /print-batches/:id/labels.pdf` | yönetici — **akış halinde** |
| `GET /print-batches/:id/items` | oku |
| `POST /print-batches/:id/confirm \| /cancel` | yönetici |
| `GET /calibration.pdf` | yönetici |
| `GET /deployments`, `/deployments/stale`, `/deployments/mismatches` | oku |
| `POST /deployments/verify`, `/install`, `/:id/issue` | saha rolleri |
| `GET /analytics` | oku |

---

## Etiket basımı

### Şablonlar (`labelTemplates.js`)

| Anahtar | Ölçü | Sayfada | QR |
|---|---|---|---|
| `a4_8` (varsayılan) | 99,1 × 67,7 mm | 8 | 45 mm |
| `a4_12` | 63,5 × 72 mm | 12 | 37 mm |
| `tek_100x70` | 100 × 70 mm | 1 | 45 mm |

Ölçüler **milimetre** cinsinden tanımlı, PDF noktasına tek yerde çevrilir
(`MM = 72/25.4`). QR **vektörel** çizilir (her modül bir dikdörtgen); PNG gömmek
45 mm'de ~180 DPI'a denk geldiği ve lazer baskıda modül kenarlarını
yumuşattığı için terk edildi.

### Akış

1. `POST /print-batches` → parti açılır, numara verilir, kurulum kayıtları
   `printed` olur, `last_printed_at` damgalanır.
2. `GET /print-batches/:id/labels.pdf` → PDF **parti kaydından** üretilir
   (filtreden değil). Aynı numara her indirişte aynı kâğıdı verir.
3. Kâğıt çıkınca `POST /print-batches/:id/confirm`.

> **PDF indirmek "yazdırıldı" değildir.** Parti `generated` durumunda kalır;
> yazıcı sıkışırsa `cancel` yalnız henüz asılmamış kurulum kayıtlarını geri
> alır, asılmış etikete dokunmaz.

### Yazdırma ayarı

Kapak sayfası bunu yazar: **GERÇEK BOYUT / %100, "sayfaya sığdır" KAPALI.**
Etiketler kayıyorsa `GET /calibration.pdf` ile QR'sız sınır sayfası basılır,
ölçülen kayma ±10 mm / %98–102 aralığında parti ayarına girilir.

### Bellek

`writeLabelPdfTo(target, …)` kullanılır: her sayfadan sonra olay döngüsüne
dönerek yanıtı besler. `streamLabelPdf` senkron çizer ve `pipeTo` verilse bile
PDF'in tamamını pdfkit'in okuma tamponunda biriktirir — tekli etiket dışında
kullanılmamalıdır.

Ölçüm (1198 etiket, geliştirme makinesi): 3,5 MB · 2290 ms · heap +9,7 MB ·
**en büyük tampon 1 KB**. Senkron sürümde aynı yükte tampon 3,6 MB idi.

---

## Saha kurulumu

Ekran: **Ayarlar → QR Basım & Kurulum**.

- **Asıldı işaretleme** — görevli koridoru gezip toplu işaretler. Aktif QR'ı
  olmayan konum yazılamaz ve `skipped_no_active_qr` içinde bildirilir; sessizce
  başarı dönmez.
- **Yerinde doğrulama** — `POST /deployments/verify` ile etiket okutulur.
  `expected_location_id` verilirse ve QR başka konumu gösterirse **doğrulama
  sayılmaz**; `location_qr_verify_mismatches` tablosuna düşer. Yanlış kapıya
  asılmış etiket sahadaki en sık hatadır.
- **Hasar** — `POST /deployments/:id/issue` (`damaged` / `removed` / `replaced`).

---

## Bakım senaryoları

| Durum | Yapılacak | Token |
|---|---|---|
| Etiket yırtıldı / söküldü | Hasar bildir, aynı partiyi yeniden bas | **Değişmez** |
| QR kopyalanmış, paylaşılmış, başka yere yapıştırılmış | `POST /locations/:id/rotate` | **Yenilenir**, eskisi `410` |
| Konum kapandı | `POST /locations/:id/revoke` | İptal, yenisi üretilmez |
| Oda numarası değişti | Trigger konum adını günceller; etiket yeniden basılır | Değişmez |

Token döndürüldüğünde kapıdaki kâğıt ölür ve **bayat etiket listesine** düşer
(`GET /deployments/stale`). Rutin yeniden basım bütün kampüs QR'larını
değiştirmez.

---

## Analitik ve sessiz sıfır kuralı

`GET /analytics` yalnız sayı vermez, **sayının gerekçesini** de verir. Bir sıfır
üç farklı şey demek olabilir:

1. **Hizmet kapalıydı** → `services[].note`: "Hizmet KAPALI — sıfır,
   kullanılmadığı anlamına gelmez"
2. **Etiket kapıda değildi** → `silence.explained_by_label`
3. **Gerçekten kullanılmadı** → `silence.genuinely_unused` — asıl bilgi budur

Ayrıca:

- Hiç olay yoksa `window.measurable = false`; günlük ortalama **üretilmez**.
- Ayar geçmişi tutulmuyor. `settings_last_changed_at` denetim kaydından gelir
  ve `settings_history_tracked: false` açıkça bildirilir — bu tarihten öncesi
  için "o gün açık mıydı" sorusu cevaplanamaz.
- Tüm liste uçları okunamadığında boş dizi değil `{ available: false, reason }`
  döner.

---

## Kritik kısıtlar

- **Çamaşır talebi teslim değildir.** Portal hiçbir `laundry_items` kaydı
  açmaz. Torba fiziksel olarak alınırken kart kapısı, gerekçe, imza ve premium
  kuralları baştan uygulanır.
- **Ortak alanda çamaşır hizmeti yoktur** (`laundry_room_only`).
- **Açık talep birleşir.** Oda başına tek açık talep; kısmi UNIQUE index yarış
  durumunda da bunu tutar.
- **Token etikete basılmaz.** Kâğıtta yalnız QR ve kısa seri vardır; seri tek
  başına portala erişim vermez.
- **Temizlik fotoğrafı zorunlu**, arıza ve çamaşır fotoğrafı opsiyoneldir.

---

## Fiziksel öneriler (spec)

Mat beyaz, suya dayanıklı kendinden yapışkanlı malzeme; yoğun kullanım
alanlarında şeffaf laminasyon. Göz hizasına yakın, düz ve yansıma yapmayan
yüzeye yapıştırılır.

---

## İlgili dosyalar

```
backend/src/modules/location-portal/
  service.js              konum senkronu, token yaşam döngüsü
  public-routes.js        sakin tarafı
  public-service.js       token çözümleme, oturum, makbuz  (410 kuralı burada)
  public-actions.js       arıza/anket
  public-cleaning-actions.js
  laundry-request-action.js
  routes.js               yönetim uçları
  labelTemplates.js       şablonlar, vektörel QR, kısa seri, kalibrasyon
  labelPdf.js             föy PDF'i  (writeLabelPdfTo = gerçek akış)
  labelSvg.js             tekli SVG/PNG
  deployment.js           partiler, kurulum, doğrulama
  analytics.js            analitik + sessiz sıfır gerekçeleri

frontend/src/modules/room-portal/RoomPortalPage.jsx    sakin portalı
frontend/src/modules/admin/QrCodesPage.jsx             konumlar
frontend/src/modules/admin/QrDeploymentPage.jsx        basım & kurulum
frontend/src/modules/admin/QrPortalAdminPage.jsx       ayarlar & analitik

migrations: 105 (temel) · 106 (güvenlik) · 107 (arıza/anket) ·
            108 (temizlik) · 109 (çamaşır talebi) · 110 (basım/kurulum)
```
