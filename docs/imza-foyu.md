# İmza föyü — basım, fotoğraftan okuma, föy takibi

Islak imzalı haftalık föy YYS'den basılır, sahada imzalanır, fotoğrafı Telegram'dan Hermes'e gönderilir; Hermes
imzaları **yapay zekâ kullanmadan** (OpenCV) okur, YYS çizelgesiyle karşılaştırır ve **föy takibine** işler.
**Puantaja hiçbir şey yazılmaz** — föy, puantajın değil devamın kanıtıdır; uyarılar insan kararına bırakılır.

## Akış

| Adım | Nerede | Ne olur |
|------|--------|---------|
| 1. Basım | YYS | Sade haftalık föy (proje başına) ya da web bölüm föyü. Her basım bir **baskı kaydı** (`signature_sheet_prints`) |
| 2. İmza | Saha | Hafta boyunca kâğıtta. Föy hafta başlamadan asılır |
| 3. Fotoğraf | Telegram | Fotoğraf, resim dosyası ya da tarama PDF'i (dört köşe görünecek) |
| 4. Okuma | Hermes `foy_oku.py` | Köşe işaretleri → baskı no + sayfa → hücre hücre mürekkep farkı |
| 5. Kayıt + kontrol | YYS | Sayfa okuması saklanır; haftanın **birleşik** kontrolü föy takibine işlenir |
| 6. Düzeltme | Telegram | Belirsiz hücre düğmesi (imzalı / boş) ya da ✏️ düz yazı (ad · gün · imzalı/boş) |
| 7. Takip | YYS web + Hermes | Gün × bölüm takip tablosu, sayfa durumu, sabah/haftalık hatırlatmalar |

## Basım

- **Sade haftalık föy** — `GET /api/shifts/schedule/signature-sheet/groups?week_start=` (gruplar) ve
  `POST /api/shifts/schedule/signature-sheet {week_start, group}` (A3 yatay PDF). Model sunucuda:
  `signatureSheet.js`. Proje başına ayrı föy (`projects.sort_order`) + **"Proje atanmamış"** (kimse föyden düşmesin);
  bölüm bandı altında çizelge sırası (`schedule_order`) sonra ad; görev sütunu ve vardiya saati yok, yalnız
  OFF / YILLIK İZİN / RAPORLU / İZİNLİ / YOK. Planı henüz yüklenmemiş gün **boş ve imzalanabilir** (kontrol, okunduğu
  andaki çizelgeyle yapılır). Sayfa başına 25 kişi, sonda 3 boş satır. Web: Çıktı Merkezi → "🖨 Sade föy
  (proje bazlı)"; Telegram: `/foy yazdır [bu hafta|gelecek hafta|19.10]`, panel ✍️ Föy → 🖨.
- **Web bölüm föyü** — `POST /api/shifts/schedule/signature-pdf` (model istemcide, `buildWeeklySignatureModel`).
- Her basım = `signature_sheet_prints` (baskı no, `week_start`, yerleşim `layout_json`, PDF, `group_key` / `title`).
  `renderSignaturePrint` (signaturePrints.js) tek giriş noktasıdır; `printId` istemciden gelmez.
- **Köşe işaretleri** (`signatureMarkers.js`, `aruco5x5.js`): ArUco `DICT_5X5_1000`; sol-üst/sağ-üst baskı no,
  sağ-alt sayfa, sol-alt sağlama (üç işaretle de çözülür). A3'te işaret kısa kenarla büyür (24 → 34 pt).
  En çok 62.499 baskı numarası taşır; aşılırsa föy işaretsiz basılır (kullanılır ama okunmaz).

## Okuma (Hermes — YYS'de değil)

`~/.hermes/avs-operations/foy_okur.py` (çekirdek) + `foy_oku.py` (CLI, YYS istemcisi), yorumlayıcı
`~/.hermes/venvs/foy/bin/python` (OpenCV, PyMuPDF). Telegram eklentisi her fotoğrafı/PDF'i önce **yoklar**
(`--probe`, ~1 sn); föy değilse yapay zekâya eskisi gibi devreder. Okunanlar:

- Kesin hücreler (`signed` / `blank`) gönderilir; **belirsizler gönderilmez** (düğmeyle sorulur).
- **Fotoğraf gününden sonraki günler sayılmaz**; o günün boşları da (gün bitmedi). İleri güne imza = "gün gelmeden
  atılmış imza" uyarısı.
- Hiç imza okunmayan sayfa (PDF'in kendisi, ekran görüntüsü, yeni basılmış kâğıt) **takibe işlenmez**.

## Sayfa okuması ve haftalık birleşik kontrol

- `POST /api/shifts/schedule/signature-prints/:id/reads {page, rows, stats?, photo_day?, source?}` — kişi o sayfada mı,
  gün föyün günü mü doğrulanır; `signature_sheet_reads`'e yazılır.
- `PATCH /api/shifts/schedule/signature-reads/:id {corrections}` — elle düzeltme.
- **Kontrol HER ZAMAN haftalık birleşimle yapılır** (`checkWeek`): haftanın tüm baskılarında her sayfanın **son**
  okuması; aynı kişi + gün için en yeni okuma geçerli. Föy takibi bölüm × gün başına **son kontrolü** gösterdiği
  için sayfayı tek başına kontrol etmek (eski yol) birden fazla sayfaya ya da projeye yayılan bölümü EZER — yapma.
- Yanıt: haftanın kontrolü (Hermes yalnız bu sayfanın kişilerini gösterir) + sayfa durumu (`progress`).

## Takip

- `GET /api/shifts/schedule/signature-check/coverage?from&to` — gün × bölüm: temiz / uyarılı / **kısmen** (bölümün
  föy sayfalarından yalnız bir kısmı o günü kapsıyor) / bekleniyor / gelmedi. **Sade haftalık föy basılmış haftada**
  okunmamış gün, föyün son gününe (hafta bitiminden sonraki pazartesi) kadar "bekleniyor"dur; günlük "gelmedi"
  alarmı yoktur. Bir sayfa okuması, fotoğraf günü o günden **sonraysa** o günü kapsar. Yanıtta `prints` (sayfa durumu).
- `GET /api/shifts/schedule/signature-sheet/progress?week_start=` — grup başına beklenen baskı (yeniden basımda
  **en çok okunan**; okunmamış grupsuz web baskısı beklenmez), sayfa başına okundu / **tamam** (fotoğraf föyün son
  gününden sonra) / hafta bitmeden çekilen.
- Hermes: Günaydın "Föy (bu hafta)" satırı, sabah kısayolları (Pzt–Salı geçen haftanın gelmeyen / tamamlanmayan
  sayfaları ve bu haftanın basılmamış föyü; Perşembe–Pazar gelecek haftanın basılmamış föyü), `/foy durum hafta`,
  haftalık raporda föy özeti + tekrarlayan imzasızlar.

## Notlar

- Staging'de baskı numaraları 60000'den başlar (canlı Hermes'e yanlışlıkla gönderilen staging föyü başka kaydın
  yerleşimiyle okunmasın). Staging DB canlıdan tazelenince: `INSERT INTO sqlite_sequence(name,seq) VALUES('signature_sheet_prints',60000)`.
- Eşikler (`foy_okur.py`: `SIGNED_MIN 0.012`, `BLANK_MAX 0.004`) sentetik fotoğraflarla ayarlandı (A4 %98,5–99,3, A3 sade
  %99,4–99,5). İlk gerçek föylerde fotoğraflar ve işaretli görseller 30 gün saklanır (`~/.hermes/cache/foy`,
  `~/.hermes/avs-operations/inbox`) — eşikleri gerçek veriyle gözden geçir.
