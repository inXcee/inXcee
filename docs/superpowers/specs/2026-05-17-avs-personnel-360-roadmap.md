# AVS Personel-Merkezli Geliştirme Yol Haritası — 2026-05-17

## Bağlam

Sistem 36 backend + 34 frontend modüle ulaştı (her şey production'da, `avskamp.com`). Bu noktadan sonra **tüm geliştirme AVS personelinin etrafında dönmeli** — yani uygulamadaki her veri/akış, sonunda "bu kişi için ne anlama geliyor?" sorusuna cevap vermeli.

Bu yol haritası 12 tema, 67 maddelik bir A-Z analizdir. Her tema bağımsızdır; istediğin sırada uygulanabilir.

---

## TEMA 1 — Personnel 360° (kişi-merkezli sayfa)

> Şu an: 30 modülde personel bilgisi var ama tek bir kişiye tıkladığında hepsini birlikte göremiyorsun. Dağınık.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| P1 | `/personnel/:id` tam ekran 360° sayfa — kimlik, foto, oda, vardiya, transport, çamaşır, bakım, disiplin, izin, mesai, gider, zimmet tek sayfada | M | 🔴 KRİTİK |
| P2 | Personnel timeline — son 90 gün tüm olaylar kronolojik (giriş, vardiya kaydı, bakım talebi, çamaşır, disiplin) | S | 🟡 |
| P3 | Acil iletişim: birden çok kişi (eş, anne-baba, kardeş) — `emergency_contacts` ayrı tablo | S | 🟡 |
| P4 | Personel foto galerisi — kimlik, sağlık raporu, sertifika, sözleşme PDF/JPG (documents'a bağlı zaten, kişi sayfasından erişim) | S | 🟢 |
| P5 | "Aktif değil" personeli arşive taşıma — çıkmış kişi liste karışıklığını engelle | XS | 🟢 |
| P6 | Personel notları — yöneticinin özel not alabileceği serbest alan + tarihli | XS | 🟢 |
| P7 | Personel grupları (departman dışı) — proje ekibi, A vardiyası, vb. esnek etiketler | M | 🟢 |

---

## TEMA 2 — Vardiya Sistemini Derinleştirme

> Şu an: Puantaj B1/B2, leave_requests, overtime var ama vardiya değişim talebi yok, çakışma kontrolü zayıf, tatil tablosu yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| V1 | Vardiya çakışma kontrolü — aynı kişi aynı günde 2 vardiya yazılırsa engelle (DB CHECK + UI uyarı) | S | 🔴 |
| V2 | Vardiya değişim talebi — A kişisi B kişisine "değişelim mi?" → onay akışı | M | 🟡 |
| V3 | Resmi tatil tablosu — `holidays` (date, name, multiplier=2) + tatilde otomatik mesai hesaplama | S | 🟡 |
| V4 | Nöbet / on-call atama — vardiya değil ama "aranabilir" durumu | S | 🟢 |
| V5 | Vardiya devir teslim notu — vardiya kapandığında sonraki vardiyaya not bırakma | S | 🟢 |
| V6 | Vardiya planlama önerisi — son 4 hafta deseninden bu hafta için otomatik öneri | L | 🟢 |
| V7 | Bordro export — vardiya + mesai + izin → Excel/PDF (kişi başı aylık) | M | 🟡 |
| V8 | Birleşik devamsızlık raporu — vardiya `status=absent` + transport `boarded=0` aynı tabloda | S | 🟡 |

---

## TEMA 3 — İş Güvenliği & Eğitim

> Şu an: drills modülü var (tatbikat) ama eğitim/sertifika/KKD takibi yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| IG1 | Eğitim takvimi — yangın, ilk yardım, iş güvenliği, çevre eğitimleri (planlama + katılım) | M | 🔴 |
| IG2 | Sertifika takibi — sertifika tipi + verme/bitiş tarihi + 30 gün önce alarm | S | 🟡 |
| IG3 | KKD zimmet — baret, gözlük, eldiven, ayakkabı; teslim tarihi + iade | M | 🟡 |
| IG4 | İş kazası kayıt — tarih, yer, şahit, ciddiyet, eylem | S | 🟡 |
| IG5 | Tatbikat → personel katılım eşleştirme (drills modülü var ama personel listesi entegre değil) | XS | 🟢 |

---

## TEMA 4 — HR / İşe Giriş-Çıkış Akışı

> Şu an: checkin/checkout var ama "işe giriş checklist" ve "ayrılma ibra" akışı yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| HR1 | İşe giriş checklist — sözleşme imza, sağlık raporu, eğitim, oda atama, KKD zimmet (her adım toggle) | M | 🔴 |
| HR2 | Çıkış checklist + ibra PDF — zimmet iade, oda boşaltma, son maaş, KVKK silme, imzalı PDF | M | 🔴 |
| HR3 | Sözleşme yenileme uyarısı — companies.contract_end yanına `personnel.contract_end` da, 30g önce alarm | S | 🟡 |
| HR4 | Periyodik sağlık raporu — son rapor tarihi + 6 ay/1 yıl alarm | S | 🟡 |
| HR5 | İzin onay akışı genişletme — şu an tek admin onay, manager→supervisor→admin imzalama | M | 🟢 |

---

## TEMA 5 — Yemekhane Modülü (YENİ)

> Şu an: yok. AVS personel günde 3 öğün yer — kim ne yedi, maliyet kişi başı?

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| YM1 | Öğün okutma — QR ile kahvaltı/öğle/akşam (sayım için, ödeme değil) | M | 🟡 |
| YM2 | Diyet/alerji bilgisi — kişide flag (vejetaryen, glutensiz, fıstık alerjisi) | XS | 🟢 |
| YM3 | Yemek talep tahmini — yarın için kişi sayısı, mutfak kapasiteye bakar | S | 🟡 |
| YM4 | Maliyet kişi başı — yemek + oda + servis = ay sonu cost report | M | 🟢 |

---

## TEMA 6 — Mobile Self-Service Genişleme

> Şu an: kiosk modülü, mobile-auth, self-service backend var ama personel kendi profilini mobile'da göremiyor.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| M1 | `/my-profile` — kişi kendi 360°'unu görür (kimlik, oda, vardiya, çamaşır, bakım, disiplin) | M | 🔴 |
| M2 | `/my-shifts` — bu hafta ve sonraki haftanın vardiyası, tatil/izin günleri | S | 🔴 |
| M3 | `/my-transport` — bugünkü servisim (rota, durak, saat, şoför ad+tel) | S | 🔴 |
| M4 | `/my-laundry` — çamaşır torbalarımın durumu | S | 🟡 |
| M5 | `/my-payslip` — son 3 ay bordrom | M | 🟢 |
| M6 | Mobile'dan izin talebi — form + sebep + tarih, push bildirim manager'a | S | 🟡 |
| M7 | Mobile'dan vardiya değişim talebi (V2 ile birleşik) | S | 🟢 |
| M8 | Push notification — kritik olaylar (oda değişti, vardiya değişti, sertifika bitiyor) | M | 🟡 |

---

## TEMA 7 — Bordro & Mali

> Şu an: salary kolonu var ama mesai/kesinti/kesinti hesaplama yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| B1 | Vardiya → puantaj çıkışı (kim kaç saat çalıştı) — `attendance_logs` üzerinden hesaplama | M | 🟡 |
| B2 | Mesai hesaplama 1.5x/2x — `overtime_records` zaten var, hesaplama UI ekle | S | 🟡 |
| B3 | Kesinti yönetimi — hasar, disiplin, geç gelme → ay sonu otomatik kesinti | M | 🟢 |
| B4 | Aylık bordro export Excel — her personel için satır (gün, saat, mesai, kesinti, net) | M | 🟡 |
| B5 | SGK gün sayısı hesabı — vardiya günlerinden otomatik | S | 🟢 |

---

## TEMA 8 — Performans & Değerlendirme

> Şu an: discipline var ama olumlu değerlendirme yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| PE1 | Yıllık değerlendirme formu — 5 puan üzerinden 8 kriter (verimlilik, takım, devamsızlık, vb.) | M | 🟢 |
| PE2 | Hedef takibi — kişi/ekip hedefleri (Q1, Q2 vb.) | M | 🟢 |
| PE3 | Pozitif puan (disiplin dengeleyici) — iyi davranış da kaydedilsin | S | 🟢 |
| PE4 | Çalışan oylama (peer) — anonim ay sonu değerlendirme | M | 🟢 |

---

## TEMA 9 — QR/Kart Sistemi (BÜYÜK KAZANIM)

> Şu an: kiosk_pin var, QR yok. QR ile **5 modülün manuel adımları otomatikleşir**.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| Q1 | Her personele unique QR kod (4 basamaklı PIN'in yanına) | XS | 🔴 |
| Q2 | QR yazıcı butonu — kart formatında PDF (ad, foto, QR, departman) | S | 🔴 |
| Q3 | Yemekhane okutma — QR scan → öğün kayıt (YM1 ile birleşik) | M | 🟡 |
| Q4 | Servis biniş okutma — QR scan → boarded=1 otomatik (Faz 6'yı tamamlar) | M | 🟡 |
| Q5 | Zimmet teslim okutma — envantere QR (kişi QR + ürün QR) | M | 🟢 |
| Q6 | Mobile'da kendi QR kart (M1 ile birleşik) — fiziksel kart kaybedilse de mobile'da | XS | 🟢 |

---

## TEMA 10 — İletişim & Bildirim

> Şu an: SSE, WhatsApp tek yön, notification_groups var. Push yok, SMS yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| IB1 | WhatsApp 2 yönlü — gelen mesaj parse → otomatik bakım talebi/komut | L | 🟢 |
| IB2 | SMS entegrasyonu (Netgsm/Twilio) — kritik bildirim (oda değişti, acil) | M | 🟡 |
| IB3 | Web Push notification — service worker üzerinden anlık bildirim | M | 🟡 |
| IB4 | Toplu duyuru gönderim — bir gruba bir tıkla SMS+WA+push | S | 🟢 |
| IB5 | Anket gönderim hatırlatması — survey aylık otomatik gönderim cron | XS | 🟢 |

---

## TEMA 11 — Raporlama & Analiz Derinleşmesi

> Şu an: 6+ rapor var ama personel-merkezli karşılaştırma yok.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| R1 | Personel devamsızlık dashboardu — vardiya + transport + disiplin birleşik | S | 🟡 |
| R2 | Maliyet kişi başı — oda + servis + yemek + KKD + zimmet | M | 🟡 |
| R3 | Karşılaştırma raporu — bu ay vs geçen ay (her metrik) | S | 🟢 |
| R4 | Özel rapor builder (drag-drop kolon seç) | L | 🟢 |
| R5 | "Risk listesi" — devamsızlık çok + disiplin çok + sözleşme bitiyor → tek liste | S | 🔴 |

---

## TEMA 12 — Sistem Sağlamlığı

> Şu an: backup, audit, error-log, kvkk var. Veri bütünlüğü kontrolleri eksik.

| # | Madde | Çaba | Değer |
|---|-------|------|-------|
| S1 | Tutarsızlık taraması — çıkmış kişinin hala odası, çamaşırı, vardiyası varsa uyar | S | 🟡 |
| S2 | KVKK V2 — kişi "verimi sil" talebi flow + onay + 6 aylık bekleme | M | 🟢 |
| S3 | Audit dashboardu zenginleştirme — kim ne zaman ne yaptı (filtre + drill-down) | S | 🟢 |
| S4 | Backup restore test scripti — `restore-test.sh` yedekten geri yükleme prova | S | 🟡 |
| S5 | T2 migration sistemi (Knex/Drizzle) — şu an 526 satır manuel try-catch | L | 🟢 |
| S6 | T1 LaundryHub split — 85KB monolith parçala | M | 🟢 |
| S7 | Frontend test coverage genişletme | L | 🟢 |

---

## Önerilen 6 Hafta Yol Haritası (en yüksek değer önce)

### Hafta 1 — Personnel 360° Temeli
- P1 (360° sayfa) + P5 (arşiv) + P6 (notlar) + R5 (risk listesi)
- **Çıktı:** her personele tıklanınca tüm yaşam döngüsü görünür

### Hafta 2 — Mobile Self-Service
- M1 (my-profile) + M2 (my-shifts) + M3 (my-transport)
- **Çıktı:** personel mobile'dan kendi durumunu görür, sahaya çıkmak için adminle konuşmaya gerek yok

### Hafta 3 — İşe Giriş/Çıkış Otomasyonu
- HR1 (giriş checklist) + HR2 (çıkış + ibra PDF) + HR3 (sözleşme alarm)
- **Çıktı:** yeni personel adımları kaçırmıyor, ayrılan personel arkada veri bırakmıyor

### Hafta 4 — Vardiya Olgunlaşması
- V1 (çakışma) + V3 (tatil) + V7 (bordro export) + V8 (birleşik devamsızlık)
- **Çıktı:** vardiya sistemi gerçek bordro/SGK ihtiyacını karşılar

### Hafta 5 — QR Sistemi
- Q1 (QR üret) + Q2 (kart PDF) + Q4 (servis okutma) + Q6 (mobile QR)
- **Çıktı:** servis devamsızlığı manuel değil otomatik, kart sistemiyle fiziksel doğrulama

### Hafta 6 — İş Güvenliği
- IG1 (eğitim takvimi) + IG2 (sertifika alarm) + IG3 (KKD zimmet)
- **Çıktı:** denetimde "kim hangi eğitime katıldı" sorusuna cevap; KKD kayıpları engellenir

---

## Bekleyen / Yapılmaması Gerekenler (öneri)

- **Tema 7 Bordro tam paketi**: Türkiye'de bordro çok karışık (SGK, vergi dilimi, AGİ); muhasebe yazılımına entegre olmadan tam çözüm zor. **B4 bordro export + Logo/Mikro entegrasyonu** daha gerçekçi.
- **Tema 10 IB1 WhatsApp 2-yön**: WhatsApp Business API ücretli + maliyet. SSS otomasyon için zaman maliyeti yüksek.
- **PE4 peer oylama**: küçük ekipte (50-100 kişi) anonimlik zor; sosyal sürtüşme riski.

---

## DB ve Mimari Etkisi

Yeni tablolar (toplam ~10):
- `emergency_contacts` (P3)
- `holidays` (V3)
- `staff_training_records` (IG1, IG2)
- `kkd_assignments` (IG3)
- `work_accidents` (IG4)
- `onboarding_checklists` + `offboarding_checklists` (HR1, HR2)
- `meals` veya `meal_logs` (YM1)
- `qr_codes` (Q1)
- `staff_tags` veya `staff_groups` (P7)
- `performance_evaluations` (PE1)

Yeni endpoint hacmi: ~80-100
Frontend yeni sayfa: ~12-15
Test eklenmeli: her tema için en az 4-6 test

---

## Karar İçin Sorular

1. **Bu yol haritasının kapsamı sana mantıklı geliyor mu?** Eklenmeli/çıkartılmalı tema var mı?
2. **Hangi 3 maddeyi öncelikle yapalım?** (en üst P1, M1, Q1 önerim ama sen seçersin)
3. **Bordro işine girelim mi (B1-B5)?** — Logo/Mikro/Netsis gibi muhasebe yazılımı kullanıyor musunuz? Entegrasyon noktası belirler.
4. **Mobile uygulamayı Capacitor ile native'e geçirelim mi?** Şu an PWA, App Store / Play yok.
