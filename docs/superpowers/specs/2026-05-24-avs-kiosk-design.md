# AVS Personel Kiosk — Tasarım Spesifikasyonu

**Tarih:** 2026-05-24
**Durum:** Brainstorm onaylı, plan yazımı bekleniyor
**Kapsam:** Standart MVP — 6 sekmeli web kiosk, sıfırdan yeni route

## Motivasyon

Sakin (personnel) için `/kiosk` (SelfServicePage) zaten mevcut. AVS personeli (staff — temizlik, çamaşır, teknik, güvenlik, mutfak, idari, bahçe, sağlık) için **dar kapsamlı `/laundry-kiosk`** var (sadece çamaşır işleme). Çalışanların kiosk terminalinden vardiyalarını, servislerini, görevlerini görmesi ve hızlıca arıza bildirmesi için **genel amaçlı AVS kiosk** lazım.

## Hedefler

- AVS personelinin shared bir kiosk terminalinden 4 haneli PIN ile giriş yapıp kendine ait bilgileri görmesi
- Hızlı arıza bildirimi (mevcut `maintenance_requests` akışına bağlanır)
- Profil düzeyinde PIN değişimi (admin yardımı gerektirmeden)
- Kiosk güvenliği: 5 dakika inaktivite sonrası otomatik logout

## Out of Scope

- Devam (clock-in/out) tuşu — ileride ayrı çalışma
- İzin talebi formu — ileride
- Bordro/dökümanlar — ileride
- Performans/disiplin kişisel görüntüleme — ileride
- Push notification — kiosk shared terminal, mantıksız
- Mobil push entegrasyonu — AVS workers'ın mobil app'i ayrı (`/mobile/*` route'ları altında)

## Mimari

Mevcut iki kiosk pattern'i ile birebir paralel:

```
frontend/src/modules/
├── self-service/SelfServicePage.jsx      # Mevcut sakin kiosk
├── laundry-kiosk/LaundryKioskPage.jsx    # Mevcut AVS çamaşır kiosk
└── avs-self-service/AvsSelfServicePage.jsx  # YENİ — AVS genel kiosk

backend/src/modules/
├── self-service/                          # Mevcut sakin endpoint'leri
└── avs-self-service/                      # YENİ
    ├── routes.js
    ├── queries.js
    └── avs-self-service.test.js
```

**Route mount (`backend/src/app.js`):**
```js
app.use('/api/avs-self-service', readLimiter, avsSelfServiceRouter)
```

**Frontend route (`frontend/src/App.jsx`):**
```jsx
<Route path="/avs-kiosk" element={<AvsSelfServicePage />} />
```

Layout dışı (standalone) — sidebar yok, login öncesi de açık. Aynı `/kiosk` ve `/laundry-kiosk` gibi.

**Sidebar entry (`frontend/src/shared/components/Sidebar.jsx`):**
YONETIM grubunda mevcut "Personel Kiosk" ve "Camasir Kiosk" satırlarının altına:
```js
{ to: '/avs-kiosk', icon: '👷', label: 'AVS Kiosk', roles: ['campus_manager'], external: true },
```

## Auth — mevcut altyapıyı kullan

Backend tarafında AVS auth **tamamen hazır:**
- `POST /api/auth/avs-search` — query string `q`, name autocomplete (pinLimiter ile)
- `POST /api/auth/avs-login` — `{ worker_id, pin }` → JWT (`role: 'avs_kiosk'`, 4h expiry, PIN lockout dahil)
- Middleware: `requireAvsKiosk` (middleware.js:50) — Bearer token doğrular, `role === 'avs_kiosk'` kontrol eder, `req.user` set eder

Yeni AVS kiosk frontend bu mevcut endpoint'leri çağıracak. Yeni auth kodu yazılmayacak.

**JWT payload (mevcut):** `{ workerId, role: 'avs_kiosk', full_name }`

## Login akışı (frontend)

Mevcut `SelfServicePage`'in "isimle giriş" modu ile birebir paralel:

1. Liste görünmez ekran — LanguageSwitcher (TR/EN/AR), başlık ("AVS Kiosk")
2. İsim input (≥2 karakter → debounced 300ms → `GET /api/auth/avs-search?q=...`)
3. Sonuç listesinden seçim; `has_pin` false olanlar disabled + "PIN tanımsız" etiketi
4. PIN input (4 haneli, numerik klavye `inputMode="numeric"`, masked)
5. Submit → `POST /api/auth/avs-login` → JWT React state'inde tutulur (localStorage **yok**)
6. Hata mesajları kullanıcıya gösterilir (TR/EN/AR çevirisi i18n dict'te)

**i18n key prefix:** `avs_kiosk.*` (dict.js'e yeni grup eklenir, mevcut `kiosk.*` ile paralel)

## Auto-logout (yeni davranış)

Login sonrası `useIdleTimeout` hook'unu kullan:
```js
useIdleTimeout({
  timeoutMs: 5 * 60 * 1000,        // 5 dakika
  warnBeforeMs: 30 * 1000,         // Son 30sn'de uyarı toast'u
  token: avsToken,
  onLogout: () => setAvsToken(null),
})
```

Mevcut hook `mobile-shared` modülünde kullanılıyor; signature aynı. Side-effect: warnBeforeMs içinde toast — "Otomatik çıkış 30 saniye sonra".

## Sekmeler — 6 adet

Tab nav: yatay flex (mobile-friendly), aktif tab badge'leri. Sakin kiosk'taki `TAB_KEYS` array pattern'i kopyalanır.

### 1. Vardiyam
**Endpoint:** `GET /api/avs-self-service/my-shifts`
**SQL:**
```sql
SELECT ss.work_date, ss.status, sd.name as shift_name,
       sd.start_time, sd.end_time
FROM shift_schedule ss
LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
WHERE ss.staff_id = ?
  AND ss.work_date >= date('now')
  AND ss.work_date <= date('now', '+7 days')
ORDER BY ss.work_date
```
**UI:** 7 günlük liste, her kart: tarih + gün adı + vardiya adı + saat aralığı + status badge (scheduled/worked/absent/on_leave/overtime).

### 2. Servisim
**Endpoint:** `GET /api/avs-self-service/my-transport`
**SQL:**
```sql
SELECT pp.name, pp.district, pp.neighborhood, pp.notes, pp.lat, pp.lng,
       s.role_label, d.name as dept_name
FROM staff s
LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
LEFT JOIN departments d ON d.id = s.department_id
WHERE s.id = ?
```
**UI:** Tek kart — durak adı, ilçe/mahalle, notlar. Eğer `pickup_point_id` null ise: "Servis atanmamış. Yöneticiye başvur." mesajı.

### 3. Görevlerim (role-dispatched)
**Endpoint:** `GET /api/avs-self-service/my-tasks`

Backend `req.user.workerId` ile staff'ı çek, `role_label` veya `dept_id`'ye göre dispatch et:

| Role / Dept | Görev kaynağı | SQL özet |
|---|---|---|
| Housekeeping (dept_id=2) | Bugünün housekeeping task'ları | Mevcut `housekeeping_tasks` tablosundan staff_id eşleşenler (kolon adını implementation planında doğrula) |
| Teknik (dept_id=5) | Açık maintenance request'ler | `maintenance_requests WHERE assigned_to = ? AND status NOT IN ('done')` |
| Çamaşır (dept_id=8) | "Çamaşır kiosk'unda işle" yönlendirme kartı | Endpoint boş `[]` döner + UI button → `/laundry-kiosk` |
| Diğer | Boş array | UI: "Bu role için tanımlı görev yok" |

Endpoint response shape: `{ type: 'housekeeping'\|'maintenance'\|'laundry'\|'none', items: [] }`. UI type'a göre uygun kart render eder.

**Not:** Tablo şemalarının net görülmesi için implementation plan'da `housekeeping_tasks` ve `maintenance_requests` join'leri doğrulanacak. Bilinmeyen alan varsa o role için MVP'de "yakında" placeholder göster.

### 4. Duyurular
**Endpoint:** `GET /api/avs-self-service/announcements`
**SQL:**
```sql
SELECT id, title, body, created_at
FROM announcements
WHERE (expires_at IS NULL OR expires_at > datetime('now'))
ORDER BY created_at DESC
LIMIT 30
```
**UI:** Sakin kiosk'taki announcements UI'sini birebir kopyala — okundu state'i localStorage'da (`avs_kiosk_read_ann`), tab badge unread sayısı. Şu an `target_role` filtresi yok (announcements tablosunda yok); tüm aktif duyurular her iki kioska da çıkar.

### 5. Hızlı Arıza
**Endpoint:** `POST /api/avs-self-service/maintenance`
**Body:** `{ location, description, priority? }` (priority default 'medium')
**Backend:**
```sql
INSERT INTO maintenance_requests(
  location, description, status, priority,
  reporter_personnel_id, reporter_user_id, opened_at
) VALUES (?, ?, 'open', ?, NULL, NULL, datetime('now'))
```
Reporter kolonu için yeni alan eklemiyoruz — kim oluşturdu bilgisi `audit_log`'a düşer (avs_kiosk action olarak). Tag/source kolonu zaten yoksa basit tutalım.
**UI:** Form (lokasyon, açıklama, opsiyonel öncelik radio); submit sonrası başarı toast'u + form reset; "Mevcut taleplerim" linki yok (MVP dışı — sonra ekleriz).

### 6. Profil
**Endpoint'ler:**
- Bilgi: `GET /api/avs-self-service/my-info`
- PIN değiş: `POST /api/avs-self-service/change-pin` body `{ current_pin, new_pin }`

**my-info SQL:**
```sql
SELECT s.full_name, s.role_label, s.phone,
       d.name as department_name,
       pp.name as pickup_name
FROM staff s
LEFT JOIN departments d ON d.id = s.department_id
LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
WHERE s.id = ?
```

**change-pin:** bcrypt ile `current_pin` doğrula → `new_pin` 4 haneli sayı validasyonu → `kiosk_pin` güncelle, `audit_log`'a `pin_change_self` action yaz.

**UI:** Kişisel bilgi kartı (sadece görüntüleme — değişmek için yöneticiye başvurun mesajı) + PIN değiştir formu (eski PIN, yeni PIN, yeni PIN tekrar) + submit.

## Tests

Her endpoint için **vitest** spec, `backend/src/modules/self-service/self-service.test.js` pattern'ini takip et:

```js
describe('AVS Self-Service endpoints', () => {
  let avsToken
  beforeAll(async () => {
    // admin login → avs-workers POST → set PIN → avs-login → avsToken
  })

  it('GET /my-info AVS token olmadan 401', async () => { ... })
  it('GET /my-info döner', async () => { ... })
  it('GET /my-shifts döner', async () => { ... })
  it('POST /maintenance request oluşturur', async () => { ... })
  it('POST /change-pin doğru eski PIN ile çalışır', async () => { ... })
  it('POST /change-pin yanlış eski PIN ile 401', async () => { ... })
  it('GET /my-tasks role dispatch çalışır', async () => { ... })
})
```

Hedef: en az 7 test, kapsama %80+.

## Internationalization

`frontend/src/shared/i18n/dict.js`'e yeni grup `avs_kiosk.*` ekle. Mevcut `kiosk.*` grubunu reference al. TR/EN/AR çevirileri — başlangıçta TR komplet, EN/AR string-string TR'ye fallback (eksikse t() key'i döner, OK).

İlk pass için en az şu key'ler: `avs_kiosk.title`, `avs_kiosk.name_search`, `avs_kiosk.pin`, `avs_kiosk.login_button`, `avs_kiosk.logout`, `avs_kiosk.idle_warning`, `avs_kiosk.tabs.{shifts,transport,tasks,announcements,quick_fault,profile}`, ve her tab'ın iç string'leri.

## Veri akışı diyagramı

```
[Kiosk terminal browser]
  → GET /api/auth/avs-search?q=ali     (PIN limiter)
  → POST /api/auth/avs-login            (PIN limiter, returns JWT 4h)
  → setAvsToken(jwt) — React state only

[6 tab içeriği]
  → fetch(`/api/avs-self-service/<endpoint>`, { Authorization: Bearer <jwt> })
  → backend requireAvsKiosk middleware → req.user.workerId
  → SQL query filtered by workerId
  → JSON response

[useIdleTimeout]
  → 4.5dk hareketsiz → toast warn
  → 5dk hareketsiz → setAvsToken(null) → login ekranına döner
```

## Risk ve dikkat noktaları

- **Görevlerim role-dispatch**: housekeeping_tasks tablosunda staff_id kolonu olduğunu varsayıyoruz; implementation planında doğrulanacak. Yoksa o role için "yakında" placeholder.
- **change-pin endpoint güvenlik**: pinLimiter ile koruma — değişim PIN denemesi spam'ini önle. `current_pin` zorunlu, sadece kendi PIN'ini değiştirir.
- **Audit log**: tüm AVS kiosk action'ları (login, change-pin, maintenance submit) `audit_log` tablosuna `kiosk_avs_*` action prefix ile yazılır.
- **PIN policy**: 4 hane sayı — mevcut staff `kiosk_pin` formatıyla uyumlu. Yeni policy yok.

## Deploy

Aşağıdakiler tek deploy'da gider:
1. Backend yeni modül + app.js mount
2. Frontend yeni sayfa + App.jsx route + Sidebar entry
3. i18n dict.js güncelleme
4. Test'ler

Migration yok (tüm tablolar mevcut, kolon eklenmiyor). DB güvenli.

## Tahmin

| Faz | Süre |
|---|---|
| Backend (routes + queries + 7 test) | 0.5-1 gün |
| Frontend (sayfa + tab içerikleri + i18n) | 2 gün |
| Auto-logout integration + login flow polish | 0.5 gün |
| Manuel canlı test + bug fix | 0.5 gün |
| **Toplam** | **3-4 gün** |

## Next step

Spec onaylanırsa `writing-plans` skill'i çağrılıp adım adım uygulama planı `docs/superpowers/plans/2026-05-24-avs-kiosk.md` dosyasına yazılır.
