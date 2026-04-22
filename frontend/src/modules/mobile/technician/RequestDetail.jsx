import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
const PRIORITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }
const STATUS_MAP = {
  open: { label: 'Açık', color: '#3b82f6' },
  assigned: { label: 'Atandı', color: '#6366f1' },
  in_progress: { label: 'Devam Ediyor', color: '#f59e0b' },
  review: { label: 'İncelemede', color: '#8b5cf6' },
  done: { label: 'Tamamlandı', color: '#10b981' },
}

export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [showClose, setShowClose] = useState(false)

  const { data: request, isLoading } = useQuery({
    queryKey: ['mobile-tech-request', id],
    queryFn: () => mobileApi.get(`/maintenance/requests/${id}`).then(r => r.data),
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['mobile-tech-request-comments', id],
    queryFn: () => mobileApi.get(`/maintenance/requests/${id}/comments`).then(r => r.data),
  })

  const startMut = useMutation({
    mutationFn: () => mobileApi.patch(`/maintenance/requests/${id}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-tech-request', id] }),
  })

  const closeMut = useMutation({
    mutationFn: () => mobileApi.patch(`/maintenance/requests/${id}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] }); navigate(-1) },
  })

  const commentMut = useMutation({
    mutationFn: () => mobileApi.post(`/maintenance/requests/${id}/comments`, { comment }),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['mobile-tech-request-comments', id] }) },
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
  if (!request) return <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Talep bulunamadı</div>

  const statusInfo = STATUS_MAP[request.status] || { label: request.status, color: '#9ca3af' }
  const canStart = ['open', 'assigned'].includes(request.status)
  const canClose = ['in_progress', 'review'].includes(request.status)

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '16px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
        ← Geri
      </button>

      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, flex: 1, marginRight: '8px' }}>{request.location}</h2>
          <span style={{ fontSize: '11px', fontWeight: 700, color: PRIORITY_COLOR[request.priority], flexShrink: 0 }}>
            {PRIORITY_LABEL[request.priority]}
          </span>
        </div>

        <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px', lineHeight: 1.5 }}>{request.description}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Row label="Durum">
            <span style={{ fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}</span>
          </Row>
          <Row label="Bildiren"><span>{request.reporter_name || '—'}</span></Row>
          <Row label="Tarih"><span>{request.opened_at?.slice(0, 10)}</span></Row>
          {request.technician_name && <Row label="Teknisyen"><span>{request.technician_name}</span></Row>}
          {request.wait_reason && <Row label="Bekleme sebebi"><span style={{ color: '#9ca3af' }}>{request.wait_reason}</span></Row>}
        </div>
      </div>

      {(canStart || canClose) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {canStart && (
            <button onClick={() => startMut.mutate()} disabled={startMut.isPending}
              style={actionBtn('#3b82f6')}>
              {startMut.isPending ? '...' : '▶ Üstleni / Başla'}
            </button>
          )}
          {canClose && !showClose && (
            <button onClick={() => setShowClose(true)} style={actionBtn('#10b981')}>
              ✓ Tamamlandı Olarak Kapat
            </button>
          )}
          {canClose && showClose && (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
              <p style={{ fontSize: '14px', margin: '0 0 12px', color: '#374151' }}>Talebi kapatmak istediğinizden emin misiniz?</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => closeMut.mutate()} disabled={closeMut.isPending}
                  style={{ ...actionBtn('#10b981'), flex: 1 }}>
                  {closeMut.isPending ? '...' : 'Evet, Kapat'}
                </button>
                <button onClick={() => setShowClose(false)} style={{ ...actionBtn('#9ca3af'), flex: 1 }}>İptal</button>
              </div>
            </div>
          )}
          {(startMut.error || closeMut.error) && (
            <p style={{ color: '#ef4444', fontSize: '13px' }}>
              {(startMut.error || closeMut.error)?.response?.data?.error || 'Hata oluştu'}
            </p>
          )}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', marginBottom: '12px' }}>
          NOTLAR ({comments.length})
        </div>

        {comments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {comments.map(c => (
              <div key={c.id} style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                  {c.user_name || c.technician_name || '?'} · {c.created_at?.slice(0, 10)}
                </div>
                <div style={{ fontSize: '14px', color: '#374151' }}>{c.comment}</div>
              </div>
            ))}
          </div>
        )}

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          rows={2} placeholder="Not ekle..."
          style={{ width: '100%', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '10px', fontSize: '14px', resize: 'none', boxSizing: 'border-box', marginBottom: '8px' }} />
        <button onClick={() => commentMut.mutate()} disabled={!comment.trim() || commentMut.isPending}
          style={{ ...actionBtn('#6366f1'), opacity: !comment.trim() ? 0.5 : 1 }}>
          {commentMut.isPending ? '...' : 'Not Ekle'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px', fontSize: '13px' }}>
      <span style={{ color: '#9ca3af' }}>{label}</span>
      {children}
    </div>
  )
}

function actionBtn(bg) {
  return { width: '100%', padding: '13px', borderRadius: '12px', background: bg, color: '#fff', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
}
