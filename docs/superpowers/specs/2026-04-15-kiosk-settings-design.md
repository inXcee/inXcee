# Kiosk & Ayarlar Geliştirmesi — Tasarım Dokümanı

**Tarih:** 2026-04-15  
**Kapsam:** Kiosk self-servis (3 → 6 sekme, 3 yeni + 2 genişletilmiş) + Ayarlar e-posta raporları (5 yeni özellik)

---

## 1. Kiosk — Yeni Sekme Yapısı

Mevcut 3 sekme (Bilgilerim, Çamaşır, Arıza Bildir) → 6 sekmeye genişletilir.

### Sekmeler

| # | Sekme | Değişim |
|---|---|---|
| 1 | 👤 Bilgilerim | Mevcut + çıkış tarihi kartı eklenir |
| 2 | 🧺 Çamaşır | Değişmez |
| 3 | 🔧 Arıza | Bildir formu + Takip listesi tek sekmede birleşir |
| 4 | 📢 Duyurular | Yeni — aktif duyurular listesi, okunmamış rozeti |
| 5 | ⚠️ Disiplin | Yeni — kişinin kendi disiplin kayıtları |
| 6 | 💬 Şikayet/Öneri | Yeni — kategori seçimi + mesaj formu |

### Sekme Detayları

**👤 Bilgilerim**
- Mevcut bilgiler korunur (şirket, telefon, giriş tarihi, disiplin puanı)
- Çıkış tarihi kartı eklenir: `expected_departure` alanından okunur, kalan gün hesaplanır
- Kalan gün ≤ 7 ise kart kırmızı/sarı ile vurgulanır

**🔧 Arıza**
- İki alt mod: "Bildir" (mevcut form) ve "Takibim" (kişinin bildirdiği arızalar)
- Takip listesi: konum, açıklama özeti, durum badge'i (bekliyor / devam ediyor / tamamlandı), tarih
- Açık arıza sayısı varsa sekme başlığında `(N)` gösterilir

**📢 Duyurular**
- `expires_at` geçmemiş duyurular gösterilir, tarih sıralı (en yeni üstte)
- Okunmamış duyuru sayısı sekme rozetinde gösterilir (localStorage ile takip)
- Her duyuru: başlık + içerik, tarih

**⚠️ Disiplin**
- Kişinin kendi disiplin kayıtları: tarih, puan, açıklama
- Toplam puan üstte özet olarak gösterilir
- Kayıt yoksa "Temiz sicil" mesajı

**💬 Şikayet/Öneri**
- Tip seçimi: Şikayet / Öneri / Diğer
- Mesaj alanı (min 20 karakter)
- "Anonim gönder" checkbox — işaretlenirse `personnel_id` kaydedilmez
- Gönderim sonrası onay mesajı

---

## 2. Backend — Kiosk Eklemeleri

### Yeni Tablolar

```sql
-- Duyurular
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT  -- NULL = süresi yok
);

-- Şikayet/Öneri
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER REFERENCES personnel(id),  -- NULL = anonim
  type TEXT NOT NULL CHECK(type IN ('complaint','suggestion','other')),
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Mevcut Tablo Değişiklikleri

- `personnel` tablosuna `expected_departure TEXT` kolonu eklenir (migration ile)

### Yeni Endpoint'ler (`/self-service`)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/my-info` | Mevcut + `expected_departure` alanı eklenir |
| GET | `/my-maintenance` | Kişinin bildirdiği arızalar (son 20) — `maintenance_requests.reporter_personnel_id` üzerinden sorgulanır; mevcut `reporter_user_id` korunur, yeni kolon migration'da eklenir |
| GET | `/my-discipline` | Kişinin disiplin kayıtları |
| GET | `/announcements` | Aktif duyurular (expires_at kontrolü) |
| POST | `/feedback` | Şikayet/öneri kaydet |

### Admin Endpoint'leri (`/api/announcements`)

Ayrı router, `/api/announcements` prefix'inde mount edilir.

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET | `/` | campus_manager | Tüm duyurular (süresi dolmuşlar dahil) |
| POST | `/` | campus_manager | Yeni duyuru oluştur |
| DELETE | `/:id` | campus_manager | Duyuru sil |

---

## 3. Ayarlar Sayfası — Yeni Düzen

Tek sayfa, aşağı kaydırmalı, 6 bölüm.

### Bölümler

**Bölüm 1 — Zamanlama** (mevcut, değişmez)
- Aktif/kapalı toggle, saat (0-23), dakika (0/15/30/45), CC adresi

**Bölüm 2 — Gün Seçimi**
- Pzt–Paz toggle butonları (hafta içi varsayılan seçili)
- En az 1 gün seçili olmalı

**Bölüm 3 — Rapor Bölümleri**
- Toggle butonlar: Doluluk · Temizlik · Arıza · Çamaşır · Giriş/Çıkış
- Seçilmeyen bölümler e-posta HTML'inden çıkarılır

**Bölüm 4 — SMTP Ayarları**
- Alanlar: Host, Port, Kullanıcı, Şifre (masked, değiştirilince gönderilir), From adresi
- Kaydedilince `system_settings`'e yazılır
- `createTransport()`: DB ayarları varsa öncelikli, yoksa `.env` fallback

**Bölüm 5 — Önizleme**
- "Önizle" butonu → `GET /settings/email/preview` çağrısı → iframe içinde gösterir
- `buildReportHtml()` aktif bölüm seçimine göre render eder

**Bölüm 6 — Gönderim Geçmişi**
- Son 30 kayıt: tarih, alıcılar, durum (başarılı/hata), hata mesajı
- Her gönderimde (başarılı veya hatalı) `email_log` tablosuna kayıt düşülür

---

## 4. Backend — Ayarlar Eklemeleri

### Yeni Tablo

```sql
CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at TEXT DEFAULT (datetime('now')),
  recipients TEXT NOT NULL,  -- virgülle ayrılmış
  status TEXT NOT NULL CHECK(status IN ('success','error')),
  error_msg TEXT
);
```

### Yeni system_settings Anahtarları

| Anahtar | Varsayılan | Açıklama |
|---|---|---|
| `email_days` | `1,2,3,4,5` | Gönderilecek gün indeksleri (JS `getDay()` convention: 0=Pazar, varsayılan = hafta içi) |
| `email_sections` | `occupancy,housekeeping,maintenance,laundry,checkinout` | Dahil edilecek bölümler |
| `smtp_host` | — | DB SMTP host (boşsa .env kullanılır) |
| `smtp_port` | — | DB SMTP port |
| `smtp_user` | — | DB SMTP kullanıcı |
| `smtp_pass` | — | DB SMTP şifre |
| `smtp_from` | — | DB From adresi |

### Yeni / Değişen Endpoint'ler (`/settings/email`)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/` | Mevcut + `days`, `sections`, smtp alanları eklenir |
| PUT | `/` | Mevcut + `days`, `sections`, smtp alanları kabul eder |
| GET | `/preview` | Güncel rapor HTML'ini döner |
| GET | `/log` | Son 30 gönderim kaydı |
| POST | `/test` | Mevcut — log kaydı da düşer |

---

## 5. Frontend — Dosya Değişiklikleri

| Dosya | Değişim |
|---|---|
| `frontend/src/modules/self-service/SelfServicePage.jsx` | 6 sekme, 3 yeni sekme içeriği eklenir |
| `frontend/src/modules/admin/SettingsPage.jsx` | 5 yeni bölüm eklenir |
| `frontend/src/modules/admin/AuditPage.jsx` veya yeni `AnnouncementsPage.jsx` | Duyuru yönetim arayüzü |

---

## 6. Uygulama Sırası (Fazlar)

1. **Faz 1** — DB migration: `announcements`, `feedback`, `email_log` tabloları + `personnel.expected_departure` kolonu
2. **Faz 2** — Backend kiosk endpoint'leri (my-maintenance, my-discipline, announcements, feedback)
3. **Faz 3** — Frontend kiosk sekmeleri (Arıza birleşimi, Duyurular, Disiplin, Şikayet)
4. **Faz 4** — Backend ayarlar (gün/bölüm seçimi, SMTP DB, preview endpoint, email_log)
5. **Faz 5** — Frontend ayarlar sayfası yenileme (6 bölüm)
6. **Faz 6** — Admin duyuru yönetimi (panel + CRUD)
