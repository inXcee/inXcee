# Mobile PWA Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile PWA'daki 5 eksikliği kapat: TechnicianHome filtre düzeltmesi, TaskDetail QR scan, mobile query optimizasyonu, PIN modal fix, token silent refresh.

**Architecture:** Tüm değişiklikler frontend-only'dir (1 satır routes.js hariç). `jsqr` kütüphanesi (zaten kurulu) QR decode için kullanılır. Token refresh MobileLayout useEffect'inden yönetilir.

**Tech Stack:** React, Zustand, @tanstack/react-query v5, jsqr (kurulu), native `getUserMedia`

---

## Keşif Notları (Zaten Yapılmış — Dokunma)

- TaskDetail checklist — **ZATEN VAR** (hardcoded CHECKLISTS sabiti + checkbox UI, satır 7-140)
- DnD odaları — **ZATEN VAR** (DndRooms.jsx tam sayfa + `/mobile/housekeeper/dnd` route)
- PIN badge — **ZATEN VAR** (UsersPage satır 249-250: `u.has_pin ? '✓ PIN' : '✗ PIN'` chip)

---

## Task 1: TechnicianHome Filtre Düzeltmesi

**Files:**
- Modify: `frontend/src/modules/mobile/technician/TechnicianHome.jsx`

- [ ] **Adım 1: Uygulamayı çalıştır, mevcut durumu kaydet**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && npm run dev
  ```
  
  `/mobile/technician` → PIN ile giriş yap → Talepler listesi görüntüle. Şu an sadece "benim bildirdiğim" talepler geliyor.

- [ ] **Adım 2: TechnicianHome.jsx'i güncelle**

  `frontend/src/modules/mobile/technician/TechnicianHome.jsx` dosyasını tamamen şu içerikle değiştir:

  ```jsx
  import { useState } from 'react'
  import { useQuery } from '@tanstack/react-query'
  import { useNavigate } from 'react-router-dom'
  import mobileApi from '../auth/mobileApi.js'
  import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

  const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
  const PRIORITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }

  const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress', 'review'])

  export default function TechnicianHome() {
    const [tab, setTab] = useState('active')
    const navigate = useNavigate()

    const { data: allRequests = [], isLoading, refetch } = useQuery({
      queryKey: ['mobile-tech-requests'],
      queryFn: () => mobileApi.get('/maintenance/requests').then(r => r.data),
      staleTime: 30_000,
      gcTime: 300_000,
      refetchInterval: 60000,
    })

    const { isPulling, handlers } = usePullToRefresh(refetch)

    const active = allRequests.filter(r => ACTIVE_STATUSES.has(r.status))
    const assigned = allRequests.filter(r => ACTIVE_STATUSES.has(r.status) && r.technician_name)
    const done = allRequests.filter(r => r.status === 'done')

    const displayed = tab === 'active' ? active : tab === 'assigned' ? assigned : done

    return (
      <div style={{ padding: '16px' }} {...handlers}>
        {isPulling && (
          <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>
        )}
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Teknik Talepler</h1>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <TabBtn label={`Tüm Aktif (${active.length})`} active={tab === 'active'} color="#3b82f6" onClick={() => setTab('active')} />
          <TabBtn label={`Atanmış (${assigned.length})`} active={tab === 'assigned'} color="#6366f1" onClick={() => setTab('assigned')} />
          <TabBtn label={`Bitti (${done.length})`} active={tab === 'done'} color="#10b981" onClick={() => setTab('done')} />
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ height: '14px', background: '#e5e7eb', borderRadius: '4px', width: '55%' }} />
                  <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '4px', width: '15%' }} />
                </div>
                <div style={{ height: '11px', background: '#f3f4f6', borderRadius: '4px', width: '80%', marginBottom: '10px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '4px', width: '30%' }} />
                  <div style={{ height: '18px', background: '#e5e7eb', borderRadius: '6px', width: '20%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
            {tab === 'done' ? 'Tamamlanan talep yok' : 'Aktif talep yok 🎉'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayed.map(r => (
              <div key={r.id} onClick={() => navigate(`request/${r.id}`)}
                style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', flex: 1, marginRight: '8px' }}>{r.location}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: PRIORITY_COLOR[r.priority], flexShrink: 0 }}>
                    {PRIORITY_LABEL[r.priority]}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px', lineHeight: 1.4 }}>
                  {r.description.length > 80 ? r.description.slice(0, 80) + '...' : r.description}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>#{r.id} · {r.opened_at?.slice(0, 10)}</span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {r.technician_name && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#dbeafe', color: '#1d4ed8' }}>
                        {r.technician_name}
                      </span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const STATUS_MAP = {
    open: { label: 'Açık', bg: '#dbeafe', color: '#1d4ed8' },
    assigned: { label: 'Atandı', bg: '#e0e7ff', color: '#4338ca' },
    in_progress: { label: 'Devam', bg: '#fef3c7', color: '#92400e' },
    review: { label: 'İnceleme', bg: '#f3e8ff', color: '#6b21a8' },
    done: { label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d' },
  }

  function StatusBadge({ status }) {
    const s = STATUS_MAP[status] || { label: status, bg: '#f3f4f6', color: '#6b7280' }
    return (
      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: s.bg, color: s.color }}>
        {s.label}
      </span>
    )
  }

  function TabBtn({ label, active, color, onClick }) {
    return (
      <button onClick={onClick}
        style={{ flex: 1, padding: '9px 6px', borderRadius: '10px', border: `2px solid ${active ? color : '#e5e7eb'}`, background: active ? color + '15' : '#fff', color: active ? color : '#9ca3af', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
        {label}
      </button>
    )
  }
  ```

- [ ] **Adım 3: Tarayıcıda doğrula**

  `/mobile/technician` → "Tüm Aktif", "Atanmış", "Bitti" sekmeleri görünüyor mu? Atanmış talepler mavi chip gösteriyor mu?

- [ ] **Adım 4: Backend testleri çalıştır**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run --reporter=dot
  ```
  
  Beklenen: 387 passed

- [ ] **Adım 5: Commit**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && git add frontend/src/modules/mobile/technician/TechnicianHome.jsx && git commit -m "fix: TechnicianHome — reporter filtresi kaldır, tüm talepler + 3 sekme"
  ```

---

## Task 2: TaskDetail QR Scan

**Files:**
- Modify: `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx`

- [ ] **Adım 1: jsqr import'unu ekle, state ve mutation güncelle**

  `TaskDetail.jsx` dosyasının en başına import ekle ve `completeMut` ile state'i güncelle.

  Dosyanın ilk satırlarını şöyle değiştir (mevcut importların üzerine):

  ```jsx
  import { useState, useRef, useEffect } from 'react'
  import { useParams, useLocation, useNavigate } from 'react-router-dom'
  import { useMutation, useQueryClient } from '@tanstack/react-query'
  import jsQR from 'jsqr'
  import mobileApi from '../auth/mobileApi.js'
  import { enqueue } from '../../../shared/utils/offlineDB.js'
  ```

- [ ] **Adım 2: completeMut'u via_qr parametresi kabul edecek şekilde güncelle**

  Mevcut `completeMut`:
  ```jsx
  const completeMut = useMutation({
    mutationFn: () => mobileApi.post(`/housekeeping/tasks/${id}/complete`, { checklist }),
  ```
  
  Şu şekilde değiştir:
  ```jsx
  const completeMut = useMutation({
    mutationFn: (opts = {}) => mobileApi.post(`/housekeeping/tasks/${id}/complete`, { checklist, ...opts }),
  ```

- [ ] **Adım 3: QR state ve scanner bileşenini ekle**

  `useState` bloklarından hemen sonra (`showSkip` state'inin altına) şunu ekle:

  ```jsx
  const [showQR, setShowQR] = useState(false)
  ```

- [ ] **Adım 4: QRScannerModal bileşenini dosyanın altına ekle**

  `btn` fonksiyonunun altına ekle:

  ```jsx
  function QRScannerModal({ expectedQR, onMatch, onClose }) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const streamRef = useRef(null)
    const rafRef = useRef(null)

    useEffect(() => {
      let active = true

      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          if (!active) { stream.getTracks().forEach(t => t.stop()); return }
          streamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
        })
        .catch(() => { if (active) onClose() })

      return () => {
        active = false
        cancelAnimationFrame(rafRef.current)
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
    }, [onClose])

    useEffect(() => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return

      function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code) {
            if (!expectedQR || code.data === expectedQR) {
              streamRef.current?.getTracks().forEach(t => t.stop())
              onMatch(code.data)
              return
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }

      const onPlay = () => { rafRef.current = requestAnimationFrame(tick) }
      video.addEventListener('play', onPlay)
      return () => video.removeEventListener('play', onPlay)
    }, [expectedQR, onMatch])

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ color: '#fff', fontSize: '14px', textAlign: 'center', margin: 0 }}>
          {expectedQR ? 'Oda QR kodunu okutun' : 'QR kodu okutun'}
        </p>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '280px', height: '280px', borderRadius: '12px', objectFit: 'cover', border: '3px solid #10b981' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button onClick={onClose}
          style={{ padding: '12px 32px', borderRadius: '10px', background: '#fff', color: '#111', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
          İptal
        </button>
      </div>
    )
  }
  ```

- [ ] **Adım 5: Render'a QR butonu ve modal ekle**

  TaskDetail render içinde, tamamlama butonundan ÖNCE (`!isDone && !isSkipped` bloğunun içinde, `<button onClick={() => completeMut.mutate()}` satırından önce) şunu ekle:

  ```jsx
  {task.qr_location && (
    <button
      onClick={() => setShowQR(true)}
      style={{ ...btn('#8b5cf6'), marginBottom: '4px' }}>
      📷 QR ile Tamamla
    </button>
  )}
  ```

  Ve JSX'in en altına (return'ün kapanış `</div>`'ından önce) şunu ekle:

  ```jsx
  {showQR && (
    <QRScannerModal
      expectedQR={task.qr_location}
      onMatch={() => { setShowQR(false); completeMut.mutate({ via_qr: true }) }}
      onClose={() => setShowQR(false)}
    />
  )}
  ```

- [ ] **Adım 6: Tarayıcıda doğrula**

  `qr_location` dolu bir görev varsa "QR ile Tamamla" butonu görünüyor mu? Yok ise buton gizli mi? Kamera izni isteniyor mu?
  
  (Seed'deki görevler `qr_location` olmayabilir — butonsuz görünmesi normal.)

- [ ] **Adım 7: Backend testleri**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run --reporter=dot
  ```

- [ ] **Adım 8: Commit**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && git add frontend/src/modules/mobile/housekeeper/TaskDetail.jsx && git commit -m "feat: TaskDetail QR scan — jsqr kamera ile görev doğrulama"
  ```

---

## Task 3: Mobile Query staleTime Optimizasyonu

**Files:**
- Modify: `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx`
- Modify: `frontend/src/modules/mobile/housekeeper/TaskHistory.jsx`

- [ ] **Adım 1: HousekeeperHome useQuery'e staleTime ekle**

  `HousekeeperHome.jsx` satır 26-32'deki `useQuery` çağrısını bul:

  ```jsx
  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-hk-tasks', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
    refetchInterval: 60000,
  })
  ```

  Şu şekilde değiştir:

  ```jsx
  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-hk-tasks', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60000,
  })
  ```

- [ ] **Adım 2: TaskHistory useQuery'e staleTime ekle**

  `TaskHistory.jsx` satır 10-15'deki `useQuery` çağrısını bul:

  ```jsx
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['mobile-hk-history', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
  })
  ```

  Şu şekilde değiştir:

  ```jsx
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['mobile-hk-history', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
    staleTime: 30_000,
    gcTime: 300_000,
  })
  ```

- [ ] **Adım 3: Commit**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && git add frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx frontend/src/modules/mobile/housekeeper/TaskHistory.jsx && git commit -m "perf: mobile query staleTime 30s + gcTime 5dk — gereksiz refetch önle"
  ```

---

## Task 4: PIN Modal Button Disable Fix

**Files:**
- Modify: `frontend/src/modules/admin/UsersPage.jsx`

- [ ] **Adım 1: PinModal'daki Kaydet butonunu düzelt**

  `UsersPage.jsx` satır 111'deki butonu bul:

  ```jsx
  <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
  ```

  Şu şekilde değiştir:

  ```jsx
  <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || (pin.length > 0 && pin.length < 4)}>
  ```

  **Mantık:** Boş bırakmak = PIN sil (geçerli). 1-3 hane = geçersiz, buton disabled. 4 hane = geçerli.

- [ ] **Adım 2: Tarayıcıda doğrula**

  UsersPage → PIN butonu → modal açılır → 1-3 hane yazınca "KAYDET" gri/disabled olmalı → 4 hane yazınca aktif olmalı → boş bırakınca da aktif olmalı.

- [ ] **Adım 3: Commit**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && git add frontend/src/modules/admin/UsersPage.jsx && git commit -m "fix: PIN modal — 1-3 hane girildiğinde kaydet butonu disabled"
  ```

---

## Task 5: Token Silent Refresh

**Files:**
- Modify: `frontend/src/modules/mobile/shared/MobileLayout.jsx`

- [ ] **Adım 1: MobileLayout'u oku ve mevcut import'ları incele**

  `frontend/src/modules/mobile/shared/MobileLayout.jsx` dosyasını aç. Mevcut import listesinde `useCallback, useEffect` zaten var.

- [ ] **Adım 2: Silent refresh useEffect'ini ekle**

  MobileLayout bileşeninin içinde, mevcut `useEffect` bloklarından sonra şunu ekle:

  ```jsx
  useEffect(() => {
    if (!mobileToken) return
    let timer
    try {
      const payload = JSON.parse(atob(mobileToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      const msUntilRefresh = payload.exp * 1000 - Date.now() - 60 * 60 * 1000
      if (msUntilRefresh <= 0) return
      timer = setTimeout(async () => {
        try {
          const r = await fetch('/api/mobile/auth/refresh', {
            method: 'POST',
            headers: { Authorization: `Bearer ${mobileToken}` },
          })
          if (r.ok) {
            const { token } = await r.json()
            useMobileAuth.getState().login(token, useMobileAuth.getState().user)
          } else {
            logout()
          }
        } catch {
          logout()
        }
      }, msUntilRefresh)
    } catch {}
    return () => clearTimeout(timer)
  }, [mobileToken, logout])
  ```

  **Nereye eklenecek:** `useEffect(() => { if (!isOnline) return` bloğundan SONRA, JSX return'ünden ÖNCE.

- [ ] **Adım 3: Tarayıcıda doğrula**

  DevTools Console'da `atob(token.split('.')[1])` ile token'ın `exp` alanını kontrol et. Uygulama 8 saat çalışınca logout yerine token yenilendiğini doğrula (manuel test için token'ın exp'ini geçmişe alıp refresh isteği yapılıp yapılmadığına bak).

- [ ] **Adım 4: Backend testleri**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run --reporter=dot
  ```
  
  Beklenen: 387 passed

- [ ] **Adım 5: Commit**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude" && git add frontend/src/modules/mobile/shared/MobileLayout.jsx && git commit -m "feat: mobile token silent refresh — 7. saatte otomatik yenile"
  ```

---

## Final Check

- [ ] **Frontend build**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/frontend" && npm run build 2>&1 | tail -20
  ```
  
  Beklenen: `✓ built in` — hata yok

- [ ] **Tüm testler**

  ```bash
  cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run --reporter=dot 2>&1 | tail -5
  ```
  
  Beklenen: 387 passed

- [ ] **Memory güncelle**

  `project_mobile_pwa_pending.md` belleğini güncelle: Task 1, 3, 4, 5 kritik maddeler tamamlandı.

---

## Özet Tablo

| Task | Dosya | Değişim |
|------|-------|---------|
| 1 | TechnicianHome.jsx | reporter_user_id kaldır, 3 sekme, teknisyen badge |
| 2 | TaskDetail.jsx | QRScannerModal + jsqr entegrasyonu |
| 3 | HousekeeperHome.jsx + TaskHistory.jsx | staleTime/gcTime |
| 4 | UsersPage.jsx | PIN modal 1-3 hane = disabled |
| 5 | MobileLayout.jsx | silent refresh useEffect |
