# İmzalı föy kontrolü

`POST /api/shifts/schedule/signature-check` — `campus_manager`, `shift_supervisor`.

Islak imzayla dönen haftalık imza föyünden okunan satırları çizelgeyle (`shift_schedule`)
karşılaştırır. **Salt okuma:** puantaja hiçbir şey yazmaz; föydeki el yazısı not
puantajı değiştirmez, yalnız fark raporlanır.

## İstek

```json
{
  "rows": [
    { "name": "Ayşe Demir", "date": "2026-10-07", "mark": "signed" },
    { "staff_id": 42, "date": "2026-10-07", "mark": "report", "note": "kenarda RAPOR" }
  ],
  "department_id": 3
}
```

`mark`: `signed` · `blank` · `off` · `report` · `annual` · `leave` (türü belirsiz İZİN) · `absent`.
Satırda `staff_id` ya da `name` olmalı. İsim eşleştirmesi büyük/küçük harf ve Türkçe
karakterden bağımsızdır (`foldName`). Aynı isimde birden fazla kişi varsa **tahmin
yürütülmez**, satır `unmatched` içinde aday listesiyle döner.

## Yanıt

- `items[]`: eşleşen her satır için `planned` (çizelge kategorisi) + `verdict` + `level` + `text`
  - `ok` imzalı · `ok_not_working` imza aranmaz · `ok_mark_matches` föydeki not çizelgeyle aynı
  - `missing_signature` çalışıyor ama imza yok
  - `signed_not_working` / `signed_unplanned` OFF/izinli/plansız ama imza var
  - `mark_mismatch` föyde RAPOR/OFF/İZİN yazıyor, çizelge farklı
- `unmatched[]`, `duplicates[]`
- `not_on_sheet[]`: föyde satırı olmayan ama o gün çalışması planlanmış aktif kişiler
  (`department_id` verilmezse föyde geçen bölümler)
- `summary`: sayımlar

Kategori sınıflaması frontend'deki `classifySignatureCell` ile aynıdır.
