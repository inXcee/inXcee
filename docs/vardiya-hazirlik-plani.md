# Vardiya & Puantaj — Hazırlık, Operasyon, Kapanış Planı

Tarih: 2026-08-09 · Kaynak: kullanıcı analizi + canlı veri doğrulaması

## Çıkış noktası

Sistemde özellik eksik değil; vardiya planlama, toplu doldurma, Excel içe/dışa
aktarma, puantaj kodları, izin, mesai, takas, dönem kilidi, onay akışı, bordro ve
banka çıktıları hepsi var. Eksik olan, bunları **üç anlaşılır çalışma alanında**
birleştirmek ve yanlış işlemi baştan engellemek:

1. **Hazırlık** — ana veriler ve kurallar hazır mı?
2. **Günlük operasyon** — bugün kim yok, hangi vardiya açık, ne yapılmalı?
3. **Dönem kapanışı** — puantaj tamam mı, istisnalar çözüldü mü, bordroya hazır mı?

## Canlı veri doğrulaması (2026-08-09)

Kullanıcı analizindeki sayılar canlı veriyle karşılaştırıldı. **Sayılar farklı
çıktı ama işaret edilen sorun gerçek.** Plan doğrulanmış sayılara dayanır:

| İddia | Canlı gerçek | Yorum |
|---|---|---|
| 125 aktif personelin tamamında atama eksik | 196 aktif; **projesiz 19**, departmansız 7 | Atama eksiği var ama sınırlı |
| Tanımlanmış vardiya tipi yok | **8 tanım var** | Adları `.`, `..`, `...` — ekranda "yok" gibi duruyor. Sorun *adlandırma* |
| Tanımlanmış rol yok | **6 rol tanımlı**, ama **195/196 personelde `role_id` boş** | Asıl sorun: roller kimseye atanmamış |
| Haftalık çizelgede 875 boş hücre | Bu hafta **1545 çizelge kaydı** var | Boşluk sayımı ayrıca ölçülmeli |
| Puantaj tamamlanma %0 | Ölçülmedi | Faz 4'te geçmiş/gelecek ayrımıyla yeniden tanımlanacak |

**Ders:** "%0 tamamlandı" ve "1000 kritik eksik" gibi rakamlar çoğu zaman
gelecek tarihli satırları da sayıyor. Sağlık katmanının ilk işi doğru saymak.

## Tasarım ilkeleri

- **Her uyarı tıklanabilir olmalı** — sorunu gösterip çözümü başka ekranda
  aratmak, bugünkü dağınıklığın sebebi.
- **Sessiz boşluk yok** — sayı sıfırsa "veri yok" mu, "gerçekten sıfır" mı ayırt
  edilmeli (bu depoda tekrar eden hata sınıfı).
- **Geçmiş ile gelecek ayrı sayılır** — gelecek tarihli plan eksiği "kritik" değil.
- **Saf mantık ayrı, ekran ayrı** — sayım/kural fonksiyonları test edilebilir
  modüllerde; bileşen yalnız çizer.
- **Her faz tek başına yayınlanabilir** ve kendi testleriyle gelir.

---

## Faz 1 — Sistem Hazırlık Merkezi (P0)

Vardiya sayfasının üstünde "hazırlık durumu": her madde sayı + durum + düzeltme
bağlantısı.

Kontroller:
- Projesi olmayan aktif personel
- Departmanı olmayan aktif personel
- Rolü atanmamış aktif personel
- Vardiya tanımı var mı, **adı anlamlı mı** (`.`/`..` gibi adlar uyarı verir)
- Çalışma noktası tanımlı mı
- Resmî tatiller girilmiş mi (içinde bulunulan yıl)
- Kapsama kuralı tanımlı mı
- Süresi dolmuş zorunlu belge
- Dönem onay sorumlusu atanmış mı

Çıktı: `GET /api/shifts/readiness` → `{ items: [{key, label, status, count, total, action}] }`
`status`: `ok` | `warning` | `critical` | `unknown` (ölçülemedi — sessiz sıfır değil)

## Faz 2 — Taslak → Kontrol → Yayın → Onay akışı (P0)

Çizelge değişikliği anında "kesin vardiya" olmamalı.

- `schedule_versions` tablosu: dönem + sürüm + durum (`draft`/`review`/`published`)
- Yayın öncesi kural kontrolü (kapsama, izin çakışması, dinlenme)
- Yayınlama, personelin gördüğünü onaylaması
- Yayın sonrası değişikliğin ayrıca bildirilmesi
- Sürüm karşılaştırma (eski/yeni)
- Yayını geri çekme

## Faz 3 — Aksiyon Merkezi (P0)

Dağınık uyarıları tek kutuda toplar: eksik vardiya, gelmeyen, geç kalan,
izin-vardiya çakışması, mesai uyuşmazlığı, eksik puantaj kodu, süresi dolan
belge, atamasız personel, açık vardiya, onay bekleyen talep, işten çıkana
yazılmış gelecek vardiya.

Her kayıt: önem, sorumlu, son tarih, durum + doğrudan düzeltme bağlantısı.

## Faz 4 — Puantajda geçmiş/gelecek ayrımı (P0)

"1000 kritik eksik" yerine:
- Gecikmiş (bugünden önce, eksik)
- Bugün tamamlanmalı
- Gelecek tarihli plan (kritik değil)
- Gerçek kritik / bilgi seviyesi

## Faz 5 — Bordro güvenlik kapısı (P0)

Kesin bordro ve banka dosyası, şunlar tamamlanmadan üretilemez: puantaj kontrolü,
departman onayları, mesai mutabakatı, izin/rapor mutabakatı, açık istisnalar,
dönem kilidi. Çıktılar **Taslak** / **Kesin** ayrılır; kesin dosyada dönem sürümü,
oluşturan, tarih ve doğrulama numarası bulunur.

## Faz 6 — Günlük Operasyon Merkezi

Tek ekran: planlanan, gelen/geç/gelmeyen, izinli/raporlu, açık vardiyalar,
mesaiye kalanlar, yerine çağrılabilecekler, servise binmeyip vardiyada görünenler,
nokta değişenler, kritik boşluklar, gün notu ve devir teslim.

## Faz 7 — Puantaj açıklanabilirlik zinciri

Planlanan vardiya → giriş/çıkış kanıtı → izin/rapor → mesai → puantaj kodu →
onaylayan. Ham kayıt kaynağı, otomatik öneri + gerekçesi, toplu mutabakat ve geri
alma, düzeltme gerekçesi zorunluluğu, kapalı dönemde ek düzeltme dönemi, iki
yönetici onaylı kapanış, kapanış simülasyonu ve bordro farkı önizlemesi.

## Faz 8 — İzin etki analizi

Onay öncesi: bakiye, aynı gün izinliler, kapsama kaybı, yerine çağrılabilecekler,
çakışan vardiyalar, mesai etkisi, yıl sonu bakiye tahmini, tekrarlayan örüntü.

## Faz 9 — Fazla mesai zinciri ve bütçe

İhtiyaç → ön onay → fiilî çalışma → doğrulama → mutabakat → puantaj → bordro.
Departman/proje bütçesi, kişi limiti, ay sonu tahmini, dağılım adaleti.

## Faz 10 — Takas ve açık vardiya başvurusu

Açık vardiyaya başvuru, çoklu aday, rol/dinlenme/mesai/lokasyon kontrolü, takas
sonrası kapsama karşılaştırması, bildirim ve görüldü onayı.

## Faz 11 — Personel uygunluk matrisi

Rol/yetkinlik, sertifika, sağlık kısıtı, çalışılabilir lokasyon, tercih edilen
vardiya, belge son kullanma. Süresi dolmuş zorunlu belgede atama uyarısı/engeli.

## Faz 12 — Akıllı planlama ve senaryolar

Öneri üretimi (rol, ihtiyaç, izin, gece sıklığı, ardışık gün, haftalık süre,
dinlenme, tatil dağılımı, mesai riski, tercih, ulaşım, belge, maliyet).
Senaryo A/B/C karşılaştırması. Adalet analizi.

## Faz 13 — Raporlama ve panolar

Planlanan/gerçekleşen, kapsama başarısı, devamsızlık trendi, izin ve mesai
sıralamaları, gece/hafta sonu adaleti, proje maliyeti, ay sonu tahmini, sürekli
açık vardiyalar, onay süreleri, ayrılma öncesi eğilimler. Hepsi tıklanabilir +
Excel/yazdırma.

## Faz 14 — Modüller arası bağlar

Vardiya yayını → servis listesi; günlük sayı → yemek ihtiyacı; turnike → devam
kanıtı; servise binmeme + gelmeme → birleşik risk; işten çıkış → gelecek vardiya
kontrolü; izin onayı → çizelge/puantaj; belge süresi → uygunluk; transfer → etki.

## Faz 15 — Kullanılabilirlik

Role göre sade görünüm; "Planlayıcı / Günlük operasyon / Puantaj kontrolörü"
modları; kaydedilebilir filtreler; kalınan görünümü koruma; sabit personel
kolonu; klavye kısayolları; işlem öncesi etki önizlemesi; toplu işlemde geri
alma; mobil özet; katlanabilir kontrol özeti.

---

## Uygulama sırası ve gerçekçilik

Sıra yukarıdaki gibidir; en yüksek getiriyi **Faz 1–5** sağlar.

Bu plan bir oturumluk iş değildir — proje kuralı gereği **her seferde tek faz**
uygulanır, testler geçmeden sonraki faza geçilmez, her faz ayrı commit'lenir.
Fazlar arasında canlıya çıkılabilir; hiçbiri diğerini beklemez.

**Durum (2026-08-10):**

| Faz | Durum | Commit |
|---|---|---|
| 1 — Sistem Hazırlık Merkezi | Bitti, canlıda | 8a74a05 |
| 2 — Taslak → Yayın → Geri çekme | Bitti, canlıda | e42f2b6 |
| 2+ — Yayın farkı satır satır | Bitti, canlıda | e637274 |
| 3 — Aksiyon Merkezi | Bitti, canlıda | 6b45f2f |
| 4 — Devreden kapanmamış puantaj | Bitti | 9402a5a |
| 5 — Bordro güvenlik kapısı | Bitti | 1732d69 |
| 6 — Günlük Operasyon Merkezi | Bitti, canlıda | cc50ae5 |
| 7 — Puantaj açıklanabilirlik zinciri | Bitti | (bu commit) |
| 8 — İzin etki analizi | Bitti | (bu commit) |
| 9 — Mesai zinciri ve bütçe | Bitti | (bu commit) |
| 10 — Açık vardiya ve başvuru | Bitti | (bu commit) |
| 11 — Personel uygunluk matrisi | Bitti | (bu commit) |
| 12 — Akıllı planlama ve senaryolar | Bitti | (bu commit) |
| 13 — Raporlama ve panolar | Bitti | (bu commit) |
| 14 — Modüller arası bağlar | Bitti | (bu commit) |
| 15 | Başlanmadı | — |

**Faz 4 notu:** "geçmiş/gelecek ayrımı yok" varsayımıyla başlandı; ölçüm ayrımın
ZATEN var olduğunu gösterdi (operasyonel/kapanış oranı ayrı hesaplanıyor).
Gerçek boşluk farklı çıktı: puantaj ekranı yalnız seçili aya baktığı için önceki
aylardan devreden 1299 kapanmamış gün hiçbir yerde görünmüyordu.

**Faz 7 kapsamı:** zincirin okunur kısmı (planlanan vardiya → giriş/çıkış kanıtı
→ izin/rapor → mesai → puantaj kodu → dönem onayı) yapıldı; her halka ok/eksik/
ölçülemez durumuyla ve gerekçesiyle görünüyor. Fazın "otomatik öneri, toplu
mutabakat, iki yönetici onaylı kapanış, bordro farkı önizlemesi" kalemleri Faz
9 ve 13'e bırakıldı — önce zincirin okunması gerekiyordu.

**Faz 2'de tamamlanmayan parça:** personelin çizelgeyi gördüğünü onaylaması
(mobil tarafta ekran gerektiriyor) — atlanmadı, ayrı artım olarak bekliyor.
