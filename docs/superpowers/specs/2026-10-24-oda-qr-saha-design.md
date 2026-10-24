# Oda QR'ı ile saha takibi — tasarım

Tarih: 24 Ekim 2026 · Durum: kullanıcı soruları atladı ("devam geliştirmeye"); aşağıdaki kararlar **benim
kararım** olarak işaretli olanlar dışında kullanıcının söyledikleridir.

## Niyet

Kullanıcı: "Oda oda QR'lı takip sistemini de entegre et, iyice geliştir." QR'ı **temizlikçiler okutur**.
Amaç (kullanıcı onayladı): **temizlikçinin odaya gerçekten gittiği kanıtlansın; kimse panodan uzaktan
"temizlendi" basamasın.**

Bugünkü durum (canlı, 24 Eki salt okuma):
- QR portalı (`docs/room-qr-portal.md`, migration 105–110) tamamen kurulu ve **açık**: 1.078 konum
  (1.054 oda + 24 M-blok ortak alanı), her birinin aktif token'ı var; sakin hizmetleri (arıza, çamaşır
  talebi, temizlik değerlendirme, anket) açık, PIN zorunlu değil.
- **Hiç etiket basılmadı:** basım partisi 0, kurulum kaydı 0; portal kullanımı 0.
- Portaldaki "görevli QR ile temizliği kapatır" akışı canlıda çalışamaz: bloğa atanmış görevli ister
  (canlıda atama yok), önceden üretilmiş görev ister (üretim kapalı), kontrol listesi + 1–3 foto ister.
- Saha ekranı (`docs/saha-ekrani.md`) canlıda; 90 saha+teknik personelin geçici PIN'i var.
- **Konum anahtarları aynı:** `service_locations.qr_location` = saha anahtarı (`M1-101`, `M1-1-corridor`).
- `cleaning_tasks.verified_by_qr` sütunu zaten var (portal akışı yazıyor).

## Hedefler

1. **İki okutma yolu, tek etiket:**
   - **Telefon kamerası:** etiket `https://avskamp.com/r/<token>` açar. Cihazda `/saha` kişisel oturumu
     varsa sakin portalı hiç yüklenmeden `/saha?qr=<token>`'a yönlenir. (Portal açılışı sakin analitiğine
     "scan" olayı yazdığı için yönlendirme veri çekmeden önce yapılır.)
   - **Uygulama içi:** Odalar sekmesinde "📷 QR okut" → kamera (`QrScannerModal`).
   - Her iki yol da `POST /avs-self-service/qr-scan` ile okutmayı kaydeder ve kişinin grubuna göre doğru
     ekranı açar: temizlik/çamaşırhane → o konumun Odalar alt sayfası; teknik/diğer → konumu dolu
     arıza formu.
2. **Kanıtlı işaret:** okutmadan sonra **60 dk** içinde aynı kişinin aynı konuma verdiği "temizlendi" /
   "temizlenemedi" işareti **QR ile doğrulanmış** sayılır (`verified_by_qr=1`,
   `verified_scan_event_id`). *(60 dk benim kararım: oda temizliği 5–20 dk; kapıda okutup temizleyip
   sonra işaretlemeye yeter, "katı baştan okut, sonra uzaktan bas"ı zorlaştırır.)*
3. **Zorunluluk ayarı** `saha_qr_enforcement`: `off` (varsayılan) | `verified_labels`. Açıkken,
   **etiketi doğrulanmış** (kurulum `verified` ve asılı QR = aktif QR) konumda temizlendi/temizlenemedi
   okutma ister (409 `qr_scan_required`); kat toplusu bu konumları dışarıda bırakır (`qr_required`).
   Etiketi olmayan kapı panodan işaretlenebilir — etiket kapıda yokken kimse engellenmez. *(benim kararım:
   zorunluluk kapı kapı, doğrulanan etiketle kendiliğinden yayılır; ayrı blok listesi tutulmaz.)*
4. **Etiket kurulumu sahadan:** alt sayfada "🏷 Etiketi doğrula" → okut → mevcut `verifyDeployment`
   kuralı (beklenen konum = alt sayfanın konumu; yanlış kapı / iptal etiket kaydedilir, açık mesaj).
   Doğrulayan saha personeli ayrı sütuna yazılır (kurulum tablolarındaki `*_by` sütunları `users`'a bağlı).
5. **Panoda görünürlük:** QR'lı işaret kutucukta 📍; alt sayfada "📍 QR ile doğrulandı 10:42" ve etiket
   durumu satırı; kat başlığında QR'lı sayı.
6. **Sakin portalı sahaya bağlanır:**
   - **Çamaşır talebi** (`laundry_pickup_requests`): Çamaşır sekmesinde "Talepler" bölümü; kutucukta 🧺;
     odaya saha alımı açık talebi `collected` yapar (ilk torba bağlanır); alım geri alınırsa talep
     yeniden açılır.
   - **Temizlik şikayeti** (`cleaning_task_reviews.outcome='issue'` → takip görevi): panoda ⚠ "Sakin eksik
     bildirdi" + yorum; "Temizlendi" **açık takip görevini** kapatır. (Bugün pano takip görevini sebepsiz
     "temizlenmedi" gösterir, saha onu kapatamaz — portal kullanılmaya başlayınca ortaya çıkacak hata.)
7. **Yönetici takibi (web):** Temizlik sayfasına "📍 SAHA TAKİBİ" görünümü — bugün kişi başına temizlendi /
   temizlenemedi / QR'lı (sayı ve %), ilk–son işaret saati; blok başına etiket kapsaması (doğrulandı / asılı /
   basıldı / yok / bayat) ve açık yanlış-kapı sayısı; zorunluluk anahtarı (yalnız müdür).
8. **Portal sayfası:** eski "çalışan numarası + PIN + kontrol listesi + foto" bölümü yerine "Görevliysen:
   Saha ekranında aç" bağlantısı. *(benim kararım: o akış canlıda çalışmıyor ve iki farklı temizlik
   yolu kafa karıştırır; arka uç ucu geriye dönük duruyor.)* Saha tarafında okutulan konumun alt
   sayfasında küçük "Sakin sayfası" bağlantısı (`/r/<token>?sakin=1` yönlendirmeyi atlar) — kampta
   kalan görevli kendi odası için sakin hizmetlerini kullanabilsin.

## Hedef olmayanlar

- Yeni etiket/token sistemi, yeni etiket şablonu (mevcut parti/basım/kurulum aynen).
- Odada kalma süresi (giriş/çıkış), GPS, NFC.
- Etiket fotoğrafıyla hile tespiti (sızan token `rotate` ile ölür; şüpheli hız raporu sonraya).
- Sakin portalı yeniden tasarımı; yazdırma/satın alma otomasyonu.

## Kaçınılacaklar

- Etiket kapıda değilken temizlikçiyi engellemek (zorunluluk varsayılan kapalı ve yalnız doğrulanmış
  etikette).
- Token'ı ekranda/logda/yanıtta göstermek (yalnız QR'da; saha yanıtları konum döner).
- Sakin portalını bozmak (görevli oturumu olmayan her cihaz portalı eskisi gibi görür).

## Veri

Migration 126 (`126_oda_qr_saha.sql`):
- `location_qr_deployments`: `installed_by_staff_id`, `verified_by_staff_id` → `staff(id)`.
- `location_qr_verify_mismatches`: `reported_by_staff_id` → `staff(id)`.
- `cleaning_tasks.verified_scan_event_id` → `location_portal_events(id)`.
- İndeks: `location_portal_events(actor_staff_id, event_type, created_at)`.
- `system_settings`: `saha_qr_enforcement='off'` (INSERT OR IGNORE).

Okutma kaydı mevcut `location_portal_events` tablosuna: `event_type='field_scan'`, `actor_mode='worker'`,
`actor_staff_id`, `qr_code_id`, `result='opened'`, `metadata {via:'camera'|'in_app'}`. Sakin analitiği
`'scan'` türünü saydığı için karışmaz.

## API (kiosk)

| Uç | Kim | Ne |
|---|---|---|
| `POST /avs-self-service/qr-scan` `{qr, via}` | tüm kiosk personeli | URL ya da token → aktif QR + aktif konum; bloğa atanmışsa blok kuralı; olay yazar. Döner: `scan_id, location, kind, block, floor, room_id, display_name, label, at`. 404 `qr_unknown`, 410 `qr_revoked` / `location_inactive`, 403 blok. |
| `POST /board/mark` `+scan_id` | saha | Geçerli okutma → doğrulanmış; zorunluysa okutmasız 409 `qr_scan_required`. |
| `POST /board/label-verify` `{location, qr}` | saha | `verifyDeployment` + saha personeli; döner `{ok, code, message}`. |
| `GET /board/rooms` | saha | Her yer için `verified_by_qr`, `label`, `qr_required`, `pickup_request`, `complaint`. |
| `GET /laundry` | saha | `requests[]` (açık çamaşır talepleri, blok kuralıyla). |

Web: `GET /housekeeping/field-report?date=` (müdür + amir), `PUT /housekeeping/field-qr-enforcement`
(müdür, denetim kaydı).

## Kurulum (kullanıcıya)

1. Ayarlar → QR Basım & Kurulum → parti aç (önce pilot blok, ör. M1: 60 oda + 8 ortak alan = 68 etiket,
   9 sayfa) → PDF → 99,1 × 67,7 mm 8'li A4 etiket kâğıdı, **%100 / sayfaya sığdır kapalı** → "basıldı".
2. Etiketleri kapılara göz hizasında yapıştır.
3. Görevli `/saha`'da odayı açar → "🏷 Etiketi doğrula" → okutur (yanlış kapı burada yakalanır).
4. Blok doğrulanınca web Saha Takibi'nden "QR zorunlu: doğrulanmış etiketler" aç.

## Kurucuya kalanlar

Bileşen sınırları, sorgu biçimi, metinlerin son hâli, test düzeni; mevcut desenlere uyulur
(`field.js` hizmetleri, `board.js` uçları, `next(e)` hata akışı, i18n `dict.js` tr+en).
