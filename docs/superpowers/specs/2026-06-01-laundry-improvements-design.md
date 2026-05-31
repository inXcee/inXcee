# Laundry (Çamaşırhane) İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modül:** `laundry` (backend + frontend)
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Uygulamanın ikinci en büyük modülü (~17k satır, 84 uç). Tam çamaşırhane akışı:
garment/torba alımı, oda-bazlı takip, makine durumu, premium garment servisi
(Y-bloklar, özel banyolu), teslim, renk/desen seçici, arşiv, tüm-kayıt sekmesi,
rapor, chat, tedarik ayarları. Backend çok iyi testli (1576 satır). Frontend
kısmen bölünmüş (components/ altında 10+ dosya) ama iki god component kaldı.

## Kapsam (onaylı)

### Faz L1 — Eksikler (validation + decomposition)
- **L1a · Zod şemaları.** **84 uç, sıfır validation** (uygulamada en çok yazma ucu
  + en az koruma). Öncelik: item create/update, delivery (premium dahil), machine
  assign, supply/settings yazma uçları. `schemas.js` + `validate()`.
- **L1b · God component decomposition.** `LaundryHub` **2038** (48 useState, 19
  useQuery), `RoomsSection` **2026** (45 useState), `NewItemModal` 1030. Shifts
  kalıbıyla alt-bileşenlere böl; sekme/oda mantığı saf hook'lara. Backend testi
  güçlü olduğu için davranış-koruma daha güvenli, ama frontend smoke testleri eklenmeli.

### Faz L2 — Yeni değer
- **L2a · Excel rapor export.** Mevcut rapor (`LaundryReport`) + yok olan xlsx;
  client-side `exportRowsToXlsx`.
- **L2b · Makine kullanım analitiği.** Makine doluluk/çevrim sayısı/ortalama süre
  (mevcut makine verisinden türet).
- **L2c · Teslim SLA takibi.** Alım→teslim süresi, geciken teslimler listesi.
- **L2d · QR ile torba takibi.** `html5-qrcode` ile torba etiket tara → hızlı
  durum/teslim (kalıp checkin QR ile paylaşılır).

### Faz L3 — a11y
- Tablo semantiği, form `aria-*`, modal focus yönetimi, klavye (tüm modülde
  şu an 7 ARIA).

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura.

## Mimari / izolasyon
- LaundryHub orkestratöre indirgenir; sekmeler/paneller ayrı dosya.
- RoomsSection oda-ızgara mantığı (durum hesap, filtre) saf modüle.
- Zod şemaları premium vs standart (M+S) akış farkını tek kaynaktan doğrular
  (bkz. `STANDARD_BLOCKS`).

## Test stratejisi
- Backend: yeni Zod şemaları birim testi; mevcut 1576-satır suite korunur.
- Frontend: LaundryHub/RoomsSection alt-bileşenleri smoke; oda-durum saf-mantık testi.
- e2e: torba alım → makine → teslim happy-path.

## Önerilen uygulama sırası
L1a (Zod, hızlı+kritik) → L1b (decomposition, büyük) → L2 → L3.
