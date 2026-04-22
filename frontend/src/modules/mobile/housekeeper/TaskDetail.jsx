import { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

export default function TaskDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const task = state?.task
  const [skipReason, setSkipReason] = useState('')
  const [showSkip, setShowSkip] = useState(false)

  const completeMut = useMutation({
    mutationFn: () => mobileApi.post(`/housekeeping/tasks/${id}/complete`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
  })

  const skipMut = useMutation({
    mutationFn: () => mobileApi.patch(`/housekeeping/tasks/${id}/skip`, { reason: skipReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
  })

  if (!task) return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <p style={{ color: '#9ca3af', marginBottom: '16px' }}>Görev bulunamadı</p>
      <button onClick={() => navigate(-1)} style={btn('#3b82f6')}>Geri Dön</button>
    </div>
  )

  const isDone = !!task.completed_at
  const isSkipped = task.skipped && !task.completed_at

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '16px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
        ← Geri
      </button>

      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>{task.block} — {task.area}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px' }}>{task.task_type}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Row label="Tarih" value={task.scheduled_at?.slice(0, 10)} />
          <Row label="Durum" value={isDone ? '✅ Tamamlandı' : isSkipped ? '⏭️ Atlandı' : '⏳ Bekliyor'} />
          {task.skip_reason && <Row label="Atlama sebebi" value={task.skip_reason} />}
          {task.assignee_name && <Row label="Tamamlayan" value={task.assignee_name} />}
          {task.floor && <Row label="Kat" value={String(task.floor)} />}
        </div>
      </div>

      {!isDone && !isSkipped && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => completeMut.mutate()} disabled={completeMut.isPending}
            style={btn('#10b981')}>
            {completeMut.isPending ? 'İşleniyor...' : '✓ Tamamlandı Olarak İşaretle'}
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
