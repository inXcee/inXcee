# Premium Parça Girişi Yeniden Tasarımı

> **Tarih:** 2026-04-04
> **Kapsam:** NewItemModal 2-adımlı akış + PremiumIntakeModal köklü UX revizyonu

---

## Problem

- `NewItemModal` kayıt sonrası `PremiumIntakeModal` otomatik açılmıyor — kullanıcı manuel olarak ★ butonuna basmak zorunda
- `PremiumIntakeModal` tablo + dropdown tabanlı, yavaş veri girişi
- Renk text input olarak var, görsel picker yok
- Klavye navigasyonu yok — her alan için fare gerekiyor

---

## Çözüm

### Akış: 2 Adım, 1 Modal

`NewItemModal` içinde 2 aşamalı akış:

**Adım 1 — Standart kayıt** (mevcut)
- Oda seçimi, teslim eden, kıyafetler, notlar, kaydet

**Adım 2 — Parça girişi** (yeni, yalnızca premium blok)
- Item oluşturulunca modal kapanmaz
- Başlık "★ PARÇA GİRİŞİ — {blok}{oda}" olarak değişir
- İçerik parça giriş paneline dönüşür

Adım 2 sadece seçilen oda **premium blokta** (`laundry_block_config.is_premium = 1`) ise tetiklenir. M, S, S1, S2 blokları mevcut akışla devam eder.

---

## Adım 2 UI

### Tip Seçimi
- Büyük chip butonlar grid'i (4 kolon)
- Tıklanınca giriş formu açılır, `Renk` alanına otomatik fokus

### Giriş Formu (seçili tip için)
```
TİP:  Gömlek · A101-001 (preview kod)

RENK*:  ● ● ● ● ● ● ● ● ●   [Diğer text]
        (görsel daire paleti, tıkla seç)

Marka: [___________]   Model: [___________]
Beden: [dropdown]      Not:   [___________]

                              [✓ Ekle →]
```

Alan sırası ve Tab navigasyonu: Renk → Marka → Model → Beden → Not → Enter/✓ Ekle

### Eklenen Parçalar Listesi
- Her parça: kod chip + tip + renk dot + marka/beden özeti
- ✕ ile silinebilir
- Gerçek zamanlı güncellenir

### Alt Aksiyonlar
- **`+ Başka Parça Ekle`** → tipi sıfırlar, forma döner
- **`Tamamla & Kapat`** → modal kapanır, kanban güncellenir
- **`Daha Sonra`** → parça girmeden çıkar (mevcut item silinmez)

---

## Klavye Kısayolları

| Tuş | Eylem |
|-----|-------|
| Enter (formda) | ✓ Ekle tetikler |
| Escape | Formu sıfırlar, tip seçimine döner |
| Tab | Sonraki alana geç |

---

## Zorunlu / Opsiyonel Alanlar

| Alan | Durum |
|------|-------|
| Tip | Zorunlu |
| Renk | Zorunlu |
| Marka | Opsiyonel |
| Model | Opsiyonel |
| Beden | Opsiyonel |
| Not | Opsiyonel |

---

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | `step` state eklenir, Adım 2 inline render |
| `frontend/src/modules/laundry/components/PremiumIntakeModal.jsx` | Silinebilir veya stub olarak tutulur (artık kullanılmıyor) |

---

## Blok Kontrolü

`NewItemModal` zaten `rooms` listesini çekiyor. Room seçilince:
```js
const isPremium = selectedRoom && !['M','S','S1','S2'].includes(selectedRoom.block)
```
Backend'den `laundry_block_config` çekmek yerine basit blok adı kontrolü yeterli — konfigürasyon M/S sabit, değişmez.

Kayıt başarılıysa:
```js
onSuccess: (data) => {
  clearDraft()
  qc.invalidateQueries({ queryKey: ['laundry-items'] })
  if (isPremium) {
    setCreatedItem(data)  // adım 2'ye geç
  } else {
    onClose()
  }
}
```

---

## Renk Paleti

`NewItemModal`'daki mevcut `COLOR_PALETTE` (15 renk) aynen kullanılır.
Görsel daire picker — tıkla seç, tekrar tıkla deseç.
"Diğer" text input ek olarak kalır.
