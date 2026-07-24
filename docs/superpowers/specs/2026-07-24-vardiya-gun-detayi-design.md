# Vardiya Gün Detayı — Bölüm Bölüm Kadro + İzin/Rapor/Devamsız

**Tarih:** 2026-07-24
**Durum:** Uygulandı (commit f84fd9da + 530f54f5 + 2d442a0f) — yerelde; canlıya alınmadı
**Kapsam:** Backend yeni okuma endpoint'i (yazma yok) + frontend yeni panel + Excel/print export.

## Problem

Vardiyalar bölümünde tek bir gün için "bölüm bölüm kim çalışıyor, kim izinli/raporlu/
devamsız, nerede, her vardiyada kaç kişi" görünümü yok. Mevcut `CoverageBoard` haftalık
ve hedef-odaklı; `LiveOccupancyBoard` "şu an" odaklı. Gün odaklı, izin/rapor kovalı,
indirilebilir kadro dökümü eksik.

## Veri modeli (mevcut — değişmez)

`shift_schedule`: `status` ∈ (scheduled, worked, absent, on_leave, overtime, off),
`leave_type` ∈ (annual, sick, emergency, maternity, paternity, marriage, bereavement,
unpaid) nullable, `absent_reason` (serbest metin) nullable, `work_date`, `dept_id`,
`shift_def_id`, `work_location_id`, `staff_id`. Segment tablosu `shift_schedule_segments`
gün içi çoklu vardiya/nokta taşır (breakdown sorgusundaki CTE deseni birebir kullanılır).

Etiketler frontend'de hazır: `shared.jsx` → `LEAVE_TYPES` (sick = "Raporlu"), `LEAVE_CELL`.

## Kova mantığı

- **Çalışan** = status ∈ (scheduled, worked, overtime) — vardiyasına yazılır.
- **Raporlu** = status = on_leave **ve** leave_type = 'sick'.
- **İzinli** = status = on_leave **ve** leave_type ≠ 'sick' (tür etiketiyle).
- **Devamsız** = status = 'absent' (+ absent_reason).
- **İzin günü** = status = 'off'.

## Backend

Yeni endpoint: `GET /shifts/day-detail?date=YYYY-MM-DD&group_by=dept|site|location`
(rol yetkisi: `managerOrSupervisor`, diğer breakdown uçlarıyla aynı). `group_by`
varsayılanı `dept`.

Sorgu: `getDayDetailRows(date)` — o günün TÜM schedule satırlarını (çalışan + izinli +
raporlu + devamsız + off) staff/dept/role/work_location/shift join'leriyle çeker.
Çalışanlar için segment CTE deseni (breakdown ile aynı) kullanılır; izin/rapor/off/absent
satırları segmentsiz doğrudan `shift_schedule`'dan gelir.

Kovalama + gruplama **saf fonksiyonda**: `buildDayDetail(rows, { groupBy })` →

```
{
  date, group_by,
  totals: { working, on_leave, sick, absent, off, groups: <grup sayısı> },
  groups: [
    {
      key, name,
      shifts: [ { shift_def_id, shift_name, start_hour, end_hour, count,
                  people: [{ staff_id, full_name, role_name, work_location_name, site }] } ],
      on_leave: [{ staff_id, full_name, leave_type, leave_type_label }],
      sick:     [{ staff_id, full_name }],
      absent:   [{ staff_id, full_name, reason }],
      off:      [{ staff_id, full_name }],
      totals: { working, on_leave, sick, absent, off },
    }
  ]
}
```

- Gruplar çalışan sayısına göre çoktan aza; grup içi vardiyalar başlangıç saatine göre.
- İsimler ada göre sıralı (COLLATE NOCASE).
- `group_by=dept` → departman adı; `site` → `COALESCE(wl.site,'Yemekhane')`; `location`
  → `COALESCE(wl.name,'Yemekhane')` (breakdown ile birebir aynı grup ifadeleri).
- İzin/rapor/off/devamsız satırlarının work_location'ı çoğu zaman null. Bu yüzden:
  - `group_by=dept` iken bu kişiler kendi departman grubunun izin kovalarına düşer (normal).
  - `group_by=site|location` iken work_location null olanlar tek bir **"Bölüm dışı / izinli"**
    grubunda toplanır (yanlışlıkla "Yemekhane" gibi bir yere sayılmasınlar). Bu grubun
    yalnız izin/rapor/devamsız/off kovaları olur, vardiyası olmaz. Panelde açıklama notu.

Not: leave_type_label backend'de gömülü küçük harita ile döner (frontend LEAVE_TYPES ile
aynı Türkçe karşılıklar) — Excel/print sunucu verisinden de okunabilsin.

## Frontend

`DayDetailBoard.jsx` — ScheduleTab'da CoverageBoard'ın hemen ardında, açılır/kapanır panel
(mevcut panel deseni). Props: `from`/seçili gün, `weekDays`, `onPersonClick`, tanım listeleri.

- **Tarih seçici** (haftanın günlerinden veya date input; varsayılan bugüne en yakın gün).
- **Gruplama seçici**: Departman (varsayılan) · Site · Nokta.
- **TOPLU özet şeridi**: Çalışan · İzinli · Raporlu · Devamsız · İzin günü (rozetli).
- **Bölüm kartları** (açılır): başlık = grup adı + çalışan/izin/rapor sayıları; içinde
  vardiya satırları (vardiya adı + saat + kişi sayısı + tıklanabilir isim çipleri →
  `onPersonClick(staff_id)`), altında izinli (tür etiketli) · raporlu · devamsız (sebep) ·
  izin günü kovaları.
- Türetme **saf modülde**: `logic/dayDetail.js` (gruplama zaten backend'de; burada
  yalnız görünüm yardımcıları + Excel/print satırları).

## İndirme

- **Excel** (exceljs lazy, `excelKit`): "Gün Detayı" sayfası — satırlar: BÖLÜM · VARDİYA ·
  KİŞİ · ROL · NOKTA · DURUM (Çalışıyor / İzinli-tür / Raporlu / Devamsız-sebep / İzin günü).
  Üstte özet satırı. Dosya adı `vardiya-gun-detayi-<date>.xlsx`.
- **PDF**: yazdırma görünümü (`openDayDetailPrint`, repodaki `openPhotoReportPrint` deseni) —
  bölüm bölüm başlık + tablolar; tarayıcı "PDF olarak kaydet" ile alır. Yeni pdfkit yok.

## Test

- **Backend:** `buildDayDetail` saf fonksiyon testi (kovalama doğru, gruplama dept/site,
  çoktan aza sıralama, toplamlar tutarlı, izin satırı vardiyaya sızmaz) + endpoint 200/400 +
  yetki 403. Yeni test verisi kendi ayrık tarihinde kurulur (mevcut testleri bozmasın).
- **Frontend logic:** Excel/print satır üretimi (durum etiketleri, sebep, izin türü).
- **Frontend bileşen:** panel açılır, gruplama değişir, kişi çipi tıklanınca `onPersonClick`,
  boş gün bilgilendirmesi.

## Boş/sınır durumları

- O gün hiç kayıt yoksa: "Bu gün için çizelge kaydı yok." indirmeler pasif.
- Departmansız kişi → "Departmansız" grubu. Vardiyasız çalışan (shift_def_id null) →
  "Vardiya atanmamış" satırı.
- Kilitli döneme dokunulmaz (salt okuma; period lock guard'ı gerekmez).

## Değişmeyenler

CoverageBoard, LiveOccupancyBoard, schedule yazma akışı, puantaj, mevcut API imzaları.
