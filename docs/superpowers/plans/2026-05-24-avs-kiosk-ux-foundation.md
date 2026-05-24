# AVS Kiosk UX Temeli (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS kiosk'unu (`/avs-kiosk`) klavyesiz dokunmatik tablette rahat kullanılır yapmak: dokunmatik PIN pad, alt nav bar, canlı saat başlık, skeleton yükleyiciler, varsayılan TR, vardiya durum lokalizasyonu, logout state reset.

**Architecture:** Saf frontend. Sunum katmanı izole kiosk bileşenlerine ayrılır (`PinPad`, `BottomNav`, `KioskHeader`, `KioskSkeleton`) + `useClock` hook'u; iş mantığı/state `AvsSelfServicePage.jsx`'te kalır. Backend/şema/endpoint değişmez.

**Tech Stack:** React 18 + Tailwind + @tanstack/react-query (mevcut). **Frontend'de birim test runner yok** — doğrulama her task'ta `npm run build -w frontend` (derleme/import hatası yakalar), davranış doğrulaması sonda **committed Playwright e2e** (`frontend/e2e/`, projenin tek frontend test konvansiyonu). Spec'in "vitest unit" maddesi yerine e2e seçildi (yeni test runner eklememek için).

**Spec:** `docs/superpowers/specs/2026-05-24-avs-kiosk-ux-foundation-design.md`

---

## File Structure

**Yeni dosyalar:**
- `frontend/src/shared/hooks/useClock.js` — canlı saat/tarih hook'u
- `frontend/src/modules/avs-self-service/components/PinPad.jsx` — dokunmatik numpad
- `frontend/src/modules/avs-self-service/components/BottomNav.jsx` — alt sekme çubuğu
- `frontend/src/modules/avs-self-service/components/KioskHeader.jsx` — üst bar + saat
- `frontend/src/modules/avs-self-service/components/KioskSkeleton.jsx` — yükleme placeholder
- `frontend/e2e/avs-kiosk-ux.spec.js` — committed e2e smoke

**Değişen dosyalar:**
- `frontend/src/shared/i18n/index.js` — `readLocale` varsayılan TR
- `frontend/src/shared/i18n/dict.js` — `avs_kiosk.nav.*` + `avs_kiosk.shifts.status.*` + `avs_kiosk.pinpad.*` (tr/en/ar)
- `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` — bileşenleri entegre et, status lokalizasyon, logout reset
- `frontend/e2e/global-setup.js` — Windows EPERM guard (e2e'yi Windows'ta koşmak için; backend açık DB'yi tutarken `.tmp` silinemiyor)

---

## Task 1: `useClock` hook

**Files:**
- Create: `frontend/src/shared/hooks/useClock.js`

- [ ] **Step 1: Hook'u yaz**

`frontend/src/shared/hooks/useClock.js`:

```js
import { useState, useEffect } from 'react'
import { getLocale } from '../i18n/index.js'

// Canlı saat (HH:MM) + locale'e göre tarih. 30sn'de bir günceller.
const LOCALE_MAP = { tr: 'tr-TR', en: 'en-US', ar: 'ar-SA' }

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const intl = LOCALE_MAP[getLocale()] || 'tr-TR'
  const time = now.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short' })
  return { time, date }
}
```

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built` — hata yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/hooks/useClock.js
git commit -m "feat(avs-kiosk): useClock hook — canli saat + tarih"
```

---

## Task 2: `PinPad` bileşeni

**Files:**
- Create: `frontend/src/modules/avs-self-service/components/PinPad.jsx`

- [ ] **Step 1: Bileşeni yaz**

`frontend/src/modules/avs-self-service/components/PinPad.jsx`:

```jsx
// Dokunmatik numerik PIN girişi. Kontrollü: değeri parent tutar.
// props: value (string), onChange(next), onComplete()?, length=4, error?
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

export default function PinPad({ value = '', onChange, onComplete, length = 4, error }) {
  const press = (k) => {
    if (k === 'back') return onChange(value.slice(0, -1))
    if (k === '' || value.length >= length) return
    const next = (value + k).slice(0, length)
    onChange(next)
    if (next.length === length && onComplete) onComplete()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-hidden="true">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`w-4 h-4 rounded-full ${i < value.length ? 'bg-amber-400' : 'bg-slate-700'}`} />
        ))}
      </div>
      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) => k === '' ? <div key={i} /> : (
          <button key={i} type="button" onClick={() => press(k)}
            aria-label={k === 'back' ? 'Sil' : k}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-100 text-2xl font-medium transition-colors flex items-center justify-center">
            {k === 'back' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/components/PinPad.jsx
git commit -m "feat(avs-kiosk): PinPad — dokunmatik numerik PIN girisi"
```

---

## Task 3: `BottomNav` bileşeni

**Files:**
- Create: `frontend/src/modules/avs-self-service/components/BottomNav.jsx`

- [ ] **Step 1: Bileşeni yaz**

`frontend/src/modules/avs-self-service/components/BottomNav.jsx`:

```jsx
// Sabit alt sekme çubuğu. props: tabs [{key, icon, label, badge?}], active, onChange(key)
export default function BottomNav({ tabs, active, onChange }) {
  return (
    <nav role="tablist"
      className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-slate-900 border-t border-slate-800 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(tab => {
        const isActive = active === tab.key
        return (
          <button key={tab.key} type="button" role="tab" aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`relative flex-1 min-h-[56px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[11px] leading-tight">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/components/BottomNav.jsx
git commit -m "feat(avs-kiosk): BottomNav — sabit alt sekme cubugu"
```

---

## Task 4: `KioskHeader` bileşeni

**Files:**
- Create: `frontend/src/modules/avs-self-service/components/KioskHeader.jsx`

- [ ] **Step 1: Bileşeni yaz**

`frontend/src/modules/avs-self-service/components/KioskHeader.jsx`:

```jsx
import { useClock } from '../../../shared/hooks/useClock.js'
import { useTranslation } from '../../../shared/i18n/index.js'

// Üst bar: kullanıcı adı + canlı saat/tarih + çıkış. props: userName, onLogout
export default function KioskHeader({ userName, onLogout }) {
  const { t } = useTranslation()
  const { time, date } = useClock()
  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="min-w-0">
        <div className="font-semibold text-slate-100 truncate">{userName}</div>
        <div className="text-xs text-slate-500">{date}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold text-slate-300 tabular-nums">{time}</div>
        <button onClick={onLogout}
          className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 bg-slate-800 rounded-xl">
          {t('avs_kiosk.logout')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/components/KioskHeader.jsx
git commit -m "feat(avs-kiosk): KioskHeader — kullanici + canli saat + cikis"
```

---

## Task 5: `KioskSkeleton` bileşeni

**Files:**
- Create: `frontend/src/modules/avs-self-service/components/KioskSkeleton.jsx`

- [ ] **Step 1: Bileşeni yaz**

`frontend/src/modules/avs-self-service/components/KioskSkeleton.jsx`:

```jsx
// Panel yükleme placeholder'ı. props: rows=3
export default function KioskSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-slate-900 rounded-2xl p-5 animate-pulse">
          <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
          <div className="h-3 bg-slate-800 rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/components/KioskSkeleton.jsx
git commit -m "feat(avs-kiosk): KioskSkeleton — panel yukleme placeholder"
```

---

## Task 6: i18n — varsayılan TR

**Files:**
- Modify: `frontend/src/shared/i18n/index.js:6-16` (`readLocale`)

- [ ] **Step 1: `readLocale`'i varsayılan TR yap**

`frontend/src/shared/i18n/index.js` içinde `readLocale` fonksiyonundaki tarayıcı-tercihi bloğunu kaldır; kayıtlı tercih yoksa doğrudan `DEFAULT_LOCALE` dön. Mevcut:

```js
function readLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALES[stored]) return stored
  } catch { /* localStorage devre dışı */ }
  // Tarayıcı tercihi (örn navigator.language='en-US') — desteklenen bir kök ise kullan
  const browser = (typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2)
  if (LOCALES[browser]) return browser
  return DEFAULT_LOCALE
}
```

Yeni hali:

```js
function readLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALES[stored]) return stored
  } catch { /* localStorage devre dışı */ }
  // Kiosk/Türk iş gücü: tarayıcı dili yerine her zaman varsayılan (tr). Kullanıcı switcher'dan değiştirebilir.
  return DEFAULT_LOCALE
}
```

> Not: `DEFAULT_LOCALE` `dict.js`'ten import ediliyor ve `tr`. Doğrula: `grep "DEFAULT_LOCALE" frontend/src/shared/i18n/dict.js` → `'tr'` olmalı. Değilse bu task'ta `dict.js`'te `tr` yap.

- [ ] **Step 2: Derleme + varsayılan doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/index.js
git commit -m "feat(i18n): public ekranlarda varsayilan dil TR (tarayici dili yerine)"
```

---

## Task 7: i18n — nav + shift status + pinpad etiketleri (tr/en/ar)

**Files:**
- Modify: `frontend/src/shared/i18n/dict.js` — `tr`/`en`/`ar` objelerindeki `avs_kiosk` grubu

- [ ] **Step 1: Her üç dile alt grupları ekle**

`dict.js`'te her dilin `avs_kiosk` grubuna aşağıdaki üç alt grubu ekle (ilgili dilin değerleriyle). `tr`:

```js
    nav: {
      shifts: 'Vardiya', transport: 'Servis', tasks: 'Görev',
      announcements: 'Duyuru', quick_fault: 'Arıza', profile: 'Profil',
    },
    pinpad: { delete: 'Sil' },
    shifts: {
      none: 'Önümüzdeki 7 gün için vardiya kaydın yok',
      status: { scheduled: 'Planlı', worked: 'Çalıştı', absent: 'Gelmedi', on_leave: 'İzinli', overtime: 'Mesai' },
    },
```

> `shifts.none` zaten var — `status` alt objesini `shifts`'in içine ekle (mevcut `none`'u koru, üzerine yazma).

`en`:

```js
    nav: {
      shifts: 'Shift', transport: 'Transport', tasks: 'Tasks',
      announcements: 'News', quick_fault: 'Fault', profile: 'Profile',
    },
    pinpad: { delete: 'Delete' },
    shifts: {
      none: 'No shifts in the next 7 days',
      status: { scheduled: 'Scheduled', worked: 'Worked', absent: 'Absent', on_leave: 'On leave', overtime: 'Overtime' },
    },
```

`ar`:

```js
    nav: {
      shifts: 'الوردية', transport: 'النقل', tasks: 'المهام',
      announcements: 'إعلانات', quick_fault: 'عطل', profile: 'الملف',
    },
    pinpad: { delete: 'حذف' },
    shifts: {
      none: 'لا ورديات خلال 7 أيام القادمة',
      status: { scheduled: 'مجدول', worked: 'حضر', absent: 'غاب', on_leave: 'إجازة', overtime: 'إضافي' },
    },
```

- [ ] **Step 2: Derleme kontrolü (dict.js parse)**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built` — virgül/parantez hatası yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/dict.js
git commit -m "feat(i18n): avs_kiosk nav + shift status + pinpad etiketleri (tr/en/ar)"
```

---

## Task 8: AvsSelfServicePage — login ekranı PinPad entegrasyonu

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: Import + login PIN alanını PinPad ile değiştir**

Dosya başına import ekle (mevcut importların altına):

```jsx
import PinPad from './components/PinPad.jsx'
import BottomNav from './components/BottomNav.jsx'
import KioskHeader from './components/KioskHeader.jsx'
import KioskSkeleton from './components/KioskSkeleton.jsx'
```

Login ekranında PIN `<input>` bloğunu (mevcut `:189-197` arası `{selected && (<div>...<input type="password".../></div>)}`) şununla değiştir:

```jsx
            {selected && (
              <div>
                <label className="block text-sm text-slate-400 mb-3 text-center">{t('avs_kiosk.pin')}</label>
                <PinPad value={pin} onChange={setPin} length={4}
                  onComplete={() => handleLogin()} error={loginError} />
              </div>
            )}
```

`handleLogin`'i argümansız da çağrılabilir yap: imzasını `const handleLogin = async (e) => { e?.preventDefault(); ... }` olarak güncelle (mevcut `e.preventDefault()` → `e?.preventDefault()`). Ayrıca form altındaki `{loginError && ...}` ayrı satırını kaldır (artık PinPad `error` gösteriyor) ve submit butonunu koru (manuel giriş için), ama `pin.length !== 4` disabled mantığı aynı kalsın.

- [ ] **Step 2: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): login ekraninda dokunmatik PinPad"
```

---

## Task 9: AvsSelfServicePage — ana ekran (header + bottom nav + skeleton + status + logout reset)

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: TAB_KEYS'i icon+label'a çevir**

Dosya başındaki `TAB_KEYS` dizisini değiştir (emoji ikon + plain nav label):

```jsx
const TAB_KEYS = [
  { key: 'shifts',        icon: '⏱', i18n: 'avs_kiosk.nav.shifts' },
  { key: 'transport',     icon: '🚌', i18n: 'avs_kiosk.nav.transport' },
  { key: 'tasks',         icon: '✅', i18n: 'avs_kiosk.nav.tasks' },
  { key: 'announcements', icon: '📢', i18n: 'avs_kiosk.nav.announcements' },
  { key: 'quick_fault',   icon: '🔧', i18n: 'avs_kiosk.nav.quick_fault' },
  { key: 'profile',       icon: '👤', i18n: 'avs_kiosk.nav.profile' },
]
```

- [ ] **Step 2: Logout reset helper ekle**

State tanımlarının altına (örn `handleSearch`'ün üstüne) ekle:

```jsx
  const handleLogout = () => {
    setAvsToken(null); setSelected(null); setPin(''); setNameQuery(''); setResults([]); setActiveTab('shifts')
  }
```

- [ ] **Step 3: Ana ekran header + tab bar + alt nav'ı değiştir**

Ana ekran `return`'ünde (`:211` civarı) mevcut başlık bloğu (`<div className="flex items-center justify-between py-4 mb-4">...</div>`), üst tab bar (`<div className="flex gap-2 mb-6 overflow-x-auto pb-1">...</div>`) ve `<div className="mb-2 flex justify-end"><LanguageSwitcher compact /></div>` üçlüsünü şununla değiştir:

```jsx
      <KioskHeader userName={selected?.full_name} onLogout={handleLogout} />
      <div className="mb-4 flex justify-end"><LanguageSwitcher compact /></div>
```

Ve en dıştaki sarmalayıcı `<div>`'in className'ine alt nav için boşluk ekle: `min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4 pb-24` (sona `pb-24`).

Kapanış `</div>`'den HEMEN ÖNCE alt nav'ı ekle:

```jsx
      <BottomNav
        tabs={TAB_KEYS.map(tb => ({ key: tb.key, icon: tb.icon, label: t(tb.i18n), badge: tb.key === 'announcements' ? unreadCount : 0 }))}
        active={activeTab} onChange={setActiveTab} />
```

- [ ] **Step 4: Vardiya durumunu lokalize et + rozet**

Vardiyam panelinde (`:256` civarı) `<div className={...${color}}>{s.status}</div>` satırını şununla değiştir:

```jsx
                <div className={`text-xs font-medium px-2 py-1 rounded-lg bg-slate-800 ${color}`}>{t('avs_kiosk.shifts.status.' + s.status, s.status)}</div>
```

> `t(key, fallback)` mevcut imza: ikinci argüman bulunamazsa dönen değer. `i18n/index.js`'te `t`'nin fallback desteğini doğrula; yoksa `lookup` sonucu undefined ise key yerine `s.status` dönecek şekilde çağrıyı `{t('avs_kiosk.shifts.status.'+s.status) || s.status}` yap.

- [ ] **Step 5: Skeleton'ları bağla**

Her panelin `!data` yükleniyor durumundaki `<div ...>{t('avs_kiosk.loading')}</div>` satırlarını `<KioskSkeleton />` ile değiştir. Yerler: shifts (`:238`), transport (`:267`), tasks (`:291`). (Profil/duyuru/arıza'da loading metni yok — dokunma.)

- [ ] **Step 6: Derleme kontrolü**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): ana ekran — KioskHeader + BottomNav + skeleton + durum lokalizasyon + logout reset"
```

---

## Task 10: Committed Playwright e2e + Windows EPERM guard

**Files:**
- Modify: `frontend/e2e/global-setup.js:9` (EPERM guard)
- Create: `frontend/e2e/avs-kiosk-ux.spec.js`

- [ ] **Step 1: global-setup EPERM guard**

`frontend/e2e/global-setup.js`'te `rmSync` satırını try/catch'e al (Windows'ta backend açık DB'yi tutarken `.tmp` silinemez; Linux/CI'da sorun yok):

```js
  if (existsSync(TMP)) {
    try { rmSync(TMP, { recursive: true, force: true }) }
    catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e }
  }
```

- [ ] **Step 2: e2e spec'i yaz**

`frontend/e2e/avs-kiosk-ux.spec.js`:

```js
import { test, expect, request as pwRequest } from '@playwright/test'

const API = 'http://localhost:3001/api'
const PINNED = `UX Test ${Date.now()}`
let pinnedId

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  const token = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  const auth = { Authorization: `Bearer ${token}` }
  const w = await ctx.post(`${API}/avs-workers`, { headers: auth, data: { full_name: PINNED, role_label: 'Temizlik Görevlisi' } })
  pinnedId = (await w.json()).id
  await ctx.put(`${API}/avs-workers/${pinnedId}/pin`, { headers: auth, data: { new_pin: '1234' } })
  await ctx.dispose()
})

test('numpad ile giris + alt nav ile sekme gezme + varsayilan TR', async ({ page }) => {
  await page.goto('/avs-kiosk')
  // Varsayilan TR (localStorage temiz) — baslik Turkce
  await expect(page.getByRole('heading', { name: 'AVS Personel Kiosk' })).toBeVisible()

  // Isimle ara + sec
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()

  // Dokunmatik numpad ile 1-2-3-4 (4. hanede otomatik giris)
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  // Giris sonrasi alt nav gorunur
  await expect(page.getByRole('tab', { name: /Vardiya/ })).toBeVisible({ timeout: 10_000 })

  // Alt nav ile Profil sekmesine gec
  await page.getByRole('tab', { name: /Profil/ }).click()
  await expect(page.getByText('Kişisel Bilgiler')).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 3: e2e'yi çalıştır**

Run: `npm run test:e2e -w frontend -- e2e/avs-kiosk-ux.spec.js --reporter=list 2>&1 | grep -vE "^\[WebServer\]" | tail -15`
Expected: `1 passed`.

> Çalışmazsa: 5174/3001 portunda asılı eski süreç olabilir — kapat (`Get-NetTCPConnection -LocalPort 3001,5174 | Stop-Process`), `frontend/e2e/.tmp`'yi sil, tekrar dene.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/avs-kiosk-ux.spec.js frontend/e2e/global-setup.js
git commit -m "test(avs-kiosk): e2e — numpad giris + alt nav + varsayilan TR; e2e Windows EPERM guard"
```

---

## Task 11: Tam derleme + final doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tam frontend build**

Run: `npm run build -w frontend 2>&1 | tail -5`
Expected: `✓ built`, hata yok.

- [ ] **Step 2: Tüm AVS e2e (varsa mevcut + yeni)**

Run: `npm run test:e2e -w frontend -- e2e/avs-kiosk-ux.spec.js --reporter=list 2>&1 | grep -vE "^\[WebServer\]" | tail -10`
Expected: PASS.

- [ ] **Step 3: Manuel smoke checklist (`npm run dev`, `/avs-kiosk`)**

`mudur/admin123` ile bir AVS worker'a PIN ver, sonra dokunmatik test:
- [ ] Numpad ile PIN girilebiliyor, 4. hanede otomatik giriş
- [ ] Açılış dili TR (localStorage temizken)
- [ ] Alt nav bar görünüyor, 6 sekme arası geçiş çalışıyor, Duyurular rozeti doğru
- [ ] Üst başlıkta canlı saat + tarih
- [ ] Vardiyam'da durum Türkçe rozet (Çalıştı/Planlı… — ham "worked" değil)
- [ ] Paneller yüklenirken skeleton görünüyor
- [ ] Çıkış sonrası login'e dönünce eski seçim/PIN kalmıyor

- [ ] **Step 4: Özet**

```bash
git status   # temiz olmalı
git log --oneline main..HEAD   # P1 commit'leri
```

Migration yok, backend yok → deploy P1 sonunda diğer fazlarla birlikte ya da tek başına gidebilir.

---

## Self-Review Notları

- **Spec kapsamı:** PinPad/BottomNav/KioskHeader/KioskSkeleton (Task 2-5), useClock (Task 1), varsayılan TR (Task 6), i18n status+nav (Task 7), entegrasyon+status lokalizasyon+logout reset (Task 8-9), e2e (Task 10) → spec'in 7 maddesi + bileşen tablosu karşılandı.
- **Test stratejisi sapması (bilinçli):** Spec "vitest unit" dedi; frontend'de runner yok → build + Playwright e2e (proje konvansiyonu) seçildi. Yeni test runner eklenmedi.
- **Tip/prop tutarlılığı:** `PinPad(value,onChange,onComplete,length,error)`, `BottomNav(tabs[{key,icon,label,badge}],active,onChange)`, `KioskHeader(userName,onLogout)`, `KioskSkeleton(rows)`, `useClock()→{time,date}` — tanım (Task 1-5) ile kullanım (Task 8-9) eşleşiyor.
- **Doğrulandı:** `t(key, fallback)` ikinci-argüman fallback'i destekleniyor (`i18n/index.js:62`) → Task 9 Step 4 birincil form çalışır. `DEFAULT_LOCALE='tr'` (`dict.js:11`) → Task 6 doğru.
