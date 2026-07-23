# Dağıtım Dökümü Paneli — Tek Sayfada Yer × Gün × Ürün (Açılır/Kapanır)

**Tarih:** 2026-07-23
**Durum:** Uygulandı (commit 9ef77e65) — yerelde; canlıya alınmadı
**Kapsam:** Frontend su modülü (yeni panel + türetme/Excel mantığı) + küçük backend alan eklentisi.

## Problem

Muhasebe raporu PDF'i güzel ama **statik**: kullanıcı ekranda tek sayfada tüm dağıtım
yerlerini görüp, ihtiyaç duyduğunda tek tek tıklayarak gün detayına inmek istiyor.
Ayrıca çıktının **indirilebilir** olması şart — muhasebeye gönderiliyor ve orada
**toplamlar** öncelikli; günlük kırılım yalnızca gerektiğinde bakılacak.

## Karar

WaterPage'de "Aylık Rapor" panelinin altına **DAĞITIM DÖKÜMÜ** paneli. Veri kaynağı
mevcut JSON endpoint'i: `GET /api/water/report/accounting?from&to&sections=matrix,days`
(frontend'de henüz kullanılmıyordu — yeni backend endpoint'i **yok**).

### Yerleşim (üstten alta)

1. **Panel başlığı** — `WaterCollapsiblePanel` ile aç/kapa; sağda `[⬇ Excel]`, `[⬇ PDF]`.
2. **Özet şerit** (her zaman görünür): toplam dağıtım · yer sayısı · hareketli gün · ürün sayısı.
3. **Ürün toplamları** (muhasebenin asıl ihtiyacı, her zaman görünür): her ürün
   `Ad · Marka` + toplam + pay. Çoktan aza.
4. **Kontroller**: yer adı arama kutusu · `Tümünü aç` / `Tümünü kapat`.
5. **Yer listesi** — çoktan aza, her satır tıklanabilir (1. seviye):
   `sıra · yer adı · toplam · pay% · kaç gün · en çok verilen ürün`
6. **Genel toplam** satırı (liste altında).

### Açılım — iki seviye

**1. seviye — yer açılır:** o yerin GÜN × ÜRÜN tablosu.
- Satır = gün (yalnız o yere hareket olan günler), sütun = o yerin ürünleri (`Ad · Marka`).
- Alt satır: TOPLAM (ürün toplamları + yer toplamı).
- Sütun sayısı 6'yı aşarsa fazlası `Diğer` sütununda toplanır (PDF ile aynı kural).

**2. seviye — gün açılır:** o günün ürün ürün kırılımı; her satırda
`ürün · marka · miktar (okunur birim)`, altında `not` ve `kaydeden` (varsa).

Her iki seviye de bağımsız açılıp kapanır; panelin kendisi de kapanabilir.

### İndirme

- **PDF** → mevcut endpoint: `/api/water/report/accounting.pdf?from&to&sections=matrix,zones`.
  Bu bölümler zaten bu panelin birebir içeriğidir (genel GÜN×ÜRÜN + yer yer tablolar +
  marka gruplu Yer×Ürün özeti) — **yeni PDF çizim kodu yazılmaz**.
- **Excel** → istemcide üretilir (mevcut `shared/logic/excelKit.js`), 2 sayfa:
  - `Özet`: satır = dağıtım yeri, sütun = ürün (`Ad · Marka`), + TOPLAM/PAY sütunları,
    altta GENEL TOPLAM satırı. Muhasebeye giden asıl sayfa.
  - `Gün Detay`: düz satırlar — `tarih · gün · dağıtım yeri · ürün · marka · miktar (baz) ·
    okunur miktar · not · kaydeden`. Excel'de filtrelenebilir.
  Dosya adı: `su-dagitim-dokumu-<from>_<to>.xlsx`.

## Backend değişikliği (küçük)

`report.js` → `buildDetail` içindeki `day.distributions` satırlarına iki alan eklenir:
`note` ve `created_by_name` (veriler `q.listMovements` sonucunda zaten var, rapora
taşınmıyordu). 2. seviye açılımda gösterilir. Başka hiçbir sözleşme değişmez.

## Boş/sınır durumları

- Aralıkta dağıtım yoksa: panel "Bu aralıkta dağıtım kaydı yok." der, indirme butonları pasif.
- `detail.days` boşsa (62+ hareketli gün → backend detay üretmez): 1. seviye tablo yine
  çalışır (veri `rows[].products[].cells`'ten gelir), 2. seviyede "gün detayı bu aralık
  için üretilmedi" notu görünür.
- Arama sonucu boşsa: "Aramaya uyan dağıtım yeri yok."
- Yükleme/hata: mevcut panel desenlerindeki iskelet/hata gösterimi.

## Test

- **Backend:** `report.test.js` — gün detayı satırları `note` + `created_by_name` taşır.
- **Frontend logic (saf fonksiyonlar, DOM'suz):** rapor JSON'undan yer/gün/ürün türetme
  (sıralama, `Diğer` katlaması, gün filtreleme, toplam tutarlılığı) ve Excel satır üretimi.
- **Frontend bileşen:** panel açılır, yer tıklanınca gün tablosu gelir, gün tıklanınca
  ürün kırılımı gelir, arama filtreler, boş durum metni çıkar.

## Değişmeyenler

Mevcut PDF bölümleri, rapor API imzası, diğer su panelleri, `WaterCollapsiblePanel`.
