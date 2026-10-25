# Saha Ekranı — oda durumu (temizlik + doluluk) ve çamaşır defteri

Tarih: 23 Ekim 2026 · Durum: tasarım (kullanıcı "güzel bir şeyler ayarla" dedi; kanal ve ayrıntılar
tasarımcıya bırakıldı — aşağıdaki **[karar]** işaretli maddeler tasarımcının kararıdır, kullanıcı itiraz
ederse değişir).

## 1. İstek ve neden

Kullanıcı (23 Eki): *"odaların durumu temizlik yapıldı mı yapılmadı mı dolu mu boş mu vs ve çamaşır
verildiğinde falan diğer kişilerin kullanabileceği girebileceği kiosk ekranını ayarla — telegram whatsapp
falan olur veya daha uygun ne varsa"*. Aynı mesajda panel sağlık skorundaki doluluk bileşeninin
**kaldırılmamasını** istedi: doluluk gerçek veriyle dolmalı.

Bugünkü durum (canlı veri, 23 Eki):

- AVS kiosku (`/avs-kiosk`, isim + PIN) canlıda ama **14 günde 0 kullanım**. Nedenleri:
  1. Temizlik sekmesi tamamen o gün **önceden üretilmiş** `cleaning_tasks`'a bağlı. Üretim 10 Eki'de
     kullanıcı kararıyla kapatıldı (her gün 1.030 görev üretiliyor, kimse kapatmıyordu; 150.938 görev
     arşive gitti). Üretim kapalıyken sekmede blok bile çıkmıyor.
  2. Çamaşır grubu boş liste alıyor ("çamaşır ayrı kioskta"); o ayrı akış (kıyafet/makine/yük takibi) Ağustos'tan
     beri kullanılmıyor — sahaya göre fazla ağır.
  3. 80 saha personelinden (Kat Hizmetleri ve Meydancılar 66, Çamaşırhane 14) **hiçbirinin PIN'i yok**.
  4. Kayıtlı cihaz olmayınca oturum "ortak cihaz" kuralına düşüyor: **2 dk hareketsizlikte kilit**. Telefonla
     oda işaretleyip sonraki odaya yürüyen temizlikçi her seferinde PIN girmek zorunda kalır.
- Oda doluluğu bilinmiyor: panel %0 (6.276 yataktan 12'si). Sakin (kişi) giriş/çıkışı kullanıcı kararıyla
  **takip edilmiyor** (10 Eki: "bizi ilgilendirmiyor") — doluluk kişi bazlı değil, **oda bazlı** gelmeli.
- Sahibin Hermes komutları (`/oda`, `/temizlik`, `/camasir`, `/panel`) aynı YYS verisine yazıyor ama yalnız
  sahibe açık; saha personeli kullanamıyor.

## 2. Hedefler

1. Kat hizmetleri ekibi telefondan (ya da ortak tabletten) oda başına **tek dokunuşla**: temizlendi ·
   temizlenemedi (sebep) · dolu / boş. Katı toptan "bitti" işaretleyebilsin.
2. Çamaşırhane defter akışı ekranda: **teslim al → hazır → teslim et**; Hermes `/camasir` ile aynı kayıt.
3. Yönetici panelde gerçek doluluğu ve bugünkü temizliği görsün; sağlık skorunun doluluk bileşeni saha
   verisiyle anlamlı hale gelsin.
4. Kurulum: bir bağlantı + PIN dağıtımı. Uygulama yüklemek yok.

**Başarı:** bir temizlikçi bir katı (≈30 oda) iki dakikadan kısa sürede işaretleyebilir; ekran yürürken
kilitlenmez; ertesi gün panel doluluğu ve temizlik sayısı sahadan gelir.

## 3. Kapsam dışı ve anti-hedefler

- Sakin giriş/çıkışı, yatak ataması, disiplin — kullanıcı istemiyor, önerilmez.
- Günlük toplu görev üretimini geri açmak (boş görev yığını). Temizlik kaydı **istendiğinde** oluşur.
- Kıyafet bazlı çamaşır takibi, makine/yük adımları — mevcut ağır akışa dokunulmaz.
- Personel için WhatsApp/Telegram botu (bkz. §4).
- **Anti-hedef:** kağıttan daha çok dokunuş isteyen bir ekran; temizlikçiyi odalar arasında yürürken
  oturumdan atan bir ekran; sahibin Hermes akışlarını bozan bir veri modeli değişikliği.

## 4. Kanal **[karar]**

**Web ekranı (mevcut AVS kiosk uygulaması), telefonda ve isteğe bağlı ortak tablette.**

- Personel telefonu: `avskamp.com/saha` → **kişisel oturum** (hareketsizlik kilidi yok, ayardaki gün kadar
  açık kalır; varsayılan 30 gün). Ana ekrana eklenebilir (PWA). Bağlantı WhatsApp grubunda paylaşılabilir.
- Ortak tablet (ör. çamaşırhane): `avskamp.com/avs-kiosk` → bugünkü **ortak** kural (hareketsizlikte kilit).
- Giriş: mevcut isim + 4 haneli PIN. PIN'ler mevcut Ayarlar → Kiosk PIN sayfasından toplu verilir ve yazdırılır
  (ilk girişte kişi kendi PIN'ini belirler — mevcut davranış).

Neden WhatsApp/Telegram değil: personelin Telegram kurup hesabını bağlaması gerekir (sahada yaygın değil);
WhatsApp Business API Meta doğrulaması + mesaj başı ücret ister; sahibin kişisel numarasıyla çalışan köprüyü
80 kişiye açmak hem riskli hem kişisel hesabı yakar. Yapılandırılmış veri (oda × durum) için dokunmatik
ızgara mesaj yazmaktan hızlı ve hatasız. **Yöneticiye** bildirim/özet kanalı Hermes (Telegram) olarak kalır.

## 5. Veri modeli

- **Migration 125** — `rooms` tablosuna:
  - `occupancy TEXT CHECK(occupancy IN ('occupied','empty'))` — NULL = bilinmiyor.
  - `occupancy_updated_at DATETIME`, `occupancy_updated_by_worker INTEGER REFERENCES staff(id)`,
    `occupancy_updated_by_user INTEGER REFERENCES users(id)`.
  - Her değişiklik `audit_log`'a (`room_occupancy_change`, önceki/sonraki değer).
- **Temizlik:** mevcut `cleaning_tasks`, anahtar `qr_location = BLOK-ODANO`, gün = `DATE(scheduled_at)`.
  Saha işaretlediğinde o günün oda görevi **yoksa oluşturulur**, sonra tamamlanır/atlanır
  (`completed_by_worker_id` = personel). Görev üretimi kapalı kalır. Hermes `/temizlik` ve web aynı kaydı görür.
- **Çamaşır:** mevcut `laundry_items` defter kaydı (`tracking_mode` defter/legacy, durum dirty → ready → delivered).
  `created_by` = mevcut `avs_kiosk_system` sistem kullanıcısı, gerçek kişi `last_modified_worker_id` +
  geçmiş notu ("Saha ekranı · <ad>") + `audit_log`. Kart zorunluluğu açıksa gerekçe "Saha ekranı".
  `client_request_id` ile çift gönderime karşı idempotent.

## 6. API (kiosk, `requireAvsKiosk`, yalnız temizlik + çamaşır grupları)

Bir "yer" (`location`) oda için `BLOK-ODANO` (`M1-205`), M bloğu ortak alanı için `BLOK-KAT-kod`
(`M1-2-toilet`) — üretimdeki anahtarın aynısı. Böylece oda ve ortak alan aynı uçlarla işaretlenir.

Oda panosu (`/api/avs-self-service/board`):

- `GET /blocks` — blok listesi + bugünkü sayaçlar (temizlendi, yapılamadı, dolu, boş, bilinmiyor, kapalı).
- `GET /rooms?block=M1` — o bloğun katları: ortak alanlar + odalar (kullanım durumu, gececi, doluluk,
  bugünkü temizlik durumu/saat/kim, son temizlik).
- `POST /mark` `{location, action: 'clean'|'skip', reason?, note?}` (+ isteğe bağlı en çok 3 foto) —
  temizlendi / temizlenemedi. İdempotent: ikinci "temizlendi" ilk kişiyi ezmez. Sebepler mevcut kioskla
  aynı: oda kullanımda · rahatsız etmeyin · kapı kilitli · arıza nedeniyle · diğer (not).
- `POST /undo` `{location}` — bugünkü işareti geri al (yalnız kendi işareti; başkasınınkini yönetici düzeltir).
- `PATCH /rooms/:id/occupancy` `{occupancy: 'occupied'|'empty'|null}`.
- `POST /floor` `{block, floor, dry_run}` — katın uygun tüm yerlerini temizlendi yapar; `dry_run` önce
  sayıyı ve dışarıda kalanları söyler. `POST /floor-undo` `{locations}` ile tek dokunuşla geri alınır.

Çamaşır defteri (`/api/avs-self-service/laundry`, oda bazında):

- `GET /` — yıkamada (dirty/washing/ironing) · hazır · bugün teslim edilenler, oda bazında gruplu.
- `POST /` `{room_id, bags, ironing, urgent, note, client_request_id}` — teslim al (torba sayısı kadar kayıt).
- `POST /rooms/:roomId/ready` · `POST /rooms/:roomId/deliver {name?}` — odanın uygun torbaları.
- `POST /undo` `{action, ids}` — son adımı geri al (kendi, 24 saat içinde).

Yönetici (web): `PATCH /api/housekeeping/rooms/:id/occupancy` (müdür + amir) — webden de doluluk verilebilsin.

Giriş: `POST /api/auth/avs-login` isteğe bağlı `device_mode: 'personal'` alır; kayıtlı cihaz yoksa ve
istenmişse kişisel oturum kuralı uygulanır. `/saha` yolu bunu otomatik gönderir.

## 7. Ekranlar (kiosk uygulaması)

- Sekmeler: temizlik grubu → **Odalar** ilk sekme (eski "Görevler" temizlik grubunda bunun yerine geçer;
  teknik grupta Görevler aynen kalır). Çamaşır grubu → **Çamaşır** ilk, **Odalar** ikinci. Temizlik grubu
  da Çamaşır sekmesini görür (odalardan torba toplayan kat görevlisi için).
- **Odalar:** blok çipleri → kat bölümleri → oda kutucukları.
  - Kutucuk: oda no; zemin rengi temizlik (yeşil ✓ temizlendi · turuncu ⊘ yapılamadı · nötr işaretsiz);
    köşe rozeti doluluk (👤 dolu · ○ boş · boş = bilinmiyor); kapalı odalar soluk ⛔, kilitli 🔒, gececi ☾.
  - Dokun → alt sayfa: büyük düğmeler **Temizlendi** · **Temizlenemedi** (sebep çipleri) · **Dolu** / **Boş** ·
    **Arıza bildir** (mevcut hızlı arıza, oda dolu gelir) · isteğe bağlı foto. Son temizlik satırı.
  - Kat başlığı: ilerleme (18/30 temizlendi · 24 dolu · 6 boş) + **Katın hepsi temizlendi** (onaylı).
  - Her işlemden sonra 6 sn **Geri al** bildirimi.
- **Çamaşır:** üstte **Çamaşır al** düğmesi (blok → oda → torba sayısı → ütü / acil → not → kaydet).
  Altta üç liste: Yıkamada · Hazır · Bugün teslim. Kartta tek dokunuş **Hazır** / **Teslim et**.
- Ana sayfa (temizlik grubu): bugün benim işaretlediklerim + bloğumun ilerlemesi.
- Türkçe öncelikli; mevcut i18n anahtar düzeni (tr/en/ar) korunur.

## 8. Yönetici tarafı

- **Panel KPI "Doluluk"** **[karar]**: herhangi bir odada saha doluluk bilgisi varsa oda bazlı hesaplanır —
  `dolu oda / (dolu + boş oda)`, kapalı odalar hariç; alt satır kapsamı söyler ("412 dolu / 840 oda ·
  214 bilinmiyor"). Saha verisi hiç yoksa bugünkü yatak bazlı hesap aynen kalır. Sağlık skoru aynı yüzdeyi
  kullanır (bileşen kaldırılmaz). Isı haritası ve blok doluluk paneli aynı kuralla blok bazında.
- Web oda kutucukları/paneli doluluk rozetini gösterir; müdür/amir oradan da değiştirebilir.
- **Sonra (bu işin dışında):** Hermes akşam özeti ve `/oda`'da doluluk; günlük doluluk anlık görüntüsüyle
  doluluk trend grafiği. → **Yapıldı (25 Eki 2026):** migration 127, `occupancy-history.js`, `evening-summary.js`;
  bkz. `docs/saha-ekrani.md` → "Doluluk geçmişi", "Hermes akşam özeti".

## 9. Kurulum

1. Canlıya alma (staging doğrulaması → kullanıcı onayı).
2. Kat Hizmetleri + Çamaşırhane personeline Kiosk PIN sayfasından toplu geçici PIN → yazdır → dağıt
   (kişiye dokunan işlem; kullanıcı onayıyla).
3. `avskamp.com/saha` bağlantısı + QR afişi (yazdırılabilir) personelin WhatsApp grubuna / panoya.

## 10. Uygulayıcı notları (tasarımcının verdiği ayrıntı kararları)

- **Hangi odalar:** yalnız `status='active'` odalar. Kapalı (`use_state='closed'`) oda soluk görünür; temizlik
  ve doluluk düğmeleri kapalıdır (kapalı = kullanılmıyor; durum değişikliği sahibin `/oda`'sında / webde).
- **Ortak alanlar:** M bloklarında her katın başında 4 ortak alan çipi (Koridor, WC, Banyo, Merdiven) — aynı
  temizlendi/yapılamadı işlemleri, anahtar `BLOK-KAT-kod` (üretimle aynı: `M1-1-toilet`).
- **Görev kaynağı:** migration 125 `cleaning_tasks.origin TEXT` ekler (`'field'` = sahadan istendiğinde açılan;
  NULL = üretilmiş/eski). Geri alma: `origin='field'` ve fotoğrafsız görev **silinir** (oda yeniden
  "işaretsiz"); aksi halde tamamlanma/atlama geri çevrilir. Üretim bir gün açılırsa üretilmiş görev silinmez.
- **Geri alma yetkisi:** kioskta yalnız kendi bugünkü işareti (`completed_by_worker_id` / atlamayı yapan);
  başkasının hatasını müdür/amir web ya da Hermes'ten düzeltir. Her işlem `audit_log`'da.
- **Katın hepsi temizlendi:** açık, kilitsiz, **boş işaretli olmayan**, gececi olmayan ve bugün işaretlenmemiş
  odalar (+ M katının işaretsiz ortak alanları). Onay penceresi sayıyı ve dışarıda kalanları söyler
  ("24 oda · 3 gececi, 4 boş, 1 kilitli dahil değil"); tek dokunuşla geri alınır (dönen kimlikler).
- **Doluluk:** kapalı odada ayarlanamaz. "Boş" işaretli oda kat toplusuna girmez ama tek tek temizlenebilir.
- **Çamaşır anlamı (Hermes `/camasir` ile birebir):** her `laundry_items` satırı bir **torba**; ekranda
  "torba sayısı" sorulur → o kadar satır açılır, `item_count=1`, not "Defter (Saha ekranı) · parça sayısı
  yazılmadı". **Hazır** ve **Teslim et** oda bazındadır (odanın uygun tüm torbaları); geri al: alım →
  `ledger-cancel` mantığı, hazır → dirty, teslim → ready. Tekil kıyafet takipli (`individual`) torbalar
  bu akışa girmez.
- **Çamaşır listeleri** oda bazında gruplanır (ör. "M1-205 · 2 torba · ütü · acil"), en fazla 200 açık torba.
- **Foto:** isteğe bağlı, mevcut temizlik kanıtı yüklemesi (en çok 3, 10 MB).
- **Kişisel oturum:** `device_mode:'personal'` yalnız kayıtlı cihaz yokken dikkate alınır; kayıtlı cihazın
  kendi kuralı önceliklidir.
- **Panel:** KPI, sağlık skoru, ısı haritası saha kuralına geçer; blok doluluk paneline oda bazlı sütunlar
  (dolu / boş / bilinmiyor) eklenir; doluluk trend grafiği şimdilik yatak bazlı kalır (sonra: günlük anlık
  görüntü).
- **Dil:** tr tam, en tam; ar için eksik anahtar tr'ye düşer (mevcut i18n geri dönüşü).

## 11. Tasarımcı kararları (kullanıcı kontrol etsin)

- Kanal: web ekranı; personel için bot yok (§4).
- Doluluk oda bazlı ve ikili (dolu/boş); kişi sayısı tutulmaz.
- Temizlik kaydı istendiğinde oluşur; günlük üretim kapalı kalır.
- Telefon oturumu `/saha` yolunda kişisel (30 gün, kilitsiz); ortak tablet bugünkü kuralda.
- Çamaşır sekmesi hem çamaşırhane hem kat hizmetleri grubuna açık.
- Panel doluluğu saha verisi varsa oda bazlı.
