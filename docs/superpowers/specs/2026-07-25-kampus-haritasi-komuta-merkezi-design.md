# Kampüs Haritası — Komuta Merkezi Geliştirmesi

**Tarih:** 2026-07-25
**Durum:** Onaylandı (kullanıcı 5 maddeyi de seçti + oda/kişi paneli ekledi)
**Kapsam:** Yeni backend okuma ucu (rol-duyarlı) + kampüs haritası arayüzü.

## Problem

Harita görsel olarak güçlü (6 mod, pin düzenleme, pan/zoom, arama, karşılaştırma,
canlı olaylar) ama iki eksiği var:

1. **Her şey göz önünde değil.** Blok başına sayıları görmek için pin pin tıklamak
   gerekiyor; 19 bloğu yan yana gösteren bir tablo yok.
2. **Aksiyonlar haritadan çıkarıyor.** Yalnız "hızlı arıza" inline; temizlik, arıza
   listesi, check-in, oda geçmişi ayrı sayfalara yönlendiriyor.

## Eklenecekler (kullanıcı onaylı)

1. **Kampüs durum tablosu** — 19 bloğun hepsi tek tabloda: doluluk %, boş/dolu oda,
   arıza, temizlik %, karantina, bakım. Sütuna tıkla sırala, satıra tıkla harita
   o bloğa odaklan. Altta TOPLAM satırı.
2. **Dikkat kuyruğu** — kampüs genelinde şu an aksiyon bekleyenler: açık arıza,
   tamamlanmamış temizlik, karantina odası, boş yatağı kalmayan blok. Satıra
   tıklayınca haritada o bloğa gider.
3. **İnline arıza + temizlik listesi** — blok panelinde o bloğun açık arızaları
   (öncelik/durum/atanan) ve bugünkü temizlik özeti; sayfadan çıkmadan.
4. **Oda → kişi paneli** — odaya tıklayınca sağda o odada kalanlar: ad, şirket,
   giriş tarihi. **Opsiyonel** (açılıp kapanabilir, varsayılan kapalı).
5. **Hızlı aksiyon çubuğu** — seçili blok için üstte görünür kısayollar.

## Backend

Yeni uç: `GET /api/campus-map/block/:block/detail`

- Yetki: `requireAuth` (harita gibi), ama **bölümler rol-duyarlı**. Kaynak
  modüllerin kuralları birebir korunur:
  - `faults` → `campus_manager | shift_supervisor | technical`
  - `cleaning` → `campus_manager | housekeeper`
  - `rooms` (+ kişiler) → `campus_manager | shift_supervisor`
- Yetkisi olmayan bölüm yanıta **konmaz**; yanıtta `can: { faults, cleaning, rooms }`
  bayrakları döner, arayüz o bölümü hiç göstermez.
- Şekil:

```
{
  block, can: { faults, cleaning, rooms },
  faults:   [{ id, location, room_no, description, priority, status, assigned_name, created_at }],
  cleaning: { total, done, skipped, pending, pct },
  rooms:    [{ id, room_no, floor, status, active_beds, occupied,
               occupants: [{ personnel_id, full_name, company, assigned_at }] }]
}
```

- Sorgular `campus-map/queries.js` içine; blok eşleşmesi mevcut desenle aynı
  (`maintenance_requests.location LIKE 'BLOK%'` — blok adı location'ın ilk kelimesi).
- Salt okuma; yazma yok.

## Frontend

- **Saf logic** `logic/campusOverview.js` (DOM'suz, testli):
  - `buildOverviewRows(summary)` → tablo satırları + TOPLAM
  - `sortOverviewRows(rows, key, dir)`
  - `buildAttentionQueue(summary)` → önem sırasına göre uyarı listesi
    (öncelik: açık arıza > boş yatak yok > tamamlanmamış temizlik > karantina/bakım)
- **Bileşenler:** `CampusOverviewTable.jsx`, `AttentionQueue.jsx`,
  `BlockDetailSections.jsx` (arıza/temizlik), `RoomOccupantsPanel.jsx`.
- Blok detayı yalnız blok seçiliyken çekilir (`enabled`), oda paneli yalnız oda
  tıklanınca.

## Boş/sınır durumları

- Blokta arıza/temizlik/kişi yoksa: "kayıt yok" satırı; bölüm gizlenmez (yetki varsa).
- Yetki yoksa bölüm hiç render edilmez (403 gösterilmez).
- Özet yüklenmediyse tablo/kuyruk iskelet gösterir.
- Oda boşsa kişi panelinde "Bu odada kayıtlı kişi yok".

## Test

- Backend: rol-duyarlı bölümler (manager hepsini, technical yalnız faults,
  housekeeper yalnız cleaning, laundry hiçbirini), blok filtresi doğru, boş blok.
- Frontend logic: satır üretimi/sıralama/TOPLAM, dikkat kuyruğu sıralaması ve
  boş durum.
- Bileşen: tablo satırına tıklayınca blok seçimi, kuyruk satırına tıklayınca odak,
  oda tıklayınca kişi paneli, yetkisiz bölümün görünmemesi.

## Değişmeyenler

Mevcut 6 mod, pin düzenleme/kaydetme, pan/zoom, arama, karşılaştırma, canlı olay
akışı, hızlı arıza modalı, mevcut API imzaları.
