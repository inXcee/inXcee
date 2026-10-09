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
karakterden bağımsızdır (`foldName`). Kelimeleri aynı ama sırası farklı isim ("DEMİR AYŞE")
kesin eşleşme sayılır; satırda `matched_by: "word_order"` + `sheet_name` döner. Aynı isimde
birden fazla kişi varsa **tahmin yürütülmez**, satır `unmatched` içinde aday listesiyle döner.
Bulunamayan isim için `suggestions[]` (en yakın 3 personel, benzerlik ≥ 0.72, aktifler önce)
döner — **yalnız öneridir**, satır eşleşmiş sayılmaz.

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

## Föy dönüş takibi

İstekte `save: true` (ve isteğe bağlı `source: "web" | "telegram"`) verilirse sonuç
`signature_check_runs` tablosuna (migration 114) **gün × bölüm** parçaları halinde işlenir
(eşleşen kişinin bölümü; eşleşmeyen satır seçilen bölüme, bölüm yoksa bölümsüz parçaya).
Yanıta `saved: { batch_id, parts }` eklenir. Puantaj yine değişmez — yalnız "kontrol edildi,
şu kadar uyarı" izi tutulur; aynı gün+bölüm yeniden kontrol edilirse **en son kayıt** geçerlidir.

`GET /api/shifts/schedule/signature-check/coverage?from=YYYY-MM-DD&to=YYYY-MM-DD` (≤ 31 gün):
çalışanı planlanmış her bölüm × gün için `status`:
`clean` (kontrol edildi, fark yok) · `warn` (uyarı / eşleşmeyen / föyde olmayan var) ·
`missing` (geçmiş gün, kontrol yok) · `pending` (bugün, föy bekleniyor) · `not_needed`
(planlı çalışan yok). Kayıtlı hücrede uyarı sayıları + kısa `findings` listesi döner.

## Arayüz

Çizelge → haftalık görünüm → **✍️ İmzalı föy kontrolü** paneli (panel tercihleri ve
"Günlük operasyon" / "Puantaj kontrolörü" modlarında açık). Föy günü ve isteğe bağlı
bölüm seçilir, her satıra bir kişi yazılır: `Ad Soyad` (imzalı) ya da
`Ad Soyad - boş / off / rapor / izin / yıllık / gelmedi`. Ayraç `-`, `;`, `:`, `|` ya da
sekme olabilir; üçüncü parça not olarak taşınır. Anlaşılmayan işaret tahmin edilmez,
satır numarasıyla gösterilir ve gönderim engellenir (`logic/signatureSheetParse.js`).

Excel'den **haftalık ızgara** da yapıştırılabilir: `Ad ⇥ Pzt ⇥ Sal …` (en az 3 gün sütunu).
Hücreler sırayla haftanın günlerine eşlenir, boş hücre = imza yok, gün/tarih başlık satırı
atlanır. Eşleşmeyen isimde önerilen kişiye tıklamak föy metnindeki ismi düzeltir.
Panelin üstünde haftanın **föy dönüş takibi** tablosu (bölüm × gün; ✓ temiz, ⚠ uyarılı,
✗ gelmedi, … bekleniyor) durur; hücrenin üstüne gelince uyarılar görünür, ✗ hücresine
tıklamak o gün ve bölümü forma taşır. "Föy takibine işle" kutusu varsayılan açıktır.
**📋 Raporu kopyala** uyarıları WhatsApp/Telegram'a yapıştırılacak düz metin olarak verir
(`logic/signatureReport.js`).
