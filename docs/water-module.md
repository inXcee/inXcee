# Su Takip Modülü

Bu belge `backend/src/modules/water/` ve `frontend/src/modules/water/` için güncel işletim ve geliştirme kaynağıdır. Tarihsel faz notları `PLAN.md` içinde kalır; çalışan davranış konusunda bu belge ve kaynak kod esas alınır.

## Kapsam

Su Takip ekranı aşağıdaki akışları tek modülde yönetir:

- ürün, marka, dağıtım yeri ve ürün-birim kuralları;
- tekli/toplu irsaliye girişi, tekli/toplu dağıtım ve metinden dağıtım çözümleme;
- FIFO irsaliye eşleştirmesi, negatif stok kontrol kuyruğu ve boş kap/palet iadeleri;
- günlük matris, dağıtım yeri geçmişi, stok, trend, tahmin ve sipariş önerileri;
- sayım, kontrollü stok düzeltmesi, ay uyuşturma, ay kilidi ve PDF/Excel çıktıları;
- su tırı ön bildirimi, ana merkez maili, kapı giriş formu ve irsaliye fotoğraf arşivi;
- operasyon uyarıları, bildirimler, otomatik raporlar ve dosya yaşam döngüsü.

## Mimari

### Backend

| Dosya | Sorumluluk |
|---|---|
| `routes.js` | `/api/water` HTTP sözleşmesi, rol kontrolü, upload, audit ve PDF yanıtları |
| `service.js` | Katalog, iade, şablon, uyarı, inceleme kuyruğu ve dışa aktarılan servis yüzeyi |
| `movements.js` | Giriş/dağıtım doğrulaması, transaction, FIFO tahsis ve yeniden uzlaştırma |
| `reconciliation.js` | Sayım, ay uyuşturma, 423 ay kilidi ve kapanış PDF verisi |
| `analytics.js` | Özet, trend, tüketim hızı, gün-yeter ve sipariş önerisi |
| `trucks.js` | Tır planı, kontrol slotları, mail kuyruğu, kapı giriş belgesi ve fotoğraf arşivi |
| `units.js` | Ürüne göre geçerli birimler, tam baz miktar dönüşümü ve insan-okur miktar |
| `notifications.js` | Su operasyon bildirimlerinin rol fan-out'u ve düşük stok kontrolü |
| `jobs.js` | Kalıcı `water.truck-mail` iş kuyruğu handler'ı |
| `file-lifecycle.js` | Güvenli dosya silme, yetim irsaliye fotoğrafı ve rapor retention temizliği |
| `queries.js` | Parametreli SQLite sorguları ve transaction yardımcıları |

`service.js`, route katmanı için geriye uyumlu facade olarak alt modülleri yeniden dışa aktarır. Yeni iş mantığı ilgili sorumluluk dosyasına eklenmelidir.

### Frontend

| Dosya | Sorumluluk |
|---|---|
| `WaterPage.jsx` | Sayfa kabuğu, sekmeler, giriş formları, ay kapanışı ve ayarlar |
| `components/WaterBoard.jsx` | Pencerelenmiş Excel benzeri dağıtım matrisi, günlük kayıt ve rapor dışa aktarımı |
| `components/TruckArrivalPanel.jsx` | Tır, mail, kapı giriş ve irsaliye fotoğraf çalışma alanı |
| `components/DailyDistributionModal.jsx` | Seçilen günün bütün dağıtım dökümü |
| `components/ZoneHistoryModal.jsx` | Dağıtım yeri geçmişi ve dönem karşılaştırması |
| `components/WaterModal.jsx` | Portal tabanlı erişilebilir modal kabuğu |
| `components/WaterCollapsiblePanel.jsx` | Açılır operasyon panellerinin ortak başlık, aksiyon ve erişilebilirlik kabuğu |
| `components/WaterQueryErrorCenter.jsx` | Veri yok ile API hatasını ayıran merkezi hata görünümü |
| `logic/waterUnits.js` | Backend birim kuralının istemci karşılığı |
| `logic/waterMatrix.js` | Hücre değişikliği, yapıştırma, klavye gezinme, satır pencereleme ve geri alma reducer'ı |
| `logic/waterQueryInvalidation.js` | Mutation sonrası kapsam bazlı TanStack Query invalidation |
| `logic/waterExcelExport.js` | Çok sayfalı su takip Excel çalışma kitabı |
| `logic/truckOperations.js` | Tır filtreleri, öncelik, kontrol slotu ve kapı giriş export verisi |
| `logic/waterUi.js` | Tarih, sayı, CSV ve ortak sunum yardımcıları |

## Roller ve Yetkiler

Tüm endpoint'ler JWT ile korunur. `/api/water` router'ı uygulama seviyesinde `writeLimiter` arkasındadır.

| Yetki grubu | Roller | İşlemler |
|---|---|---|
| Operasyon | `campus_manager`, `shift_supervisor` | Listeleme/raporlama, katalog yönetimi, giriş-dağıtım-iade, şablon, sayım, tır oluşturma/güncelleme, manuel kontrol ve fotoğraf arşivi |
| Müdür | `campus_manager` | Stok düzeltme/silme, eksi stok onayı, ay kilitleme/açma, tır silme, gerçek mail kuyruğa alma, tır uyarı taramasını elle çalıştırma |

`technical`, `laundry` ve `housekeeper` rollerinin Su Takip API erişimi yoktur. Saha dağıtım yetkisi genişletilecekse yeni endpoint açmak yerine mevcut role middleware ve audit kapsamı bilinçli olarak değiştirilmelidir.

Önemli ayrım:

- **Mail gönder** (`POST .../send-mail`) SMTP işini kalıcı kuyruğa alır ve yalnızca müdür kullanabilir.
- **Gönderildi işaretle** (`POST .../mark-mail-sent`) sistem dışında gönderilen mailin teyididir; SMTP çağrısı yapmaz.

## Miktar ve Stok Kuralları

`qty_base`, ürünün doğal takip birimidir: ürün tanımına göre `adet`, `koli`, `paket` veya `palet`. Kullanıcı `adet`, `koli`, `paket` ya da `palet` girebilir; yalnızca ürün kuralında anlamlı olan seçenekler kabul edilir.

- `units_per_case`: bir koli içindeki adet sayısıdır.
- `cases_per_pallet`: bir paletteki koli veya paket sayısıdır.
- `lead_time_days`: sipariş verildikten sonra ürünün sahaya ulaşmasının beklenen gün sayısıdır (varsayılan 7).
- `safety_stock_days`: tedarik gecikmesi ve tüketim dalgalanması için ek stok günüdür (varsayılan 3).
- Her giriş tam sayılı bir baz miktara dönüşmelidir. Örneğin dönüşüm 2,5 baz birim üretiyorsa kayıt yuvarlanmaz, HTTP 400 ile reddedilir.
- `5 lt / paket / 80 paket-palet`, `damacana / adet / 36 adet-palet` gibi farklı ürün modelleri aynı dönüşüm motoruyla çalışır.
- Frontend canlı hesaplama ile backend `toBase` doğrulaması aynı kuralları izler; backend son otoritedir.

Stok yetersizliği dağıtımı engellemez. Karşılanamayan miktar `needs_review=1` ile kontrol kuyruğuna düşer ve stok negatif görünebilir. Bu sayede saha kaydı kaybolmaz; müdür daha sonra irsaliye girerek FIFO eşleştirmesini tamamlar veya kaydı inceleyip onaylar.

## Tahmin ve Sipariş Planı

`GET /forecast`, son 30 günlük dağıtımı ürün bazında günlük ortalamaya çevirir. Her ürün için `lead_time_days + safety_stock_days` sipariş eşiği olarak kullanılır; ortak bir global teslim süresi kullanılmaz.

- `order_by_date`: tahmini stok bitiş tarihinden tedarik ve emniyet günleri geri gidilerek hesaplanan sipariş son günüdür.
- `order_due_in_days`: sipariş son gününe kalan gün; negatif değer gecikmeyi gösterir.
- `order_urgency`: `overdue`, `due_soon`, `planned` veya `insufficient_data` durumudur.
- `target_stock_days`: varsayılan hedef stok günü ile tedarik + emniyet süresinin büyük olanıdır. Uzun teslim süreli ürünlerde önerilen miktarın teslim gelmeden yetersiz kalmasını önler.

Ürün ayarlarında tedarik ve emniyet günleri `0-365` aralığında tam sayı olarak yönetilir. Tahmin paneli geciken siparişleri ve sipariş son gününü gösterir. Detaylı Excel kapanış paketindeki **Sipariş Planı** sayfası aynı hesapları, renkli durumları ve filtrelenebilir ürün satırlarını içerir.

## Hareket ve FIFO Akışı

1. Giriş satırı doğrulanır ve giriş ile bekleyen dağıtımların FIFO uzlaştırması aynı transaction içinde yazılır.
2. Dağıtım, açık giriş lotlarını en eski lot önce olacak şekilde tahsis eder.
3. Karşılanamayan bölüm inceleme kuyruğuna düşer; sonradan gelen irsaliye bekleyen dağıtımları otomatik kapatır.
4. Dağıtım güncellenince eski ve yeni ürünün tahsisleri birlikte yeniden uzlaştırılır.
5. Dağıtım silinince serbest kalan lotlar diğer bekleyen çıkışlara yeniden dağıtılır ve çözülen inceleme bayrakları temizlenir.
6. Başka dağıtımlara tahsis edilmiş giriş doğrudan silinemez; API HTTP 409 ve bağlı kullanım açıklaması döndürür.

Tekli giriş, toplu giriş ve FIFO uzlaştırması transaction içindedir. API hataları route içinde yutulmaz; Express merkezi hata katmanına aktarılır. Beklenmeyen 5xx hataları `error_log` ve yapılandırılmışsa Sentry'ye gider.

## Ay Kapanışı ve Kilit

`POST /monthly-close` sayım/kapanış snapshot'ını oluşturur ve ayı kilitler. Kilitli aya ait hareket ekleme, güncelleme veya silme işlemleri HTTP **423 Locked** döndürür.

Kilit kapsamı:

- tekli/toplu giriş ve dağıtım;
- dağıtım güncelleme ve bütün hareket silmeleri;
- tekli/toplu boş kap iadesi ve iade silme;
- stok sayımı;
- stok düzeltme ekleme ve silme.

Katalog, tır ve fotoğraf işlemleri ay hareketi olmadığı için bu kilide bağlı değildir. Kilidi yalnızca `campus_manager`, `POST /monthly-close/:month/unlock` ile açabilir. Kilit atlanmamalı; düzeltme gerekiyorsa önce audit'li kilit açma akışı kullanılmalıdır.

## Tır, Mail ve Kapı Girişi

Tır kaydı; geliş tarihi/saat aralığı, mail son tarihi/saati, kontrol aralığı, 15-240 dakika hatırlatma sıklığı, tedarikçi/marka, sürücü kimliği ve telefonu, plaka/dorse, ziyaret edilecek firma/kişi, saha giriş nedeni, çalışma bölgesi ve ana merkez e-postasını saklar.

Durumlar: `planned`, `mail_sent`, `confirmed`, `arrived`, `cancelled`.

Mail öncesi kontrol listesi ana merkez e-postası, sürücü adı, sicil/arşiv TC veya pasaport, telefon, plaka/dorse, ziyaret firma/kişi/telefonu, giriş nedeni, çalışma bölgesi ve geliş aralığını zorunlu tutar. Eksik alan varken gerçek mail kuyruğa alınmaz.

Mail gönderimi:

1. Route kaydı ve alıcıları doğrular.
2. `water.truck-mail` işi ile tır kaydı aynı SQLite transaction içinde bağlanır.
3. Worker varsayılan 2 saniyelik döngüde işi alır; tır maili en fazla 5 kez denenir.
4. Geçici hatalarda üstel gecikme uygulanır. Kalıcı SMTP/yapılandırma veya veri hataları tekrar denenmez ve kayıtta görünür.
5. Başarıdan sonra `mail_sent_at` yazılır; aynı tır yeniden gönderilmez.

Kapı giriş PDF'i `GET /truck-arrivals/:id/gate-entry.pdf` ile üretilir. UI aynı veri kümesini Excel ve görüntü çıktısı için de kullanır. İrsaliye fotoğrafı tıra, harekete veya her ikisine bağlanabilir. Tır silinirken harekete bağlı fotoğraf korunup tır bağı kaldırılır; yalnızca tıra bağlı fotoğraf kaydı ve fiziksel dosyası silinir.

## API Referansı

Tablodaki `Operasyon`, iki operasyon rolünü; `Müdür`, yalnızca `campus_manager` rolünü ifade eder. Bütün yollar `/api/water` önekine sahiptir. Route sözleşmesi 56 method+yol handler'ından ve 43 benzersiz yoldan oluşur.

### Katalog

| Yöntem | Yol | Yetki | Amaç |
|---|---|---|---|
| GET/POST | `/products` | Operasyon | Ürün listele/oluştur |
| PUT/DELETE | `/products/:id` | Operasyon | Ürün güncelle veya sil |
| GET/POST | `/brands` | Operasyon | Marka listele/oluştur |
| PUT/DELETE | `/brands/:id` | Operasyon | Marka güncelle/sil |
| GET/POST | `/zones` | Operasyon | Dağıtım yeri listele/oluştur |
| PUT/DELETE | `/zones/:id` | Operasyon | Dağıtım yeri güncelle/sil |

### Hareketler ve İadeler

| Yöntem | Yol | Yetki | Amaç |
|---|---|---|---|
| GET | `/movements` | Operasyon | Tarih/tür/ürün/bölge filtreli hareketler |
| POST | `/intake` | Operasyon | Tek irsaliye girişi |
| POST | `/intake/batch` | Operasyon | Tek irsaliyede çok ürün |
| POST | `/distribute` | Operasyon | Tek dağıtım |
| POST | `/distribute/parse` | Operasyon | Serbest metni kaydetmeden önizle |
| POST | `/distribute/batch` | Operasyon | Çok satırlı dağıtım |
| PUT/DELETE | `/movements/:id` | Operasyon | Dağıtım güncelle veya hareket sil |
| GET/POST | `/returns` | Operasyon | Boş kap/palet iadesi listele/oluştur |
| POST | `/returns/batch` | Operasyon | Toplu iade |
| DELETE | `/returns/:id` | Operasyon | İade sil |
| GET | `/deposit` | Operasyon | Depozito/iade bakiyesi |

### Operasyon ve Analiz

| Yöntem | Yol | Yetki | Amaç |
|---|---|---|---|
| GET | `/summary` | Operasyon | Stok, dönem akışı, bölge ve seri özeti |
| GET | `/pivot` | Operasyon | Dağıtım yeri x ürün/marka matrisi |
| GET | `/alerts` | Operasyon | Günlük operasyon uyarıları |
| GET | `/forecast` | Operasyon | Tüketim hızı ve sipariş önerisi |
| GET | `/trends` | Operasyon | 3/6/12 aylık trend kırılımları |
| GET | `/pending` | Operasyon | FIFO irsaliye eşleşmesi bekleyen çıkışlar |
| GET | `/review` | Operasyon | Negatif stok kontrol kuyruğu |
| POST | `/review/approve` | Müdür | Seçilen kontrol kayıtlarını onayla |
| GET/POST | `/templates` | Operasyon | Hızlı dağıtım şablonu listele/oluştur |
| DELETE | `/templates/:id` | Operasyon | Şablon sil |

### Sayım ve Kapanış

| Yöntem | Yol | Yetki | Amaç |
|---|---|---|---|
| GET | `/adjustments` | Operasyon | Stok düzeltmelerini ve sebep listesini getir |
| POST/DELETE | `/adjustments`, `/adjustments/:id` | Müdür | Kontrollü stok düzeltmesi ekle/sil |
| GET | `/reconciliation` | Operasyon | `month=YYYY-MM` ile ay uyuşturma verisi |
| GET | `/reconciliation/:month/pdf` | Operasyon | Ay kapanış PDF özeti |
| POST | `/stock-count` | Operasyon | Ürün sayımını ekle/güncelle |
| POST | `/monthly-close` | Müdür | Ayı snapshot ile kapat ve kilitle |
| POST | `/monthly-close/:month/unlock` | Müdür | Ay kilidini aç |

### Tır ve Fotoğraf

| Yöntem | Yol | Yetki | Amaç |
|---|---|---|---|
| GET/POST | `/truck-arrivals` | Operasyon | Tır planlarını listele/oluştur |
| PUT | `/truck-arrivals/:id` | Operasyon | Tır planını güncelle |
| DELETE | `/truck-arrivals/:id` | Müdür | Tır ve yalnız-tıra bağlı fotoğrafları sil |
| GET | `/truck-arrivals/:id/gate-entry.pdf` | Operasyon | Personel/araç kapı giriş PDF'i |
| POST | `/truck-arrivals/:id/send-mail` | Müdür | SMTP mailini kalıcı kuyruğa al |
| POST | `/truck-arrivals/:id/mark-mail-sent` | Operasyon | Haricen gönderilen maili teyit et |
| POST | `/truck-arrivals/:id/check` | Operasyon | Son tır kontrol zamanını kaydet |
| POST | `/truck-arrivals/check-alerts` | Müdür | Hatırlatma taramasını elle çalıştır |
| GET/POST | `/waybill-photos` | Operasyon | İrsaliye fotoğrafı listele/yükle |
| DELETE | `/waybill-photos/:id` | Operasyon | Fotoğraf kaydı ve fiziksel dosyayı sil |

## Otomasyonlar

Bütün zamanlanmış işler `Europe/Istanbul` saat diliminde ve overlap kilidi ile çalışır.

| Zaman | İş | Davranış |
|---|---|---|
| Her dakika | `water-truck-alerts` | 15-240 dakikalık kullanıcı slotlarını değerlendirir; slot bazlı dedup ile mail/geliş/gecikme uyarısı üretir |
| Her gün 06:15 | `water-daily-digest` | Bekleyen irsaliye, negatif/düşük/kritik stok, sipariş önerisi ve kayıtsız bölge özetini bildirir; eskalasyonları çalıştırır |
| Her ayın 1'i 03:15 | `water-monthly-pdf` | Geçen ayın `su-kapanis-YYYY-MM.pdf` raporunu üretir ve hazır bildirimini yollar |
| Her gün 02:00 | `cleanup` | Yetim su fotoğrafları ve süresi dolan raporları temizler, sonucu audit'e yazar |

Su operasyon bildirimleri hem `campus_manager` hem `shift_supervisor` rollerine fan-out edilir. Dedup anahtarları rol ve zaman slotu bazında tekrar bildirimleri engeller. Günlük özet şu an uygulama içi/push bildirimi üretir; otomatik günlük özet e-postası planlı fakat uygulanmış değildir.

## Dosya Yaşam Döngüsü

- Upload kökü: `UPLOADS_DIR` veya varsayılan `uploads`.
- İrsaliye upload'ları `water-waybill-` önekiyle yazılır ve magic-byte doğrulamasından geçer.
- DB'de referansı olmayan irsaliye dosyaları varsayılan 7 günlük bekleme sonrası silinir.
- `uploads/reports` altındaki PDF'ler varsayılan 730 gün saklanır.
- `WATER_UPLOAD_ORPHAN_GRACE_DAYS` yetim fotoğraf bekleme süresini değiştirir.
- `UPLOAD_REPORT_RETENTION_DAYS` PDF retention süresini değiştirir.
- Güvenli silme yalnızca upload kökünün tek-seviye `/uploads/<dosya>` yollarını kabul eder; path traversal veya dış yol yok sayılır.

## Audit, Hata ve Tutarlılık

Katalog oluşturma/güncelleme/silme, hareketler, tır/mail/kontrol, fotoğraf, sayım, düzeltme, inceleme ve ay kapanışı önemli audit eylemleri üretir. Cron rapor ve dosya retention sonuçları da audit'e yazılır.

Route hataları `next(error)` ile merkezi handler'a gider. HTTP 4xx mesajları istemciye açıklayıcı biçimde döner; 5xx yanıtı `Sunucu hatası` olarak maskelenir ve `error_log`/Sentry kaydı oluşturulur. Frontend `WaterQueryErrorCenter`, başarısız sorguyu boş veri gibi göstermeden kullanıcıya tekrar deneme imkanı verir.

Mutation sonrası veri tutarlılığı `invalidateWaterQueries` kapsamlarıyla yönetilir. Yeni mutation eklerken doğrudan dağınık query key listesi yazılmamalıdır.

## Test ve Doğrulama

Backend su testleri:

```bash
cd backend
npx vitest run src/modules/water src/shared/cron/cron.test.js
```

Backend değiştiyse commit öncesi zorunlu tam suite:

```bash
cd backend
npx vitest run
```

Frontend su testleri ve build:

```bash
cd frontend
npx vitest run src/modules/water
npm run build
```

Kritik regresyonlar: tam baz miktar matematiği, giriş+FIFO atomikliği, ürün değişiminde yeniden tahsis, bağlı giriş silmede 409, kilitli ayda 423, tır slot dedup'u, mail retry/kalıcı hata, upload silme/retention, matris yapıştırma-klavye-undo ve Excel çalışma kitabı.

## Operasyon Kontrol Listesi

1. Ürün birim kurallarını ve min/kritik eşikleri doğrula.
2. Günlük dağıtımları matriste kaydet; negatif kayıt varsa inceleme kuyruğunu kapat.
3. Gelen irsaliyeyi aynı gün gir ve FIFO bekleyen listesini kontrol et.
4. Tır kaydında mail kontrol listesini tamamla; gerçek gönderim ile harici teyidi karıştırma.
5. Ay sonunda tüm ürünleri say, fark varsa sebep/not gir, PDF'i kontrol et ve ayı kilitle.
6. Kilit açılması gerekiyorsa gerekçeyi operasyon notuna yaz; düzeltme sonrası yeniden kapat.
7. Sistem Sağlığı ekranında cron, job queue ve `error_log` durumunu takip et.

## Bilinçli Olarak Ertelenenler

- günlük su özetinin otomatik SMTP e-postası;
- SKT/son kullanma tarihi takibi;
- mobil/QR saha girişi;
- firma bazlı tüketim faturalaması;
- kapı giriş verisinin ortak ziyaretçi/güvenlik modülüne taşınması.

Bu maddeler uygulanmadan UI veya dokümantasyonda tamamlanmış gibi gösterilmemelidir.
