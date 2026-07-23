# Su Muhasebe Raporu — "Dağıtım Yeri × Gün" Bölümünün GÜN↓ × ÜRÜN→ Dökümüne Dönüşümü

**Tarih:** 2026-07-23
**Durum:** Uygulandı (2026-07-23 — commit af9c1f5d + 3844f785)
**Kapsam:** Yalnız PDF çizimi (`backend/src/modules/water/report-pdf.js`). Veri katmanı (`report.js`) değişmez.

## Problem

- "DAĞITIM YERİ × GÜN MATRİSİ" sayfasında sütunlar gün numarası (01–31), hücreler karma toplam:
  bir yere **hangi üründen** gittiği bu sayfada görünmüyor.
- "GÜN GÜN DETAY" tablolarında ürün sütunları `1 2 3` diye numaralı; adlar yalnız bölüm
  başındaki lejantta. Kullanıcı ürün adlarını her tablonun üstünde tam görmek istiyor.

## Karar (kullanıcı onaylı A seçeneği)

Eski Yer×Gün grid'i ve altındaki ÜRÜN×GÜN tablosu **kaldırılır**; yerine aynı bölümde:

1. **Ay geneli GÜN↓ × ÜRÜN→ tablosu** (bölümün ilk bloğu, tam genişlik)
2. **Her dağıtım yeri tek tek** kendi GÜN↓ × ÜRÜN→ mini tablosu (2 kolonlu akış)

"Gün gün detay" bölümünde lejant kalkar, ürün adları her tablonun başlığına yazılır.

## 1. Bölüm: `drawMatrixSection` yeniden yazımı

Sayfa **dikey** (portrait) olur; başlık `DAĞITIM YERİ × GÜN — ÜRÜN DÖKÜMÜ`,
içindekiler kısa adı `Yer · Gün · Ürün` (`SECTION_TITLES.matrix`, `SECTION_SHORT.matrix`).
Bölüm hedefi `sec-matrix` ve gün bağlantı davranışı korunur.

### 1a. Ay geneli GÜN↓ × ÜRÜN→ tablosu

- **Satırlar:** aralıktaki **tüm** günler, `report.daily` sırası ve etiketiyle (`01.07 Çar`).
  Hareketsiz gün: soluk etiket + `·` hücreler. `grouped` modda satırlar aydır (mevcut mantık).
- **Sütunlar:** `detail.product_rows` (çoktan aza, en fazla `PRODUCT_COLUMN_LIMIT`=14).
  Başlıkta ürün adı + altında birim etiketi (zones bölümündeki başlıkla aynı desen).
- **Hücre:** `product_rows[i].cells[günIdx]` (indeks `detail.columns` ile hizalı).
- **Sağ sütun:** günün toplamı (`column_totals[günIdx]`).
- **Alt satırlar:** TOPLAM (ürün toplamları + `grand_total`) ve PAY (`product_rows[i].share`).
- Gün etiketi, gün detayı üretildiyse (`detail.days` içinde varsa) mavi renk + `day-<key>`
  bağlantısı alır (eski matristeki davranışın taşınması).
- 14 üründe hücre ~30pt kalır; değerler `compactCell` + `fitFontSize` ile sığdırılır.

### 1b. Yer yer tablolar (2 kolonlu akış)

- Kaynak: `detail.rows` (çoktan aza, `MATRIX_ZONE_LIMIT`=60 sınırı ve taşma notu korunur).
- Her yer için:
  - **Başlık bandı:** `YER ADI · toplam N · %pay` (gün başlık bandı stilinde).
  - **Sütunlar:** o yerin `products` listesi (çoktan aza). **En fazla 6** ürün sütunu;
    fazlası tek `Diğer` sütununda toplanır ve tablo altına tek satırlık not düşülür
    (`Diğer: X, Y (toplam Z)`).
  - **Satırlar:** yalnız o yere hareket olan günler (herhangi bir ürün hücresi > 0),
    kronolojik; etiket `07.07 Pzt`, gün detayı varsa mavi + `day-<key>` bağlantısı.
    `grouped` modda satırlar aydır ve etiket `detail.columns[i].full`dan gelir
    (`Temmuz 2026`); gün bağlantısı bu modda zaten üretilmez.
  - **Alt satır:** TOPLAM (ürün toplamları + yerin toplamı).
  - Ürün adı başlıkta tam yazılır; sığmazsa `fitFontSize` küçültür, gerekirse 2 satıra sarar
    (başlık yüksekliği buna göre ~16pt).
- Akış: bölümün ilk sayfasında genel tablonun bittiği yerden devam eder, sonra 2 kolon;
  `columnFlow`a "mevcut sayfada, verilen y'den başla" desteği eklenir (yeni sayfa açmadan).
  Yer bandı + başlık + ilk satır bölünmez (`reserve`).
- Tek ürünlü yer de aynı biçimde çizilir (tek ürün sütunu + TOPLAM) — özel durum yok.

### 1c. Kaldırılanlar

- Yatay Yer×Gün grid (gün numarası sütunları), alt "ÜRÜN × GÜN" tablosu ve
  bunlara özel not metinleri. Yeni notlar: hücrelerin baz birimde olduğu, gün
  bağlantısı, ürün/yer sınırı taşma bilgileri.

## 2. Bölüm: `drawDaysSection` başlık değişikliği

- Bölüm başındaki `SÜTUNLAR: 1 = …` lejant bloğu **kaldırılır**.
- `tableHeader` ürün sütunlarına numara yerine **ürün adını** yazar: 2 satıra kadar sarma
  (`lineBreak` açık, sabit yükseklik), `fitFontSize` min ~4.2. Başlık yüksekliği
  8.5 → ~16pt'e çıkar; devam başlıklarında da aynı.
- Taşma sütununun etiketi `D` → `Diğer`; kapsamı bölüm sonunda değil, ilk kullanıldığı
  yerde kısa notla belirtilir (`Diğer = N ürün`).
- Kolon sayısı/akış mantığı (`flowColumns`, `cellW`, `labelWidth`) değişmez.

## 3. Değişmeyenler

- `report.js` veri sözleşmesi aynen kalır (rows/products/cells/product_rows/days).
- "Dağıtım Yeri × Ürün" (zones), günlük defter, irsaliye, fotoğraf, ekler bölümleri.
- Frontend, API imzaları, bölüm anahtarları (`sections=matrix,days,…`).

## Test

- Mevcut `report.test.js` veri testleri geçmeye devam etmeli (veri katmanı değişmiyor).
- PDF smoke: rapor `matrix`+`days` bölümleriyle hatasız buffer üretmeli (çok ürünlü,
  çok yerli, tek ürünlü yer, `grouped` aralık ve 6+ ürünlü yer senaryoları dahil).
- Yerleşim assert'i font-bağımsız yazılır (koordinat/karakter genişliği asserti yok —
  Windows Arial ≠ sunucu DejaVu).

## Sayfa etkisi

Bölüm bugün yatay 1–2 sayfa; yeni yerleşim dikey ~2–3 sayfa. Gün gün detay bölümü
lejant kalktığı için başa ~1 blok kısalır, başlıklar büyüdüğü için ~%5 uzar.
