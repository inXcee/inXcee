# İnsan/Uyum Grubu İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modüller:** `personnel`, `hr`, `discipline`, `visitors`
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Dört görece küçük modül. Ortak: Zod YOK, a11y=0, i18n yok, minimal test.
- **personnel** (12 uç): `Personnel360Page` 592 satır (birleşik 360° görünüm).
- **hr** (10 uç): küçük frontend.
- **discipline** (10 uç): `DisciplinePage` ~926 satır.
- **visitors** (4 uç): küçük.

## Kapsam (onaylı)

### Faz 1 — Validation
Dört modüle de `schemas.js` + `validate()` (hepsi sıfır):
- personnel: register/update/photo/search yazma uçları.
- hr: kayıt/güncelleme uçları.
- discipline: card create/delete, blacklist add/remove, points.
- visitors: visitor create/checkout.

### Faz 2 — Decomposition
- **`DisciplinePage` (~926)** → liste / kart-form / kara-liste panelleri ayrı.
- Personnel360Page (592) kabul edilebilir; gerekirse hafif bölme.

### Faz 3 — Modüle-özel değer
- **personnel:** **360° zaman tüneli** (`activity` modülü `getStaffActivity`'yi
  bağla — tek kişinin tüm hareketleri), gelişmiş arama/filtre, belge ekleri, export.
- **hr:** **sözleşme bitiş uyarısı** (yaklaşan bitiş → bildirim/dashboard), belge
  yönetimi (vize/sağlık raporu son kullanma), işe-alış/ayrılış akışı.
- **discipline:** **eskalasyon analitiği** (puan eşiği → otomatik kara liste,
  `automation` motoru hazır), disiplin trendi (zaman/firma bazlı), itiraz akışı.
- **visitors:** **ön-kayıt + QR ziyaretçi kartı** (`cards`/`stations` altyapısı
  hazır — ziyaretçi giriş kartı zaten Faz 5b'de var), ev sahibi bildirimi,
  ziyaretçi analitiği (sık gelen, ortalama süre).

### Faz 4 — a11y
Tüm dört modül: tablo/form semantiği, klavye, hata duyurusu.

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura.

## Mimari / izolasyon
- Personnel zaman tüneli `activity` modülünü tüketir (yeni tablo yok).
- Discipline eskalasyon kuralı `automation` evaluator trigger'ı (`discipline_threshold`).
- HR sözleşme uyarısı `cron`/job queue + dashboard anomali kalıbı.
- Visitors QR kartı mevcut `cards` (holder_type=visitor) + `stations` scan akışı.

## Test stratejisi
- Backend: her Zod şeması birim testi; eskalasyon/sözleşme-uyarısı saf-mantık.
- Frontend: DisciplinePage alt-bileşenleri smoke.
- e2e: ziyaretçi giriş/çıkış + disiplin kartı happy-path.

## Önerilen uygulama sırası
Dört modül Zod (toplu, hızlı) → Discipline decomposition → modül-özel değer
(personnel zaman tüneli, discipline eskalasyon, visitors QR, hr sözleşme) → a11y.
