# Kayıp Parça Tazminat Takip Sistemi — Tasarım Dokümanı

**Tarih:** 2026-04-09  
**Kapsam:** Çamaşırhanede kaybolan kıyafetlere tahmini değer + not girişi ve arşivde görüntüleme

---

## Genel Bakış

Mevcut sistemde kayıp kıyafet `status='lost'` olarak işaretlenebiliyor ancak mali değer kaydedilemiyor. Bu özellik, kayıp kıyafete tahmini TL değeri ve opsiyonel not ekleyerek arşivde takip edilmesini sağlar. Maaş kesintisi veya otomatik ödeme sistemi kapsam dışıdır — sadece kayıt/takip.

---

## Veritabanı

`laundry_items` tablosuna 2 kolon eklenir:

```sql
ALTER TABLE laundry_items ADD COLUMN compensation_value REAL DEFAULT NULL;
ALTER TABLE laundry_items ADD COLUMN compensation_note  TEXT DEFAULT NULL;
```

- Sadece `status='lost'` kayıtlarında anlam taşır; diğerlerinde NULL kalır.
- Mevcut veriler bozulmaz (ALTER TABLE, geriye dönük uyumlu).

---

## Backend

### Yeni Endpoint

```
PATCH /api/laundry/items/:id/compensation
```

**Yetki:** `campus_manager`, `shift_supervisor`

**Body:**
```json
{ "value": 1250, "note": "Sakin beyanı" }
```

**Kurallar:**
- Item `status='lost'` değilse → 400 hata
- `value` < 0 ise → 400 hata
- `note` opsiyonel, NULL kabul edilir
- Başarıda güncellenmiş item döner

**Mevcut arşiv sorgusu** (`getArchiveQuery`) `laundry_items` tüm kolonlarını zaten döndürüyor; yeni kolonlar otomatik gelir, sorgu değişmez.

---

## Frontend

### ArchiveTable.jsx — Yeni "Tazminat" Kolonu

- Sadece `status='lost'` satırlarında gösterilir.
- Değer **varsa:** `₺1.250` badge (tıklanabilir → düzenleme açar).
- Değer **yoksa:** `+ Değer Gir` butonu.
- Diğer statüslerde (`delivered`, vb.) kolon hücresi boş.

### CompensationModal.jsx — Yeni Modal

**Tetikleyici:** `+ Değer Gir` veya mevcut değer badge'ine tıklamak.

**İçerik:**
- Item bilgisi (blok · oda · parça sayısı) — salt okunur başlık
- Tahmini Değer (TL) — sayı input, zorunlu
- Not — textarea, opsiyonel
- Kaydet → `PATCH /api/laundry/items/:id/compensation`
- Başarıda `['laundry-archive']` query invalidate, modal kapanır

**Düzenleme:** Modal açıldığında mevcut `compensation_value` ve `compensation_note` form alanlarına dolu gelir.

---

## Test Planı

### Backend
- `status='lost'` item'a değer girme → 200 + kolon güncellenir
- `status='ready'` item'a istek → 400
- Negatif değer → 400
- `compensation_note` boş gönderme → 200 (NULL kaydedilir)

### Frontend
- Değersiz kayıp satırda `+ Değer Gir` görünür
- Modal açılır, değer girilir, kaydedilir, badge `₺X.XXX` olarak güncellenir
- Mevcut değerli satırda badge'e tıklayınca form dolu gelir

---

## Kapsam Dışı

- Maaş kesintisi veya personel hesabına bağlama
- Ödeme durumu takibi (bekliyor / ödendi)
- Toplu tazminat işlemleri
