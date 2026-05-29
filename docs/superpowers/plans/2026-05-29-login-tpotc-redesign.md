# Login TP-OTC Sinematik Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut tek-viewport login'i TP-OTC tarzı çok bölümlü, kaydırmalı, sinematik kurumsal denizcilik landing'ine dönüştür — tüm auth işlevselliğini (RBAC, 2FA, cooldown, caps-lock, kiosk) koruyarak.

**Architecture:** `LoginPage.jsx` bir orkestratör olur (state + auth mantığı). Sunum, odaklı bileşenlere ayrılır: `components/HeroScene`, `components/LoginCard` ve `components/sections/*`. Saf mantık (count-up, scroll-reveal, hareket tercihi, heatmap rengi) test edilebilir hook/helper'lara çıkar. Görünüm tek kaynağı onaylı mockup: `docs/login-redesign-assets/mockup-tpotc-style.html`.

**Tech Stack:** React 18 (Vite), Vitest + jsdom + @testing-library/react, mevcut `shared/i18n`, `shared/blocks.js`, `shared/api/client.js`, open-meteo, IntersectionObserver, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-05-29-login-cinematic-redesign-design.md`

**Test komutu (frontend):** `cd frontend && npx vitest run <dosya>` · tümü: `cd frontend && npx vitest run`

---

## File Structure

**Yeni dosyalar:**
- `frontend/src/modules/auth/loginData.js` — sabitler (MODULES, MODES, KIOSKS, hizmet kartları, ticker)
- `frontend/src/modules/auth/hooks/useReveal.js` — IntersectionObserver scroll-reveal
- `frontend/src/modules/auth/hooks/useReveal.test.js`
- `frontend/src/modules/auth/hooks/useCountUp.js` — viewport'a girince sayaç
- `frontend/src/modules/auth/hooks/useCountUp.test.js`
- `frontend/src/modules/auth/hooks/useMotionPref.js` — Sakin/Yavaş/Normal + reduced-motion + localStorage
- `frontend/src/modules/auth/hooks/useMotionPref.test.js`
- `frontend/src/modules/auth/heatmap.js` — blok doluluk → renk eşiği (saf fonksiyon)
- `frontend/src/modules/auth/heatmap.test.js`
- `frontend/src/modules/auth/components/HeroScene.jsx` — video + yağmur canvas + HUD
- `frontend/src/modules/auth/components/LoginCard.jsx` — cam login paneli (mod/form/2fa/passkey/dil)
- `frontend/src/modules/auth/components/LoginCard.test.jsx`
- `frontend/src/modules/auth/components/sections/MissionBand.jsx`
- `frontend/src/modules/auth/components/sections/ServicePillars.jsx`
- `frontend/src/modules/auth/components/sections/ModuleCarousel.jsx`
- `frontend/src/modules/auth/components/sections/StatsCounter.jsx`
- `frontend/src/modules/auth/components/sections/BlockHeatmap.jsx`
- `frontend/src/modules/auth/components/sections/BlockHeatmap.test.jsx`
- `frontend/src/modules/auth/components/sections/FilyosEnv.jsx`
- `frontend/src/modules/auth/components/sections/SecurityBand.jsx`
- `frontend/src/modules/auth/components/sections/LandingTicker.jsx`
- `frontend/src/modules/auth/components/sections/LandingFooter.jsx`

**Değişen dosyalar:**
- `frontend/src/modules/auth/LoginPage.jsx` — orkestratöre indirgenir, bölümleri kompoze eder
- `frontend/src/modules/auth/LoginPage.css` — TP-OTC paletine retune + bölüm stilleri
- `backend/src/shared/security/helmet.*` (CSP — `mediaSrc`/`imgSrc`/`connectSrc` doğrula) — Faz 5

**Dokunulmaz:** `LoginModals.jsx`, `shared/auth/postLoginRedirect.js`, `shared/store/authStore.js`, backend auth.

---

## Faz 0 — Güvenlik ağı: mevcut davranışı kilitle

Refactor öncesi mevcut login'in çalışan davranışını test altına al ki bozulmasın.

### Task 0.1: LoginPage mevcut davranış smoke testi

**Files:**
- Test: `frontend/src/modules/auth/LoginPage.test.jsx`

- [ ] **Step 1: Mevcut testleri çalıştır (baseline)**

Run: `cd frontend && npx vitest run`
Expected: PASS (mevcut testler geçiyor — kırmızı yoksa devam)

- [ ] **Step 2: Smoke test yaz**

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage from './LoginPage.jsx'

// api ve store'u izole et
vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() },
}))
vi.mock('../../shared/store/authStore.js', () => ({
  useAuthStore: (sel) => sel({ login: vi.fn() }),
}))

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>)

describe('LoginPage — temel davranış', () => {
  beforeEach(() => { global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ current: {} }) })) })

  it('4 giriş modunu gösterir', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /Personel/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Yönetici/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Güvenlik/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Kiosk/ })).toBeInTheDocument()
  })

  it('kullanıcı adı ve şifre alanlarını render eder', () => {
    renderPage()
    expect(screen.getByLabelText(/Kullanıcı Adı/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Şifre/i)).toBeInTheDocument()
  })

  it('Kiosk moduna geçince PIN/QR kısayollarını gösterir', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /Kiosk/ }))
    expect(screen.getByText(/AVS Personel/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Testi çalıştır, geçtiğini doğrula**

Run: `cd frontend && npx vitest run src/modules/auth/LoginPage.test.jsx`
Expected: PASS (3 test) — geçmezse mevcut markup'a göre selektörleri düzelt, davranışı DEĞİŞTİRME

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/auth/LoginPage.test.jsx
git commit -m "test(login): mevcut davranış güvenlik ağı (refactor öncesi)"
```

---

## Faz 1 — Saf mantık hook/helper'ları (TDD)

Animasyon ve heatmap mantığını sunumdan ayrı, test edilebilir birimlere çıkar.

### Task 1.1: heatmap renk eşiği (saf fonksiyon)

**Files:**
- Create: `frontend/src/modules/auth/heatmap.js`
- Test: `frontend/src/modules/auth/heatmap.test.js`

- [ ] **Step 1: Failing test**

```js
import { describe, it, expect } from 'vitest'
import { occupancyColor } from './heatmap.js'

describe('occupancyColor', () => {
  it('düşük doluluk yeşil (<60)', () => expect(occupancyColor(45)).toBe('#1fa971'))
  it('orta doluluk sarı (60–79)', () => expect(occupancyColor(70)).toBe('#d6a020'))
  it('yüksek doluluk kırmızı (>=80)', () => expect(occupancyColor(92)).toBe('#d6453f'))
  it('sınır 60 sarı', () => expect(occupancyColor(60)).toBe('#d6a020'))
  it('sınır 80 kırmızı', () => expect(occupancyColor(80)).toBe('#d6453f'))
  it('null/undefined nötr gri', () => expect(occupancyColor(null)).toBe('#41576b'))
})
```

- [ ] **Step 2: Run — fail**

Run: `cd frontend && npx vitest run src/modules/auth/heatmap.test.js`
Expected: FAIL ("occupancyColor is not a function")

- [ ] **Step 3: Implement**

```js
// Blok doluluk yüzdesini renge çevirir (yeşil→sarı→kırmızı). Saf — UI'dan bağımsız test edilebilir.
export function occupancyColor(pct) {
  if (pct == null || Number.isNaN(pct)) return '#41576b' // nötr gri
  if (pct >= 80) return '#d6453f'
  if (pct >= 60) return '#d6a020'
  return '#1fa971'
}
```

- [ ] **Step 4: Run — pass**

Run: `cd frontend && npx vitest run src/modules/auth/heatmap.test.js`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/heatmap.js frontend/src/modules/auth/heatmap.test.js
git commit -m "feat(login): heatmap doluluk renk eşiği helper'ı"
```

### Task 1.2: useCountUp hook

**Files:**
- Create: `frontend/src/modules/auth/hooks/useCountUp.js`
- Test: `frontend/src/modules/auth/hooks/useCountUp.test.js`

- [ ] **Step 1: Failing test**

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCountUp } from './useCountUp.js'

describe('useCountUp', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('aktif değilken 0 döner', () => {
    const { result } = renderHook(() => useCountUp(100, false))
    expect(result.current).toBe(0)
  })

  it('aktif olunca hedefe yükselir', () => {
    const { result } = renderHook(() => useCountUp(100, true, 500))
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current).toBe(100)
  })

  it('reduced-motion: anında hedef', () => {
    const { result } = renderHook(() => useCountUp(50, true, 500, true))
    expect(result.current).toBe(50)
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useCountUp.test.js`
Expected: FAIL ("useCountUp is not a function")

- [ ] **Step 3: Implement**

```js
import { useEffect, useState } from 'react'

// `active` true olunca `to` değerine `durationMs` içinde yükselir. reduced ise anında.
export function useCountUp(to, active, durationMs = 1200, reduced = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    if (reduced) { setVal(to); return }
    let raf, start
    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / durationMs)
      setVal(Math.round(to * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, active, durationMs, reduced])
  return val
}
```

> Not: jsdom'da `requestAnimationFrame` fake timer ile çalışmazsa testte `vi.stubGlobal('requestAnimationFrame', cb => setTimeout(() => cb(performance.now()), 16))` ekle (setupFiles'a değil, test dosyasına `beforeEach`).

- [ ] **Step 4: Run — pass**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useCountUp.test.js`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/hooks/useCountUp.js frontend/src/modules/auth/hooks/useCountUp.test.js
git commit -m "feat(login): useCountUp hook (viewport sayaç animasyonu)"
```

### Task 1.3: useReveal hook (scroll-reveal)

**Files:**
- Create: `frontend/src/modules/auth/hooks/useReveal.js`
- Test: `frontend/src/modules/auth/hooks/useReveal.test.js`

- [ ] **Step 1: Failing test**

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReveal } from './useReveal.js'

describe('useReveal', () => {
  let observeCb
  beforeEach(() => {
    global.IntersectionObserver = vi.fn((cb) => { observeCb = cb; return { observe: vi.fn(), disconnect: vi.fn() } })
  })

  it('başlangıçta görünmez (false)', () => {
    const { result } = renderHook(() => useReveal())
    expect(result.current[1]).toBe(false)
  })

  it('reduced-motion ise anında görünür (true)', () => {
    const { result } = renderHook(() => useReveal(true))
    expect(result.current[1]).toBe(true)
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useReveal.test.js`
Expected: FAIL ("useReveal is not a function")

- [ ] **Step 3: Implement**

```js
import { useEffect, useRef, useState } from 'react'

// [ref, visible] döner. Element viewport'a girince visible=true (bir kez). reduced ise hep true.
export function useReveal(reduced = false) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(reduced)
  useEffect(() => {
    if (reduced || !ref.current) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { setVisible(true); io.disconnect() } })
    }, { threshold: 0.15 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [reduced])
  return [ref, visible]
}
```

- [ ] **Step 4: Run — pass**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useReveal.test.js`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/hooks/useReveal.js frontend/src/modules/auth/hooks/useReveal.test.js
git commit -m "feat(login): useReveal hook (scroll-reveal)"
```

### Task 1.4: useMotionPref hook

**Files:**
- Create: `frontend/src/modules/auth/hooks/useMotionPref.js`
- Test: `frontend/src/modules/auth/hooks/useMotionPref.test.js`

- [ ] **Step 1: Failing test**

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMotionPref } from './useMotionPref.js'

describe('useMotionPref', () => {
  beforeEach(() => {
    localStorage.clear()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })

  it('varsayılan motion "slow", rain açık', () => {
    const { result } = renderHook(() => useMotionPref())
    expect(result.current.motion).toBe('slow')
    expect(result.current.rain).toBe(true)
  })

  it('reduced-motion: motion "calm", rain kapalı', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const { result } = renderHook(() => useMotionPref())
    expect(result.current.motion).toBe('calm')
    expect(result.current.rain).toBe(false)
    expect(result.current.reduced).toBe(true)
  })

  it('setMotion localStorage\'a yazar', () => {
    const { result } = renderHook(() => useMotionPref())
    act(() => result.current.setMotion('normal'))
    expect(result.current.motion).toBe('normal')
    expect(localStorage.getItem('yys-login-motion')).toBe('normal')
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useMotionPref.test.js`
Expected: FAIL ("useMotionPref is not a function")

- [ ] **Step 3: Implement**

```js
import { useCallback, useState } from 'react'

const MK = 'yys-login-motion', RK = 'yys-login-rain'
const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

// Hareket tercihi: 'calm' | 'slow' | 'normal' + yağmur aç/kapa. reduced-motion'da calm + yağmur kapalı.
export function useMotionPref() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [motion, setMotionState] = useState(() => reduced ? 'calm' : read(MK, 'slow'))
  const [rain, setRainState] = useState(() => reduced ? false : read(RK, 'on') === 'on')

  const setMotion = useCallback((m) => {
    setMotionState(m); try { localStorage.setItem(MK, m) } catch { /* yoksay */ }
  }, [])
  const setRain = useCallback((on) => {
    setRainState(on); try { localStorage.setItem(RK, on ? 'on' : 'off') } catch { /* yoksay */ }
  }, [])

  return { motion, setMotion, rain, setRain, reduced: !!reduced }
}
```

- [ ] **Step 4: Run — pass**

Run: `cd frontend && npx vitest run src/modules/auth/hooks/useMotionPref.test.js`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/hooks/useMotionPref.js frontend/src/modules/auth/hooks/useMotionPref.test.js
git commit -m "feat(login): useMotionPref hook (hareket/yağmur tercihi)"
```

---

## Faz 2 — Veri sabitleri + tema retune

### Task 2.1: loginData.js — sabitleri çıkar

**Files:**
- Create: `frontend/src/modules/auth/loginData.js`
- Modify: `frontend/src/modules/auth/LoginPage.jsx` (sabitleri import et)

- [ ] **Step 1: loginData.js oluştur**

LoginPage.jsx'teki `KIOSKS`, `MODULES`, `MODE_ORDER`, `MODE_TITLES`, `DEMO_USERS`, `COMPASS`, `WMO`, `LAT/LON` sabitlerini buraya taşı + landing için yeni sabitler ekle:

```js
export const LAT = 41.57, LON = 32.04
export const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']
export const WMO = { /* …mevcut LoginPage.jsx'teki WMO objesini birebir taşı… */ }

export const DEMO_USERS = [ /* …mevcut… */ ]
export const KIOSKS = [ /* …mevcut… */ ]
export const MODE_ORDER = [ /* …mevcut… */ ]
export const MODE_TITLES = { /* …mevcut… */ }

// Modüller artık canlı rozet alanlı (carousel için). badge: stats'tan türetilir (Stats/Carousel'de bağlanır).
export const MODULES = [
  { icon: '🛏️', name: 'Oda & Yatak', spec: '814 yatak · 19 blok' },
  { icon: '📋', name: 'Check-in/out', spec: 'giriş/çıkış akışı' },
  { icon: '🔧', name: 'Arıza & Bakım', spec: 'SLA takipli' },
  { icon: '📦', name: 'Zimmet', spec: 'dijital imza' },
  { icon: '⚖️', name: 'Disiplin', spec: 'kayıt & uyarı' },
  { icon: '📅', name: 'Vardiya', spec: 'puantaj entegre' },
  { icon: '🍽️', name: 'Yemekhane', spec: 'menü & sayım' },
  { icon: '🧺', name: 'Çamaşırhane', spec: 'kiosk akışı' },
  { icon: '🚪', name: 'Ziyaretçi', spec: 'kapı kontrol' },
  { icon: '📈', name: 'Raporlama', spec: 'günlük özet' },
]

export const PILLARS = [
  { icon: '🛏️', title: 'Konaklama & Operasyon', desc: 'Oda/yatak atama, check-in/out, ziyaretçi ve disiplin akışları — gerçek zamanlı doluluk.' },
  { icon: '🔧', title: 'Tesis & Bakım', desc: 'Arıza takibi, bakım planı, zimmet ve çamaşırhane lojistiği tek panelde.' },
  { icon: '👥', title: 'Personel & İK', desc: 'Vardiya, puantaj, yemekhane ve raporlama — KVKK uyumlu, rol bazlı erişim.' },
]

export const SECURITY = [
  { icon: '🔒', title: 'TLS 1.3', desc: 'uçtan uca şifreli' },
  { icon: '🛡️', title: 'RBAC + 2FA', desc: 'rol bazlı + TOTP' },
  { icon: '💾', title: 'Gece yedeği', desc: 'her gün 03:00' },
  { icon: '⚡', title: '%99.9 uptime', desc: 'KampüsERP v5.0' },
]
```

- [ ] **Step 2: LoginPage.jsx'te import et, yerel kopyaları sil**

`LoginPage.jsx` üstündeki taşınan sabit tanımlarını sil, yerine:
```js
import { LAT, LON, COMPASS, WMO, DEMO_USERS, KIOSKS, MODE_ORDER, MODE_TITLES, MODULES } from './loginData.js'
```

- [ ] **Step 3: Faz 0 testini çalıştır — yeşil kalmalı**

Run: `cd frontend && npx vitest run src/modules/auth/LoginPage.test.jsx`
Expected: PASS (3 test — davranış değişmedi)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/auth/loginData.js frontend/src/modules/auth/LoginPage.jsx
git commit -m "refactor(login): sabitleri loginData.js'e çıkar + landing sabitleri"
```

### Task 2.2: CSS paletini TP-OTC'ye retune

**Files:**
- Modify: `frontend/src/modules/auth/LoginPage.css:7-19` (`.lp-root` değişkenleri)

- [ ] **Step 1: Değişkenleri güncelle**

`.lp-root` değişken bloğunu TP-OTC paletine ayarla (mevcut isimleri koru, değerleri güncelle):
```css
.lp-root {
  --void:#030c16; --navy-0:#04101c; --navy-1:#071c30; --navy-2:#0a2236;
  --glass:rgba(7,28,48,.55); --glass-hi:rgba(10,34,54,.7);
  --blue:#0b6f86; --blue-hi:#19c6d4; --teal:#19c6d4; --teal-hi:#4fe8ee;
  --ember:#ff9d3d; --ember-hi:#ffd08a; --gold:#ffce6a;
  --white:#eaf6fb; --muted:rgba(141,179,198,.78); --muted-2:rgba(141,179,198,.45);
  --line:rgba(120,200,220,.16); --line-hi:rgba(25,198,212,.42);
  --danger:#ff4d6d; --ok:#5fe3b6; --tr-red:#e30a17;
  /* font değişkenleri --d/--b/--m aynı kalır */
}
```

- [ ] **Step 2: Görsel doğrula (manuel)**

Run: `cd frontend && npm run dev` → tarayıcıda `/login` aç
Expected: Mevcut login cyan/amber tonlarına döndü, layout bozulmadı. (Kapat: Ctrl+C)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/auth/LoginPage.css
git commit -m "style(login): CSS paletini TP-OTC (lacivert+cyan+amber) retune"
```

---

## Faz 3 — HeroScene + LoginCard bileşenleri

### Task 3.1: LoginCard bileşenini çıkar (auth korunur)

LoginPage.jsx'teki login kartı JSX'i (modes + form + 2fa + kiosk + demo) `LoginCard.jsx`'e taşınır. Tüm state ve handler'lar **prop olarak** geçer — mantık LoginPage'de kalır.

**Files:**
- Create: `frontend/src/modules/auth/components/LoginCard.jsx`
- Create: `frontend/src/modules/auth/components/LoginCard.test.jsx`
- Modify: `frontend/src/modules/auth/LoginPage.jsx`

- [ ] **Step 1: LoginCard.jsx oluştur**

`LoginPage.jsx`'teki `<aside className="login">…</aside>` bloğunu (satır ~395-529) buraya taşı. `TwoFactorInput` da bu dosyaya taşınır. Props imzası:
```jsx
// Tüm state/handler LoginPage'den prop gelir — bileşen saf sunum + dil seçici.
export function LoginCard({
  mode, onModeChange, mTitle, mSub, isForm,
  username, setUsername, password, setPassword, showPw, setShowPw,
  capsLock, setCapsLock, error, loading, isLocked, cooldownLeft,
  onSubmit, twoFA, code, setCode, shake, onVerify2fa, onCancel2fa,
  onForgot, kiosks, onKioskNav, demoUsers, onPickDemo,
}) { /* …taşınan JSX… mevcut className'ler birebir korunur… */ }
```
Üstüne **dil seçici** (TR/EN/AR) ve **son giriş** satırını `.ctop` olarak ekle (mockup'taki gibi), dil için `shared/i18n` kullan:
```jsx
import { useTranslation, setLocale } from '../../../shared/i18n/index.js'
// kart başında:
// <div className="ctop"><div className="lang">{['tr','en','ar'].map(l => <button key={l} className={`lang-b ${locale===l?'on':''}`} onClick={()=>setLocale(l)}>{l.toUpperCase()}</button>)}</div><div className="lastlogin">{lastLogin || ''}</div></div>
```

- [ ] **Step 2: LoginPage.jsx'te kullan**

`<aside>` bloğunu `<LoginCard …props />` ile değiştir, `TwoFactorInput` tanımını LoginPage'den sil (artık LoginCard'da).

- [ ] **Step 3: Smoke test yaz**

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LoginCard } from './LoginCard.jsx'

const base = {
  mode: 'standard', onModeChange: vi.fn(), mTitle: 'Personel Girişi', mSub: 'alt',
  isForm: true, username: '', setUsername: vi.fn(), password: '', setPassword: vi.fn(),
  showPw: false, setShowPw: vi.fn(), capsLock: false, setCapsLock: vi.fn(),
  error: '', loading: false, isLocked: false, cooldownLeft: 0, onSubmit: vi.fn(),
  twoFA: null, code: '', setCode: vi.fn(), shake: false, onVerify2fa: vi.fn(), onCancel2fa: vi.fn(),
  onForgot: vi.fn(), kiosks: [], onKioskNav: vi.fn(), demoUsers: [], onPickDemo: vi.fn(),
}

describe('LoginCard', () => {
  it('mod sekmelerini ve form alanlarını render eder', () => {
    render(<LoginCard {...base} />)
    expect(screen.getByLabelText(/Kullanıcı Adı/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Yönetici/ })).toBeInTheDocument()
  })
  it('dil seçicide TR/EN/AR gösterir', () => {
    render(<LoginCard {...base} />)
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AR' })).toBeInTheDocument()
  })
  it('submit çağrılır', () => {
    render(<LoginCard {...base} />)
    fireEvent.submit(screen.getByLabelText(/Kullanıcı Adı/i).closest('form'))
    expect(base.onSubmit).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run — pass + Faz 0 yeşil**

Run: `cd frontend && npx vitest run src/modules/auth/components/LoginCard.test.jsx src/modules/auth/LoginPage.test.jsx`
Expected: PASS (6 test toplam)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/components/LoginCard.jsx frontend/src/modules/auth/components/LoginCard.test.jsx frontend/src/modules/auth/LoginPage.jsx
git commit -m "refactor(login): LoginCard bileşeni + dil seçici + son giriş"
```

### Task 3.2: HeroScene bileşeni (video + yağmur + HUD)

**Files:**
- Create: `frontend/src/modules/auth/components/HeroScene.jsx`
- Modify: `frontend/src/modules/auth/LoginPage.jsx`

- [ ] **Step 1: HeroScene.jsx oluştur**

Video katmanı + yağmur canvas + HUD (motion seg + rain toggle). `useMotionPref` sonucu prop gelir. Yağmur canvas: `rain && motion!=='calm'` iken çizer; sekme gizliyken `requestAnimationFrame` durur (`document.hidden`).
```jsx
import { useEffect, useRef } from 'react'

export function HeroScene({ posterSrc, videoSrc, motion, setMotion, rain, setRain, reduced, children }) {
  const videoRef = useRef(null), canvasRef = useRef(null)

  // video hız: calm→duraklat, slow→0.5x, normal→1x
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    if (motion === 'calm') { v.pause() } else { v.playbackRate = motion === 'slow' ? 0.5 : 1; v.play().catch(() => {}) }
  }, [motion])

  // yağmur
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !rain || motion === 'calm') return
    const ctx = cv.getContext('2d')
    const size = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight }
    size(); window.addEventListener('resize', size)
    const drops = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, l: 8 + Math.random() * 12, s: 3 + Math.random() * 4 }))
    let raf
    const draw = () => {
      if (document.hidden) { raf = requestAnimationFrame(draw); return }
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.strokeStyle = 'rgba(150,210,230,.25)'; ctx.lineWidth = 1
      drops.forEach(d => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1, d.y + d.l); ctx.stroke(); d.y += d.s * 2; d.x -= .4; if (d.y > cv.height) { d.y = -10; d.x = Math.random() * cv.width } })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [rain, motion])

  return (
    <header className="hero">
      <video className="hero-video" ref={videoRef} muted loop playsInline preload="auto" poster={posterSrc} aria-hidden="true">
        {videoSrc && <source src={videoSrc} type="video/mp4" />}
      </video>
      <div className="video-grade" />
      {!reduced && <canvas className="rain-canvas" ref={canvasRef} aria-hidden="true" />}
      <div className="hud">
        <div className="seg" role="group" aria-label="Hareket">
          {[['calm', 'Sakin'], ['slow', 'Yavaş'], ['normal', 'Normal']].map(([k, lb]) => (
            <button key={k} type="button" className={motion === k ? 'on' : ''} onClick={() => setMotion(k)}>{lb}</button>
          ))}
        </div>
        <button type="button" className={`toggle ${rain ? '' : 'off'}`} onClick={() => setRain(!rain)} aria-pressed={rain}>
          <span>🌧️ Yağmur</span><span className="sw" />
        </button>
      </div>
      {children}
    </header>
  )
}
```
Asset yolu: `frontend/public/login/` altına `hero-night.mp4` + `D2-night-bright.png` kopyala (Faz 5'te optimize). Şimdilik: `posterSrc="/login/D2-night-bright.png"`, `videoSrc="/login/hero-night.mp4"`.

- [ ] **Step 2: Asset'leri public'e kopyala**

```bash
mkdir -p frontend/public/login
cp docs/login-redesign-assets/hero-night.mp4 frontend/public/login/
cp docs/login-redesign-assets/D2-night-bright.png frontend/public/login/
```

- [ ] **Step 3: LoginPage.jsx'te eski `.scene` bloğunu HeroScene ile değiştir**

`useMotionPref()` çağır; `<div className="scene">…</div>` + eski video useEffect/paralaks'ı kaldır; `<HeroScene …>` içine hero-copy + `<LoginCard/>` koy.

- [ ] **Step 4: Faz 0 testi + manuel doğrula**

Run: `cd frontend && npx vitest run src/modules/auth/LoginPage.test.jsx`
Expected: PASS. Sonra `npm run dev` → video oynuyor, HUD toggle çalışıyor, yağmur açılıp kapanıyor.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/components/HeroScene.jsx frontend/src/modules/auth/LoginPage.jsx frontend/public/login/
git commit -m "feat(login): HeroScene — video + yağmur canvas + hareket HUD"
```

---

## Faz 4 — Landing bölümleri

Her bölüm odaklı bir bileşen. Hepsi `useReveal` ile scroll-reveal sarmalı. Bu fazda bileşenler oluşturulup **Task 4.9'da** LoginPage'e kompoze edilir.

### Task 4.1: MissionBand

**Files:** Create `frontend/src/modules/auth/components/sections/MissionBand.jsx`

- [ ] **Step 1: Oluştur**

```jsx
export function MissionBand() {
  return (
    <div className="mission">
      <div className="fire">🔥 Misyon</div>
      <h2>Kampüsün <span>kesintisiz nefesi</span> biziz.</h2>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/MissionBand.jsx
git commit -m "feat(login): MissionBand bölümü"
```

### Task 4.2: ServicePillars

**Files:** Create `frontend/src/modules/auth/components/sections/ServicePillars.jsx`

- [ ] **Step 1: Oluştur**

```jsx
import { PILLARS } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

export function ServicePillars({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Operasyon alanları</div>
        <h3>Üç ana eksende tam kontrol</h3>
        <div className="pillars">
          {PILLARS.map(p => (
            <div className="pillar" key={p.title}>
              <div className="gl" /><div className="ic">{p.icon}</div>
              <h4>{p.title}</h4><p>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/ServicePillars.jsx
git commit -m "feat(login): ServicePillars bölümü"
```

### Task 4.3: ModuleCarousel

**Files:** Create `frontend/src/modules/auth/components/sections/ModuleCarousel.jsx`

- [ ] **Step 1: Oluştur** — canlı rozetleri `stats`'tan türet (yoksa nötr).

```jsx
import { MODULES } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

// stats'tan modül rozeti türet (hardcode değil — gerçek veriden).
function badgeFor(name, stats) {
  if (!stats) return null
  if (name === 'Oda & Yatak') return { ok: true, text: `%${stats.occupancy_pct} dolu` }
  if (name === 'Arıza & Bakım') return { ok: stats.open_faults === 0, text: `${stats.open_faults} açık` }
  return null
}

export function ModuleCarousel({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section id="modules" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Filo</div>
        <h3>10 entegre modül — canlı durum</h3>
        <div className="track" role="list">
          {MODULES.map(m => {
            const b = badgeFor(m.name, stats)
            return (
              <div className="mcard" role="listitem" key={m.name}>
                <div className="mc-top"><span className="em">{m.icon}</span>
                  {b && <span className={`liveb ${b.ok ? 'ok' : ''}`}>{b.text}</span>}
                </div>
                <h4>{m.name}</h4><div className="spec">{m.spec}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/ModuleCarousel.jsx
git commit -m "feat(login): ModuleCarousel bölümü (canlı rozetli)"
```

### Task 4.4: StatsCounter

**Files:** Create `frontend/src/modules/auth/components/sections/StatsCounter.jsx`

- [ ] **Step 1: Oluştur** — `useReveal` görünürlüğü `useCountUp`'a `active` olarak besler.

```jsx
import { useReveal } from '../../hooks/useReveal.js'
import { useCountUp } from '../../hooks/useCountUp.js'

function Stat({ to, suffix = '', label, active, reduced }) {
  const v = useCountUp(to, active, 1200, reduced)
  return <div className="stat"><div className="v">{v}{suffix}</div><div className="l">{label}</div></div>
}

export function StatsCounter({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const s = stats || {}
  return (
    <section id="stats" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Sayılarla AVS</div>
        <h3>Kampüs bir bakışta</h3>
        <div className="stats">
          <Stat to={s.occupancy_pct ?? 0} suffix="%" label="Doluluk oranı" active={vis} reduced={reduced} />
          <Stat to={s.beds_occupied ?? 0} label={`Dolu yatak / ${s.beds_total ?? '—'}`} active={vis} reduced={reduced} />
          <Stat to={19} label="Aktif blok" active={vis} reduced={reduced} />
          <Stat to={s.active_staff ?? 0} label="Aktif personel" active={vis} reduced={reduced} />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/StatsCounter.jsx
git commit -m "feat(login): StatsCounter bölümü (count-up)"
```

### Task 4.5a: Backend — /public/stats'e per-blok doluluk ekle (TDD)

Heatmap'in gerçek veriyle çalışması için public stats'e blok dizisi eklenir. Hassas veri değil (sadece blok adı + %).

**Files:**
- Modify: `backend/src/modules/public/routes.js` (response'a `blocks` ekle)
- Modify: `backend/src/modules/public/queries.js` veya yardımcı (per-blok occupancy hesabı; mevcut KPI/queries kalıbını izle)
- Test: `backend/src/modules/public/public.test.js`

- [ ] **Step 1: Failing test ekle**

```js
it('blok başına doluluk dizisi döner', async () => {
  const res = await request(app).get('/api/public/stats')
  expect(res.status).toBe(200)
  expect(Array.isArray(res.body.blocks)).toBe(true)
  if (res.body.blocks.length) {
    expect(res.body.blocks[0]).toHaveProperty('block')
    expect(res.body.blocks[0]).toHaveProperty('occupancy_pct')
  }
})
```

- [ ] **Step 2: Run — fail**

Run: `cd backend && npx vitest run src/modules/public/public.test.js`
Expected: FAIL (`blocks` undefined)

- [ ] **Step 3: Implement** — mevcut campus-map/dashboard query kalıbını kullanarak blok bazlı doluluk üret (parametreli SQL), `routes.js` response'una `blocks: e.blocks` ekle. Blok adları DB'den gelir; eksik bloklar frontend'de nötr render edilir.

- [ ] **Step 4: Run — pass**

Run: `cd backend && npx vitest run src/modules/public/public.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/public/
git commit -m "feat(public): /public/stats'e blok bazlı doluluk dizisi"
```

### Task 4.5: BlockHeatmap (test'li)

**Files:**
- Create: `frontend/src/modules/auth/components/sections/BlockHeatmap.jsx`
- Create: `frontend/src/modules/auth/components/sections/BlockHeatmap.test.jsx`

- [ ] **Step 1: Failing test** — `BLOCKS`'tan 19 hücre, hardcode yok.

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BlockHeatmap } from './BlockHeatmap.jsx'

vi.mock('../../hooks/useReveal.js', () => ({ useReveal: () => [{ current: null }, true] }))

describe('BlockHeatmap', () => {
  it('19 blok hücresi render eder', () => {
    render(<BlockHeatmap blocks={[]} reduced />)
    expect(screen.getAllByTestId('heat-cell')).toHaveLength(19)
  })
  it('blok adını gösterir (M1)', () => {
    render(<BlockHeatmap blocks={[]} reduced />)
    expect(screen.getByText('M1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `cd frontend && npx vitest run src/modules/auth/components/sections/BlockHeatmap.test.jsx`
Expected: FAIL (bileşen yok)

- [ ] **Step 3: Implement** — `BLOCKS` üzerinden, `occupancyColor` ile.

```jsx
import { BLOCKS } from '../../../../shared/blocks.js'
import { occupancyColor } from '../../heatmap.js'
import { useReveal } from '../../hooks/useReveal.js'

// blocks: [{ block, occupancy_pct }] (public stats'tan). Eşleşmeyen blok → null pct (nötr).
export function BlockHeatmap({ blocks = [], reduced }) {
  const [ref, vis] = useReveal(reduced)
  const byName = Object.fromEntries(blocks.map(b => [b.block, b.occupancy_pct]))
  return (
    <section id="heat" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Yeni</div>
        <h3>19 blok doluluk haritası</h3>
        <div className="heat">
          {BLOCKS.map(b => {
            const pct = byName[b.block] ?? null
            const c = occupancyColor(pct)
            return (
              <div className="hb" key={b.block} data-testid="heat-cell"
                style={{ background: `linear-gradient(180deg,${c}22,${c}44)`, borderColor: c + '66' }}
                title={`${b.block} bloğu · ${pct == null ? 'veri yok' : `%${pct} dolu`}`}>
                {b.block}<small>{pct == null ? '—' : `%${pct}`}</small>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run — pass**

Run: `cd frontend && npx vitest run src/modules/auth/components/sections/BlockHeatmap.test.jsx`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/auth/components/sections/BlockHeatmap.jsx frontend/src/modules/auth/components/sections/BlockHeatmap.test.jsx
git commit -m "feat(login): BlockHeatmap bölümü (19 blok, BLOCKS kaynaklı)"
```

### Task 4.6: FilyosEnv

**Files:** Create `frontend/src/modules/auth/components/sections/FilyosEnv.jsx`

- [ ] **Step 1: Oluştur** — `weather` prop (LoginPage'deki mevcut open-meteo state'i).

```jsx
import { useReveal } from '../../hooks/useReveal.js'

export function FilyosEnv({ weather, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const w = weather || {}
  const items = [
    ['🌡️', w.temp != null ? `${w.temp}°` : '—°', `Sıcaklık · ${w.desc || '—'}`],
    ['💨', w.windKn != null ? `${w.windKn} kn` : '—', `Rüzgâr · ${w.windDir || '—'}`],
    ['🌊', w.wave != null ? `${w.wave} m` : '—', 'Dalga yüksekliği'],
    ['🌅', w.sunrise || '—', 'Gün doğumu'],
  ]
  return (
    <section id="env" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Canlı · open-meteo</div>
        <h3>Filyos anlık ortam</h3>
        <div className="env">
          {items.map(([em, v, l]) => (
            <div className="ev" key={l}><span className="em">{em}</span><div><div className="v">{v}</div><div className="l">{l}</div></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/FilyosEnv.jsx
git commit -m "feat(login): FilyosEnv bölümü (canlı hava/deniz)"
```

### Task 4.7: SecurityBand

**Files:** Create `frontend/src/modules/auth/components/sections/SecurityBand.jsx`

- [ ] **Step 1: Oluştur**

```jsx
import { SECURITY } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

export function SecurityBand({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section id="sec" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Sistem & Güvenlik</div>
        <h3>Kurumsal güvence</h3>
        <div className="secband">
          {SECURITY.map(s => (
            <div className="sec" key={s.title}><span className="em">{s.icon}</span><div><b>{s.title}</b><span>{s.desc}</span></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/auth/components/sections/SecurityBand.jsx
git commit -m "feat(login): SecurityBand bölümü"
```

### Task 4.8: LandingTicker + LandingFooter

**Files:**
- Create `frontend/src/modules/auth/components/sections/LandingTicker.jsx`
- Create `frontend/src/modules/auth/components/sections/LandingFooter.jsx`

- [ ] **Step 1: LandingTicker.jsx** — JSX ile render (innerHTML YOK), iki kez tekrar marquee için.

```jsx
export function LandingTicker({ items }) {
  const doubled = [...items, ...items]
  return (
    <div className="tickerbar" aria-label="Sistem akışı">
      <div className="ticker">
        {doubled.map(([key, label, val], i) => (
          <span className="tk-item" key={i}><b>{label}</b> {val}<span className="d">●</span></span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: LandingFooter.jsx** — modal tetikleyici prop'lar.

```jsx
export function LandingFooter({ onModal }) {
  return (
    <footer className="footer">
      <div className="lp-wrap">
        <div className="fgrid">
          <div className="fcol">
            <div className="brand-name">Kampüs <span>YYS</span></div>
            <p className="f-about">Şantiye yatakhane yönetim sistemi. 8 modül, 19 blok, 814 yatak — tek panelden 7/24.</p>
          </div>
          <div className="fcol"><h5>Yasal</h5>
            <button type="button" className="f-link" onClick={() => onModal('kvkk')}>KVKK &amp; Gizlilik</button>
            <button type="button" className="f-link" onClick={() => onModal('terms')}>Kullanım Koşulları</button>
          </div>
          <div className="fcol"><h5>Destek</h5>
            <button type="button" className="f-link" onClick={() => onModal('support')}>Yardım & İletişim</button>
          </div>
        </div>
        <div className="fbottom">
          <span>© 2026 AVS Kamp Alanı · Filyos · Zonguldak</span>
          <span className="ftag">Powered by KampüsERP v5.0</span>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/auth/components/sections/LandingTicker.jsx frontend/src/modules/auth/components/sections/LandingFooter.jsx
git commit -m "feat(login): LandingTicker + LandingFooter bölümleri"
```

### Task 4.9: LoginPage'e tüm bölümleri kompoze et + nav

**Files:** Modify `frontend/src/modules/auth/LoginPage.jsx`

- [ ] **Step 1: Bölümleri import et ve render et**

`useMotionPref()`'ten `reduced` al. Nav'ı sticky bölüm linkleriyle güncelle (Modüller/Sayılarla/Bloklar/Filyos/Güvenlik). HeroScene'den sonra sırayla:
```jsx
<MissionBand />
<ServicePillars reduced={reduced} />
<ModuleCarousel stats={stats} reduced={reduced} />
<StatsCounter stats={stats} reduced={reduced} />
<BlockHeatmap blocks={stats?.blocks || []} reduced={reduced} />
<FilyosEnv weather={weather} reduced={reduced} />
<SecurityBand reduced={reduced} />
<LandingTicker items={tickerItems} />
<LandingFooter onModal={setModal} />
```
Eski `.strip` + eski `.footer` JSX'ini kaldır (yerini FilyosEnv + LandingFooter aldı).

- [ ] **Step 2: Faz 0 testi yeşil + manuel tam tur**

Run: `cd frontend && npx vitest run`
Expected: PASS (tüm testler). Sonra `npm run dev` → kaydır: tüm bölümler reveal oluyor, sayaçlar artıyor, heatmap renkli, carousel kayıyor.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/auth/LoginPage.jsx
git commit -m "feat(login): tüm landing bölümlerini kompoze et + bölüm nav"
```

---

## Faz 5 — CSS bölümleri, a11y, responsive, CSP/perf

### Task 5.1: Bölüm stillerini LoginPage.css'e ekle

**Files:** Modify `frontend/src/modules/auth/LoginPage.css`

- [ ] **Step 1: Mockup CSS'ini `.lp-root` altına scoped port et**

`mockup-tpotc-style.html` `<style>` bloğundaki bölüm sınıflarını (`.hero`, `.hud`, `.mission`, `.blk`, `.kicker`, `.reveal`, `.pillars/.pillar`, `.track/.mcard/.liveb`, `.stats/.stat`, `.heat/.hb`, `.env/.ev`, `.secband/.sec`, `.tickerbar/.ticker`, `.footer/.fgrid/.fcol/.fbottom/.ftag`, `.lp-wrap`) **`.lp-root` ön ekiyle** ekle ki global tema bozulmasın. Renkleri mockup hex yerine `var(--…)` değişkenleriyle bağla. `.reveal{opacity:0;transform:translateY(26px);transition:.7s} .reveal.in{opacity:1;transform:none}`.

- [ ] **Step 2: Manuel doğrula**

Run: `cd frontend && npm run dev`
Expected: Tüm bölümler mockup'a görsel uyumlu.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/auth/LoginPage.css
git commit -m "style(login): landing bölüm stilleri (scoped, değişken bağlı)"
```

### Task 5.2: reduced-motion + responsive

**Files:** Modify `frontend/src/modules/auth/LoginPage.css`

- [ ] **Step 1: Media query'ler ekle**

```css
@media (prefers-reduced-motion: reduce) {
  .lp-root .reveal { opacity:1 !important; transform:none !important; transition:none; }
  .lp-root .ticker { animation:none; }
}
@media (max-width:860px) {
  .lp-root .hero .lp-wrap { grid-template-columns:1fr; }
  .lp-root .hero-copy { display:none; }
  .lp-root .pillars, .lp-root .stats, .lp-root .env, .lp-root .secband { grid-template-columns:1fr 1fr; }
  .lp-root .heat { grid-template-columns:repeat(5,1fr); }
  .lp-root .nav-sections { display:none; }
}
```

- [ ] **Step 2: Manuel doğrula** — DevTools mobil görünüm + reduced-motion emülasyonu.

Run: `cd frontend && npm run dev` (DevTools → Rendering → Emulate reduced motion)
Expected: Animasyonlar kapalı, mobilde tek kolon, hero-copy gizli.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/auth/LoginPage.css
git commit -m "style(login): reduced-motion + responsive (mobil) kuralları"
```

### Task 5.3: Asset optimize + CSP doğrula

**Files:**
- Modify: `frontend/public/login/hero-night.mp4` (optimize)
- Verify/Modify: backend helmet CSP

- [ ] **Step 1: Video'yu web için optimize et (ffmpeg varsa)**

```bash
ffmpeg -i docs/login-redesign-assets/hero-night.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset slow -an -movflags +faststart frontend/public/login/hero-night.mp4
```
(ffmpeg yoksa bu adımı atla, mevcut dosya kalsın — boyut notunu spec'e düş.)

- [ ] **Step 2: CSP'yi kontrol et**

Run: `cd ~/Desktop/inXcee && grep -rn "mediaSrc\|imgSrc\|connectSrc\|contentSecurityPolicy" backend/src`
Beklenen: helmet config bulun. `mediaSrc`'de `'self'`, `imgSrc`'de `'self' data:`, `connectSrc`'de `'self' https://api.open-meteo.com https://marine-api.open-meteo.com` olduğunu doğrula. Eksikse ekle. (CSP yoksa veya self yeterliyse — video/asset `/login/` altında self olduğundan ek gerekmez; sadece open-meteo connectSrc'i doğrula.)

- [ ] **Step 3: Backend testleri (CSP değiştiyse)**

Run: `cd backend && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/public/login/ backend/
git commit -m "perf(login): video optimize + CSP medya/connect doğrula"
```

### Task 5.4: Final tam doğrulama

- [ ] **Step 1: Tüm testler**

Run: `cd frontend && npx vitest run` ve `cd backend && npx vitest run`
Expected: Tümü PASS

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: Hatasız build

- [ ] **Step 3: Manuel kabul turu**

`npm run dev` → kontrol listesi:
- [ ] Personel/Yönetici/Güvenlik girişleri çalışıyor (gerçek auth)
- [ ] 2FA akışı (TOTP) çalışıyor
- [ ] 3 başarısız → cooldown kilidi
- [ ] Caps-lock uyarısı
- [ ] Kiosk modu → PIN/QR kısayolları
- [ ] Dil TR/EN/AR değişiyor (AR'da RTL)
- [ ] HUD: Sakin/Yavaş/Normal + yağmur toggle
- [ ] Tüm bölümler scroll-reveal, sayaçlar artıyor, heatmap doğru renk
- [ ] Mobil + reduced-motion

- [ ] **Step 4: Branch tamamlama**

`superpowers:finishing-a-development-branch` skill'i ile merge/PR kararı.

---

## Self-Review Notları

- **Spec kapsamı:** Bölüm 4'teki 10 bölüm → Faz 3-4 tasklarıyla birebir karşılanıyor. Login paneli ekstraları (dil/son giriş/passkey buton) → Task 3.1. Hero HUD/video/yağmur → Task 3.2. a11y/perf/CSP → Faz 5.
- **Passkey:** Mockup'ta buton var; bu plan butonu + UI'yı kurar. `@simplewebauthn` backend bağlantısı (challenge/verify akışı) **ayrı bir spec/plan** gerektirir — bu planda buton görünür ama "yakında" durumda bırakılır veya backend hazırsa Task 3.1'e WebAuthn çağrısı eklenir. (Engelleyici değil; spec açık sorularında not edildi.)
- **Son giriş:** UI satırı Task 3.1'de var; backend `last_login_at` alanı yoksa boş/gizli render edilir (ayrı backend task'ı gerekebilir — spec açık sorusu).
- **innerHTML:** Mockup'taki innerHTML kullanımları JSX render ile değiştirildi (ticker/heatmap) — XSS riski yok.
- **Hardcode blok yok:** Heatmap hücreleri `BLOCKS`'tan üretiliyor (CLAUDE.md kuralı); doluluk yüzdeleri Task 4.5a'daki `/public/stats.blocks`'tan gelir, eşleşmeyen blok nötr render edilir.
- **Doğrulanan kontratlar:** `shared/i18n` → `useTranslation`/`setLocale`/`getLocale` mevcut ✓. `/public/stats` mevcut alanlar: `beds_total/beds_occupied/occupancy_pct/open_faults/active_staff/departments` ✓ (`blocks` Task 4.5a'da ekleniyor).
