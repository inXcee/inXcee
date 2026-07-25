# Kampüs Haritası — A'dan Z'ye Geliştirme Planı

**Tarih:** 2026-07-25
**Durum:** Kullanıcı onayı alındı (mod-duyarlı panel · blok-önekli arıza kuralı · A+B+C+D)
**Not:** Kullanıcı ayrıca "Something else" işaretledi, metni ulaşmadı — o madde geldiğinde plana eklenecek.

---

## FAZ A — Doğruluk ve tutarlılık (öncelik 1)

### A1. Panel modu takmıyor  ← kullanıcının bildirdiği
`SidePanel` bölümleri (vardiya dağılımı, bugün temizlik, şirketler) **moddan bağımsız**
çiziliyor; DOLULUK modunda blok panelinde temizlik çubuğu görünüyor.
**Karar:** seçili modun bölümü **en üstte ve vurgulu**, diğerleri **katlanmış** (açılabilir).
Bilgi kaybı yok, sıra moda göre değişir.
- Bölümler: `occupancy` (doluluk özeti), `shifts` (vardiya), `cleaning` (temizlik),
  `company` (şirketler), `faults`/`quarantine` (durum kutuları).
- Uygulama: `SidePanel` içinde bölüm listesi + `mode`'a göre sırala; ilk bölüm `defaultOpen`.
- Test: her modda ilk bölümün o mod olduğunu, diğerlerinin katlandığını doğrula.

### A2. ŞİRKET modunda başlık metriği boş
`CampusMapPage.jsx:424` var olmayan `premium` modu için dal içeriyor; gerçek `company`
modu `default`'a düşüp boş değer basıyor.
**Düzeltme:** `premium` dalını sil, `company` için metrik ekle
(ör. "EN BÜYÜK ŞİRKET" + kişi sayısı, alt satırda kaç farklı şirket).
- Test: `topMetric` her MODES elemanı için boş olmayan label döndürmeli (regresyon koruması).

### A3. Oda ızgarası modu takmıyor
Kat kat oda kutuları her modda doluluk rengiyle çiziliyor.
**Düzeltme:** oda rengi moda göre — `occupancy` doluluk, `faults` arıza sayısı,
`quarantine` durum, diğer modlarda mevcut doluluk rengi (nötr).
- Test: aynı odalar farklı modda farklı renk sınıfı üretmeli (saf fonksiyon `roomColor(mode, room)`).

### A4. Arıza eşleştirme kuralı ikiye ayrılmış
- Pin rozeti (`getCampusSummary`): `location LIKE '%blok%Oda no%'` → yalnız gerçek odaya bağlananlar.
- Panel listesi (`getBlockFaults`): `location = blok OR location LIKE 'blok %'` → blokla başlayan hepsi.
Sonuç: "M1 Ortak Alan" arızası listede var, rozette yok.
**Karar (kullanıcı):** **blok-önekli kural** kazanır — hiçbir arıza görmezden gelinmez.
- `getCampusSummary` fault sorgusu blok-önekli kurala çevrilir; tek yardımcı fonksiyona alınır
  (`blockFaultFilter`) ki iki yerde ayrışmasın.
- Test: odasız ("M1 Ortak Alan") bir arıza ekle → hem rozet hem liste 1 artmalı; "A" bloğu
  "A1"in arızasını saymamalı (boşluklu önek).

### A5. "temiz" ifadesi
ARIZA modunda 0 arızalı blokta pin altı "temiz" yazıyor → temizlikle karışıyor.
**Düzeltme:** "arıza yok".

---

## FAZ B — Vardiya verisi (doğrulandı: kaynak DOĞRU, incelik var)

`shifts` tablosu ölü değil — `checkin` ve `bulk-actions` hâlâ yazıyor. Bu **sakinlerin**
gece/gündüz çalışma tipi (yatakhanede anlamlı: gece çalışan gündüz uyur), personel
vardiya çizelgesi değil. Yani kaynak yanlış değil.

**Gerçek incelik:** `COALESCE(s.shift_type,'day') = 'day'` → vardiya kaydı **olmayan** her
sakin "gündüz" sayılıyor, bu da gündüz sayısını şişiriyor.
**Düzeltme önerisi:** üç kova — `day` / `night` / `bilinmiyor`; panelde "bilinmiyor" ayrı
gösterilsin (veri eksikliği görünür olsun, sessizce gündüze yazılmasın).
- Test: shift kaydı olmayan sakin `unknown` kovasına düşmeli.

---

## FAZ C — Haritadan iş bitirme

### C1. Oda bazında durum değiştirme
Şu an yalnız **tüm blok** karantina/bakım/aktif yapılabiliyor (`bulkAction`).
Oda kutusuna sağ tık / uzun bas → o odayı karantinaya al · bakıma al · aktif yap.
Mevcut uç: `PATCH /capacity/rooms/:id/status` (campus_manager).

### C2. Arızayı haritadan yönet
Panel arıza satırında: teknisyene ata (`PATCH /maintenance/requests/:id/assign`),
öncelik değiştir (`/priority`), durum ilerlet (`/status`). Kapatma foto istediği için
(`/close` upload'lu) haritadan **kapatma yapılmaz**, "Bakım sayfasında aç" bağlantısı kalır.

### C3. Temizlik görevini tamamlama
`POST /housekeeping/tasks/:id/complete` foto/imza isteyebiliyor → haritadan **tek tık
tamamlama yapılmaz**; bunun yerine bloğun bekleyen görev listesi + "Temizlik sayfasında aç".
(Yanlış vaat vermemek için bilinçli sınır.)

### C4. Kişi arama → konum
Üstteki aramaya kişi adı yazınca hangi blok/oda olduğunu bulup haritada göstersin
(`/capacity/personnel/search` mevcut).

---

## FAZ D — Rapor ve kullanım kolaylığı

### D1. Kampüs durum raporu
Durum tablosunun Excel + yazdırma çıktısı (mevcut `excelKit` + `openXPrint` deseni).
Sayfalar: `Kampüs Özeti` (tablo + TOPLAM), `Dikkat Kuyruğu`.

### D2. Klavye kısayolları
`1..6` mod değiştir · `/` arama · `Esc` seçimi kapat · `F` tam ekran · `?` yardım.
(Mevcut yardım modalına kısayol listesi eklenir.)

### D3. Mobil/dar ekran
Harita + panel dikey yığılsın, durum tablosu yatay kaydırılsın (şu an sabit 320px panel
dar ekranda taşıyor).

---

## Sıra ve doğrulama

1. **A** (hatalar) → her madde testli, tek commit grubu
2. **B** (vardiya kovası) → tek commit
3. **C** (oda durumu → arıza yönetimi → kişi arama) → madde madde commit
4. **D** (rapor → kısayol → mobil) → madde madde commit

Her fazda: backend + frontend suite tam yeşil, prod build temiz, sonra commit.
Deploy `update.sh` rollback korumalı (yarım deploy riski yok).

## Değişmeyenler
Pin düzenleme/kaydetme, pan/zoom, ComparePanel, SSE canlı olaylar, hızlı arıza modalı,
yeni eklenen durum tablosu / dikkat kuyruğu / blok detay bölümleri, mevcut API imzaları.
