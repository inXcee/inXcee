# S2 — Performans & UX Sprint (Vardiya)

**Tarih:** 2026-07-15
**Durum:** Tasarım onaylandı, uygulama planı bekliyor
**Kapsam:** Çoklu-ajan A-Z incelemesinden çıkan, **vardiya (shifts) modülündeki** performans ve UX bulgularının kapatılması. Su modülü tamamen kapsam dışı (paralel Codex süreci su tarafındaki eşdeğer işleri — virtualization, panel birleştirme, dosya bölme, query invalidation — bağımsız tamamladı).

## Arka Plan

S1 (güvenlik & doğruluk) 3 fazla tamamlandı ve canlıda (`fbc428a` → `1b429a5b` → `590e1f6`). S2, keşif raporlarının performans/UX eksenindeki vardiya bulgularını alır:

- **Backend N+1:** `puantajService` her personel için `getYtdGross` çağırıyor; `getYtdGross` personel başına 4 ayrı sorgu çalıştırıyor → N personel için ~4N sorgu. (Keşif düzeltmesi: `operationsDashboardService` puantajService'i istek başına **tek** kez çağırıyor — asıl maliyet bu N+1; bulk düzeltmesi dashboard'ı da otomatik hızlandırır.)
- **Takvim render:** `PuantajCalendarView` N×31 hücreyi inline render ediyor; modülde hiç `React.memo` yok — her ok tuşu/seçim değişimi tüm tabloyu yeniden çiziyor. tfoot gün toplamı her render'da O(31×N) tarama.
- **Loading tutarsızlığı:** LeaveTab/OvertimeTab listeleri `isLoading` kullanmıyor (yükleme sırasında boş-durum görünüp veri gelince atlıyor). (Keşif düzeltmesi: PayrollPage indirmeleri zaten toast'lu; sessiz yutan tek yol `PuantajTab.downloadCsv`.)
- **Erişilebilirlik/kalıntı:** Dönem geri-gönderme notu `window.prompt` ile alınıyor (stilsiz, erişilemez, test edilemez); `routes.js`'te 2 adet `console.error` (CLAUDE.md kuralına aykırı).
- **Keşfedilebilirlik:** PayrollPage / HolidaysPage / CombinedAbsencesPage yalnız `/settings` altında (SettingsLayout OPERASYON grubu) erişilebiliyor — vardiya çalışma alanından (ShiftsPage) hızlı erişim yok; kullanıcı bordro için Ayarlar'a gitmek zorunda.

## Mimari İlkeler

- **4 bağımsız faz**, her biri kendi test→uygulama→review→commit→deploy döngüsü (S1 akışının aynısı; kullanıcı kuralı: her faz ayrı deploy).
- **Davranış korunur:** F1 ve F2 saf performans refactor'u — çıktı birebir aynı kalmalı; mevcut testler regresyon guard'ı, F1'e ek "toplu = tekil sonuç" eşdeğerlik testi yazılır.
- **Migration yok**, şema değişikliği yok.
- Su modülü dosyalarına dokunulmaz (Codex'in alanı).

## Fazlar

### F1 — Backend N+1: `getYtdGross` toplu sorgu + dashboard paylaşımı

**Sorun:** `puantajService` (service.js) satır bazlı `map` içinde her personel için `getYtdGross(db, row.id, …)` çağırıyor; fonksiyon personel başına 4 sorgu (staff salary + shift_schedule + leave + overtime) çalıştırıyor. `operationsDashboardService` aynı ay için `puantajService`'i yeniden hesaplıyor.

**Tasarım:**
- Yeni `getYtdGrossBulk(db, monthStart)` (veya eşdeğer): yılbaşından önceki ay sonuna kadar TÜM personelin YTD bileşenlerini `GROUP BY staff_id` ile tek sorgu setinde döndürür; `puantajService` map içinde sorgu yerine hazır map'ten okur.
- Mevcut `getYtdGross` tekil kullanım için korunur (başka çağıranı varsa) veya toplu fonksiyonun tek-kişilik özel hali olur — plan, gerçek çağıran envanterine göre netleştirir.
- `operationsDashboardService`, `puantajService` sonucunu parametreyle alabilir veya tek çağrıda paylaşır — istek başına tek hesaplama.

**Doğruluk garantisi:** Yeni eşdeğerlik testi — aynı seed verisiyle `getYtdGrossBulk` çıktısı, her personel için tekil `getYtdGross` çıktısına birebir eşit. Mevcut YTD/vergi/bordro testleri regresyon guard'ı.

### F2 — Puantaj takvim render performansı

**Sorun:** `PuantajCalendarView` (PuantajTab.jsx) hücreleri inline render ediyor; `activeCell`/`anchor`/`undoCount` değişimi ~N×31 hücrenin tamamını yeniden çiziyor; tfoot toplamı her render'da yeniden taranıyor.

**Tasarım:**
- Gün hücresi `React.memo`'lu `PuantajCell` bileşenine çıkarılır (props: entry, isActive, inSelection, busy, saveFailed, handler'lar — handler'lar `useCallback` ile sabitlenir).
- Personel satırı `React.memo`'lu `PuantajRow` bileşenine çıkarılır; satırın memo kırılımı yalnız o satırın verisi/seçimi değişince olur.
- tfoot gün toplamları `useMemo`'ya alınır (bağımlılık: dayData + filtered).
- Virtualization eklenmez (YAGNI) — memo katmanı mevcut ölçekte yeterli; 60+ personel gerçek sorun olursa ayrı iş.

**Doğruluk garantisi:** Davranış-koruyucu refactor; mevcut puantaj smoke testleri (takvim veri kalıcılığı, kaydetme-hatası işareti, gün dökümü, sağ tık editörü) regresyon guard'ı. Görsel doğrulama dev server'da yapılır.

### F3 — Loading / UX tutarlılığı

**Tasarım (dört küçük düzeltme):**
1. **SkeletonTable:** LeaveTab ve OvertimeTab liste query'lerinden `isLoading` alınır; yüklenirken mevcut `SkeletonTable` bileşeni gösterilir (PayrollPage'deki desenle aynı).
2. **İndirme hataları:** `PuantajTab.downloadCsv` ve PayrollPage indirme yolları hata durumunda `toastErr` gösterir — sessiz yutma kalkar.
3. **Geri gönderme notu:** `window.prompt` yerine mevcut `ModalOverlay` deseniyle küçük bir not modalı (textarea + Vazgeç/Gönder). Boş not mevcut davranıştaki gibi geçerli kalır.
4. **Logger:** `routes.js`'teki 2 `console.error` → `logger.error` (dosyada logger zaten import'lu).

**Doğruluk garantisi:** Smoke testlere skeleton/modal assertion'ları eklenir; mevcut testler regresyon guard'ı.

### F4 — Nav keşfedilebilirliği

**Sorun:** PayrollPage (`/payroll`), HolidaysPage (`/holidays`), CombinedAbsencesPage (`/combined-absences`) App.jsx'te route'lu ama hiçbir nav'dan erişilemiyor.

**Tasarım:** ShiftsPage sol nav'ına, mevcut sekmelerin altına ayrı bir "sayfa linkleri" bölümü eklenir — 3 giriş react-router navigasyonuyla ilgili sayfaya götürür (sekme state'ine karışmaz). Mevcut `NAV_ITEMS`/collapse davranışı ve rol korumaları aynen korunur. (Plan, keşif çıktısına göre iç sekme mi Link mi kararını kesinleştirir — mevcut desene en uygun olan seçilir.)

**Doğruluk garantisi:** tabs smoke testine nav girişlerinin varlık assertion'ı; tıklama navigasyonu dev server'da doğrulanır.

## Kapsam Dışı (sonraki turlara)

- Takvim satır **virtualization** (60+ personel ölçeği gerçekleşirse)
- Nav **rozetleri** (FM bekleyen sayısı vb.) → S4 özellik işi
- İzin↔puantaj görsel bağı, absent otomasyonu + bildirimler → S4
- `PuantajTab.jsx` dosya bölünmesi (4.026 satır) → S3 teknik borç (F2 yalnız hücre/satır bileşenlerini çıkarır, tam bölme yapmaz)
- Su modülünün tamamı (Codex)

## Başarı Kriterleri

- F1: eşdeğerlik testi geçer; `puantajService` personel başına ek sorgu çalıştırmaz (sorgu sayısı sabit); mevcut bordro/YTD testleri yeşil.
- F2: mevcut puantaj smoke'ları yeşil; hücre bileşenleri memo'lu; davranış değişikliği yok.
- F3: skeleton + hata toast'ı + not modalı çalışır; `console.error` kalmaz.
- F4: 3 sayfa ShiftsPage nav'ından erişilebilir.
- Her faz: backend değiştiyse `npx vitest run` tam yeşil, frontend değiştiyse frontend testler + build yeşil; ayrı semantic commit; ayrı push+deploy+smoke.
