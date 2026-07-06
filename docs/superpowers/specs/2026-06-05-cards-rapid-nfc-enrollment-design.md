# Kartlar: Hızlı Seri NFC Kayıt — Tasarım

**Tarih:** 2026-06-05
**Modül:** `cards`
**Kaynak:** Kullanıcı — "kartlara devam." Telefonla tek-kart NFC kaydının (`cd8aefd`) doğal devamı: çok sayıda fiziksel kartı akıcı bir seri akışta bağlama.

## Bağlam

Telefonla NFC kayıt var ama **tek kart için**: CardsPage'de bir kişinin kartını seç → 📱 NFC OKU → bağla. Yüzlerce kart için bu yavaş (her kart: kişiye git, kartı aç, oku). `issue` + `bind-nfc` ayrı uçlar; "kart yoksa önce üret sonra bağla" iki çağrı.

## Amaç

Operatörün telefonla arka arkaya kart bağlaması: kart tipini bir kez seç, kişiyi ara/seç, kartı telefona dokundur → otomatik bağlanır → sıradaki kişiye geç. Minimum dokunuş.

## Yaklaşım (onaylı)

Seri akışı tek atomik endpoint'e indir (`enroll-nfc`: bul-veya-üret + bağla); frontend'de NFC dinlemesini oturum boyunca açık tutan bir "Hızlı NFC Kayıt" modu.

## Bileşenler

### `backend/src/modules/cards/routes.js` — yeni `POST /cards/enroll-nfc` (`mgr`)
- Zod `enrollNfcSchema`: `holder_type` (enum staff/personnel/visitor, default 'staff'), `holder_id` (pozitif int), `card_type` (enum access/meal), `nfc_uid` (string min 1).
- `normalizeNfcUid(nfc_uid)`; boşsa 400.
- Transaction:
  - Kişinin o tipte aktif kartını bul (`activeCard`).
  - Yoksa → yeni kart üret (`genCode`, INSERT, issued_by) → `created=true`.
  - `UPDATE cards SET nfc_uid=? WHERE id=?`.
- UNIQUE(nfc_uid) çakışması → **409** "Bu NFC etiketi başka karta bağlı".
- Dönüş `{ card_id, code, card_type, holder_id, nfc_uid, created }`. logAudit `card_enroll_nfc`.
- Mevcut `issue` / `bind-nfc` değişmez (bu uçlar korunur).

### Frontend `CardsPage.jsx` — yeni "📲 Hızlı NFC Kayıt" modu
- `view` state: `'roster' | 'analytics' | 'enroll'`. Başlığa "📲 Hızlı Kayıt" toggle.
- Sadece Android (`NFC_SUPPORTED`): değilse panelde bilgi notu ("Web NFC yalnız Android Chrome").
- Enroll paneli:
  - **Kart tipi** toggle (giriş/yemek) — oturum başında bir kez.
  - **NFC durumu** göstergesi: moda girince `NDEFReader.scan()` başlatılır ("📡 NFC dinleniyor"). Moddan çıkınca durdurulur (`AbortController`).
  - **Kişi arama** (roster filtreleme) + sonuç listesi; tıkla → seçili kişi (vurgulanır), "Aktif kişi: X" üstte.
  - Kart dokununca `onreading` → seçili kişi varsa `enroll-nfc` (holder_type='staff', holder_id, card_type, serialNumber); yoksa "önce kişi seç" uyarısı.
  - Başarı → oturum sayacı +1, "son bağlananlar" listesine ekle (ad + tip + UID kısaltma), seçili kişiyi temizle (sıradakine hazır).
  - 409 → "UID başka karta bağlı" uyarısı (kişi seçili kalır).
- **Stale-closure:** seçili kişi + card_type `useRef` ile tutulur (onreading kapanışı güncel değeri görsün); roster react-query'den.

## Hata / sınır durumları
- Kişi seçili değilken okutma → uyarı, işlem yok.
- Aynı UID tekrar (aynı kişiye) → enroll-nfc idempotent (aynı karta aynı UID yazılır, 200).
- UID başka kişide → 409 → uyarı.
- NFC izin reddi/okuma hatası → toast; mod açık kalır.
- Mod kapanınca/sayfa değişince `reader` abort (kaynak sızıntısı yok).

## Kapsam dışı (bilinçli — YAGNI)
- iPhone NFC (platform desteklemiyor).
- Kart tipini her kişide ayrı seçme (mod başında tek tip — hız için; değiştirmek isterse toggle).
- personnel/visitor seri kayıt UI (endpoint holder_type'ı destekler ama UI staff roster; ileride).
- Toplu CSV/numara import.
- Foto bu modda (tek-kart akışında var).

## Test stratejisi
Backend `cards.test.js` (ekleme):
- **enroll-nfc kart yoksa üretir + bağlar:** kartsız staff → 200, `created=true`, DB'de aktif kart + normalize UID.
- **enroll-nfc mevcut karta bağlar:** aktif kartı olan staff → 200, `created=false`, aynı card_id.
- **normalize:** `04:1a:2b` → DB'de `041A2B`.
- **409:** UID başka karta bağlıyken başka kişiye aynı UID → 409.
- **400:** boş nfc_uid.
- **403:** view rolü (camasir).
Frontend `CardsPage.smoke.test.jsx` (ekleme): "📲 Hızlı Kayıt" toggle → panel render; NFC destekleniyormuş gibi (NDEFReader stub) kişi arama + seçim görünür; ya da NFC yokken bilgi notu. (Gerçek Web NFC jsdom'da test edilemez.)

## Önerilen uygulama sırası
1. `enrollNfcSchema` + `POST /cards/enroll-nfc` + backend testleri (TDD).
2. Frontend enroll modu (NFC dinleme + kişi seç + enroll) + smoke + build.
3. Manuel doğrulama: enroll-nfc kart üret+bağla; (Web NFC gerçek Android'de).
4. Deploy (onayla).
