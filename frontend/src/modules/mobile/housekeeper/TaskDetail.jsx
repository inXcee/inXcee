import { useState, useRef, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import jsQR from 'jsqr'
import mobileApi from '../auth/mobileApi.js'
import { enqueue } from '../../../shared/utils/offlineDB.js'

const CHECKLISTS = {
  room: [
    'Zemin süpürüldü',
    'Zemin paspaslı temizlendi',
    'Çöp boşaltıldı',
    'Yatak düzenlendi / çarşaf değiştirildi',
    'Toz alındı',
    'Pencere / cam silindi',
    'Banyo / tuvalet temizlendi',
  ],
  common_area: [
    'Zemin süpürüldü',
    'Zemin paspaslı temizlendi',
    'Çöp boşaltıldı',
    'Cam / pencere silindi',
    'Koridor & merdiven temizlendi',
  ],
}

function initChecklist(taskType, savedChecklist) {
  if (savedChecklist) {
    try { return JSON.parse(savedChecklist) } catch {}
  }
  const items = CHECKLISTS[taskType] || CHECKLISTS.common_area
  return items.map(item => ({ item, done: false }))
}

export default function TaskDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const task = state?.task
  const [skipReason, setSkipReason] = useState('')
  const [showSkip, setShowSkip] = useState(false)
  const [checklist, setChecklist] = useState(() =>
    initChecklist(task?.task_type, task?.checklist)
  )
  const [showQR, setShowQR] = useState(false)

  const completeMut = useMutation({
    mutationFn: (opts = {}) => mobileApi.post(`/housekeeping/tasks/${id}/complete`, { checklist, ...opts }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
    onError: (_err, opts) => {
      if (!navigator.onLine) {
        enqueue('complete_task', { taskId: id, checklist, via_qr: opts?.via_qr ?? false })
        navigate(-1)
      }
    },
  })

  const skipMut = useMutation({
    mutationFn: () => mobileApi.patch(`/housekeeping/tasks/${id}/skip`, { reason: skipReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
    onError: () => {
      if (!navigator.onLine) {
        enqueue('skip_task', { taskId: id, reason: skipReason })
        navigate(-1)
      }
    },
  })

  if (!task) return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <p style={{ color: '#9ca3af', marginBottom: '16px' }}>Görev bulunamadı</p>
      <button onClick={() => navigate(-1)} style={btn('#3b82f6')}>Geri Dön</button>
    </div>
  )

  const isDone = !!task.completed_at
  const isSkipped = task.skipped && !task.completed_at
  const allChecked = checklist.every(i => i.done)
  const checkedCount = checklist.filter(i => i.done).length

  function toggle(idx) {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, done: !item.done } : item))
  }

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '16px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
        ← Geri
      </button>

      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>{task.block} — {task.area}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px' }}>{task.task_type === 'room' ? 'Oda Temizliği' : 'Ortak Alan'}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Row label="Tarih" value={task.scheduled_at?.slice(0, 10)} />
          <Row label="Durum" value={isDone ? '✅ Tamamlandı' : isSkipped ? '⏭️ Atlandı' : '⏳ Bekliyor'} />
          {task.skip_reason && <Row label="Atlama sebebi" value={task.skip_reason} />}
          {task.assignee_name && <Row label="Tamamlayan" value={task.assignee_name} />}
          {task.floor && <Row label="Kat" value={String(task.floor)} />}
        </div>
      </div>

      {/* Checklist */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px' }}>
            TEMİZLİK KONTROLLİSTESİ
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: allChecked ? '#10b981' : '#f59e0b' }}>
            {checkedCount}/{checklist.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {checklist.map((item, idx) => (
            <button
              key={idx}
              onClick={() => !isDone && !isSkipped && toggle(idx)}
              disabled={isDone || isSkipped}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 8px',
                borderRadius: '8px', border: 'none', background: item.done ? '#f0fdf4' : 'transparent',
                cursor: isDone || isSkipped ? 'default' : 'pointer', textAlign: 'left', width: '100%',
              }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                border: `2px solid ${item.done ? '#10b981' : '#d1d5db'}`,
                background: item.done ? '#10b981' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.done && <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: '14px', color: item.done ? '#10b981' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>
                {item.item}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showQR && (
        <QRScannerModal
          expectedQR={task.qr_location}
          onMatch={() => { setShowQR(false); completeMut.mutate({ via_qr: true }) }}
          onClose={() => setShowQR(false)}
        />
      )}

      {!isDone && !isSkipped && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {task.qr_location && (
            <button
              onClick={() => setShowQR(true)}
              disabled={completeMut.isPending}
              style={{ ...btn('#8b5cf6'), marginBottom: '4px', opacity: completeMut.isPending ? 0.5 : 1 }}>
              📷 QR ile Tamamla
            </button>
          )}
          <button
            onClick={() => completeMut.mutate()}
            disabled={completeMut.isPending || !allChecked}
            style={{ ...btn(allChecked ? '#10b981' : '#9ca3af'), opacity: allChecked ? 1 : 0.6 }}>
            {completeMut.isPending
              ? 'İşleniyor...'
              : allChecked
                ? '✓ Tamamlandı Olarak İşaretle'
                : `${checklist.length - checkedCount} madde kaldı`}
          </button>

          {!showSkip ? (
            <button onClick={() => setShowSkip(true)} style={btn('#9ca3af')}>Atla</button>
          ) : (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                ATLAMA SEBEBİ
              </label>
              <textarea value={skipReason} onChange={e => setSkipReason(e.target.value)}
                rows={3} placeholder="Neden atlanıyor?"
                style={{ width: '100%', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '10px', fontSize: '14px', resize: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={() => skipMut.mutate()} disabled={skipMut.isPending}
                  style={{ ...btn('#ef4444'), flex: 1 }}>
                  {skipMut.isPending ? '...' : 'Onayla'}
                </button>
                <button onClick={() => setShowSkip(false)} style={{ ...btn('#9ca3af'), flex: 1 }}>İptal</button>
              </div>
            </div>
          )}

          {(completeMut.error || skipMut.error) && (
            <p style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center' }}>
              {(completeMut.error || skipMut.error)?.response?.data?.error || 'Bir hata oluştu'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
      <span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: '14px', color: '#111' }}>{value || '—'}</span>
    </div>
  )
}

function btn(bg) {
  return { width: '100%', padding: '14px', borderRadius: '12px', background: bg, color: '#fff', border: 'none', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }
}

function QRScannerModal({ expectedQR, onMatch, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const onMatchRef = useRef(onMatch)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onMatchRef.current = onMatch }, [onMatch])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    let active = true

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => { if (active) onCloseRef.current() })

    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

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
            onMatchRef.current(code.data)
            return
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const onPlay = () => { rafRef.current = requestAnimationFrame(tick) }
    video.addEventListener('play', onPlay)
    return () => video.removeEventListener('play', onPlay)
  }, [expectedQR])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <p style={{ color: '#fff', fontSize: '14px', textAlign: 'center', margin: 0 }}>
        {expectedQR ? 'Oda QR kodunu okutun' : 'QR kodu okutun'}
      </p>
      <video ref={videoRef} autoPlay playsInline muted
        style={{ width: '280px', height: '280px', borderRadius: '12px', objectFit: 'cover', border: '3px solid #10b981' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <button onClick={() => onCloseRef.current()}
        style={{ padding: '12px 32px', borderRadius: '10px', background: '#fff', color: '#111', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
        İptal
      </button>
    </div>
  )
}
