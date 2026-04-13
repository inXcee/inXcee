# Otomatik E-posta Raporu — Tasarım Dokümanı

**Tarih:** 2026-04-13  
**Kapsam:** Sabah raporu e-posta gönderimi — cron tabanlı, DB ayarlı, HTML içerikli

---

## Genel Bakış

Her sabah belirlenen saatte `campus_manager` rolündeki kullanıcılara ve sabit CC adresine otomatik HTML e-posta gönderilir. Gönderim saati ve alıcı adresi admin panelinden ayarlanabilir. SMTP kimlik bilgileri `.env`'de tutulur.

---

## 1. Veritabanı — `system_settings`

Yeni tablo: key-value store (tüm sistem ayarları için genel kullanım).

```sql
CREATE TABLE system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

E-posta ile ilgili başlangıç ayarları (seed ile eklenir):

| key | varsayılan değer |
|-----|-----------------|
| `email_enabled` | `false` |
| `email_hour` | `7` |
| `email_minute` | `0` |
| `email_cc` | `` (boş) |

SMTP ayarları `.env`'de tutulur (UI'a çıkmaz):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

---

## 2. Backend — `email` Modülü

### Dosya yapısı

```
backend/src/modules/email/
  queries.js    — system_settings CRUD
  service.js    — nodemailer transport + HTML builder + sendMorningReport()
  routes.js     — GET/PUT /api/settings/email, POST /api/settings/email/test
```

### Endpoint'ler

| Method | Path | Erişim | Açıklama |
|--------|------|--------|----------|
| GET | `/api/settings/email` | campus_manager | Mevcut ayarları döndür |
| PUT | `/api/settings/email` | campus_manager | Ayarları güncelle + cron'u yeniden planla |
| POST | `/api/settings/email/test` | campus_manager | Anında test maili gönder |

### `queries.js`

```js
getSetting(key)            // tek ayar oku
setSetting(key, value)     // upsert
getEmailSettings()         // { enabled, hour, minute, cc }
setEmailSettings({ hour, minute, cc, enabled })
getManagerEmails()         // campus_manager rolündeki tüm kullanıcıların e-mail adresi
```

`users` tablosunda `email` kolonu olmadığından bu kolonu `migration`'da ekle.

### `service.js`

- `createTransport()` — `.env` değerlerinden nodemailer transport
- `buildReportHtml()` — mevcut reports service fonksiyonlarını çağırır, 6 bölümlü HTML döndürür:
  1. KPI özeti (doluluk %, açık arıza, karantina oda)
  2. Doluluk tablosu (blok bazlı)
  3. Temizlik özeti (bugünün görevleri)
  4. Bakım/arıza özeti (açık + SLA ihlalleri)
  5. Giriş/çıkış (bugün beklenen)
  6. Çamaşırhane özeti (bekleyen + teslim edilen)
- `sendMorningReport()` — ayarları DB'den okur, alıcıları toplar, mail gönderir

### `routes.js`

PUT ayar güncellerken `scheduleMorningReport()` fonksiyonunu çağırarak cron'u yeniden planlar.

---

## 3. Cron Entegrasyonu

`cron/index.js`'e dinamik e-posta işi eklenir:

```js
let emailJob = null

export function scheduleMorningReport() {
  if (emailJob) { emailJob.stop(); emailJob = null }
  const { enabled, hour, minute } = getEmailSettings()
  if (!enabled) return
  emailJob = cron.schedule(`${minute} ${hour} * * *`, () => {
    sendMorningReport().catch(e => console.error('[Cron] Email hatası:', e))
  })
}
```

`startCronJobs()` içinde `scheduleMorningReport()` çağrılır. Ayar değiştiğinde PUT endpoint'i de çağırır.

---

## 4. Frontend — `SettingsPage.jsx`

Yeni sayfa: `frontend/src/modules/admin/SettingsPage.jsx`  
Route: `/admin/settings` (sadece `campus_manager` erişir)

### Form alanları

- **E-posta Raporu Aktif** — toggle switch (`enabled`)
- **Gönderim Saati** — saat (0-23) + dakika (0/15/30/45) seçici
- **CC Adresi** — text input (opsiyonel)
- **Kaydet** butonu
- **Test Gönder** butonu — POST `/api/settings/email/test`, başarıda toast

### Navigasyon

Sidebar'a `campus_manager` için "Ayarlar" linki eklenir (Audit sayfasının altına).

---

## 5. `users` Tablosu — `email` Kolonu

Mevcut `users` tablosuna `email TEXT` kolonu eklenir (migration). Seed verisinde örnek e-postalar eklenir. `UsersPage.jsx`'e e-posta alanı eklenir (kullanıcı oluştururken/düzenlerken).

---

## 6. Test Kapsamı

`backend/src/modules/email/email.test.js`:
- `getSetting` / `setSetting` doğru çalışıyor mu
- `getEmailSettings` varsayılan değerleri döndürüyor mu
- `buildReportHtml()` string döndürüyor, 6 bölüm var mı
- `GET /api/settings/email` → 200, doğru alanlar
- `PUT /api/settings/email` → 200, DB güncellendi mi
- `POST /api/settings/email/test` → SMTP mock ile 200

---

## Kapsam Dışı

- E-posta şablonu özelleştirme (logo, renk seçimi)
- Kullanıcı başına ayrı abonelik tercihi
- Bounce/delivery tracking
