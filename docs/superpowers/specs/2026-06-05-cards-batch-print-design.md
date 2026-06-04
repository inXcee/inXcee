# Kartlar: Toplu Basım (Batch PDF) — Tasarım

**Tarih:** 2026-06-05
**Modül:** `cards`
**Kaynak:** Kullanıcı — "kartlar bölümünü daha da geliştir." Telefonla kayıt (NFC+foto) sonrası doğal devam: çok sayıda kartı tek seferde yazdırma.

## Bağlam

Kart PDF'i şu an **sadece tek-kart** (`GET /cards/:id/pdf`, ID-1 boyut, giriş=mavi/yemek=turuncu, QR + sahip bilgisi). Çok kartı basmak için kart kart indirmek gerekiyor. Toplu/birleşik PDF yok.

## Amaç

Bir kart tipinin (veya seçili kartların) **tümünü tek PDF'te**, sayfa başına birden çok ID-1 kart olacak şekilde yazdırma — enrollment sonrası operasyonel ihtiyaç.

## Yaklaşım (onaylı)

Mevcut tek-kart çizim mantığını saf helper'a çıkar, hem tek-kart hem toplu endpoint kullansın (davranış korunur). A4 sayfaya 2 sütun × 4 satır = 8 kart; taşınca yeni sayfa.

## Bileşenler

### `cards/routes.js` (değişiklik)
- **`drawCard(doc, x, y, w, h, { card, holder, meta, qrDataUrl })`** (yeni saf helper): kartı verilen origin'e göre çizer (çerçeve, sol şerit accent, başlık, ad/departman/pozisyon, TC/tel/kan, tip rozeti, QR sağda, kod alt). Mevcut tek-kart endpoint'i (`GET /:id/pdf`) bunu `x=20,y=20` ile çağırır — çıktı birebir korunur.
- **`GET /cards/batch-pdf`** (`mgr`):
  - Query: `card_type=access|meal` (zorunlu, enum) + opsiyonel `ids=1,2,3` (virgül; verilirse o kartlar, verilmezse `card_type`'ın **status='active' tüm** kartları).
  - Her kart: holder bilgisi (`staff` join — tek-kart ile aynı kapsam) + `QRCode.toDataURL(card.code)`.
  - PDF: A4 portrait (595×842 pt), margin 24. Kart 243×153 pt. Izgara 2 sütun × 4 satır (sütun gap ~12, satır gap ~14). 8'i dolunca `doc.addPage()`.
  - Boş sonuç → 400 `{ error: 'Yazdırılacak kart yok' }`.
  - `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="toplu-<card_type>-<n>.pdf"` (ASCII — tek-kart PDF'teki filename gotcha'sı: card_type kullan).
  - Hata: try/catch, `headersSent` değilse 500.

### `cards/schemas.js` (gerekirse)
- `batch-pdf` query doğrulaması route içinde basit kontrol (card_type ∈ {access,meal}; değilse 400). Ayrı Zod şart değil (GET query, küçük).

### Frontend `CardsPage.jsx` (değişiklik)
- Header'daki kapsama/üret butonları satırına **"⊞ Toplu PDF"** (her tip için, ya da tek buton + tip seçimi). Basit: her tip için `⊞ {tip} toplu PDF` butonu → `downloadBatchPdf(card_type)`.
- `downloadBatchPdf(card_type)`: `api.get('/cards/batch-pdf?card_type='+card_type, { responseType:'blob' })` → blob indir (mevcut `downloadPdf` deseni). Hata → toast.

## Hata / sınır durumları
- Aktif kart yoksa → 400 → frontend toast "Yazdırılacak kart yok".
- `card_type` geçersiz → 400.
- `ids` içinde olmayan/iptal kart → atlanır (sadece bulunan + status uygun çizilir); hepsi yoksa 400.
- Çok kart (yüzlerce) → çok sayfalı PDF; QR üretimi async döngü, makul (roster zaten ≤ birkaç yüz staff).

## Kapsam dışı (bilinçli — YAGNI)
- Kart analitiği (ayrı kalem — kapsam, kayıp oranı, access_events kullanımı).
- Seçili-kişi multi-select UI (tip-bazlı toplu yeterli; `ids` API'de hazır ama UI bu turda yok).
- personnel/visitor holder PDF (tek-kart ile aynı staff kapsamı).
- Sayfa düzeni/kart-sayısı özelleştirme.

## Test stratejisi
Backend `cards.test.js` (ekleme):
- **batch-pdf:** ≥2 aktif `access` kart üret → `GET /cards/batch-pdf?card_type=access` → 200 + `application/pdf` + body > tek-kart boyutu.
- **boş:** olmayan tip durumu / tüm kartlar iptal → 400.
- **geçersiz card_type** → 400.
- **yetki:** view rolü (camasir) → 403.
- **regresyon:** tek-kart `GET /:id/pdf` hâlâ 200 + pdf (drawCard refactor sonrası).
Frontend `CardsPage.smoke.test.jsx` (ekleme): "Toplu PDF" butonu render olur; tıklayınca `/cards/batch-pdf?card_type=` içeren blob isteği yapılır (api mock spy).

## Önerilen uygulama sırası
1. `drawCard` helper refactor + tek-kart endpoint onu kullanır → mevcut PDF testi yeşil (regresyon).
2. `GET /cards/batch-pdf` + testler (TDD).
3. Frontend "Toplu PDF" butonu + downloadBatchPdf + smoke.
4. Manuel doğrulama: 2+ kart → toplu PDF indir, sayfa düzeni doğru.
5. Deploy (onayla).
