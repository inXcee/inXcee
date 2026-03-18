# Vardiya Yonetim Modulu - Arsiv

> Bu modul YYS uygulamasindan cikarilmistir. Baska bir uygulamada kullanilmak uzere arsivlenmistir.

## Ne yapar?

Tam kapsamli bir **personel vardiya yonetim sistemi**. 7 sekmeli tek sayfa uygulama:

| Sekme | Islem |
|-------|-------|
| **CIZELGE** | Haftalik vardiya cizelgesi - personel x gun matrisi, hucrelere tiklayarak vardiya atama/degistirme, hafta kopyalama |
| **IZINLER** | Izin talebi olusturma (yillik/hastalik/acil/dogum/babalik/evlilik/olum), onaylama/reddetme, izin bakiyesi takibi |
| **MESAI** | Fazla mesai kaydi, departman bazli ozet, aylik raporlama |
| **YOKLAMA** | Giris/cikis saati kaydi, gercek calisma suresi hesaplama |
| **DEPARTMANLAR** | Departman CRUD, personel atama, cinsiyet dagilimi |
| **TAKAS** | Vardiya takas talepleri - iki personel arasi vardiya degisimi |
| **AYARLAR** | Vardiya tanimi CRUD (isim, baslangic/bitis saati, renk), rotasyon sablonu uygulama |

## Ek Ozellik: Personel Detay Paneli

Cizelgede personel adina tiklaninca sag taraftan slide-over panel acilir:
- **5 iç sekme**: Ozet, Vardiyalar, Izinler, Mesai, Yoklama
- **Ozet kartalari**: Toplam vardiya, calisti, mesai saati, izin sayisi, devamsizlik
- Tum gecmis kayitlar tablo halinde

---

## Dosya Yapisi

```
backend/src/modules/shifts/
  queries.js    -- 554 satir, 35+ SQL fonksiyonu
  service.js    -- 169 satir, validasyon katmani
  routes.js     -- 258 satir, 25+ Express endpoint

frontend/src/modules/shifts/
  ShiftsPage.jsx -- ~2020 satir, 10+ React component
```

---

## Tech Stack & Bagimliliklar

- **Backend**: Express.js, better-sqlite3 (SQLite)
- **Frontend**: React, TanStack React Query, Zustand (auth store)
- **Stil**: CSS variables ile dark theme (inline styles, `.panel`, `.data-table`, `.badge-*`, `.filter-chip`, `.btn`, `.form-input` class'lari)
- **Auth**: JWT token, role-based (`campus_manager`, `shift_supervisor` = full access; diger roller = read-only)

---

## Veritabani Tablolari (SQLite)

```sql
-- Departmanlar
CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color_class TEXT NOT NULL,       -- 'bg-red-600', 'bg-green-600' vb.
  description TEXT
);

-- Vardiya tanimlari (ornegin: Sabah 06-14, Aksam 14-22, Gece 22-06)
CREATE TABLE shift_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_hour INTEGER NOT NULL,     -- 0-23
  end_hour INTEGER NOT NULL,       -- 1-24
  color_class TEXT NOT NULL         -- 'bg-blue-400', 'bg-orange-400', 'bg-indigo-600'
);

-- Vardiya cizelgesi (personel x gun)
CREATE TABLE shift_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  shift_def_id INTEGER NOT NULL REFERENCES shift_definitions(id),
  work_date TEXT NOT NULL,          -- 'YYYY-MM-DD'
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','worked','absent','on_leave','overtime')),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(personnel_id, work_date)   -- bir personel bir gunde tek vardiya
);

-- Izin talepleri
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  leave_type TEXT NOT NULL
    CHECK(leave_type IN ('annual','sick','emergency','maternity','paternity','marriage','bereavement')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Izin bakiyesi (yillik)
CREATE TABLE leave_balance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  year INTEGER NOT NULL,
  annual_total INTEGER DEFAULT 15,
  annual_used INTEGER DEFAULT 0,
  sick_used INTEGER DEFAULT 0,
  emergency_used INTEGER DEFAULT 0,
  UNIQUE(personnel_id, year)
);

-- Fazla mesai kayitlari
CREATE TABLE overtime_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  work_date TEXT NOT NULL,
  hours REAL NOT NULL,              -- 0.5 - 12 arasi
  reason TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Yoklama kayitlari
CREATE TABLE attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  shift_schedule_id INTEGER REFERENCES shift_schedule(id),
  check_in_at DATETIME,
  check_out_at DATETIME,
  actual_hours REAL
);

-- Takas talepleri (runtime'da olusturulur)
CREATE TABLE shift_swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES personnel(id),
  target_id INTEGER NOT NULL REFERENCES personnel(id),
  swap_date TEXT NOT NULL,
  requester_shift_id INTEGER REFERENCES shift_definitions(id),
  target_shift_id INTEGER REFERENCES shift_definitions(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Not:** `personnel` tablosu bu modulun disinda tanimlidir. Bu modul `personnel.id`, `personnel.full_name`, `personnel.gender`, `personnel.department_id`, `personnel.tc_no`, `personnel.check_in_date`, `personnel.check_out_date` alanlarini kullanir.

---

## API Endpointleri

### Departmanlar & Tanimlar
| Method | Path | Yetki | Aciklama |
|--------|------|-------|----------|
| GET | `/api/shifts/departments` | Tumu | Departman listesi |
| GET | `/api/shifts/departments/summary` | Tumu | Departman ozeti (personel sayisi, cinsiyet) |
| POST | `/api/shifts/departments` | Manager/Supervisor | Yeni departman |
| PUT | `/api/shifts/departments/:id` | Manager/Supervisor | Departman guncelle |
| DELETE | `/api/shifts/departments/:id` | Manager/Supervisor | Departman sil |
| POST | `/api/shifts/departments/assign` | Manager/Supervisor | Personeli departmana ata |
| GET | `/api/shifts/definitions` | Tumu | Vardiya tanimlari |
| POST | `/api/shifts/definitions` | Manager/Supervisor | Yeni vardiya tanimi |
| PUT | `/api/shifts/definitions/:id` | Manager/Supervisor | Tanim guncelle |
| DELETE | `/api/shifts/definitions/:id` | Manager/Supervisor | Tanim sil |

### Cizelge
| Method | Path | Yetki | Aciklama |
|--------|------|-------|----------|
| GET | `/api/shifts/schedule?week=YYYY-MM-DD&dept_id=` | Tumu | Haftalik cizelge |
| POST | `/api/shifts/schedule` | Manager/Supervisor | Toplu vardiya atama (body: `{entries}`) |
| DELETE | `/api/shifts/schedule/:personnelId/:date` | Manager/Supervisor | Cizelge kaydini sil |
| POST | `/api/shifts/schedule/copy-week` | Manager/Supervisor | Haftayi sonraki haftaya kopyala |
| POST | `/api/shifts/schedule/rotation` | Manager/Supervisor | Rotasyon sablonu uygula |

### Izinler
| Method | Path | Yetki | Aciklama |
|--------|------|-------|----------|
| GET | `/api/shifts/leave` | Tumu | Izin listesi (filtreli) |
| POST | `/api/shifts/leave` | Tumu | Yeni izin talebi |
| PATCH | `/api/shifts/leave/:id` | Manager/Supervisor | Onayla/Reddet |
| DELETE | `/api/shifts/leave/:id` | Manager/Supervisor | Izin iptali |
| GET | `/api/shifts/leave/balance/:personnelId` | Tumu | Izin bakiyesi |

### Mesai & Yoklama
| Method | Path | Yetki | Aciklama |
|--------|------|-------|----------|
| GET | `/api/shifts/overtime` | Tumu | Mesai kayitlari |
| GET | `/api/shifts/overtime/summary?month=YYYY-MM` | Tumu | Aylik ozet |
| POST | `/api/shifts/overtime` | Manager/Supervisor | Mesai kaydi ekle |
| GET | `/api/shifts/attendance` | Tumu | Yoklama kayitlari |
| POST | `/api/shifts/attendance/checkin` | Tumu | Giris kaydi |
| POST | `/api/shifts/attendance/checkout` | Tumu | Cikis kaydi |

### Personel & Takas
| Method | Path | Yetki | Aciklama |
|--------|------|-------|----------|
| GET | `/api/shifts/personnel?date=&dept_id=` | Tumu | Personel + vardiya durumu |
| GET | `/api/shifts/personnel/search?q=` | Tumu | Personel arama (autocomplete) |
| GET | `/api/shifts/personnel/:id/detail` | Tumu | Personel detay profili |
| GET | `/api/shifts/statistics?date=` | Tumu | Gunluk istatistikler |
| GET | `/api/shifts/swaps` | Tumu | Takas talepleri |
| POST | `/api/shifts/swaps` | Tumu | Takas talebi olustur |
| PATCH | `/api/shifts/swaps/:id/approve` | Manager/Supervisor | Takas onayla |
| PATCH | `/api/shifts/swaps/:id/reject` | Manager/Supervisor | Takas reddet |

---

## Frontend Componentler

| Component | Satir | Aciklama |
|-----------|-------|----------|
| `ShiftsPage` | Ana component | 7 sekme yonetimi, departments/shiftDefs query |
| `ScheduleTab` | Cizelge | Haftalik grid, hucre edit modal, hafta kopyalama |
| `LeaveTab` | Izinler | Izin listesi/filtre, yeni talep modal, onay/red |
| `OvertimeTab` | Mesai | Mesai kayitlari, departman bazli ozet |
| `AttendanceTab` | Yoklama | Giris/cikis kaydi, sure hesaplama |
| `DepartmentsTab` | Departmanlar | CRUD, personel atama, departman ozet kartlari |
| `SwapTab` | Takas | Takas listesi, yeni talep, onay/red |
| `SettingsTab` | Ayarlar | Vardiya tanimi CRUD, rotasyon sablonu |
| `PersonnelSearch` | Yardimci | Debounced arama, dropdown, autocomplete |
| `PersonnelDetailPanel` | Yardimci | Slide-over profil paneli, 5 tab |
| `ModalOverlay` | Yardimci | Genel modal wrapper |

---

## Nasil Entegre Edilir (Baska Uygulamada)

### 1. Backend
1. `queries.js`, `service.js`, `routes.js` dosyalarini `backend/src/modules/shifts/` altina kopyala
2. `app.js`'de router'i ekle:
   ```js
   import { shiftsRouter } from './modules/shifts/routes.js'
   app.use('/api/shifts', shiftsRouter)
   ```
3. Schema'daki tablolari DB'ye ekle (yukaridaki SQL'ler)
4. `personnel` tablonuzun `id, full_name, gender, department_id, tc_no, check_in_date, check_out_date` alanlari olmali
5. Auth middleware (`requireAuth`, `requireRole`) uygulamaniza uyarla

### 2. Frontend
1. `ShiftsPage.jsx` dosyasini `frontend/src/modules/shifts/` altina kopyala
2. `App.jsx`'de route ekle:
   ```jsx
   import ShiftsPage from './modules/shifts/ShiftsPage.jsx'
   <Route path="shifts" element={<ShiftsPage />} />
   ```
3. Sidebar/nav'a link ekle
4. Gerekli CSS class'lari: `.panel`, `.data-table`, `.badge`, `.badge-*`, `.filter-chip`, `.btn`, `.btn-primary`, `.btn-ghost`, `.form-input`, `.form-select`, `.form-label`, `.empty-state`, `.fade-up`
5. `@keyframes slideInRight` animasyonu CSS'e ekle
6. API client (`api`) axios instance olmali, base URL `/api` prefix'li

### 3. Bagimliliklar
```json
{
  "react": "^18",
  "@tanstack/react-query": "^5",
  "zustand": "^4",
  "axios": "^1",
  "express": "^4",
  "better-sqlite3": "^11"
}
```

---

## Onemli Is Mantiklari

- **Izin onaylaninca**: Ilgili tarihlerdeki shift_schedule kayitlari `status='on_leave'` olur
- **Izin iptal edilince**: `on_leave` olan kayitlar `scheduled`'a doner
- **Takas onaylaninca**: Iki personelin o gundeki `shift_def_id`'leri yer degistirir (DB transaction)
- **Hafta kopyalama**: Source haftadaki tum kayitlar +7 gun ile hedef haftaya upsert edilir
- **Rotasyon sablonu**: `(personelIndex + haftaNo) % vardiyaSayisi` formuluyle dongusel atama
- **Yoklama cikisi**: `check_in_at` ile `now()` farki hesaplanip `actual_hours`'a yazilir, schedule `worked` olur
