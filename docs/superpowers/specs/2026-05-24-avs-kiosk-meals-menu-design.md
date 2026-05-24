# AVS Kiosk — Yemek Menüsü (P5) Tasarım Spec'i

> **Bağlam:** AVS kiosk canlıda; P1-P4 bitti+deploy. Bu **P5**: net-yeni yemek menüsü — yönetici günlük menüyü girer, çalışan kioskta bugünün menüsünü görür. A-Z kiosk geliştirmesinin son fazı.

**Amaç:** Yönetici Yemekhane sayfasından tarih bazlı menü girer (kahvaltı/öğle/akşam/ara); AVS çalışanı kiosktan bugünün menüsünü görür.

**Önemli:** Menü için **veri modeli yok** (`meal_logs` sadece tüketim kaydı) → 1 yeni tablo gerekir (idempotent migration).

## Doğrulanmış kod gerçekleri

- `meal_logs(meal_type CHECK breakfast/lunch/dinner/snack, meal_date, ...)` — tüketim. **Menü tablosu yok.**
- `meals` modülü (`/api/meals`): `mgr = requireRole('campus_manager','shift_supervisor')`, `view = requireRole(+laundry/housekeeper/technical)`. Mevcut: `/log`, `/daily`, `/forecast`, `/cost-summary`. `VALID_MEALS = ['breakfast','lunch','dinner','snack']`.
- `MealsPage.jsx` (Yemekhane, `/settings/meals`): sekme yapısı (`scan/daily/forecast/cost`) + `MEALS` const (4 öğün label/renk: 🌅 Kahvaltı / ☀ Öğle / 🌙 Akşam / ☕ Ara). `nowMealType()` saate göre aktif öğün.
- Kiosk: `avs-self-service` `requireAvsKiosk`, bottom nav (P4 sonrası 8 sekme).

## Veri modeli (yeni tablo)

`db/index.js` migration bölümüne idempotent (mevcut pattern):
```sql
CREATE TABLE IF NOT EXISTS meal_menu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
  items TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(meal_date, meal_type)
)
```
`items`: satır-satır yemek listesi (serbest metin). `meal_type` enum'ı `meal_logs` ile aynı.

## Mimari

Backend: `meals/routes.js`'e 2 admin endpoint; `avs-self-service/routes.js`'e 1 kiosk endpoint. Frontend: `MealsPage.jsx`'e "MENÜ" sekmesi; `AvsSelfServicePage.jsx`'e "Yemek" sekmesi. 1 migration.

### Backend — admin (meals modülü)
- `GET /api/meals/menu?date=YYYY-MM-DD` (`...view`) → o tarihin tüm öğünleri: `[{ meal_type, items }]` (4 öğün, kayıt yoksa boş). Tarih verilmezse bugün.
- `PUT /api/meals/menu` (`...mgr`) → upsert: body `{ meal_date, meal_type, items }`. `INSERT INTO meal_menu(...) ON CONFLICT(meal_date, meal_type) DO UPDATE SET items=excluded.items, updated_at=datetime('now')`. `meal_type` VALID_MEALS kontrol. `logAudit` `meal_menu_set`. `{ ok: true }`.

### Backend — kiosk (avs-self-service)
- `GET /api/avs-self-service/menu/today` (`requireAvsKiosk`) → `SELECT meal_type, items FROM meal_menu WHERE meal_date=date('now') AND items IS NOT NULL AND items != ''`. Dizi döner (dolu öğünler).

### Frontend — admin "MENÜ" sekmesi (MealsPage)
- TABS'a `{ key: 'menu', label: '🍽 MENÜ' }`. `<MenuTab />`: tarih `<input type=date>` (default bugün) → o tarihin 4 öğünü `GET /menu?date` ile yüklenir; her öğün için textarea (MEALS label'ları); "Kaydet" → değişen öğünler için `PUT /menu`. Toast feedback.

### Frontend — kiosk "Yemek" sekmesi
- TAB_KEYS'e `{ key: 'meals', icon: '🍽', i18n: 'avs_kiosk.nav.meals' }` (9. sekme). `GET /menu/today`. Her dolu öğün bir kart (MEALS benzeri başlık + items satırları); `nowMealType()` ile o anki öğün vurgulu. Menü yoksa "bugün için menü girilmemiş".

## Nav yoğunluğu
Kiosk bottom nav 9 sekme olur. Duvar tableti (geniş) için uygun; dar telefonda sıkışık. "Daha fazla" taşması kapsam dışı (gerekirse ayrı polish).

## Hata yönetimi
- PUT geçersiz meal_type → 400. GET hata → 500 + log.
- Kiosk menü boşsa → bilgi mesajı (hata değil).

## Test
- **Backend (vitest, zorunlu):**
  - `meals.test.js` (varsa ekle, yoksa oluştur): PUT /menu (mgr) upsert → GET /menu?date o öğünü items'la döner; PUT tekrar (aynı date+type) → günceller (UNIQUE conflict); geçersiz meal_type → 400; `view` dışı rol PUT'ta 403.
  - `avs-self-service.test.js`: bugüne menü ekle (db insert), `GET /menu/today` → dolu öğün döner.
- **Frontend:** `npm run build`; e2e regresyon.

## Kapsam dışı
- Haftalık menü görünümü, menü kopyalama (önceki günden), besin/kalori, fotoğraf → ileride.
- Bottom nav "daha fazla" taşması → ayrı polish.

## İzole birimler
- `meal_menu` tablosu: tek sorumluluk (tarih+öğün → yemekler), `meal_logs`'tan bağımsız.
- Admin endpoint'leri: meals modülünde, mevcut mgr/view auth.
- Kiosk endpoint: salt-okunur bugün menüsü.
- MenuTab / kiosk Yemek paneli: bağımsız bileşenler, mevcut pattern.
