# Vardiya/Puantaj — "Excel gibi" Geliştirme Tasarımı (Faz 27-30)

Tarih: 2026-07-06 · Durum: Onaylandı (kullanıcı: "onaylıyorum başla sormadan devam et")

## Amaç

Puantaj takvim görünümünü (hücre boyama modu — commit 5397fb4) gerçek bir iş yeri
puantaj cetveli deneyimine taşımak: Excel benzeri grid etkileşimi, bordro girdileri,
resmi imzalık föy çıktısı ve vardiya rotasyon otomasyonu.

## Mevcut Temel (Faz 0 — 5397fb4)

- `shift_schedule.leave_type` (migration 019) — izin türü gün bazında
- `GET /shifts/puantaj/days` — ay boyu gün satırları
- PuantajTab takvim görünümü: N/h/r/üi/yi/Y kod paleti + hücre/boyama modu

## Faz 27 — Excel-grid deneyimi (frontend ağırlıklı)

- **Klavye navigasyonu:** grid'e odaklanınca ok tuşları hücre gezdirir; tek hücre
  "aktif hücre" (Excel'deki gibi çerçeveli)
- **Kod tuşları:** aktif hücrede `N`/`H`/`R`/`Ü`/`Y`/`P` (ve `Delete` = sil) direkt işaretler
- **Aralık seçimi:** Shift+tık ve Shift+ok ile dikdörtgen seçim; seçili aralığa
  palet kodu veya klavye kodu toplu uygulanır
- **Undo:** Ctrl+Z — son 50 işlem bellekte (önceki hücre durumlarıyla), ters uygulanır
  ve API'ye yazılır
- **Sticky:** başlık satırı üstte, personel kolonu solda sabit (CSS sticky)
- **Alt toplam satırı:** her gün kolonunda çalışan/izinli/devamsız sayısı
- Test: kod eşleme + undo yığını saf fonksiyonlara çıkarılır (`logic/puantajGrid.js`),
  vitest ile birim test; smoke test grid render

## Faz 28 — Gerçek bordro girdileri

- **Tatil vurgusu:** `holidays` tablosu (mevcut, H4) — tatil kolonları grid'de Pazar
  gibi vurgulanır, başlıkta tatil adı tooltip
- **Tatil çalışması:** tatilde `worked` işaretli hücre satır toplamında "tatil günü"
  olarak sayılır (payroll zaten `holiday_days` hesaplıyor — grid'de görünür olur)
- **Hücre içi FM:** hücreye çift tık → saat girişi → `overtime_records` upsert;
  hücre köşesinde FM rozeti
- **Devamsızlık nedeni:** `absent` işaretlerken opsiyonel neden (mevcut alan yoksa
  `shift_schedule.absent_reason` migration 020)
- Satır sonu ek toplamlar: tatil günü + FM saati

## Faz 29 — Resmi puantaj cetveli (Excel export)

- ExcelJS (mevcut altyapı — ScheduleTab renkli export) ile aylık föy:
  başlık (firma/dönem/departman), personel × 1-31 gün kod matrisi (renkli),
  sağda toplam kolonları (N/h/yi/r/üi/Y/FM), altta kod lejantı +
  "Düzenleyen / Kontrol Eden / Onaylayan" imza blokları
- İndirme: PuantajTab'dan "📄 PUANTAJ FÖYÜ" butonu, `puantaj-{ay}.xlsx`

## Faz 30 — Rotasyon şablonları

- Migration 021: `rotation_templates(id, name, pattern_json, created_by, created_at)`
  — pattern: gün dizisi (örn. `["G","G","N","N","OFF","OFF"]`, vardiya tanım id'leri ile)
- SettingsTab: şablon CRUD; ScheduleTab: "şablonu uygula" (personel seçimi + başlangıç
  günü + tarih aralığı) → önizleme → toplu atama
- **Kural uyarıları (uygulamadan önce):** art arda çalışma > limit (varsayılan 6 gün),
  iki vardiya arası < 11 saat dinlenme — uyarı listesi, kullanıcı onaylarsa yazılır
- Backend: `POST /shifts/rotation/preview` + `POST /shifts/rotation/apply` + testler

## Kurallar

- Her faz: testler yeşil → commit → PLAN.md işaretle
- Migration'lar `migrations/NNN_ad.sql` (runner) — sırada 020, 021
- Hardcoded blok/kat listesi yok; mevcut kod stiline (inline style, Türkçe UI) uy
