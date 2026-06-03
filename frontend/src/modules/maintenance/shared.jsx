// MaintenancePage genelinde paylaşılan sabitler, helper'lar ve küçük sunum/aksiyon
// primitive'leri. Hem DetailPanel hem orkestratör listesi/formu bunları kullanır.
import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export const MAINTENANCE_EXPORT_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'location', label: 'Konum' },
  { key: 'description', label: 'Açıklama' },
  { key: 'status_label', label: 'Durum' },
  { key: 'priority_label', label: 'Öncelik' },
  { key: 'wait_reason', label: 'Bekleme Nedeni' },
  { key: 'opened_at', label: 'Açılış' },
  { key: 'closed_at', label: 'Kapanış' },
  { key: 'reporter', label: 'Raporlayan' },
]

export const PRIORITIES = [
  { key: 'high', label: 'ACİL', color: 'var(--red)' },
  { key: 'medium', label: 'NORMAL', color: 'var(--amber)' },
  { key: 'low', label: 'DÜŞÜK', color: 'var(--blue)' },
]

export const SPECIALTIES = {
  elektrik: 'Elektrik',
  tesisat: 'Tesisat',
  genel: 'Genel',
  klima: 'Klima',
  boya: 'Boya',
}

export const SHIFTS = {
  '1': { label: '1. Vardiya', hours: '08:00–17:00', color: 'var(--amber)' },
  '2': { label: '2. Vardiya', hours: '15:00–00:00', color: 'var(--blue)' },
  '3': { label: '3. Vardiya', hours: '00:00–08:00', color: 'var(--purple)' },
}

export const STATUSES = [
  { key: 'open', label: 'AÇIK', color: 'var(--red)', dotColor: '#e74c3c' },
  { key: 'in_progress', label: 'DEVAM EDİYOR', color: 'var(--amber)', dotColor: '#f0a500' },
  { key: 'done', label: 'TAMAMLANDI', color: 'var(--green)', dotColor: '#27c96a' },
]

export function statusInfo(s) { return STATUSES.find(x => x.key === s) || STATUSES[0] }

export const WAIT_REASONS = [
  'Yetkili servis çağrıldı',
  'Odada kişi var, gündüz bakılacak',
  'Malzeme bekleniyor',
  'Parça siparişte',
]

export const BLOCK_TYPES = ['M', 'S', 'Y']

export function priInfo(p) { return PRIORITIES.find(x => x.key === p) || PRIORITIES[1] }

export function getCurrentShift() {
  const h = new Date().getHours()
  if (h >= 8 && h < 15) return '1'
  if (h >= 15 && h < 24) return '2'
  return '3'
}

/* ═══════════════════════════════════════════════════════════════════════════
   SLA Countdown
   ═══════════════════════════════════════════════════════════════════════════ */
export function SLACountdown({ deadline }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!deadline) return null

  const deadlineMs = new Date(deadline).getTime()
  const diff = deadlineMs - now
  const isOverdue = diff <= 0
  const absDiff = Math.abs(diff)

  const hours = Math.floor(absDiff / 3600000)
  const minutes = Math.floor((absDiff % 3600000) / 60000)
  const seconds = Math.floor((absDiff % 60000) / 1000)
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  let color = 'var(--text2)'
  if (isOverdue) color = 'var(--red)'
  else if (diff <= 3600000) color = 'var(--red)'
  else if (diff <= 14400000) color = 'var(--amber)'

  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '4px',
      color,
      background: isOverdue ? 'rgba(231,76,60,.12)' : diff <= 3600000 ? 'rgba(231,76,60,.08)' : diff <= 14400000 ? 'rgba(240,165,0,.08)' : 'rgba(148,163,184,.08)',
      border: isOverdue ? '1px solid rgba(231,76,60,.3)' : diff <= 3600000 ? '1px solid rgba(231,76,60,.2)' : diff <= 14400000 ? '1px solid rgba(240,165,0,.2)' : '1px solid var(--border)',
      animation: isOverdue ? 'sla-pulse 1.5s ease-in-out infinite' : 'none',
      display: 'inline-flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px',
    }}>
      {isOverdue ? `SLA AŞILDI +${formatted}` : formatted}
    </span>
  )
}

/* inject SLA pulse keyframes once */
if (typeof document !== 'undefined' && !document.getElementById('sla-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'sla-pulse-style'
  style.textContent = `@keyframes sla-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`
  document.head.appendChild(style)
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status Timeline
   ═══════════════════════════════════════════════════════════════════════════ */
export function StatusTimeline({ status }) {
  const currentIdx = STATUSES.findIndex(s => s.key === status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      {STATUSES.map((s, i) => {
        const isActive = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{
              width: isCurrent ? '10px' : '7px',
              height: isCurrent ? '10px' : '7px',
              borderRadius: '50%',
              background: isActive ? s.dotColor : 'var(--border2)',
              boxShadow: isCurrent ? `0 0 6px ${s.dotColor}` : 'none',
              transition: 'all .2s',
            }} title={s.label} />
            {i < STATUSES.length - 1 && (
              <div style={{
                width: '12px', height: '2px',
                background: i < currentIdx ? STATUSES[i + 1].dotColor : 'var(--border2)',
                borderRadius: '1px',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status Action Buttons
   ═══════════════════════════════════════════════════════════════════════════ */
export function StatusActions({ request, onSuccess }) {
  const qc = useQueryClient()

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
    qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    qc.invalidateQueries({ queryKey: ['maintenance-detail', request.id] })
    if (onSuccess) onSuccess()
  }

  const statusMut = useMutation({
    mutationFn: (status) => api.patch(`/maintenance/requests/${request.id}/status`, { status }),
    onSuccess: inv,
  })

  if (request.status === 'open') {
    return (
      <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); statusMut.mutate('in_progress') }}
        disabled={statusMut.isPending}
        style={{ background: 'var(--amber)', borderColor: 'var(--amber)', fontSize: '9px', letterSpacing: '1px' }}>
        {statusMut.isPending ? '...' : 'BAŞLA'}
      </button>
    )
  }

  if (request.status === 'in_progress') {
    return (
      <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); statusMut.mutate('done') }}
        disabled={statusMut.isPending}
        style={{ background: 'var(--green)', borderColor: 'var(--green)', fontSize: '9px', letterSpacing: '1px' }}>
        {statusMut.isPending ? '...' : 'TAMAMLA'}
      </button>
    )
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   Photo Capture
   ═══════════════════════════════════════════════════════════════════════════ */
export function PhotoCapture({ value, onChange, label = 'Fotoğraf' }) {
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const [preview, setPreview] = useState(null)

  const handleFile = (file) => {
    if (!file) return
    onChange(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const clear = () => { onChange(null); setPreview(null) }

  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      {preview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img loading="lazy" src={preview} alt="" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', border: '1px solid var(--border)', objectFit: 'cover' }} />
          <button onClick={clear} style={{
            position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', borderRadius: '50%',
            background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => cameraRef.current?.click()} style={{
            flex: 1, padding: '14px 10px', borderRadius: '8px', cursor: 'pointer',
            border: '2px dashed var(--border)', background: 'rgba(15,23,42,.3)',
            color: 'var(--text2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ fontSize: '20px' }}>📷</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>KAMERA</span>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            flex: 1, padding: '14px 10px', borderRadius: '8px', cursor: 'pointer',
            border: '2px dashed var(--border)', background: 'rgba(15,23,42,.3)',
            color: 'var(--text2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ fontSize: '20px' }}>📁</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>DOSYA</span>
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  )
}
