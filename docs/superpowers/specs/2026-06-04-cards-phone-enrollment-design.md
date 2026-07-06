# Kartlar: Telefonla Kayıt (Android NFC + Foto) — Tasarım

**Tarih:** 2026-06-04
**Modül:** `cards` (+ `stations` UID normalizasyon hizalaması)
**Kaynak:** Kullanıcı isteği — "halihazırda fiziksel kartlar var; telefonla NFC okutarak veya fotoğrafını çekerek sisteme girebileyim, telefona göre ayarla."

## Bağlam

Kartlar altyapısı geniş (Faz 1-10 canlı, bkz. roadmap):
- `cards` tablosu: `holder_type×card_type`, `code` (AVS-A:/AVS-M: QR), `nfc_uid TEXT UNIQUE` nullable, status.
- `PATCH /cards/:id/bind-nfc {nfc_uid}` — UID bağlama (var). `CardsPage` zaten **elle UID girişi** sunuyor (`nfcDraft` input).
- NFC okuma şu an yalnız **sabit USB HID istasyonları** (`/stations/scan`, `raw_uid` → `cards.nfc_uid` birebir eşleşme).
- Foto: istasyonda webcam var; `cards` tablosunda **foto kolonu YOK**.

**Eksik (kullanıcı isteği):** **telefonla** (sabit istasyon değil) mevcut fiziksel kartı sisteme alma — (1) Android Web NFC ile UID okuma, (2) kart fotoğrafı çekip karta ekleme.

**Kararlar (onaylı):** Telefon platformu = **Android** (Web NFC `NDEFReader` çalışır; iPhone tarayıcıdan NFC okuyamaz — kapsam dışı, elle giriş fallback). Foto işlevi = **foto ekle + numarayı elle gir** (OCR/QR-tarama yok).

## Bileşenler

### 1. Migration `backend/src/shared/db/migrations/009_card_photo.sql` (yeni)
`ALTER TABLE cards ADD COLUMN photo_url TEXT` — basit ADD COLUMN (rebuild yok). Baseline'a dokunulmaz.

### 2. Ortak UID normalizasyonu `backend/src/shared/nfc.js` (yeni)
- **`normalizeNfcUid(raw)`** → `String(raw||'').trim().toUpperCase().replace(/[\s:.\-]/g, '')` (boş → null döndür). Web NFC `serialNumber` (`04:1a:2b`) ile USB okuyucu çıktısı (`04 1A 2B` / `04:1A:2B`) aynı kanonik forma (`041A2B`) gelsin → telefonla kaydedilen kart istasyonda da eşleşsin.
- Kullanılacak yerler: cards `bind-nfc` + cards `issue` (nfc_uid verilmişse) + stations `scan` (`raw_uid` eşleşme öncesi) + stations `scan` yazımı (`access_events.raw_uid` da normalize edilmiş tutulur). **Davranış-koruma:** mevcut testlerdeki UID'ler ayraçsız/büyük harf olduğundan normalize idempotent — kırılmamalı (doğrulanacak).

### 3. Backend `cards/routes.js` (değişiklik)
- Yeni: **`POST /cards/:id/photo`** (`mgr`, `upload.single('photo')` + `verifyMagicBytes`) → `photo_url = /uploads/<filename>`, `UPDATE cards SET photo_url=?`. Dönüş `{ photo_url }`. logAudit `card_photo`. (maintenance foto deseni birebir.)
- `bind-nfc` ve `issue`: `normalizeNfcUid` uygulanır (yukarıda).
- `GET /cards/:holderType/:holderId` ve `GET /cards/roster`: SELECT'e `photo_url` eklenir (UI küçük resim göstersin).

### 4. Backend `stations/routes.js` (değişiklik)
- `scan`: `rawUid` matched/yazılırken `normalizeNfcUid` uygulanır (kart eşleşmesi telefon-kaydı ile tutarlı). Mevcut test UID'leri korunur.

### 5. Frontend `cards/CardsPage.jsx` (değişiklik) — mobil-dostu kayıt
- **📱 NFC OKU** butonu (her kart): `'NDEFReader' in window` ise göster. Tıklayınca `const r = new NDEFReader(); await r.scan(); r.onreading = e => bindNfc({id, nfc_uid: e.serialNumber})`. Hata/iptal → toast. `NDEFReader` yoksa (iPhone/masaüstü) buton gizli, **mevcut elle UID girişi** kalır.
- **📷 FOTO ÇEK** butonu: `<input type="file" accept="image/*" capture="environment">` (mobilde arka kamera). Seçince multipart `POST /cards/:id/photo` → başarıda küçük resim önizleme (`photo_url`). Yeniden çekilebilir.
- Foto önizleme: karta `photo_url` varsa thumbnail (tıkla → büyüt/yeni sekme).
- Layout: kayıt kontrolleri (NFC/foto/elle) dar ekranda dikey sığsın (mevcut kart-detay bloğu içinde).

## Şema / güvenlik
- Migration 009 (versiyonlu). Foto `verifyMagicBytes` ile doğrulanır (mevcut güvenlik). `photo_url` salt `/uploads/` altında.

## Hata / sınır durumları
- Web NFC yoksa → buton görünmez, elle giriş çalışır (graceful degradation).
- Web NFC izin reddi / okuma hatası → toast, kart değişmez.
- UID UNIQUE çakışması (başka karta bağlı) → bind-nfc 409 (mevcut davranış; normalize sonrası da geçerli).
- Foto: magic-bytes geçmezse 400; UPLOADS_DIR yoksa middleware oluşturur (mevcut).
- Çok büyük foto: multer limiti (mevcut middleware sınırı).

## Kapsam dışı (bilinçli — YAGNI)
- OCR ile otomatik numara okuma (kullanıcı foto+elle seçti).
- QR/barkod kamera tarama (bu tur dışı).
- iPhone NFC (platform tarayıcıda desteklemiyor).
- Foto galeri/çoklu foto (tek referans foto yeterli).
- Yeni fiziksel kart basımı/sipariş akışı.

## Test stratejisi
Backend `cards.test.js` (mevcut dosyaya ekleme; supertest + seedDev):
- **photo upload:** multipart foto → 200 + `photo_url` `/uploads/` ile başlar; DB'de set; sonra `GET /cards/:holderType/:holderId` `photo_url` döner.
- **bind-nfc normalize:** `nfc_uid: '04:1a:2b'` bağla → DB'de `041A2B`; `GET` ile doğrula.
- (mevcut cards/stations testleri korunur.)
`backend/src/shared/nfc.test.js`: `normalizeNfcUid` birim (ayraç/boşluk/küçük-harf → kanonik; boş → null; idempotent).
`stations`: scan normalize — mevcut testler yeşil kalır (UID'ler zaten kanonik); 1 yeni test: `bind '0A:1B'` + scan `raw_uid:'0a-1b'` → eşleşir (ok).
Frontend `CardsPage.smoke.test.jsx`: foto butonu render + NDEFReader yokken NFC butonu görünmez (feature-detect); roster mock ile sayfa açılır.

## Önerilen uygulama sırası
1. `shared/nfc.js` + birim test (TDD).
2. Migration 009 + `cards/photo` endpoint + bind-nfc/issue normalize + list photo_url → cards route testleri.
3. `stations/scan` normalize hizalama → stations testleri yeşil + yeni eşleşme testi.
4. Frontend CardsPage: NFC OKU + FOTO ÇEK + önizleme → smoke + build.
5. Manuel doğrulama: foto upload → photo_url; bind normalize; (Web NFC gerçek cihazda — kod feature-detect'li).
6. Deploy (onayla).
