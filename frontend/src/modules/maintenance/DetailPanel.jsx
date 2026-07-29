// Seçili arıza kaydının detay paneli: durum/öncelik/bekleme-sebebi değişimi,
// önce/sonra fotoğrafları, kapatma/yeniden-açma ve fotoğraflı not akışı.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import {
  statusInfo, priInfo, PRIORITIES, SPECIALTIES, WAIT_REASONS,
  StatusTimeline, StatusActions, PhotoCapture,
} from './shared.jsx'

export default function DetailPanel({ requestId, onClose }) {
  const qc = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [commentPhoto, setCommentPhoto] = useState(null)
  const [closePhoto, setClosePhoto] = useState(null)
  const [customReason, setCustomReason] = useState('')

  const { data: request } = useQuery({
    queryKey: ['maintenance-detail', requestId],
    queryFn: () => api.get(`/maintenance/requests/${requestId}`).then(r => r.data),
  })

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
    qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    qc.invalidateQueries({ queryKey: ['maintenance-detail', requestId] })
  }

  const { data: comments = [] } = useQuery({
    queryKey: ['maintenance-comments', requestId],
    queryFn: () => api.get(`/maintenance/requests/${requestId}/comments`).then(r => r.data),
  })

  const waitReasonMut = useMutation({
    mutationFn: (wait_reason) => api.patch(`/maintenance/requests/${requestId}/wait-reason`, { wait_reason }),
    onSuccess: inv,
  })
  const priorityMut = useMutation({
    mutationFn: (priority) => api.patch(`/maintenance/requests/${requestId}/priority`, { priority }),
    onSuccess: inv,
  })
  const reopenMut = useMutation({ mutationFn: () => api.patch(`/maintenance/requests/${requestId}/reopen`), onSuccess: inv })
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/maintenance/requests/${requestId}`),
    onSuccess: () => { inv(); onClose() },
  })
  const closeMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      if (closePhoto) fd.append('photo', closePhoto)
      return api.patch(`/maintenance/requests/${requestId}/close`, fd)
    },
    onSuccess: () => { setClosePhoto(null); inv() },
  })
  const commentMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('comment', newComment.trim())
      if (commentPhoto) fd.append('photo', commentPhoto)
      return api.post(`/maintenance/requests/${requestId}/comments`, fd)
    },
    onSuccess: () => {
      setNewComment('')
      setCommentPhoto(null)
      qc.invalidateQueries({ queryKey: ['maintenance-comments', requestId] })
    },
  })

  if (!request) return <SkeletonCard lines={6} />

  const pri = priInfo(request.priority)

  return (
    <div className="panel fade-up" style={{ marginTop: '16px' }}>
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${pri.color}, var(--purple))` }} />
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="panel-title">#{request.id} — {request.location}</div>
            {(() => { const si = statusInfo(request.status); return (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '8.5px', letterSpacing: '1px', padding: '2px 8px',
                borderRadius: '4px', color: si.color,
                background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${si.color} 30%, transparent)`,
              }}>{si.label}</span>
            ) })()}
            <StatusTimeline status={request.status} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
              color: pri.color, background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${pri.color} 30%, transparent)`,
            }}>{pri.label}</span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
              color: 'var(--blue)', background: 'rgba(52,152,219,.1)',
              border: '1px solid rgba(52,152,219,.2)',
            }}>{SPECIALTIES[request.category] || SPECIALTIES.genel}</span>
            {request.sla_deadline && request.status !== 'done' && (() => {
              const isOverdue = new Date(request.sla_deadline) < new Date()
              return (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                  color: isOverdue ? 'var(--red)' : 'var(--teal)',
                  background: isOverdue ? 'rgba(231,76,60,.12)' : 'rgba(26,188,156,.12)',
                  border: isOverdue ? '1px solid rgba(231,76,60,.3)' : '1px solid rgba(26,188,156,.3)',
                }}>SLA {isOverdue ? 'AŞILDI' : new Date(request.sla_deadline).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              )
            })()}
          </div>
          <div className="panel-subtitle" style={{ marginTop: '4px' }}>
            {request.reporter_name && `${request.reporter_name} · `}
            {new Date(request.opened_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {request.block ? ` · ${request.block}` : ''}
            {request.room_id ? ` · Oda #${request.room_id}` : ''}
            {request.cleaning_task_id ? ` · Temizlik görevi #${request.cleaning_task_id}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', fontSize: '9px' }}
            onClick={async () => { if (await confirmDialog({ title: 'Arıza Kaydını Sil', body: 'Bu arıza kaydı silinsin mi?', danger: true })) deleteMut.mutate() }}>SİL</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="panel-body">
        {/* Description */}
        <div style={{
          padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '8px', marginBottom: '14px',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{request.description}</div>
        </div>

        {/* Workflow Actions */}
        {request.status !== 'done' && (
          <div style={{
            padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px' }}>İŞLEM:</span>
            <div style={{ position: 'relative' }}>
              <StatusActions request={request} onSuccess={() => {}} />
            </div>
            {(request.technician_name || request.avs_worker_name) && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '4px',
                background: 'rgba(52,152,219,.1)', border: '1px solid rgba(52,152,219,.2)',
                color: 'var(--blue)', marginLeft: 'auto',
              }}>Teknisyen: {request.technician_name || request.avs_worker_name}</span>
            )}
          </div>
        )}

        {/* Wait reason */}
        {request.status !== 'done' && (
          <div style={{
            padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', marginBottom: '14px',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '8px' }}>BEKLEME SEBEBİ</div>
            {request.wait_reason && (
              <div style={{
                padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.2)',
                fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{request.wait_reason}</span>
                <button onClick={() => waitReasonMut.mutate(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '11px',
                }}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {WAIT_REASONS.map(r => (
                <button key={r} onClick={() => waitReasonMut.mutate(r)}
                  disabled={waitReasonMut.isPending}
                  style={{
                    padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                    border: request.wait_reason === r ? '1px solid var(--amber)' : '1px solid var(--border)',
                    background: request.wait_reason === r ? 'rgba(240,165,0,.1)' : 'transparent',
                    color: request.wait_reason === r ? 'var(--amber)' : 'var(--text2)',
                    fontFamily: 'var(--sans)', transition: 'all .1s',
                  }}>{r}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <input className="form-input" value={customReason} onChange={e => setCustomReason(e.target.value)}
                placeholder="Başka bir sebep yaz..." style={{ fontSize: '11px', flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && customReason.trim()) { waitReasonMut.mutate(customReason.trim()); setCustomReason('') } }} />
              {customReason.trim() && (
                <button className="btn btn-ghost btn-xs" onClick={() => { waitReasonMut.mutate(customReason.trim()); setCustomReason('') }}>EKLE</button>
              )}
            </div>
          </div>
        )}

        {/* Priority change */}
        {request.status !== 'done' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
            padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px' }}>ÖNCELİK:</span>
            {PRIORITIES.map(p => (
              <button key={p.key} onClick={() => priorityMut.mutate(p.key)} disabled={priorityMut.isPending} style={{
                padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', border: 'none',
                background: request.priority === p.key ? `color-mix(in srgb, ${p.color} 18%, transparent)` : 'transparent',
                color: request.priority === p.key ? p.color : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
              }}>{p.label}</button>
            ))}
          </div>
        )}

        {/* Photos */}
        {(request.photo_before || request.photo_url) && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {request.photo_before && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', letterSpacing: '1.5px', marginBottom: '6px' }}>ÖNCE</div>
                <img loading="lazy" src={request.photo_before} alt="" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
            )}
            {request.photo_url && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)', letterSpacing: '1.5px', marginBottom: '6px' }}>SONRA</div>
                <img loading="lazy" src={request.photo_url} alt="" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
            )}
          </div>
        )}

        {/* Close / Complete — from in_progress status */}
        {request.status === 'in_progress' && (
          <div style={{
            padding: '12px 14px', background: 'rgba(39,201,106,.04)', border: '1px solid rgba(39,201,106,.15)',
            borderRadius: '8px', marginBottom: '14px',
          }}>
            <PhotoCapture value={closePhoto} onChange={setClosePhoto} label="Tamamlanma Fotoğrafı" />
            <button className="btn btn-primary btn-sm" disabled={closeMut.isPending}
              onClick={() => closeMut.mutate()}
              style={{ background: 'var(--green)', borderColor: 'var(--green)', marginTop: '10px' }}>
              {closeMut.isPending ? '...' : 'KAPAT'}
            </button>
          </div>
        )}

        {/* Done state */}
        {request.status === 'done' && (
          <div style={{
            padding: '10px 14px', background: 'rgba(39,201,106,.08)', border: '1px solid rgba(39,201,106,.25)',
            borderRadius: '8px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)' }}>
              Tamamlandı · {new Date(request.closed_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '9px', color: 'var(--accent)' }}
              onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending}>YENİDEN AÇ</button>
          </div>
        )}

        {/* Comments */}
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
            NOTLAR · {comments.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {comments.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '8px 0' }}>Henüz not yok</div>
            )}
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: 'linear-gradient(135deg,var(--blue),var(--purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '9px', color: '#fff',
                  }}>{(c.user_name || '?').charAt(0).toUpperCase()}</div>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{c.user_name || 'Sistem'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginLeft: 'auto' }}>
                    {new Date(c.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{c.comment}</div>
                {c.photo_url && <img loading="lazy" src={c.photo_url} alt="" style={{ marginTop: '8px', maxWidth: '200px', borderRadius: '6px', border: '1px solid var(--border)' }} />}
              </div>
            ))}
          </div>
          <div style={{
            padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <input className="form-input" value={newComment} onChange={e => setNewComment(e.target.value)}
              placeholder="Not ekle..." style={{ fontSize: '12px' }}
              onKeyDown={e => { if (e.key === 'Enter' && newComment.trim()) commentMut.mutate() }} />
            <PhotoCapture value={commentPhoto} onChange={setCommentPhoto} label="" />
            <button className="btn btn-primary btn-sm" disabled={!newComment.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate()}
              style={{ alignSelf: 'flex-start', opacity: (!newComment.trim() || commentMut.isPending) ? 0.5 : 1 }}>
              {commentMut.isPending ? '...' : 'GÖNDER'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
