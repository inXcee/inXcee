import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { toastErr, SWAP_STATUS, formatDate, ModalOverlay, StaffSearch } from '../shared.jsx'

export default function SwapTab() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ requester_id: '', target_id: '', swap_date: '', reason: '' })

  const { data: swaps = [] } = useQuery({ queryKey: ['swaps'], queryFn: () => api.get('/shifts/swaps').then(r => r.data) })
  const createSwap = useMutation({ mutationFn: data => api.post('/shifts/swaps', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['swaps'] }); setShowForm(false); setForm({ requester_id: '', target_id: '', swap_date: '', reason: '' }) }, onError: toastErr })
  const approveMut = useMutation({ mutationFn: (id) => api.patch(`/shifts/swaps/${id}/approve`), onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }) })
  const rejectMut = useMutation({ mutationFn: (id) => api.patch(`/shifts/swaps/${id}/reject`), onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }) })

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Takas Talebi</button>
      </div>

      <div className="panel">
        <div className="panel-header"><div><div className="panel-title">VARDIYA TAKAS TALEPLERI</div><div className="panel-subtitle">{swaps.length} TALEP</div></div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {swaps.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#128260;</div><div className="empty-title">TAKAS YOK</div><div className="empty-sub">Henuz takas talebi yok</div></div>
          ) : (
            <table className="data-table responsive-stack">
              <thead><tr><th>Talep Eden</th><th>Hedef Kisi</th><th>Tarih</th><th>Sebep</th><th>Durum</th>{canApprove && <th>Islem</th>}</tr></thead>
              <tbody>
                {swaps.map(s => (
                  <tr key={s.id}>
                    <td data-label="Talep Eden" style={{ fontSize: '12.5px' }}>{s.requester_name || `#${s.requester_id}`}</td>
                    <td data-label="Hedef Kisi" style={{ fontSize: '12.5px' }}>{s.target_name || `#${s.target_id}`}</td>
                    <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{s.swap_date ? formatDate(s.swap_date) : '—'}</td>
                    <td data-label="Sebep" style={{ color: 'var(--text2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.reason || '—'}</td>
                    <td data-label="Durum"><span className={`badge ${SWAP_STATUS[s.status]?.badge || 'badge-gray'}`}>{SWAP_STATUS[s.status]?.label || s.status}</span></td>
                    {canApprove && (
                      <td data-label="Islem">
                        {s.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={() => approveMut.mutate(s.id)} disabled={approveMut.isPending}>Onayla</button>
                            <button className="btn btn-danger btn-sm" onClick={() => rejectMut.mutate(s.id)} disabled={rejectMut.isPending}>Reddet</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>YENI TAKAS TALEBI</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Talep Eden Personel</label><StaffSearch value={form.requester_id} onChange={v => setForm(p => ({ ...p, requester_id: v }))} placeholder="Talep eden personeli ara..." /></div>
            <div><label className="form-label">Hedef Personel</label><StaffSearch value={form.target_id} onChange={v => setForm(p => ({ ...p, target_id: v }))} placeholder="Hedef personeli ara..." /></div>
            <div><label className="form-label">Takas Tarihi</label><input type="date" className="form-input" value={form.swap_date} onChange={e => setForm(p => ({ ...p, swap_date: e.target.value }))} /></div>
            <div><label className="form-label">Sebep</label><textarea className="form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ minHeight: '60px' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!form.requester_id || !form.target_id || !form.swap_date) ? 0.5 : 1 }}
              disabled={!form.requester_id || !form.target_id || !form.swap_date || createSwap.isPending}
              onClick={() => createSwap.mutate({ requester_id: parseInt(form.requester_id), target_id: parseInt(form.target_id), swap_date: form.swap_date, reason: form.reason })}>
              {createSwap.isPending ? 'Gonderiliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
