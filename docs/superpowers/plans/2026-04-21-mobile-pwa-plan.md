# Mobile PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telefon-optimize `/mobile` arayüzü — housekeeper (temizlik görevleri) ve teknisyen (bakım talepleri) için PIN tabanlı giriş + role-specific ekranlar.

**Architecture:** `users` tablosuna `mobile_pin` (bcrypt) eklenir, yeni `mobile-auth` backend modülü PIN doğrular + 8h JWT üretir, frontend `/mobile/*` route'ları mevcut Layout'tan bağımsız çalışır.

**Tech Stack:** Express + better-sqlite3 + bcryptjs + jsonwebtoken (backend), React 18 + React Router v6 + Zustand + Axios (frontend)

---

## File Map

**Oluşturulacak — Backend:**
- `backend/src/modules/mobile-auth/routes.js` — POST /api/mobile/auth/login, GET /api/mobile/auth/me
- `backend/src/modules/mobile-auth/service.js` — PIN doğrulama + JWT üretimi
- `backend/src/modules/mobile-auth/middleware.js` — requireMobile(role) middleware
- `backend/src/modules/mobile-auth/mobile-auth.test.js` — entegrasyon testleri

**Değiştirilecek — Backend:**
- `backend/src/shared/db/index.js` — migration: users.mobile_pin
- `backend/src/shared/db/schema.js` — schema: users.mobile_pin
- `backend/src/modules/users/routes.js` — PATCH /:id/mobile-pin endpoint
- `backend/src/modules/users/service.js` — setMobilePin servisi
- `backend/src/app.js` — mobileAuthRouter kaydı

**Oluşturulacak — Frontend:**
- `frontend/src/modules/mobile/auth/useMobileAuth.js` — localStorage token + user state
- `frontend/src/modules/mobile/auth/mobileApi.js` — mobile token'lı axios instance
- `frontend/src/modules/mobile/auth/MobileLogin.jsx` — rol seç + PIN pad
- `frontend/src/modules/mobile/shared/MobileLayout.jsx` — bottom tab bar wrapper
- `frontend/src/modules/mobile/shared/MobileProtected.jsx` — auth guard
- `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx` — görev listesi
- `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx` — checklist + foto + tamamla
- `frontend/src/modules/mobile/housekeeper/FaultReport.jsx` — arıza bildir
- `frontend/src/modules/mobile/housekeeper/TaskHistory.jsx` — geçmiş
- `frontend/src/modules/mobile/technician/TechnicianHome.jsx` — talep listesi + SLA
- `frontend/src/modules/mobile/technician/RequestDetail.jsx` — detay + foto + yorum
- `frontend/src/modules/mobile/technician/QuickFault.jsx` — hızlı arıza

**Değiştirilecek — Frontend:**
- `frontend/src/App.jsx` — `/mobile/*` route ekleme

---

## Task 1: Migration — users.mobile_pin

**Files:**
- Modify: `backend/src/shared/db/index.js`
- Modify: `backend/src/shared/db/schema.js`

- [ ] **Step 1: schema.js'e mobile_pin ekle**

`backend/src/shared/db/schema.js` içindeki `users` tablosuna:
```sql
-- mevcut: created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- yeni satır ekle:
  mobile_pin TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

`users` CREATE TABLE bloğunda `email TEXT` satırından sonra:
```js
  email TEXT,
  mobile_pin TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

- [ ] **Step 2: index.js'e migration ekle**

`backend/src/shared/db/index.js` dosyasında `return db` satırından hemen önce:
```js
  // ── Mobile PIN auth ───────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE users ADD COLUMN mobile_pin TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] mobile_pin:', e.message) }
```

- [ ] **Step 3: Migration'ı doğrula**
```bash
cd backend
node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>{ const {getDB}=require('./src/shared/db/index.js'); const cols=getDB().prepare('PRAGMA table_info(users)').all(); console.log(cols.map(c=>c.name)) })"
```
`mobile_pin` kolonunun listede göründüğünü doğrula.

- [ ] **Step 4: Commit**
```bash
git add backend/src/shared/db/index.js backend/src/shared/db/schema.js
git commit -m "feat: users.mobile_pin migration"
```

---

## Task 2: Backend — Mobile Auth Modülü

**Files:**
- Create: `backend/src/modules/mobile-auth/service.js`
- Create: `backend/src/modules/mobile-auth/middleware.js`
- Create: `backend/src/modules/mobile-auth/routes.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: service.js yaz**

```js
// backend/src/modules/mobile-auth/service.js
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../../shared/db/index.js'

const SECRET = process.env.JWT_SECRET

const MOBILE_ROLES = new Set(['housekeeper', 'technical'])

export function loginMobile(pin, role) {
  if (!MOBILE_ROLES.has(role)) return { error: 'Geçersiz rol', status: 400 }
  if (!pin || !/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }

  const db = getDB()
  const users = db.prepare(
    'SELECT * FROM users WHERE role=? AND mobile_pin IS NOT NULL'
  ).all(role)

  const matched = users.find(u => bcrypt.compareSync(pin, u.mobile_pin))
  if (!matched) return { error: 'PIN hatalı veya mobil erişim tanımlı değil', status: 401 }

  const token = jwt.sign(
    { id: matched.id, role: matched.role, full_name: matched.full_name },
    SECRET,
    { expiresIn: '8h' }
  )
  return { token, user: { id: matched.id, role: matched.role, full_name: matched.full_name } }
}

export function getMobileMe(userId) {
  const db = getDB()
  const u = db.prepare('SELECT id, role, full_name FROM users WHERE id=?').get(userId)
  return u || null
}
```

- [ ] **Step 2: middleware.js yaz**

```js
// backend/src/modules/mobile-auth/middleware.js
import { verifyToken } from '../../shared/auth/service.js'

const MOBILE_ROLES = new Set(['housekeeper', 'technical'])

export function requireMobile(...roles) {
  const allowed = roles.length ? new Set(roles) : MOBILE_ROLES
  return (req, res, next) => {
    const h = req.headers.authorization
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
    try {
      req.user = verifyToken(h.slice(7))
      if (!allowed.has(req.user.role)) return res.status(403).json({ error: 'Yetkisiz' })
      next()
    } catch {
      res.status(401).json({ error: 'Geçersiz token' })
    }
  }
}
```

- [ ] **Step 3: verifyToken'ın export edildiğini doğrula**

`backend/src/shared/auth/service.js` dosyasında `export function verifyToken` veya `export { verifyToken }` olup olmadığını kontrol et. Eğer yoksa, service.js'e ekle:
```js
export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}
```

- [ ] **Step 4: routes.js yaz**

```js
// backend/src/modules/mobile-auth/routes.js
import { Router } from 'express'
import { loginMobile, getMobileMe } from './service.js'
import { requireMobile } from './middleware.js'

export const mobileAuthRouter = Router()

mobileAuthRouter.post('/login', (req, res) => {
  const { pin, role } = req.body
  const result = loginMobile(pin, role)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

mobileAuthRouter.get('/me', requireMobile(), (req, res) => {
  const user = getMobileMe(req.user.id)
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })
  res.json(user)
})
```

- [ ] **Step 5: app.js'e kaydet**

`backend/src/app.js` dosyasında import listesine ekle:
```js
import { mobileAuthRouter } from './modules/mobile-auth/routes.js'
```

Route registration bloğuna ekle (diğer route'lardan sonra):
```js
app.use('/api/mobile/auth', writeLimiter, mobileAuthRouter)
```

- [ ] **Step 6: Commit**
```bash
git add backend/src/modules/mobile-auth/ backend/src/app.js
git commit -m "feat: mobile-auth module — PIN login + requireMobile middleware"
```

---

## Task 3: Backend — Users PIN Yönetimi

**Files:**
- Modify: `backend/src/modules/users/service.js`
- Modify: `backend/src/modules/users/routes.js`

- [ ] **Step 1: service.js'e setMobilePin ekle**

`backend/src/modules/users/service.js` dosyasına:
```js
import bcrypt from 'bcryptjs'

export function setMobilePinService(userId, pin, actorId) {
  const db = getDB()  // getDB import'u zaten mevcut olmalı
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (pin === null || pin === '') {
    db.prepare('UPDATE users SET mobile_pin=NULL WHERE id=?').run(userId)
    return { ok: true }
  }
  if (!/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }
  const hashed = bcrypt.hashSync(pin, 10)
  db.prepare('UPDATE users SET mobile_pin=? WHERE id=?').run(hashed, userId)
  return { ok: true }
}
```

- [ ] **Step 2: routes.js'e endpoint ekle**

`backend/src/modules/users/routes.js` dosyasında mevcut route'lardan sonra:
```js
usersRouter.patch('/:id/mobile-pin', ...adminOnly, (req, res) => {
  const result = service.setMobilePinService(+req.params.id, req.body.pin ?? null, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/modules/users/service.js backend/src/modules/users/routes.js
git commit -m "feat: users — PATCH /:id/mobile-pin endpoint"
```

---

## Task 4: Backend — Testler

**Files:**
- Create: `backend/src/modules/mobile-auth/mobile-auth.test.js`

- [ ] **Step 1: Test dosyası yaz**

```js
// backend/src/modules/mobile-auth/mobile-auth.test.js
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import bcrypt from 'bcryptjs'

let adminToken, db
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = res.body.token
})

describe('Mobile Auth — PIN login', () => {
  let housekeeperId

  it('finds housekeeper user from seed', () => {
    const u = db.prepare("SELECT id FROM users WHERE role='housekeeper' LIMIT 1").get()
    expect(u).toBeTruthy()
    housekeeperId = u.id
  })

  it('sets mobile PIN via admin endpoint', async () => {
    const res = await request(app)
      .patch(`/api/users/${housekeeperId}/mobile-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('verifies PIN is stored as bcrypt hash', () => {
    const u = db.prepare('SELECT mobile_pin FROM users WHERE id=?').get(housekeeperId)
    expect(u.mobile_pin).toBeTruthy()
    expect(bcrypt.compareSync('1234', u.mobile_pin)).toBe(true)
  })

  it('logs in with correct PIN + role', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'housekeeper' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('housekeeper')
  })

  it('rejects wrong PIN', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '9999', role: 'housekeeper' })
    expect(res.status).toBe(401)
  })

  it('rejects wrong role', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'campus_manager' })
    expect(res.status).toBe(400)
  })

  it('rejects non-4-digit PIN', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: 'abc', role: 'housekeeper' })
    expect(res.status).toBe(400)
  })

  it('GET /me returns user info with valid mobile token', async () => {
    const login = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'housekeeper' })
    const res = await request(app)
      .get('/api/mobile/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('housekeeper')
  })

  it('clears PIN via admin endpoint', async () => {
    const res = await request(app)
      .patch(`/api/users/${housekeeperId}/mobile-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '' })
    expect(res.status).toBe(200)
    const u = db.prepare('SELECT mobile_pin FROM users WHERE id=?').get(housekeeperId)
    expect(u.mobile_pin).toBeNull()
  })
})
```

- [ ] **Step 2: Testleri çalıştır**
```bash
cd backend
npx vitest run src/modules/mobile-auth/mobile-auth.test.js
```
Beklenen: **8/8 PASS**

- [ ] **Step 3: Tüm suite'i çalıştır**
```bash
npx vitest run
```
Beklenen: tüm mevcut testler + 8 yeni test geçmeli.

- [ ] **Step 4: Commit**
```bash
git add backend/src/modules/mobile-auth/mobile-auth.test.js
git commit -m "test: mobile-auth — 8 entegrasyon testi"
```

---

## Task 5: Frontend — Auth Altyapısı

**Files:**
- Create: `frontend/src/modules/mobile/auth/useMobileAuth.js`
- Create: `frontend/src/modules/mobile/auth/mobileApi.js`
- Create: `frontend/src/modules/mobile/auth/MobileLogin.jsx`

- [ ] **Step 1: useMobileAuth.js yaz**

```js
// frontend/src/modules/mobile/auth/useMobileAuth.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useMobileAuth = create(persist(
  set => ({
    token: null,
    user: null,
    login: (token, user) => set({ token, user }),
    logout: () => set({ token: null, user: null }),
  }),
  { name: 'yys-mobile-auth' }
))
```

- [ ] **Step 2: mobileApi.js yaz**

```js
// frontend/src/modules/mobile/auth/mobileApi.js
import axios from 'axios'
import { useMobileAuth } from './useMobileAuth.js'

const mobileApi = axios.create({ baseURL: '/api', timeout: 30000 })

mobileApi.interceptors.request.use(cfg => {
  const token = useMobileAuth.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

mobileApi.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      useMobileAuth.getState().logout()
      window.location.href = '/mobile'
    }
    return Promise.reject(err)
  }
)

export default mobileApi
```

- [ ] **Step 3: MobileLogin.jsx yaz**

```jsx
// frontend/src/modules/mobile/auth/MobileLogin.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMobileAuth } from './useMobileAuth.js'
import mobileApi from './mobileApi.js'

const ROLES = [
  { value: 'housekeeper', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
]

export default function MobileLogin() {
  const [role, setRole] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useMobileAuth()
  const navigate = useNavigate()

  async function handleSubmit() {
    if (pin.length !== 4) return
    setLoading(true); setError('')
    try {
      const res = await mobileApi.post('/mobile/auth/login', { pin, role })
      login(res.data.token, res.data.user)
      navigate(role === 'housekeeper' ? '/mobile/housekeeper' : '/mobile/technician', { replace: true })
    } catch (e) {
      setError(e.response?.data?.error || 'Giriş başarısız')
      setPin('')
    } finally { setLoading(false) }
  }

  function pressDigit(d) {
    if (pin.length < 4) {
      const next = pin + d
      setPin(next)
      if (next.length === 4) setTimeout(handleSubmit, 100)
    }
  }

  if (!role) return (
    <div style={styles.container}>
      <h1 style={styles.title}>YYS Mobil</h1>
      <p style={styles.sub}>Rolünüzü seçin</p>
      {ROLES.map(r => (
        <button key={r.value} style={styles.roleBtn} onClick={() => setRole(r.value)}>
          {r.label}
        </button>
      ))}
    </div>
  )

  return (
    <div style={styles.container}>
      <button style={styles.back} onClick={() => { setRole(null); setPin('') }}>← Geri</button>
      <h2 style={styles.title}>{ROLES.find(r => r.value === role)?.label}</h2>
      <p style={styles.sub}>PIN giriniz</p>
      <div style={styles.dots}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...styles.dot, background: i < pin.length ? '#3b82f6' : '#e5e7eb' }} />
        ))}
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.pad}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button key={i} style={d ? styles.padBtn : styles.padBtnEmpty}
            onClick={() => d === '⌫' ? setPin(p => p.slice(0,-1)) : d && pressDigit(d)}
            disabled={loading}
          >{d}</button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px', background:'#f9fafb' },
  title: { fontSize:'24px', fontWeight:700, margin:'0 0 8px', color:'#111' },
  sub: { fontSize:'14px', color:'#6b7280', margin:'0 0 32px' },
  roleBtn: { width:'100%', maxWidth:'280px', padding:'16px', fontSize:'18px', fontWeight:600, background:'#3b82f6', color:'#fff', border:'none', borderRadius:'12px', marginBottom:'12px', cursor:'pointer' },
  back: { alignSelf:'flex-start', background:'none', border:'none', color:'#3b82f6', fontSize:'16px', cursor:'pointer', marginBottom:'24px' },
  dots: { display:'flex', gap:'16px', marginBottom:'24px' },
  dot: { width:'16px', height:'16px', borderRadius:'50%', transition:'background 0.15s' },
  error: { color:'#ef4444', fontSize:'14px', marginBottom:'12px' },
  pad: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px', width:'240px' },
  padBtn: { padding:'18px', fontSize:'22px', fontWeight:600, background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', cursor:'pointer' },
  padBtnEmpty: { padding:'18px', background:'transparent', border:'none', cursor:'default' },
}
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/modules/mobile/auth/
git commit -m "feat: mobile — auth store + api client + PIN login ekranı"
```

---

## Task 6: Frontend — Mobile Layout & App.jsx

**Files:**
- Create: `frontend/src/modules/mobile/shared/MobileLayout.jsx`
- Create: `frontend/src/modules/mobile/shared/MobileProtected.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: MobileProtected.jsx yaz**

```jsx
// frontend/src/modules/mobile/shared/MobileProtected.jsx
import { Navigate } from 'react-router-dom'
import { useMobileAuth } from '../auth/useMobileAuth.js'

export default function MobileProtected({ role, children }) {
  const { token, user } = useMobileAuth()
  if (!token) return <Navigate to="/mobile" replace />
  if (role && user?.role !== role) return <Navigate to="/mobile" replace />
  return children
}
```

- [ ] **Step 2: MobileLayout.jsx yaz**

```jsx
// frontend/src/modules/mobile/shared/MobileLayout.jsx
import { NavLink, Outlet } from 'react-router-dom'
import { useMobileAuth } from '../auth/useMobileAuth.js'

export default function MobileLayout({ tabs }) {
  const { logout } = useMobileAuth()
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f9fafb', maxWidth:'480px', margin:'0 auto' }}>
      <main style={{ flex:1, overflowY:'auto', paddingBottom:'72px' }}>
        <Outlet />
      </main>
      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', display:'flex', background:'#fff', borderTop:'1px solid #e5e7eb', zIndex:100 }}>
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to}
            style={({ isActive }) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', color: isActive ? '#3b82f6' : '#9ca3af', textDecoration:'none', fontSize:'11px', fontWeight:600, gap:'4px' })}>
            <span style={{ fontSize:'20px' }}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
        <button onClick={logout} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', background:'none', border:'none', color:'#9ca3af', fontSize:'11px', fontWeight:600, gap:'4px', cursor:'pointer' }}>
          <span style={{ fontSize:'20px' }}>🚪</span>Çıkış
        </button>
      </nav>
    </div>
  )
}
```

- [ ] **Step 3: App.jsx'e mobile route'ları ekle**

`frontend/src/App.jsx` dosyasında lazy import'lar bloğuna ekle:
```js
const MobileLogin = lazy(() => import('./modules/mobile/auth/MobileLogin.jsx'))
const HousekeeperHome = lazy(() => import('./modules/mobile/housekeeper/HousekeeperHome.jsx'))
const TaskDetail = lazy(() => import('./modules/mobile/housekeeper/TaskDetail.jsx'))
const FaultReport = lazy(() => import('./modules/mobile/housekeeper/FaultReport.jsx'))
const TaskHistory = lazy(() => import('./modules/mobile/housekeeper/TaskHistory.jsx'))
const TechnicianHome = lazy(() => import('./modules/mobile/technician/TechnicianHome.jsx'))
const RequestDetail = lazy(() => import('./modules/mobile/technician/RequestDetail.jsx'))
const QuickFault = lazy(() => import('./modules/mobile/technician/QuickFault.jsx'))
```

`MobileLayout` ve `MobileProtected` için lazy DEĞİL, doğrudan import:
```js
import MobileLayout from './modules/mobile/shared/MobileLayout.jsx'
import MobileProtected from './modules/mobile/shared/MobileProtected.jsx'
```

`<Routes>` içinde `/kiosk` route'undan önce ekle:
```jsx
<Route path="/mobile" element={<MobileLogin />} />
<Route path="/mobile/housekeeper" element={
  <MobileProtected role="housekeeper">
    <MobileLayout tabs={[
      { to: '/mobile/housekeeper', icon: '🧹', label: 'Görevler' },
      { to: '/mobile/housekeeper/fault', icon: '⚠️', label: 'Arıza Bildir' },
      { to: '/mobile/housekeeper/history', icon: '📋', label: 'Geçmiş' },
    ]} />
  </MobileProtected>
}>
  <Route index element={<HousekeeperHome />} />
  <Route path="task/:id" element={<TaskDetail />} />
  <Route path="fault" element={<FaultReport />} />
  <Route path="history" element={<TaskHistory />} />
</Route>
<Route path="/mobile/technician" element={
  <MobileProtected role="technical">
    <MobileLayout tabs={[
      { to: '/mobile/technician', icon: '🔧', label: 'Talepler' },
      { to: '/mobile/technician/quick-fault', icon: '➕', label: 'Yeni Talep' },
    ]} />
  </MobileProtected>
}>
  <Route index element={<TechnicianHome />} />
  <Route path="request/:id" element={<RequestDetail />} />
  <Route path="quick-fault" element={<QuickFault />} />
</Route>
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/modules/mobile/shared/ frontend/src/App.jsx
git commit -m "feat: mobile — layout, protected route, App.jsx routing"
```

---

## Task 7: Frontend — Housekeeper Task List

**Files:**
- Create: `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx`

- [ ] **Step 1: HousekeeperHome.jsx yaz**

```jsx
// frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { useMobileAuth } from '../auth/useMobileAuth.js'

const STATUS_LABEL = { null: 'Bekliyor', completed: 'Tamamlandı', skipped: 'Atlandı' }
const STATUS_COLOR = { null: '#f59e0b', completed: '#10b981', skipped: '#6b7280' }

function taskStatus(t) {
  if (t.completed_at) return 'completed'
  if (t.skipped) return 'skipped'
  return null
}

export default function HousekeeperHome() {
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const { user } = useMobileAuth()
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    mobileApi.get('/housekeeping/tasks', {
      params: { date: today, uncleaned: filter === 'pending' ? 1 : undefined }
    }).then(r => setTasks(r.data)).finally(() => setLoading(false))
  }, [filter, today])

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => !t.completed_at && !t.skipped).length,
    done: tasks.filter(t => t.completed_at).length,
  }

  return (
    <div style={{ padding:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <h2 style={{ margin:0, fontSize:'20px', fontWeight:700 }}>Görevlerim</h2>
        <span style={{ fontSize:'13px', color:'#6b7280' }}>{user?.full_name}</span>
      </div>
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        {[['pending','Bekleyen',counts.pending],['all','Tümü',counts.all],['done','Tamamlanan',counts.done]].map(([k,l,c])=>(
          <button key={k} onClick={()=>setFilter(k)}
            style={{ flex:1, padding:'8px 4px', fontSize:'12px', fontWeight:600, border:'none', borderRadius:'8px', cursor:'pointer',
              background: filter===k ? '#3b82f6' : '#e5e7eb', color: filter===k ? '#fff' : '#374151' }}>
            {l} ({c})
          </button>
        ))}
      </div>
      {loading ? <p style={{ textAlign:'center', color:'#6b7280' }}>Yükleniyor...</p> : (
        tasks.length === 0 ? <p style={{ textAlign:'center', color:'#6b7280', marginTop:'48px' }}>Görev yok 🎉</p> :
        tasks.map(t => {
          const st = taskStatus(t)
          return (
            <div key={t.id} onClick={() => navigate(`task/${t.id}`, { state: { task: t } })}
              style={{ background:'#fff', borderRadius:'12px', padding:'16px', marginBottom:'10px', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', cursor:'pointer', borderLeft:`4px solid ${STATUS_COLOR[st]}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <p style={{ margin:'0 0 4px', fontWeight:600, fontSize:'15px' }}>{t.area}</p>
                  <p style={{ margin:0, fontSize:'13px', color:'#6b7280' }}>{t.task_type}</p>
                </div>
                <span style={{ fontSize:'11px', fontWeight:600, color: STATUS_COLOR[st], background: STATUS_COLOR[st]+'20', padding:'4px 8px', borderRadius:'12px' }}>
                  {STATUS_LABEL[st]}
                </span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx
git commit -m "feat: mobile housekeeper — görev listesi"
```

---

## Task 8: Frontend — Housekeeper Task Detail

**Files:**
- Create: `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx`

- [ ] **Step 1: TaskDetail.jsx yaz**

```jsx
// frontend/src/modules/mobile/housekeeper/TaskDetail.jsx
import { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

export default function TaskDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const task = state?.task || {}

  const [checklist, setChecklist] = useState(
    task.checklist ? JSON.parse(task.checklist) : []
  )
  const [photo, setPhoto] = useState(null)
  const [note, setNote] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [mode, setMode] = useState('view') // view | skip
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(!!task.completed_at)

  function toggleCheck(i) {
    setChecklist(cl => cl.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item))
  }

  async function handleComplete() {
    setLoading(true)
    const fd = new FormData()
    if (photo) fd.append('photo', photo)
    if (checklist.length) fd.append('checklist', JSON.stringify(checklist))
    try {
      await mobileApi.post(`/housekeeping/tasks/${id}/complete`, { checklist, via_qr: false })
      if (note) await mobileApi.patch(`/housekeeping/rooms/${task.room_id}/notes`, { notes: note }).catch(() => {})
      setDone(true)
      setTimeout(() => navigate(-1), 800)
    } catch (e) {
      alert(e.response?.data?.error || 'Hata oluştu')
    } finally { setLoading(false) }
  }

  async function handleSkip() {
    if (!skipReason.trim()) return alert('Atlama nedeni zorunlu')
    setLoading(true)
    try {
      await mobileApi.patch(`/housekeeping/tasks/${id}/skip`, { reason: skipReason })
      navigate(-1)
    } catch (e) {
      alert(e.response?.data?.error || 'Hata oluştu')
    } finally { setLoading(false) }
  }

  if (done) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ fontSize:'64px' }}>✅</div>
      <p style={{ fontSize:'18px', fontWeight:600, color:'#10b981' }}>Tamamlandı!</p>
    </div>
  )

  return (
    <div style={{ padding:'16px' }}>
      <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'#3b82f6', fontSize:'16px', cursor:'pointer', marginBottom:'16px' }}>← Geri</button>
      <h2 style={{ margin:'0 0 4px', fontSize:'18px', fontWeight:700 }}>{task.area}</h2>
      <p style={{ margin:'0 0 24px', color:'#6b7280', fontSize:'14px' }}>{task.task_type}</p>

      {checklist.length > 0 && (
        <section style={{ marginBottom:'24px' }}>
          <h3 style={s.sectionTitle}>Kontrol Listesi</h3>
          {checklist.map((item, i) => (
            <label key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', background:'#fff', borderRadius:'10px', marginBottom:'8px', cursor:'pointer' }}>
              <input type="checkbox" checked={!!item.checked} onChange={() => toggleCheck(i)}
                style={{ width:'20px', height:'20px', cursor:'pointer' }} />
              <span style={{ fontSize:'15px', textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#9ca3af' : '#111' }}>{item.label || item}</span>
            </label>
          ))}
        </section>
      )}

      <section style={{ marginBottom:'24px' }}>
        <h3 style={s.sectionTitle}>Fotoğraf (İsteğe Bağlı)</h3>
        <label style={s.photoBtn}>
          📷 {photo ? photo.name : 'Fotoğraf Çek / Seç'}
          <input type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => setPhoto(e.target.files[0])} />
        </label>
      </section>

      <section style={{ marginBottom:'24px' }}>
        <h3 style={s.sectionTitle}>Oda Notu (İsteğe Bağlı)</h3>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Oda hakkında not..."
          style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'14px', resize:'none', boxSizing:'border-box', minHeight:'80px' }} />
      </section>

      {mode === 'skip' ? (
        <div>
          <textarea value={skipReason} onChange={e => setSkipReason(e.target.value)}
            placeholder="Atlama nedeni (zorunlu)..."
            style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #fca5a5', fontSize:'14px', resize:'none', boxSizing:'border-box', minHeight:'80px', marginBottom:'12px' }} />
          <div style={{ display:'flex', gap:'12px' }}>
            <button onClick={() => setMode('view')} style={s.btnSecondary}>İptal</button>
            <button onClick={handleSkip} disabled={loading} style={s.btnDanger}>Atla</button>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={() => setMode('skip')} style={s.btnSecondary}>Atla</button>
          <button onClick={handleComplete} disabled={loading} style={s.btnPrimary}>
            {loading ? 'Kaydediliyor...' : '✓ Tamamla'}
          </button>
        </div>
      )}
    </div>
  )
}

const s = {
  sectionTitle: { fontSize:'13px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 10px' },
  photoBtn: { display:'block', padding:'14px', background:'#f3f4f6', border:'2px dashed #d1d5db', borderRadius:'10px', textAlign:'center', cursor:'pointer', fontSize:'15px', color:'#374151' },
  btnPrimary: { flex:1, padding:'16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer' },
  btnSecondary: { flex:1, padding:'16px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer' },
  btnDanger: { flex:1, padding:'16px', background:'#ef4444', color:'#fff', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer' },
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/modules/mobile/housekeeper/TaskDetail.jsx
git commit -m "feat: mobile housekeeper — görev detayı (checklist + foto + tamamla/atla)"
```

---

## Task 9: Frontend — Housekeeper Fault Report & History

**Files:**
- Create: `frontend/src/modules/mobile/housekeeper/FaultReport.jsx`
- Create: `frontend/src/modules/mobile/housekeeper/TaskHistory.jsx`

- [ ] **Step 1: FaultReport.jsx yaz**

```jsx
// frontend/src/modules/mobile/housekeeper/FaultReport.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

export default function FaultReport() {
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!location.trim() || description.trim().length < 5) return alert('Konum ve açıklama zorunlu (min 5 karakter)')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('location', location.trim())
      fd.append('description', description.trim())
      fd.append('priority', priority)
      if (photo) fd.append('photo_before', photo)
      await mobileApi.post('/housekeeping/fault-report', fd)
      setSent(true)
      setTimeout(() => navigate(-1), 1200)
    } catch (e) {
      alert(e.response?.data?.error || 'Hata oluştu')
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ fontSize:'64px' }}>✅</div>
      <p style={{ fontSize:'18px', fontWeight:600 }}>Bildirim Gönderildi!</p>
    </div>
  )

  return (
    <div style={{ padding:'16px' }}>
      <h2 style={{ margin:'0 0 24px', fontSize:'20px', fontWeight:700 }}>Arıza Bildir</h2>
      <form onSubmit={handleSubmit}>
        <label style={s.label}>Konum</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Örn: A Blok 203"
          style={s.input} />
        <label style={s.label}>Açıklama</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Arızayı açıklayın..." style={{ ...s.input, minHeight:'100px', resize:'none' }} />
        <label style={s.label}>Öncelik</label>
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          {[['high','Acil','#ef4444'],['medium','Normal','#f59e0b'],['low','Düşük','#10b981']].map(([v,l,c]) => (
            <button type="button" key={v} onClick={() => setPriority(v)}
              style={{ flex:1, padding:'10px', border:'none', borderRadius:'10px', fontWeight:600, fontSize:'13px', cursor:'pointer',
                background: priority===v ? c : '#f3f4f6', color: priority===v ? '#fff' : '#374151' }}>
              {l}
            </button>
          ))}
        </div>
        <label style={s.label}>Fotoğraf (İsteğe Bağlı)</label>
        <label style={s.photoBtn}>
          📷 {photo ? photo.name : 'Fotoğraf Çek / Seç'}
          <input type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => setPhoto(e.target.files[0])} />
        </label>
        <button type="submit" disabled={loading}
          style={{ width:'100%', padding:'16px', background:'#ef4444', color:'#fff', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer', marginTop:'24px' }}>
          {loading ? 'Gönderiliyor...' : '⚠️ Arıza Bildir'}
        </button>
      </form>
    </div>
  )
}

const s = {
  label: { display:'block', fontSize:'13px', fontWeight:600, color:'#374151', marginBottom:'6px' },
  input: { width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'15px', marginBottom:'16px', boxSizing:'border-box' },
  photoBtn: { display:'block', padding:'14px', background:'#f3f4f6', border:'2px dashed #d1d5db', borderRadius:'10px', textAlign:'center', cursor:'pointer', fontSize:'15px', color:'#374151', marginBottom:'8px' },
}
```

- [ ] **Step 2: TaskHistory.jsx yaz**

```jsx
// frontend/src/modules/mobile/housekeeper/TaskHistory.jsx
import { useState, useEffect } from 'react'
import mobileApi from '../auth/mobileApi.js'

export default function TaskHistory() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    const from = d.toISOString().split('T')[0]
    mobileApi.get('/housekeeping/tasks', { params: { from } })
      .then(r => setTasks(r.data.filter(t => t.completed_at || t.skipped)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding:'16px' }}>
      <h2 style={{ margin:'0 0 20px', fontSize:'20px', fontWeight:700 }}>Son 7 Günün Geçmişi</h2>
      {loading ? <p style={{ textAlign:'center', color:'#6b7280' }}>Yükleniyor...</p> :
        tasks.length === 0 ? <p style={{ textAlign:'center', color:'#6b7280' }}>Geçmiş görev yok</p> :
        tasks.map(t => (
          <div key={t.id} style={{ background:'#fff', borderRadius:'12px', padding:'14px', marginBottom:'8px', boxShadow:'0 1px 2px rgba(0,0,0,0.06)', borderLeft:`4px solid ${t.completed_at ? '#10b981' : '#6b7280'}` }}>
            <p style={{ margin:'0 0 4px', fontWeight:600, fontSize:'14px' }}>{t.area}</p>
            <p style={{ margin:0, fontSize:'12px', color:'#9ca3af' }}>
              {t.completed_at ? `✓ ${new Date(t.completed_at).toLocaleDateString('tr-TR')}` : `Atlandı: ${t.skip_reason || '-'}`}
            </p>
          </div>
        ))
      }
    </div>
  )
}
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/modules/mobile/housekeeper/FaultReport.jsx frontend/src/modules/mobile/housekeeper/TaskHistory.jsx
git commit -m "feat: mobile housekeeper — arıza bildir + geçmiş"
```

---

## Task 10: Frontend — Technician Request List

**Files:**
- Create: `frontend/src/modules/mobile/technician/TechnicianHome.jsx`

- [ ] **Step 1: TechnicianHome.jsx yaz**

```jsx
// frontend/src/modules/mobile/technician/TechnicianHome.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { useMobileAuth } from '../auth/useMobileAuth.js'

const PRIORITY_COLOR = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' }
const PRIORITY_LABEL = { high:'ACİL', medium:'Normal', low:'Düşük' }

function SlaBar({ deadlineStr }) {
  if (!deadlineStr) return null
  const deadline = new Date(deadlineStr)
  const now = new Date()
  const total = deadline - new Date(deadline.getTime() - 24*3600000)
  const remaining = deadline - now
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const color = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444'
  const hrs = Math.floor(remaining / 3600000)
  const mins = Math.floor((remaining % 3600000) / 60000)
  return (
    <div style={{ marginTop:'8px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#6b7280', marginBottom:'4px' }}>
        <span>SLA</span>
        <span style={{ color }}>{remaining < 0 ? 'Süre doldu!' : `${hrs}s ${mins}dk`}</span>
      </div>
      <div style={{ background:'#f3f4f6', borderRadius:'4px', height:'4px' }}>
        <div style={{ background:color, width:`${pct}%`, height:'4px', borderRadius:'4px', transition:'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function TechnicianHome() {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('mine')
  const [loading, setLoading] = useState(true)
  const { user } = useMobileAuth()
  const navigate = useNavigate()

  useEffect(() => {
    mobileApi.get('/maintenance/requests', { params: { status: 'open,in_progress' } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : r.data.data || []
        setRequests(data)
      })
      .finally(() => setLoading(false))
  }, [])

  const shown = filter === 'mine'
    ? requests.filter(r => r.technician_name === user?.full_name)
    : requests

  return (
    <div style={{ padding:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <h2 style={{ margin:0, fontSize:'20px', fontWeight:700 }}>Talepler</h2>
        <span style={{ fontSize:'13px', color:'#6b7280' }}>{user?.full_name}</span>
      </div>
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        {[['mine','Bana Atanan'],['all','Tümü']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ flex:1, padding:'10px', fontSize:'13px', fontWeight:600, border:'none', borderRadius:'8px', cursor:'pointer',
              background: filter===k ? '#3b82f6' : '#e5e7eb', color: filter===k ? '#fff' : '#374151' }}>
            {l}
          </button>
        ))}
      </div>
      {loading ? <p style={{ textAlign:'center', color:'#6b7280' }}>Yükleniyor...</p> :
        shown.length === 0 ? <p style={{ textAlign:'center', color:'#6b7280', marginTop:'48px' }}>Talep yok ✓</p> :
        shown.map(r => (
          <div key={r.id} onClick={() => navigate(`request/${r.id}`, { state: { request: r } })}
            style={{ background:'#fff', borderRadius:'12px', padding:'16px', marginBottom:'10px', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', cursor:'pointer', borderLeft:`4px solid ${PRIORITY_COLOR[r.priority]}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
              <span style={{ fontWeight:600, fontSize:'15px' }}>{r.location}</span>
              <span style={{ fontSize:'11px', fontWeight:700, color: PRIORITY_COLOR[r.priority] }}>{PRIORITY_LABEL[r.priority]}</span>
            </div>
            <p style={{ margin:'0 0 4px', fontSize:'13px', color:'#374151' }}>{r.description}</p>
            {r.technician_name && <p style={{ margin:0, fontSize:'12px', color:'#6b7280' }}>👷 {r.technician_name}</p>}
            <SlaBar deadlineStr={r.sla_deadline} />
          </div>
        ))
      }
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/modules/mobile/technician/TechnicianHome.jsx
git commit -m "feat: mobile technician — talep listesi + SLA göstergesi"
```

---

## Task 11: Frontend — Technician Request Detail

**Files:**
- Create: `frontend/src/modules/mobile/technician/RequestDetail.jsx`

- [ ] **Step 1: RequestDetail.jsx yaz**

```jsx
// frontend/src/modules/mobile/technician/RequestDetail.jsx
import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

export default function RequestDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const [request, setRequest] = useState(state?.request || null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [afterPhoto, setAfterPhoto] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!request) mobileApi.get(`/maintenance/requests/${id}`).then(r => setRequest(r.data))
    mobileApi.get(`/maintenance/requests/${id}/comments`).then(r => setComments(r.data))
  }, [id])

  async function handleStart() {
    setLoading(true)
    try {
      await mobileApi.patch(`/maintenance/requests/${id}/start`)
      setRequest(r => ({ ...r, status: 'in_progress' }))
    } catch (e) { alert(e.response?.data?.error || 'Hata') }
    finally { setLoading(false) }
  }

  async function handleClose() {
    if (!afterPhoto) return alert('Tamamlama fotoğrafı zorunlu')
    setLoading(true)
    const fd = new FormData()
    fd.append('photo', afterPhoto)
    try {
      await mobileApi.patch(`/maintenance/requests/${id}/close`, fd)
      setRequest(r => ({ ...r, status: 'done' }))
    } catch (e) { alert(e.response?.data?.error || 'Hata') }
    finally { setLoading(false) }
  }

  async function handleComment() {
    if (!newComment.trim()) return
    try {
      await mobileApi.post(`/maintenance/requests/${id}/comments`, { comment: newComment.trim() })
      setComments(c => [...c, { comment: newComment.trim(), created_at: new Date().toISOString(), user_name: 'Ben' }])
      setNewComment('')
    } catch (e) { alert(e.response?.data?.error || 'Hata') }
  }

  if (!request) return <div style={{ padding:'32px', textAlign:'center', color:'#6b7280' }}>Yükleniyor...</div>

  const isDone = request.status === 'done'
  const isOpen = request.status === 'open'
  const isInProgress = request.status === 'in_progress'

  return (
    <div style={{ padding:'16px' }}>
      <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'#3b82f6', fontSize:'16px', cursor:'pointer', marginBottom:'16px' }}>← Geri</button>

      <div style={{ background:'#fff', borderRadius:'12px', padding:'16px', marginBottom:'16px', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
          <h2 style={{ margin:0, fontSize:'18px', fontWeight:700 }}>{request.location}</h2>
          <span style={{ fontSize:'12px', padding:'4px 10px', borderRadius:'12px', fontWeight:600,
            background: isDone ? '#d1fae5' : isInProgress ? '#dbeafe' : '#fef3c7',
            color: isDone ? '#065f46' : isInProgress ? '#1e40af' : '#92400e' }}>
            {isDone ? 'Tamamlandı' : isInProgress ? 'Devam Ediyor' : 'Açık'}
          </span>
        </div>
        <p style={{ margin:'0 0 8px', color:'#374151' }}>{request.description}</p>
        {request.reporter_name && <p style={{ margin:0, fontSize:'13px', color:'#6b7280' }}>Bildiren: {request.reporter_name}</p>}
        {request.photo_before && (
          <img src={request.photo_before} alt="Önce" style={{ width:'100%', borderRadius:'8px', marginTop:'12px', maxHeight:'200px', objectFit:'cover' }} />
        )}
      </div>

      {comments.length > 0 && (
        <div style={{ marginBottom:'16px' }}>
          <h3 style={s.sectionTitle}>Yorumlar</h3>
          {comments.map((c, i) => (
            <div key={i} style={{ background:'#fff', padding:'12px', borderRadius:'10px', marginBottom:'8px' }}>
              <p style={{ margin:'0 0 4px', fontSize:'14px' }}>{c.comment}</p>
              <p style={{ margin:0, fontSize:'11px', color:'#9ca3af' }}>{c.user_name} · {new Date(c.created_at).toLocaleDateString('tr-TR')}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom:'16px' }}>
        <h3 style={s.sectionTitle}>Yorum Ekle</h3>
        <div style={{ display:'flex', gap:'8px' }}>
          <input value={newComment} onChange={e => setNewComment(e.target.value)}
            placeholder="Yorum..." style={{ flex:1, padding:'12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'14px' }} />
          <button onClick={handleComment} style={{ padding:'12px 16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer' }}>Gönder</button>
        </div>
      </div>

      {!isDone && (
        <div style={{ marginBottom:'16px' }}>
          <h3 style={s.sectionTitle}>Tamamlama Fotoğrafı (Sonra)</h3>
          <label style={s.photoBtn}>
            📷 {afterPhoto ? afterPhoto.name : 'Sonra fotoğraf çek'}
            <input type="file" accept="image/*" capture="environment" style={{ display:'none' }}
              onChange={e => setAfterPhoto(e.target.files[0])} />
          </label>
        </div>
      )}

      <div style={{ display:'flex', gap:'12px', marginTop:'8px' }}>
        {isOpen && <button onClick={handleStart} disabled={loading} style={s.btnPrimary}>▶ Başlat</button>}
        {isInProgress && <button onClick={handleClose} disabled={loading} style={{ ...s.btnPrimary, background:'#10b981' }}>✓ Tamamla</button>}
        {isDone && <p style={{ color:'#10b981', fontWeight:600, textAlign:'center', width:'100%' }}>✅ Bu talep tamamlandı</p>}
      </div>
    </div>
  )
}

const s = {
  sectionTitle: { fontSize:'13px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 10px' },
  photoBtn: { display:'block', padding:'14px', background:'#f3f4f6', border:'2px dashed #d1d5db', borderRadius:'10px', textAlign:'center', cursor:'pointer', fontSize:'15px', color:'#374151' },
  btnPrimary: { flex:1, padding:'16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer' },
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/modules/mobile/technician/RequestDetail.jsx
git commit -m "feat: mobile technician — talep detayı (foto + yorumlar + başlat/tamamla)"
```

---

## Task 12: Frontend — Technician Quick Fault

**Files:**
- Create: `frontend/src/modules/mobile/technician/QuickFault.jsx`

- [ ] **Step 1: QuickFault.jsx yaz**

```jsx
// frontend/src/modules/mobile/technician/QuickFault.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

export default function QuickFault() {
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [photo, setPhoto] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    mobileApi.get('/maintenance/location-suggestions').then(r => setSuggestions(r.data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!location.trim() || description.trim().length < 5) return alert('Konum ve açıklama zorunlu (min 5 karakter)')
    setLoading(true)
    const fd = new FormData()
    fd.append('location', location.trim())
    fd.append('description', description.trim())
    fd.append('priority', priority)
    if (photo) fd.append('photo_before', photo)
    try {
      await mobileApi.post('/maintenance/requests', fd)
      setSent(true)
      setTimeout(() => navigate(-1), 1200)
    } catch (e) {
      alert(e.response?.data?.error || 'Hata oluştu')
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ fontSize:'64px' }}>✅</div>
      <p style={{ fontSize:'18px', fontWeight:600 }}>Talep Oluşturuldu!</p>
    </div>
  )

  return (
    <div style={{ padding:'16px' }}>
      <h2 style={{ margin:'0 0 24px', fontSize:'20px', fontWeight:700 }}>Yeni Arıza Talebi</h2>
      <form onSubmit={handleSubmit}>
        <label style={s.label}>Konum</label>
        <input value={location} onChange={e => setLocation(e.target.value)}
          list="location-list" placeholder="Örn: B Blok 105"
          style={s.input} />
        <datalist id="location-list">
          {suggestions.map((sg, i) => <option key={i} value={sg} />)}
        </datalist>

        <label style={s.label}>Açıklama</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Arızayı detaylı açıklayın..."
          style={{ ...s.input, minHeight:'100px', resize:'none' }} />

        <label style={s.label}>Öncelik</label>
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          {[['high','Acil','#ef4444'],['medium','Normal','#f59e0b'],['low','Düşük','#10b981']].map(([v,l,c]) => (
            <button type="button" key={v} onClick={() => setPriority(v)}
              style={{ flex:1, padding:'10px', border:'none', borderRadius:'10px', fontWeight:600, fontSize:'13px', cursor:'pointer',
                background: priority===v ? c : '#f3f4f6', color: priority===v ? '#fff' : '#374151' }}>
              {l}
            </button>
          ))}
        </div>

        <label style={s.label}>Önce Fotoğraf (İsteğe Bağlı)</label>
        <label style={s.photoBtn}>
          📷 {photo ? photo.name : 'Fotoğraf Çek / Seç'}
          <input type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => setPhoto(e.target.files[0])} />
        </label>

        <button type="submit" disabled={loading}
          style={{ width:'100%', padding:'16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:600, cursor:'pointer', marginTop:'24px' }}>
          {loading ? 'Gönderiliyor...' : '➕ Talep Oluştur'}
        </button>
      </form>
    </div>
  )
}

const s = {
  label: { display:'block', fontSize:'13px', fontWeight:600, color:'#374151', marginBottom:'6px' },
  input: { width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'15px', marginBottom:'16px', boxSizing:'border-box' },
  photoBtn: { display:'block', padding:'14px', background:'#f3f4f6', border:'2px dashed #d1d5db', borderRadius:'10px', textAlign:'center', cursor:'pointer', fontSize:'15px', color:'#374151', marginBottom:'8px' },
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/modules/mobile/technician/QuickFault.jsx
git commit -m "feat: mobile technician — hızlı arıza talebi"
```

---

## Task 13: Admin — PIN Yönetimi UI

**Files:**
- Modify: `frontend/src/modules/admin/UsersPage.jsx`

Bu task'ta mevcut `UsersPage.jsx` dosyasını oku, kullanıcı düzenleme formunu bul ve `mobile_pin` alanı ekle.

- [ ] **Step 1: UsersPage.jsx'i oku**
```bash
cat frontend/src/modules/admin/UsersPage.jsx
```

- [ ] **Step 2: Edit user form'da mobile_pin alanı ekle**

Kullanıcı düzenleme/oluşturma formunda (modal veya inline form), şifre alanının altına ekle:

```jsx
<div style={{ marginTop: '12px' }}>
  <label style={{ display:'block', fontSize:'13px', fontWeight:600, marginBottom:'4px' }}>
    Mobil PIN (4 hane, boş = devre dışı)
  </label>
  <div style={{ display:'flex', gap:'8px' }}>
    <input
      type="text"
      maxLength={4}
      pattern="\d{4}"
      placeholder="1234"
      value={mobilePinInput}
      onChange={e => setMobilePinInput(e.target.value.replace(/\D/g, '').slice(0,4))}
      style={{ flex:1, padding:'8px 12px', borderRadius:'8px', border:'1px solid #e5e7eb', fontFamily:'monospace', fontSize:'18px', letterSpacing:'4px' }}
    />
    <button type="button" onClick={handleSetMobilePin}
      style={{ padding:'8px 16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
      {mobilePinInput ? 'Kaydet' : 'Kaldır'}
    </button>
  </div>
</div>
```

`handleSetMobilePin` fonksiyonu:
```js
async function handleSetMobilePin() {
  try {
    await api.patch(`/users/${editingUser.id}/mobile-pin`, { pin: mobilePinInput || '' })
    addToast('Mobil PIN güncellendi', 'success')
    setMobilePinInput('')
  } catch (e) {
    addToast(e.response?.data?.error || 'Hata', 'error')
  }
}
```

State'e ekle: `const [mobilePinInput, setMobilePinInput] = useState('')`

- [ ] **Step 3: Commit**
```bash
git add frontend/src/modules/admin/UsersPage.jsx
git commit -m "feat: admin users — mobil PIN yönetimi alanı"
```

---

## Task 14: Son Doğrulama

- [ ] **Step 1: Backend testleri çalıştır**
```bash
cd backend
npx vitest run
```
Beklenen: tüm testler PASS (yeni 8 test dahil)

- [ ] **Step 2: Frontend dev server başlat ve manuel test**
```bash
cd ..  # proje kökü
npm run dev
```

- [ ] **Step 3: Housekeeper akışını test et**
  1. `http://localhost:5173/mobile` → "Temizlik" seç
  2. Admin'den bir housekeeper kullanıcısına PIN ata: `PATCH /api/users/:id/mobile-pin { pin: "1234" }`
  3. PIN gir → görevi tamamla → arıza bildir → geçmişe bak
  4. 401 sonrası `/mobile`'a yönlendirme çalışıyor mu kontrol et

- [ ] **Step 4: Teknisyen akışını test et**
  1. `http://localhost:5173/mobile` → "Teknik" seç
  2. Teknik kullanıcıya PIN ata
  3. Talep listesi → detay → başlat → tamamla (fotoğraf ile)
  4. Yeni talep oluştur

- [ ] **Step 5: Final commit**
```bash
git add -A
git commit -m "feat: mobile PWA — housekeeper + teknisyen PIN tabanlı mobil arayüz tamamlandı"
```
