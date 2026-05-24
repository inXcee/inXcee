# AVS Kiosk Yemek Menüsü (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development veya executing-plans. Checkbox (`- [ ]`) ile takip.

**Goal:** Yönetici Yemekhane'den günlük menü girer; AVS çalışanı kiosktan bugünün menüsünü görür.

**Architecture:** 1 yeni tablo (`meal_menu`, idempotent migration). Backend: `meals/routes.js`'e 2 admin endpoint (GET/PUT menu), `avs-self-service/routes.js`'e 1 kiosk endpoint (menu/today). Frontend: `MealsPage.jsx`'e MENÜ sekmesi, `AvsSelfServicePage.jsx`'e Yemek sekmesi.

**Tech Stack:** Express + better-sqlite3 (ON CONFLICT upsert) + vitest; React + react-query.

**Spec:** `docs/superpowers/specs/2026-05-24-avs-kiosk-meals-menu-design.md`

---

## File Structure
- Modify: `backend/src/shared/db/index.js` — `meal_menu` CREATE TABLE
- Modify: `backend/src/modules/meals/routes.js` — `GET /menu`, `PUT /menu`
- Modify: `backend/src/modules/meals/meals.test.js` — menu testleri
- Modify: `backend/src/modules/avs-self-service/routes.js` — `GET /menu/today`
- Modify: `backend/src/modules/avs-self-service/avs-self-service.test.js` — test
- Modify: `frontend/src/shared/i18n/dict.js` — nav.meals + meals grubu
- Modify: `frontend/src/modules/meals/MealsPage.jsx` — MENÜ sekmesi + MenuTab
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` — Yemek sekmesi

---

## Task 1: Migration — `meal_menu` tablosu

**Files:** Modify `backend/src/shared/db/index.js`

- [ ] **Step 1: Tabloyu ekle**

`meal_logs` `CREATE TABLE` bloğunun hemen ardına:

```js
    db.exec(`CREATE TABLE IF NOT EXISTS meal_menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
      items TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meal_date, meal_type)
    )`)
```

- [ ] **Step 2: Doğrula**

Run: `cd backend && node -e "process.env.DB_PATH=':memory:'; const {initDB,getDB}=await import('./src/shared/db/index.js'); initDB(); console.log(getDB().prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='meal_menu'\").get())" --input-type=module`
Expected: `{ name: 'meal_menu' }`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat(meals): meal_menu tablosu (gunluk menu)"
```

---

## Task 2: Backend admin — `GET /menu` + `PUT /menu`

**Files:** Modify `backend/src/modules/meals/routes.js`, `backend/src/modules/meals/meals.test.js`

- [ ] **Step 1: Failing test ekle**

`meals.test.js` sonuna (dosyadaki mevcut admin token değişkenini kullan; yoksa beforeAll'daki manager token adını kontrol et — `mudur/admin123`):

```js
describe('Meals — menu', () => {
  it('PUT menu upsert + GET menu döner', async () => {
    const put = await request(app).put('/api/meals/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-10', meal_type: 'lunch', items: 'Mercimek\nTavuk\nPilav' })
    expect(put.status).toBe(200)
    const get = await request(app).get('/api/meals/menu?date=2026-07-10')
      .set('Authorization', `Bearer ${token}`)
    expect(get.status).toBe(200)
    const lunch = get.body.find(m => m.meal_type === 'lunch')
    expect(lunch.items).toContain('Tavuk')
  })
  it('PUT aynı date+type günceller (upsert)', async () => {
    await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-11', meal_type: 'dinner', items: 'eski' })
    await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-11', meal_type: 'dinner', items: 'yeni' })
    const get = await request(app).get('/api/meals/menu?date=2026-07-11').set('Authorization', `Bearer ${token}`)
    expect(get.body.find(m => m.meal_type === 'dinner').items).toBe('yeni')
  })
  it('geçersiz meal_type 400', async () => {
    const res = await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-10', meal_type: 'brunch', items: 'x' })
    expect(res.status).toBe(400)
  })
})
```

> Not: `meals.test.js`'in beforeAll'unda manager token değişkeninin gerçek adını kontrol et (muhtemelen `token`). Farklıysa testte o adı kullan.

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/meals/meals.test.js -t "menu"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint'leri ekle**

`meals/routes.js` sonuna (cost-summary endpoint'inden sonra):

```js
// ── Menü ──
mealsRouter.get('/menu', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const rows = getDB().prepare('SELECT meal_type, items FROM meal_menu WHERE meal_date=?').all(date)
    res.json(rows)
  } catch (e) { logger.error('[meals/menu get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

mealsRouter.put('/menu', ...mgr, (req, res) => {
  const { meal_date, meal_type, items } = req.body || {}
  if (!meal_date || !VALID_MEALS.includes(meal_type))
    return res.status(400).json({ error: 'Geçersiz tarih veya öğün' })
  try {
    getDB().prepare(`
      INSERT INTO meal_menu(meal_date, meal_type, items) VALUES(?,?,?)
      ON CONFLICT(meal_date, meal_type) DO UPDATE SET items=excluded.items, updated_at=datetime('now')
    `).run(meal_date, meal_type, items ?? null)
    logAudit(req.user.id, 'meal_menu_set', 'meals', null, `${meal_date} ${meal_type}`)
    res.json({ ok: true })
  } catch (e) { logger.error('[meals/menu put]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Geç**

Run: `cd backend && npx vitest run src/modules/meals/meals.test.js -t "menu"`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/meals/
git commit -m "feat(meals): menu GET/PUT endpoint'leri (upsert)"
```

---

## Task 3: Backend kiosk — `GET /menu/today`

**Files:** Modify `backend/src/modules/avs-self-service/routes.js`, `avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

`avs-self-service.test.js` sonuna:

```js
describe('AVS Self-Service — menu/today', () => {
  it('bugünün menüsü dolu öğünleri döner', async () => {
    const db = getDB()
    db.prepare("INSERT INTO meal_menu(meal_date, meal_type, items) VALUES(date('now'),'lunch','Çorba\nKöfte')").run()
    const res = await request(app).get('/api/avs-self-service/menu/today')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.some(m => m.meal_type === 'lunch' && m.items.includes('Köfte'))).toBe(true)
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "menu/today"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`avs-self-service/routes.js` sonuna:

```js
// Bugünün yemek menüsü — dolu öğünler
avsSelfServiceRouter.get('/menu/today', requireAvsKiosk, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT meal_type, items FROM meal_menu
      WHERE meal_date = date('now') AND items IS NOT NULL AND items != ''
    `).all()
    res.json(rows)
  } catch (e) { logger.error('[avs menu/today]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "menu/today"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): GET menu/today — bugunun menusu"
```

---

## Task 4: Backend tam regresyon

- [ ] **Step 1:** Run: `cd backend && npx vitest run 2>&1 | tail -5` → PASS.

---

## Task 5: i18n — meals etiketleri (tr/en/ar)

**Files:** Modify `frontend/src/shared/i18n/dict.js`

- [ ] **Step 1: nav.meals + meals grubu (her dile)**

`nav`'a `meals` ekle; yeni `meals` grubu (`leave` grubunun yanına).

`tr`: nav'a `meals: 'Yemek'`; grup:
```js
    meals: {
      title: 'Bugünün Menüsü', none: 'Bugün için menü girilmemiş',
      breakfast: '🌅 Kahvaltı', lunch: '☀ Öğle', dinner: '🌙 Akşam', snack: '☕ Ara',
    },
```
`en`: nav'a `meals: 'Meals'`; grup:
```js
    meals: {
      title: "Today's Menu", none: 'No menu set for today',
      breakfast: '🌅 Breakfast', lunch: '☀ Lunch', dinner: '🌙 Dinner', snack: '☕ Snack',
    },
```
`ar`: nav'a `meals: 'الطعام'`; grup:
```js
    meals: {
      title: 'قائمة اليوم', none: 'لم تُحدد قائمة لليوم',
      breakfast: '🌅 فطور', lunch: '☀ غداء', dinner: '🌙 عشاء', snack: '☕ وجبة خفيفة',
    },
```

- [ ] **Step 2:** Run: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`.
- [ ] **Step 3:** Commit: `git add frontend/src/shared/i18n/dict.js && git commit -m "feat(i18n): avs_kiosk meals etiketleri (tr/en/ar)"`

---

## Task 6: Frontend admin — MealsPage MENÜ sekmesi

**Files:** Modify `frontend/src/modules/meals/MealsPage.jsx`

- [ ] **Step 1: TABS'a menu ekle**

`TABS` dizisine ekle:
```js
  { key: 'menu',     label: '🍽 MENÜ' },
```
Ve render bloğuna: `{tab === 'menu' && <MenuTab />}`

- [ ] **Step 2: MenuTab bileşenini ekle**

Dosya sonuna (diğer Tab bileşenlerinin yanına):

```jsx
function MenuTab() {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draft, setDraft] = useState({})
  const { data: rows = [] } = useQuery({
    queryKey: ['meal-menu', date],
    queryFn: () => api.get(`/meals/menu?date=${date}`).then(r => r.data),
  })
  useEffect(() => {
    const m = {}
    for (const r of rows) m[r.meal_type] = r.items || ''
    setDraft(m)
  }, [rows])
  const save = useMutation({
    mutationFn: (meal_type) => api.put('/meals/menu', { meal_date: date, meal_type, items: draft[meal_type] || '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meal-menu', date] }); toast('Menü kaydedildi') },
    onError: toastErr,
  })
  return (
    <div style={{ maxWidth: 700 }}>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
      {Object.entries(MEALS).map(([key, meta]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, color: 'var(--text2)', fontSize: 14 }}>{meta.label}</div>
          <textarea value={draft[key] || ''} onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
            rows={3} placeholder="Her satıra bir yemek…"
            style={{ width: '100%', padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit' }} />
          <button onClick={() => save.mutate(key)} disabled={save.isPending}
            style={{ marginTop: 6, padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Kaydet
          </button>
        </div>
      ))}
    </div>
  )
}
```

> `useEffect` import edilmiş (MealsPage başında `useState, useEffect, useRef` var). `MEALS`, `api`, `toast`, `toastErr`, `useQuery/useMutation/useQueryClient` dosyada mevcut.

- [ ] **Step 3:** Run: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`.
- [ ] **Step 4:** Commit: `git add frontend/src/modules/meals/MealsPage.jsx && git commit -m "feat(meals): MENU sekmesi — gunluk menu girisi"`

---

## Task 7: Frontend kiosk — Yemek sekmesi

**Files:** Modify `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: TAB_KEYS'e meals ekle**

`leave` satırından sonra:
```jsx
  { key: 'meals',         icon: '🍽', i18n: 'avs_kiosk.nav.meals' },
```

- [ ] **Step 2: Query ekle**

Diğer query'lerin yanına:
```jsx
  const { data: menuToday = [] } = useQuery({
    queryKey: ['avs-menu-today', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/menu/today').then(r => r.data),
    enabled: !!avsToken && activeTab === 'meals',
  })
```

- [ ] **Step 3: Panel ekle**

İzin panelinden sonra (BottomNav'dan önce):
```jsx
      {activeTab === 'meals' && (
        <div className="space-y-3">
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.meals.title')}</h2>
          {menuToday.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.meals.none')}</div>
          ) : menuToday.map(m => (
            <div key={m.meal_type} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{t('avs_kiosk.meals.' + m.meal_type, m.meal_type)}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{m.items}</div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4:** Run: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`.
- [ ] **Step 5:** Commit: `git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx && git commit -m "feat(avs-kiosk): Yemek sekmesi — bugunun menusu"`

---

## Task 8: Final doğrulama
- [ ] Backend: `cd backend && npx vitest run 2>&1 | tail -5` → PASS.
- [ ] Frontend: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`; e2e: `npm run test:e2e -w frontend -- e2e/avs-kiosk-ux.spec.js --reporter=list 2>&1 | grep -vE "^\[WebServer\]" | tail -6` → `1 passed`.
- [ ] Manuel smoke: admin Yemekhane→MENÜ'de bugüne menü gir → kiosk "Yemek" sekmesinde görünüyor.

---

## Self-Review Notları
- **Spec kapsamı:** meal_menu (Task 1), admin GET/PUT (Task 2), kiosk menu/today (Task 3), i18n (Task 5), admin MenuTab (Task 6), kiosk Yemek sekmesi (Task 7) → karşılandı.
- **Şekil tutarlılığı:** GET /menu → `[{meal_type, items}]` (Task 2 ↔ MenuTab Task 6); menu/today → `[{meal_type, items}]` (Task 3 ↔ kiosk Task 7). meal_type enum breakfast/lunch/dinner/snack — i18n `meals.<type>` + fallback.
- **Upsert:** `ON CONFLICT(meal_date,meal_type)` — UNIQUE constraint var (Task 1). better-sqlite3 SQLite upsert destekler.
- **Doğrulanacak:** `meals.test.js` manager token değişken adı (Task 2 Step 1 notu) — implementasyonda kontrol et.
