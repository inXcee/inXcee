# Çamaşırhane Sistemi — Tam Geliştirme Yol Haritası

**Tarih:** 2026-04-05  
**Kapsam:** Tüm modüller, A'dan Z'ye her iyileştirme fikri

---

## A. Makine & Süreç Yönetimi

### A1. Makine Zamanlayıcısı
- Her makineye `started_at` timestamp → geri sayım overlay (`45:00 → 00:00`)
- Süre dolunca makine kartı kırmızı pulsar + SSE bildirimi: `"🔔 Makine 2 bitti — X parça hazır"`
- Kullanıcı makineyi başlatırken program seç: Normal (45dk), Hızlı (30dk), Yoğun (90dk), Çarşaf (60dk)
- Tahmini bitiş saati göster: `"~14:32'de hazır"`

### A2. Makine Bakım Takvimi
- Her makine için bakım kaydı: tarih, yapılan iş, bakım yapan kişi
- Planlı bakım hatırlatması: `"Makine 3 — 15 gün içinde filtre temizleme"`
- Arıza bildirimi: makineyi `"bakımda"` statüsüne al, sebebi kaydet
- `maintenance_log` tablosu: `machine_id, type, notes, performed_by, performed_at`

### A3. Elektrik & Tüketim Takibi
- Load başına kWh (makineye göre sabit değer) → aylık toplam tüketim
- `"Bu ay 287 kWh kullanıldı"` dashboard widget
- Maliyet hesabı: kWh birim fiyatı girilince aylık maliyet otomatik

### A4. Makine Kapasitesi & Yük Dengeleme
- Her makineye max kg kapasitesi tanımla
- Makineye atarken `"Bu makine dolmak üzere, Makine 2'ye yönlendir"` uyarısı
- Makine bazlı günlük load sayısı: `"Makine 1 bugün 8 load — rekoru kırdı"`

### A5. Deterjan / Sarf Malzeme Stok Takibi
- Stok kalemleri: deterjan (kg), yumuşatıcı (L), leke çıkarıcı (adet), torba (adet)
- Her yıkama load'unda otomatik düş: `"1 load = 60g deterjan"`
- Düşük stok eşiği uyarısı: `"⚠️ Deterjan 2 kg kaldı — sipariş ver"`
- Stok giriş formu, tedarikçi notu, son sipariş tarihi

---

## B. Toplu İşlemler & Hız

### B1. Blok Bazlı Toplu Teslimat
- `ready` kolonunda `"A Bloğu (8 kayıt)"` → hepsini seç → imzalatıp toplu teslim et
- Kat bazlı gruplama da olsun: `"3. Kat — 5 kayıt hazır"`
- Teslimat listesi yazdır: A4 çıktı, her kayıt için satır + imza alanı

### B2. Makineye Toplu Atama
- `dirty` kolonundaki birden fazla kartı checkbox ile seç → `"Seçilenleri Makine 2'ye At"`
- Seçim modu: kanban başlığında toggle butonu

### B3. Toplu Durum Güncelleme
- Seçili kartları bir sonraki statüye al (örn: makine bittiyse 5 kartı birden `ready`'e çek)
- Geri alma: toplu işlemi `Ctrl+Z` ile geri al (10 saniyelik pencere)

### B4. Toplu Etiket Yazdırma
- Seçili kayıtlar için QR etiket sayfası oluştur → tarayıcıdan yazdır
- Etiket içeriği: oda no, ad, tarih, QR kod, parça sayısı
- Termal yazıcı desteği (58mm / 80mm bant genişliği seçeneği)

---

## C. Barkod & QR Sistemi

### C1. Çanta QR Etiketi
- Kayıt oluşturulunca QR kod üret (kayıt ID encode)
- Etiket şablonu: `"A-101 · Ahmet Yılmaz · 2026-04-05 · 3 parça"` + QR
- Tek tıkla etiket yazdır (kayıt kartından `🖨️ Etiket` butonu)

### C2. QR ile Hızlı Durum Güncelleme
- Tablet/telefon kamerası → QR tara → `"Makineye mi atıyorsunuz?"` pop-up
- Birden fazla QR ardı ardına tara (batch scan modu)
- Çantayı makineye koyarken tara → otomatik `washing` statüsüne geç

### C3. Oda QR Tara (mevcut geliştirme)
- Şu an `"Oda Tara"` butonu var — oda QR'ı tarayınca room_id otomatik seçilsin
- QR kod basma: her oda kapısına yapıştırılacak oda QR'ı toplu üret (A4 sayfa, grid)

---

## D. Bildirim & İletişim

### D1. WhatsApp Otomatik Tetikleme
- `ready` statüsüne geçince otomatik WA: `"Çamaşırlarınız hazır — A-101 · 3 parça"`
- Template seçimi: kısa/uzun mesaj, emoji seçeneği
- Tetikleme modu: anında / 30 dk sonra / el ile
- Başarısız gönderim retry + log

### D2. SLA Öncesi Uyarı
- Şu an SLA ihlali olunca uyarı var
- Eklenti: ihlalden N saat önce `"⚠️ 3 kayıt 2 saat içinde SLA sınırını aşacak"` banner
- Konfigüre edilebilir eşik: `"SLA süresi Xh, uyarı Y saat önce"`

### D3. Hatırlatma Akışı
- `ready` > 24 saat: otomatik WA hatırlatma
- `ready` > 48 saat: personel bildirimi + kayıt renkle işaretle
- `ready` > 72 saat: yönetici bildirimi
- Aşamalar ayarlanabilir

### D4. Bildirim Merkezi (In-App)
- Header'da zil ikonu + okunmamış sayaç (şu an SSE var)
- Bildirim kategorileri: SLA, makine bitti, teslimat, sistem hatası, stok uyarısı
- `"Tümünü okundu işaretle"`, `"Bu bildirimi kapat"`, `"Bu türü sustur"`
- Bildirim arşivi: son 30 gün

### D5. E-posta Bildirimi (WA alternatifi)
- WA numarası yoksa e-posta gönder
- Toplu günlük özet e-posta: `"Bugün 23 yıkama yapıldı, 2 SLA ihlali"`

---

## E. İstatistik & Analitik

### E1. Ortalama Süre Analizi
- Her statü geçişi arasındaki süre: `dirty→washing: ort. 2.3s`, `washing→ready: ort. 47 dk`
- Haftalık trend: bu hafta geçen hafta ile karşılaştır
- En uzun bekleyen 5 kayıt

### E2. Kişi / Oda Bazlı Profil
- `"A-101 bu ay 12 yıkama — en aktif oda"`
- Kayıp bildirimi geçmişi: `"Bu odadan 3 kez kayıp bildirimi geldi"`
- Premium kullanım oranı: `"B-205 kayıtlarının %80'i premium"`

### E3. Makine Verimliliği
- Günlük / haftalık / aylık load sayısı per makine
- Boşta kalma süresi: `"Makine 2 bu hafta 14 saat boşta bekledi"`
- Arıza süresi vs çalışma süresi

### E4. Vardiya Bazlı Rapor
- `"Sabah vardiyası: 23 giriş, 18 teslim, 2 SLA ihlali"`
- Personel karşılaştırması (anonim veya yönetici izniyle)
- Vardiya devir teslim notu: `"Makine 3 bakımda, A-101 bekliyor"`

### E5. Dashboard Kişiselleştirme
- Widget'ları sürükle/bırak ile düzenle
- Widget ekle/kaldır: hangi KPI'lar görünsün?
- Farklı rol → farklı default dashboard (çamaşırhane çalışanı vs yönetici)

### E6. Export & Raporlama
- Tarih + statü + blok filtreli kayıt listesi → `.xlsx` indir
- Aylık özet PDF (otomatik oluştur)
- Premium parça özet raporu: teslim alınan vs teslim edilen

### E7. Yoğunluk Heatmap
- Günün saatlerine göre giriş yoğunluğu (7 gün × 24 saat grid)
- `"Pazartesi 09-11 arası en yoğun"` → kapasite planlaması

---

## F. Kanban Geliştirmeleri

### F1. Swimlane Görünümü
- Blok bazında yatay bantlar: `"A Bloğu | B Bloğu | Premium"` şeklinde satırlar
- Kat bazlı swimlane da olabilir
- Swimlane toggle: açık/kapalı seçeneği

### F2. Kart Renk Kuralları
- SLA ihlali → kırmızı border
- Acil → portakal/sarı arka plan
- Premium → altın border
- 24h+ bekleyen → mavi uyarı

### F3. Kart Detay Modal
- Kanban kartına tıklayınca tam geçmiş: `"Kirli→Yıkanıyor: 14:23 / Makine 2 / Ahmet"`
- Kart üzerinden not ekleme
- Kart üzerinden durum değiştirme (drag alternatifi)

### F4. Kolon Kapasitesi
- Her kolona max kart sayısı sınırı (örn: `washing` max 8 = 8 makine)
- Sınıra yaklaşınca sarı, dolunca kırmızı header
- `"Bu kolona daha fazla kart eklenemez"` engeli

### F5. Filtre & Arama (Kanban)
- Kanban üzerinde gerçek zamanlı arama: `"Ahmet"` yaz → sadece o kişinin kartları
- Blok filtresi: `"Sadece A Bloğu kartlarını göster"`
- Acil/premium/normal filtre

### F6. Kolonu Daralt/Genişlet
- Kullanılmayan kolonları (örn: `ironing`) daralt → sadece başlık kalsın
- Genişletince kartlar görünsün

---

## G. Premium Kıyafet Yönetimi

### G1. Fotoğraf Yükleme
- Kıyafet alınırken fotoğraf çek (browser kamera API veya dosya yükle)
- Teslim ederken yeniden fotoğraf çek → önceki/sonraki karşılaştırma
- `condition_photos` kolonu (JSON array, URL listesi)
- Hasar belgesi olarak kullan

### G2. Bakım Etiketi & Yıkama Talimatı
- Kıyafetin bakım sembollerini seç: `30°C`, `elde yıka`, `ütülenebilir`, `kurutma yok`
- Makine programını otomatik öner: `"Bu kıyafet 30°C naylon program gerektiriyor"`
- `care_instructions` kolonu

### G3. Garderob / Yaşam Döngüsü
- `"Bu gömlek 8. kez yıkanıyor"` — yıkama sayacı
- Kıyafetin toplam değer tahmini (kullanıcı girer)
- Hasar/kayıp durumunda tazminat hesabı

### G4. Hasar Akışı
- Hasar bildirimi: fotoğraf + açıklama + kategori (yırtık, soluk, küçülmüş, kayıp)
- Durum: `açık → inceleniyor → çözüldü / tazminat`
- Yönetici onayı gerektiren durum
- `damage_claims` tablosu

### G5. Premium Parça Çoğaltma / Şablon
- `"Bu parçanın aynısından 3 tane daha ekle"` butonu
- Kişinin önceki premium kaydından kopyala

---

## H. Teslimat Akışı Geliştirmeleri

### H1. Teslimat İmzası
- Teslim ederken de imza al (şu an sadece teslim alırken var)
- `delivery_signature` kolonu
- `"Kim teslim aldı"` imzası ile belgele

### H2. Teslimat Fişi / Makbuzu
- Teslim edilen kayıtlar için PDF makbuz: oda, kişi, parça listesi, tarih, her iki imza
- `window.print()` + CSS print media query
- Termal yazıcı için 80mm format

### H3. Oda Bazlı Teslimat Görünümü
- `"A-101'in hazır kayıtları: 3 parça"` — odaya tıkla → tüm ready parçaları göster
- Teslim et butonu → hepsini teslim et veya seçilileri teslim et
- `"Bugün teslim edilecekler"` listesi (ready + 24h+)

### H4. Teslimat Kuyruğu
- Acil → önce, sonra SLA sıralı
- Kat/blok bazlı sıralama (floor-by-floor teslimat rotu optimize)
- `"Rota: 3. kat (4 teslimat) → 2. kat (2 teslimat) → 1. kat (1 teslimat)"`

---

## I. Kullanıcı Profili & Oda Sakin Tercihleri

### I1. Yıkama Tercihleri Profili
- Her oda sakini için tercih kaydı: `"Kurutma makinesi yok"`, `"Renkli-beyaz ayrı"`, `"Hassas program"`
- Kayıt girerken otomatik uyarı: `"Bu kişinin özel talebi var: ⚠️ El yıkama"`
- `resident_preferences` tablosu veya `rooms.preferences` JSON kolonu

### I2. Alerji / Kimyasal Hassasiyeti
- `"Parfümsüz deterjan"`, `"Çamaşır suyu yok"` işareti
- Yıkama sırasında çalışana uyarı

### I3. VIP / Özel Not
- Oda veya kişi başına kalıcı not: `"Bu kişinin kıyafetleri ayrı torbada gelmeli"`
- Kanban kartında görünür ikon: `"⚠️ Özel not var"` → hover'da metin

---

## J. Arama & Filtreleme

### J1. Global Komut Paleti (`Ctrl+K`)
- Her yerden açılır: `"Oda 101"` → o odanın aktif kayıtları
- `"Ahmet Yılmaz"` → o kişinin tüm geçmişi
- `"Makine 2"` → makine durumu
- `"Hızlı ekle"` → QuickAdd açılır
- `"Rapor"` → rapor sayfasına git
- Klavye navigasyonu: `↑↓` seç, `Enter` git

### J2. Fuzzy Search (Bulanık Arama)
- `"Ahmt"` → `"Ahmet"` bulur — Türkçe normalize ile
- Tüm alanlarda: ad, oda, blok, not
- Hem anlık hem arşiv aramada

### J3. Kayıtlı Filtre Presets
- `"Bugünün acil kayıtları"` → bookmark olarak kaydet
- `"A Bloğu hazır kayıtlar"` preset
- Sidebar'da favoriler listesi
- Paylaşılabilir filtre URL'si: `?status=ready&block=A`

### J4. Gelişmiş Filtre Builder
- Birden fazla filtre AND/OR kombinasyonu: `"ready VE (A bloğu VEYA B bloğu)"`
- Tarih range picker: `"01.04.2026 - 05.04.2026 arası"`
- Filtre kaydet, filtre sil, filtre paylaş

---

## K. Güvenlik & Denetim

### K1. Tam Audit Log
- Her aksiyon kaydedilir: `"Ali Çavuş — A-101 kaydını Teslim Edildi yaptı — 14:32"`
- `audit_log` tablosu: `user_id, action, entity_type, entity_id, old_value, new_value, ip, timestamp`
- Yönetici panelinde filtreli audit görünümü
- Export: belirli tarih aralığı audit log

### K2. Personel Performans Paneli
- Vardiya başına: kaç giriş, kaç teslim, ortalama yanıt süresi
- Karşılaştırma: bu vardiya vs geçen hafta aynı vardiya
- SLA ihlali sorumlusu: kimin vardiyasında ihlal oldu

### K3. Oturum Güvenliği
- Belirli dakika hareketsizlikte otomatik logout
- Çoklu sekme/cihaz uyarısı: `"Bu hesap başka bir cihazda açık"`
- Giriş geçmişi: son 10 giriş (IP, tarih, cihaz)

### K4. Rol Bazlı Kısıtlama İyileştirme
- `laundry`: giriş + durum güncelleme
- `shift_supervisor`: + makine ata, + rapor görüntüle
- `campus_manager`: tüm yetkiler + audit log + personel raporu
- `housekeeper`: sadece kendi bloğunu görsün

---

## L. UX & Arayüz İyileştirmeleri

### L1. Klavye-First Mod
- `Tab` sırası tüm formlarda optimize
- Enter ile form kaydet, Esc ile kapat — her modalde
- Global kısayollar: `N` = yeni kayıt, `Q` = QuickAdd, `K` = Kanban, `R` = Rapor
- Kısayol rehberi: `?` tuşuna bas → tüm kısayollar

### L2. Son İşlemler Geçmişi
- Sidebar veya footer: `"Son 5 işlem"` listesi
- `"A-101 Ahmet → Yıkanıyor (2 dk önce)"` → tıklayınca o kayda git
- Geri alma (`Ctrl+Z`): son 1 işlemi geri al (10 saniyelik pencere)

### L3. Oda Favorileri
- Sık kullanılan odaları `★` ile sabitle
- QuickAdd'de ve Yeni Kayıt'ta favori odalar en üstte
- Premium blok çalışanı A1 bloğunu sabitlesin

### L4. Toplu Form Şablonları
- `"Standart Gömlek Seti"` şablonu: 2 gömlek + 1 pantolon + 1 çorap, mavi/beyaz
- Şablon kaydet, şablon adını gir, tek tıkla uygula
- Kişi başına şablon: `"Ahmet'in standart paketi"`

### L5. Animasyon & Micro-Interactions
- Kart statü değişiminde smooth geçiş animasyonu
- Kaydet butonuna tıklanınca çekirdek animasyon (pulse)
- Hata mesajları shake animasyonu
- Yükleme skeleton (blank kartlar yerine)

### L6. Responsive & Tablet Optimizasyonu
- Tablet (iPad) için optimize kanban: daha büyük dokunma alanları
- Swipe right = ileri al, swipe left = geri al (touch gesture)
- Bottom navigation bar mobilde

### L7. Büyük Yazı / Erişilebilirlik Modu
- Yazı boyutu ayarı (S/M/L) — kalıcı tercih
- Yüksek kontrast mod
- ARIA label'ları eksiksiz
- Tab navigasyonu erişilebilir

---

## M. Çarşaf / Nevresim / Havlu Yönetimi

### M1. Oda Bazlı Set Takibi
- Her odaya verilen: `"A-101 → 2 nevresim seti, 4 havlu"`
- Teslim tarihi, beklenen iade tarihi
- Gecikmiş iade uyarısı

### M2. Yıpranma Takibi
- Yıkama sayacı: `"Bu nevresim 45 kez yıkandı — değiştirilmeli"`
- Ömür eşiği ayarı (örn: 50 yıkama sonrası alarm)
- `"Bu ay eskiyen 12 set var"` raporu

### M3. Stok Sayımı
- Toplam nevresim/havlu envanteri
- Konumlar: `"Depoda 45, odalarda 120, çamaşırhanede 8"`
- Kayıp sayısı, hasar sayısı

---

## N. Çanta / Torba Yönetimi

### N1. Çanta ID Sistemi
- Her çantaya ID numarası (barkod etiketi)
- `"Bu çanta hangi kayda ait?"` → QR tara → kayıt aç
- Çanta iade takibi: verilen çanta geri geldi mi?

### N2. Çanta Durumu
- Temiz / kullanımda / kirli / hasarlı / kayıp
- `"Bugün 5 çanta iade alındı, 3 çanta çıktı"`

---

## O. Planlama & Takvim

### O1. Yıkama Takvimi (Blok Rotasyonu)
- `"A1 Bloğu: Pazartesi-Çarşamba, B Bloğu: Salı-Perşembe"`
- Takvim görünümü: hangi gün hangi blok
- Oda sakinlerine `"Sizin günleriniz: Salı-Perşembe"` SMS/WA

### O2. Kapasite Planlama
- Günlük makine kapasitesi: `"Bugün max 32 load girilebilir"`
- Gün başında kapasite durumu: `"18/32 load dolu"`
- Overbooking uyarısı

### O3. Bekleme Süresi Tahmini
- Şu an kaç yıkama var → sıradaki için tahmini süre
- `"Tahmini beklemeniz: 1 saat 45 dakika"` → QuickAdd veya kiosk ekranında göster

### O4. Periyodik Bakım Takvimi
- Makine bakımı, filtre değişimi, kontrol tarihleri
- Takvim görünümünde makine bakım günleri
- Bakım günü öncesi bildirim

---

## P. Veri Yönetimi & Yedekleme

### P1. Otomatik Yedekleme
- Günlük otomatik backup: `yys_backup_2026-04-05.db`
- Son 30 yedek sakla
- Yedek indirme butonu (yönetici)
- Manuel yedek tetikleme

### P2. Veri İçe/Dışa Aktarma
- Oda listesini Excel'den import et
- Tüm kayıtları CSV olarak export et
- Premium parça arşivini JSON export

### P3. Arşiv Politikası
- N ay öncesi teslim edilmiş kayıtlar otomatik arşivle
- Arşiv sıkıştırma / summarize
- `"Eski kayıtları temizle"` yönetici aksiyonu

---

## Q. Müşteri Memnuniyeti

### Q1. Teslim Sonrası Değerlendirme
- Teslim QR'ından memnuniyet anketi: `"Hizmetimizden memnun kaldınız mı? ⭐⭐⭐⭐⭐"`
- Şikayet kategorileri: `geç teslim`, `hasar`, `kayıp`, `hijyen`, `iletişim`
- Puanlar dashboard'a yansır

### Q2. Şikayet Akışı
- Şikayet kaydı: tip + açıklama + öncelik
- Durum takibi: açık → işlemde → çözüldü
- Çözüm süresi hedefi: `"Şikayetler max 48 saat içinde çözülmeli"`

---

## R. Bildirim & Mesajlaşma Geliştirmeleri

### R1. Vardiya Devir Teslim Notu
- Vardiya bitiminde zorunlu not: `"Makine 3 bakımda, A-101 özel istek var"`
- Bir sonraki vardiyaya görünür banner
- `shift_handover_notes` tablosu

### R2. İç Mesajlaşma İyileştirmeleri
- Kayda yorum ekle: `"Bu kıyafetin rengi solmuş, müşteriyle konuşuldu"`
- @mention: `"@mudur Bu konuda onay lazım"`
- Kayıt bazlı yorum geçmişi

### R3. Duyuru Sistemi
- Yönetici → tüm personel duyurusu: `"Bugün saat 15'te ekipman bakımı"`
- Duyuru tipleri: acil, bilgi, hatırlatma
- Okundu bildirimi

---

## S. Offline & Performans

### S1. PWA / Offline Çalışma
- Service Worker ile kritik sayfalar offline cache
- Offline girilen kayıtlar → bağlantı gelince sync
- `"Çevrimdışı — 3 kayıt senkron bekliyor"` banner

### S2. Hız Optimizasyonları
- Virtual scroll: çok kayıt varken DOM'da sadece görünen render et
- İlk yüklemede sadece bugünün verisi — daha fazlasını scroll ile yükle
- Agresif staleTime / cache stratejisi

### S3. Optimistic Updates
- Kanban drag → anında UI güncelle, arka planda API çağır
- Hata olursa geri al ve uyar
- Şu an kısmen var, tüm aksiyonlara yay

---

## T. Onboarding & Yardım

### T1. İnteraktif Tur
- Yeni personel ilk girişte `"Sistem turunu başlat"` seçeneği
- Tooltip baloncukları: `"Bu buton hızlı kayıt için"` → `"İleri"` → `"Bu ise kanban..."`
- Tur adımları rolüne göre farklı

### T2. Yardım Merkezi
- Her sayfada `"?"` butonu → o sayfaya özel yardım
- Sık sorulan sorular
- Kısayol rehberi (anında açılır overlay)

### T3. Uygulama İçi Değişiklik Günlüğü
- `"🆕 Yeni özellik: ⚡ Hızlı giriş eklendi"` popup (bir kez göster)
- Versiyonlu changelog listesi yönetici için

---

## U. Özel / İnce Dokunuşlar

### U1. Akıllı Varsayılanlar
- QuickAdd oda alanına son girilen oda no otomatik gelsin (değiştirilebilir)
- Yeni kayıtta oda seçilince o odanın son yıkama tercihlerini varsayılan yap
- Sık kullanılan kıyafet tipi en üstte göster

### U2. Hata Kurtarma
- Form doldururken tarayıcı kapanırsa `localStorage` draft → açınca `"Yarım kalan form var, devam et?"`
- (NewItemModal'da zaten var — diğer formlara yay)

### U3. Tarih/Saat Bağlamı
- `"3 saat önce"` → hover'da tam tarih (`"5 Nisan 14:32"`)
- Kart üzerindeki süreler renk kodlaması: yeşil <2s, sarı 2-4s, kırmızı >4s

### U4. Renk Körlüğü Desteği
- Sadece renk değil şekil/ikon kombinasyonu kullan
- Renk körlüğü simülatörü ile test edilmiş palet

### U5. Uygulama İçi Kamera
- QuickAdd / Yeni Kayıt'ta fotoğraf çek — kayda ekle
- Video akışı üzerinden QR scan (harici kütüphane yok, browser API)

### U6. Toplu Mesaj Gönderme
- `"A Bloğu tüm sakinlerine WA"`: `"Çamaşırhanede yoğunluk var, lütfen Çarşamba-Perşembe kullanın"`
- Hedef grup: blok / kat / bireysel

### U7. Kiosk Modu
- Çamaşırhane girişine dokunmatik ekran: oda no yaz → bekleyen kayıtlarını gör
- Basit arayüz: sadece `"Çamaşırım hazır mı?"` sorusu
- QR tara → hazırsa `"✓ Hazır, 3. raftaki raftan alabilirsiniz"`

---

## Öncelik Matrisi

### Yüksek Etki / Düşük Efor (Önce Bunlar)
| # | Özellik | Bölüm |
|---|---------|-------|
| 1 | Makine zamanlayıcısı + SSE bildirimi | A1 |
| 2 | Blok bazlı toplu teslimat | B1 |
| 3 | WhatsApp otomatik tetikleme | D1 |
| 4 | SLA öncesi uyarı | D2 |
| 5 | Global komut paleti Ctrl+K | J1 |
| 6 | Kanban kart filtresi (isim/blok) | F5 |
| 7 | Son işlemler geçmişi + Ctrl+Z | L2 |
| 8 | Vardiya devir teslim notu | R1 |
| 9 | Deterjan stok takibi | A5 |
| 10 | Kayıtlı filtre presets | J3 |

### Yüksek Etki / Orta Efor
| # | Özellik | Bölüm |
|---|---------|-------|
| 11 | QR etiket yazdırma | C1 |
| 12 | Kart detay modal (geçmiş) | F3 |
| 13 | Teslimat imzası + fişi | H1, H2 |
| 14 | Makine bakım takvimi | A2 |
| 15 | Ortalama süre analizi | E1 |
| 16 | Tam audit log | K1 |
| 17 | Oda sakin tercihleri | I1 |
| 18 | Nevresim / havlu seti takibi | M1 |
| 19 | Premium fotoğraf | G1 |
| 20 | Swimlane kanban | F1 |

### Stratejik / Uzun Vadeli
| # | Özellik | Bölüm |
|---|---------|-------|
| 21 | PWA / offline | S1 |
| 22 | Kiosk modu | U7 |
| 23 | Müşteri memnuniyeti anketi | Q1 |
| 24 | Hasar tazminat akışı | G4 |
| 25 | Yoğunluk heatmap | E7 |
| 26 | Yıkama takvimi / rotasyon | O1 |
| 27 | Çanta ID sistemi | N1 |
| 28 | Stok/envanter modülü | A5, M3 |
