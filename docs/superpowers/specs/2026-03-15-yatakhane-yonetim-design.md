# Yatakhane Yönetim Sistemi — Tasarım Spesifikasyonu

**Tarih:** 2026-03-15
**Durum:** Onaylandı
**Kapsam:** Tek şantiye, ileriye dönük çoklu şantiye desteği için genişletilebilir

---

## 1. Genel Bakış

Şantiye kampüsündeki yatakhane operasyonlarını uçtan uca dijitalleştiren web tabanlı yönetim sistemi. 8 işlevsel modül, tek deployment, tablet/masaüstü kullanımı.

**Tech Stack:**
- Frontend: React + Vite + TanStack Query + Tailwind CSS + Zustand
- Backend: Node.js + Express (modüler router yapısı)
- Veritabanı: SQLite (better-sqlite3)
- Zamanlayıcı: node-cron
- Bildirimler: Sistem içi + WhatsApp webhook stub
- QR: jsQR (kamera okuma) + qrcode (üretim)

---

## 2. Mimari

### Modüler Monolit

Her modül kendi `routes.js / service.js / queries.js` üçlüsüne sahip. Frontend ve backend aynı repo içinde, ayrı `frontend/` ve `backend/` klasörlerinde.

```
project/
├── frontend/
│   └── src/
│       ├── modules/          # 8 modül klasörü
│       └── shared/           # components, hooks, api client
├── backend/
│   └── src/
│       ├── modules/          # 8 modül (routes/service/queries)
│       └── shared/           # auth, db, notifications
└── docs/
```

### Yetkilendirme

JWT tabanlı. Her istek `Authorization: Bearer <token>` header'ı taşır. Role-based middleware (`requireRole(...)`) her route'a uygulanır.

---

## 3. Kullanıcı Rolleri ve Erişim Matrisi

| Modül | Kampüs Müdürü | Vardiya Amiri | Teknik Servis | Çamaşırhane | Meydancı |
|---|:---:|:---:|:---:|:---:|:---:|
| Check-in / Onboarding | ✓ | ✓ | — | — | — |
| Kapasite & Oda Yönetimi | ✓ | ✓ | — | — | — |
| Çamaşırhane | ✓ | — | — | ✓ | — |
| Housekeeping | ✓ | — | — | — | ✓ |
| Teknik Servis | ✓ | görüntüle | ✓ | — | — |
| Disiplin | ✓ | ✓ | — | — | — |
| Yönetici Kokpiti | ✓ | kısıtlı | — | — | — |

---

## 4. Modüller

### 4.1 Check-in & Onboarding
- TC Kimlik / Pasaport ile personel sorgulama
- Kara liste anlık kontrolü → kırmızı engel ekranı + tutanak
- Otomatik grup yerleştirme: aynı firma + aynı memleket → yakın odalar
- Dijital zimmet: nevresim, battaniye, kask vb. kişiye atanır, dijital imza alınır
- Toplu onboarding: 50 kişilik otobüs için sıralı işlem desteği

### 4.2 Kapasite & Uyku Yönetimi
- **S2 bloğu max 4 yatak** → SQLite CHECK constraint (DB seviyesinde kilitli)
- Diğer odalar max 6 → uygulama katmanı + DB constraint
- **Dinamik yatak yönetimi:** Yönetici oda başına aktif yatak sayısını artırıp azaltabilir (bakım, hasar, temizlik durumunda). Fiili kapasite, tavan kapasiteden düşük olabilir.
- **Blok/Kat bazlı personel görünümü:** Her blok ekranında o blokta kalan personel listesi gösterilir (isim, oda, yatak, kat). Her kat ayrı sorumluluk alanıdır ve ayrı bir sorumlu atanabilir. Atamalar bu ekrandan değiştirilebilir.
- **Sabit blok prensibi:** Personel genellikle belirli bir bloğa atanır (gelen firma/ekip bloğa sabitlenerek yerleştirilir). Durum gerektirdiğinde (kapasite, karantina) blok değişikliği yapılabilir.
- Karantina modu: tek tuşla oda/koridor karantinaya alınır, yeni atama bloke edilir, ilaçlama iş emri açılır
- **Vardiya:** Sistemde tek vardiya tanımlıdır — 08:00–17:00. `shifts` tablosu ileride ek vardiya tanımlanabilmesi için tutulur ancak şu an tüm personel aynı vardiyadadır.

### 4.3 Çamaşırhane
- Her file QR kodlu; oda oda tarama ile "Kirli - Teslim Alındı" durumuna geçiş
- Makine yükleme: hangi makinaya hangi blok yüklendi kaydedilir
- Akıllı dağıtım rotası: yıkama bitti → fileler blok sırasına göre sıralanmış liste olarak gösterilir (M1→M2→S1→S2→S3); ayrı arabaya blok ataması görevli ekranında
- Hasar/eksik tutanağı: dağıtım sırasında yatağa "Eksik/Hasarlı" notu
- Deterjan stok takibi: her yıkamada gramaj stoktan düşer, eşik altına düşünce sistem bildirimi

### 4.4 Housekeeping
- node-cron ile günlük 4 temizlik görevi otomatik oluşturulur (M blok ortak alanlar: 06:00, 12:00, 18:00, 23:00)
- Görev tamamlama: kapı barkodu okutulur → görev kapanır
- DND modu: gece vardiyasından çıkıp uyuyan personelin odası meydancı tabletinde siyah gösterilir
- S blok bireysel banyolu odalarda günlük temizlik görevi atanır

### 4.5 Teknik Servis
- Self-servis arıza bildirimi: kiosk/QR üzerinden konum + açıklama + fotoğraf
- Depo entegrasyonu: teknik personel malzeme talep eder → stoktan düşer
- Fotoğraflı iş kapama: tamir sonrası fotoğraf yükle → iş emri kapanır
- Önleyici bakım: node-cron ile mevsimsel bakım emirleri otomatik oluşturulur (filtre temizliği, petek havası)

### 4.6 Disiplin Sistemi
- Sarı kart (uyarı) / Kırmızı kart (ağır ihlal) tutanağı
- Personel 3 uyarıya ulaşınca İK'ya otomatik bildirim: "Fesih limiti doldu"
- İhlal sicili kara liste ile entegre: çıkışta "Kara listeye ekle?" seçeneği

### 4.7 Personel Self-Servis
- Tablet kiosk veya şantiye Wi-Fi üzerinden TC numarasıyla giriş → kısa ömürlü (1 saatlik) read-only JWT üretilir, yalnızca self-servis endpoint'lerine erişim izni verir
- Görüntülenebilir bilgiler: çamaşır durumu, vardiya bilgisi, açık arıza kaydı, günlük menü
- Yeni arıza bildirimi açma

### 4.8 Yönetici Kokpiti
- KPI kartları: aktif personel, doluluk %, açık arıza, karantina oda sayısı
- Isı haritası: blok doluluk renk kodlu (yeşil→sarı→turuncu→kırmızı, mavi=karantina)
- Gelecek projeksiyon: ayrılış planına göre boşluk tahmini + yeni gelen yerleştirme
- Kritik uyarılar paneli: gerçek zamanlı

---

## 5. Veritabanı Şeması (12 Tablo)

| Tablo | Amaç |
|---|---|
| `personnel` | Personel kaydı, kara liste bayrağı, disiplin puanı |
| `rooms` | Blok/kat/oda, tavan kapasite, aktif kapasite, durum, kat sorumlusu (user_id) |
| `room_assignments` | Personel-oda eşleşmesi, yatak numarası |
| `shifts` | Personel vardiya bilgisi — `start_hour` ve `end_hour` (0-23 tam sayı), çakışma tespiti bu iki değerin kesişimiyle yapılır |
| `zimmet` | Zimmetlenen malzemeler, dijital imza |
| `laundry_bags` | QR kodlu fileler, durum, makine ataması, hasar notu |
| `machines` | Çamaşır makineleri, durum, aktif blok |
| `maintenance_requests` | Arıza kaydı, durum, fotoğraf, sorumlu |
| `discipline_records` | Sarı/kırmızı kart tutanakları |
| `inventory` | Stok takibi (deterjan, malzeme), eşik uyarısı |
| `cleaning_tasks` | Temizlik görevleri, tamamlama kaydı |
| `notifications` | Sistem bildirimleri, okunma durumu |

**Kritik DB kısıtları:**
- `rooms`: `CHECK(CASE WHEN block='S2' THEN capacity <= 4 ELSE capacity <= 6 END)`
- `rooms`: `active_beds <= capacity` constraint
- `room_assignments`: `UNIQUE(personnel_id) WHERE check_out_at IS NULL` — aynı kişi 2 odada olamaz
- `rooms.status = 'quarantine'` iken atama INSERT trigger ile bloke edilir

---

## 6. Bildirim Sistemi

- **Sistem içi:** `notifications` tablosu; frontend SSE (Server-Sent Events) ile gerçek zamanlı güncelleme — `GET /api/notifications/stream` endpoint'i
- **WhatsApp webhook stub:** `POST /api/notifications/whatsapp` endpoint hazır, gerçek gateway entegrasyonu için yapılandırma değişkeni
- **Otomatik tetikleyiciler:** stok eşiği, disiplin limiti, karantina ilanı, önleyici bakım

---

## 7. Genişletilebilirlik (Çoklu Şantiye)

- Tüm tablolara `site_id` kolonu eklenerek çoklu şantiye desteği aktif edilebilir
- JWT payload'ına `site_id` eklenir, middleware otomatik filtreler
- Şimdilik `site_id = 1` sabit varsayılan

---

## 8. Kapsam Dışı

- Gerçek SMS gateway entegrasyonu
- Mobil native uygulama
- Muhasebe / maaş hesaplama
- Yemek siparişi yönetimi (menü gösterimi var, sipariş yok)
