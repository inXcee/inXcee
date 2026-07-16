import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { DossierSection, DossierMetric, DossierField, formatDossierDate } from './StaffDossierShared.jsx'

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)

function useStaffResource(key, staffId, url, enabled = true) {
  return useQuery({
    queryKey: [key, String(staffId)],
    queryFn: () => api.get(url).then(r => r.data),
    enabled: !!staffId && enabled,
    staleTime: 30000,
  })
}

function Empty({ label }) {
  return <div style={{ color: 'var(--text3)', fontSize: 11 }}>{label}</div>
}

function Loading() {
  return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div>
}

/* ─── Performans ve Hedefler ─────────────────────────────── */
export function StaffPerformancePanel({ staffId, canManage }) {
  const qc = useQueryClient()
  const reviews = useStaffResource('staff-perf-reviews', staffId, `/performance/reviews?staff_id=${staffId}`)
  const goals = useStaffResource('staff-perf-goals', staffId, `/performance/goals?staff_id=${staffId}`)
  const positive = useStaffResource('staff-perf-positive', staffId, `/performance/positive/${staffId}`)

  const progressMutation = useMutation({
    mutationFn: ({ id, progress }) => api.patch(`/performance/goals/${id}`, {
      progress, status: progress >= 100 ? 'done' : 'in_progress',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-perf-goals', String(staffId)] }); toast('Hedef güncellendi') },
    onError: (e) => toast(e.response?.data?.error || 'Güncellenemedi', 'error'),
  })

  const [pointForm, setPointForm] = useState({ reason: '', points: 1 })
  const pointMutation = useMutation({
    mutationFn: () => api.post('/performance/positive', { staff_id: staffId, reason: pointForm.reason, points: pointForm.points }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-perf-positive', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
      toast('Pozitif puan eklendi'); setPointForm({ reason: '', points: 1 })
    },
    onError: (e) => toast(e.response?.data?.error || 'Eklenemedi', 'error'),
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <DossierSection title="DEĞERLENDİRME GEÇMİŞİ" subtitle={reviews.isLoading ? 'Yükleniyor…' : `${reviews.data?.length || 0} değerlendirme`}>
        {reviews.isLoading ? <Loading /> : reviews.data?.length ? (
          <div style={{ display: 'grid', gap: 7 }}>
            {reviews.data.slice(0, 8).map(review => (
              <div key={review.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: '3px solid var(--blue)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                  <span>{review.period}</span>
                  <span style={{ color: 'var(--accent)' }}>Puan: {review.total_score ?? '—'}</span>
                </div>
                {(review.strengths || review.improvement_areas) && (
                  <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 4 }}>
                    {review.strengths ? `Güçlü: ${review.strengths}` : ''}{review.improvement_areas ? ` · Gelişim: ${review.improvement_areas}` : ''}
                  </div>
                )}
                <div style={{ color: 'var(--text4)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 3 }}>{formatDossierDate(review.reviewed_at)}</div>
              </div>
            ))}
          </div>
        ) : <Empty label="Değerlendirme kaydı yok." />}
      </DossierSection>

      <DossierSection title="HEDEFLER" subtitle={goals.isLoading ? 'Yükleniyor…' : `${goals.data?.length || 0} hedef`}>
        {goals.isLoading ? <Loading /> : goals.data?.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {goals.data.slice(0, 10).map(goal => (
              <div key={goal.id} style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--surface2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>{goal.title}</span>
                  <span className={`badge ${goal.status === 'done' ? 'badge-green' : goal.status === 'cancelled' ? 'badge-gray' : 'badge-blue'}`}>{goal.status}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${goal.progress || 0}%`, background: goal.progress >= 100 ? 'var(--green)' : 'var(--blue)' }} />
                </div>
                {canManage && goal.status !== 'done' && goal.status !== 'cancelled' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <input type="range" min="0" max="100" step="5" defaultValue={goal.progress || 0}
                      onMouseUp={(e) => progressMutation.mutate({ id: goal.id, progress: +e.target.value })}
                      onTouchEnd={(e) => progressMutation.mutate({ id: goal.id, progress: +e.target.value })}
                      style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>%{goal.progress || 0}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <Empty label="Tanımlı hedef yok." />}
      </DossierSection>

      <DossierSection title="POZİTİF PUANLAR" subtitle={positive.isLoading ? 'Yükleniyor…' : `Toplam ${(positive.data || []).reduce((sum, p) => sum + (p.points || 0), 0)} puan`}>
        {canManage && (
          <form onSubmit={(e) => { e.preventDefault(); if (pointForm.reason.trim()) pointMutation.mutate() }} style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
            <input className="input" placeholder="Gerekçe" value={pointForm.reason} onChange={(e) => setPointForm(f => ({ ...f, reason: e.target.value }))} style={{ flex: 1 }} />
            <input className="input" type="number" min="1" max="10" value={pointForm.points} onChange={(e) => setPointForm(f => ({ ...f, points: +e.target.value }))} style={{ width: 60 }} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pointMutation.isPending || !pointForm.reason.trim()}>+ Puan</button>
          </form>
        )}
        {positive.isLoading ? <Loading /> : positive.data?.length ? (
          <div style={{ display: 'grid', gap: 5 }}>
            {positive.data.slice(0, 8).map(point => (
              <div key={point.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
                <span>{point.reason}</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>+{point.points}</span>
              </div>
            ))}
          </div>
        ) : <Empty label="Pozitif puan kaydı yok." />}
      </DossierSection>
    </div>
  )
}

/* ─── İSG ve Sertifikalar ─────────────────────────────── */
export function StaffSafetyPanel({ staffId }) {
  const training = useStaffResource('staff-training', staffId, `/safety/staff/${staffId}/training`)
  const accidents = useStaffResource('staff-accidents', staffId, `/safety/accidents?staff_id=${staffId}`)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <DossierSection title="EĞİTİM VE SERTİFİKALAR" subtitle={training.isLoading ? 'Yükleniyor…' : `${training.data?.length || 0} kayıt`}>
        {training.isLoading ? <Loading /> : training.data?.length ? (
          <div style={{ display: 'grid', gap: 7 }}>
            {training.data.slice(0, 12).map(row => {
              const expired = row.cert_expires_at && row.cert_expires_at < today
              return (
                <div key={row.attendance_id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: `3px solid ${expired ? 'var(--red)' : row.attended ? 'var(--green)' : 'var(--accent)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ fontWeight: 600 }}>{row.title}</span>
                    <span className={`badge ${row.attended ? 'badge-green' : 'badge-amber'}`}>{row.attended ? 'Katıldı' : 'Katılmadı'}</span>
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 3 }}>
                    {formatDossierDate(row.session_date)}{row.score != null ? ` · puan ${row.score}` : ''}
                    {row.cert_expires_at ? ` · sertifika ${expired ? 'DOLDU' : 'bitiş'} ${row.cert_expires_at}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <Empty label="Eğitim kaydı yok." />}
      </DossierSection>

      <DossierSection title="İŞ KAZALARI VE İSG OLAYLARI" subtitle={accidents.isLoading ? 'Yükleniyor…' : `${accidents.data?.length || 0} kayıt`}>
        {accidents.isLoading ? <Loading /> : accidents.data?.length ? (
          <div style={{ display: 'grid', gap: 7 }}>
            {accidents.data.slice(0, 10).map(accident => (
              <div key={accident.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>{accident.accident_date}</span>
                  <span className="badge badge-red">{accident.severity || accident.status}</span>
                </div>
                <div style={{ color: 'var(--text2)', fontSize: 10, marginTop: 3 }}>{accident.description}</div>
                <a className="btn btn-ghost btn-sm" href={`/safety?tab=accidents&id=${accident.id}`} style={{ marginTop: 5, fontSize: 9 }}>Detay →</a>
              </div>
            ))}
          </div>
        ) : <Empty label="İş kazası kaydı yok." />}
      </DossierSection>
    </div>
  )
}

/* ─── Zimmet ve Ekipman ─────────────────────────────── */
export function StaffEquipmentPanel({ staffId, canManage }) {
  const qc = useQueryClient()
  const inventory = useStaffResource('staff-inventory', staffId, `/inventory/checkouts/staff/${staffId}`)
  const kkd = useStaffResource('staff-kkd', staffId, `/safety/kkd?staff_id=${staffId}`)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-inventory', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-kkd', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }
  const returnInventory = async (item) => {
    const remaining = (item.quantity || 0) - (item.returned_qty || 0)
    const ok = await confirmDialog({ title: 'Zimmet iadesi', message: `"${item.item_name}" (${remaining} adet) iade edilsin mi?`, confirmText: 'İade Al' })
    if (!ok) return
    try { await api.post(`/inventory/return/${item.id}`, { quantity: remaining }); toast('Zimmet iade alındı'); invalidate() }
    catch (e) { toast(e.response?.data?.error || 'İade başarısız', 'error') }
  }
  const returnKkd = async (item) => {
    const ok = await confirmDialog({ title: 'KKD iadesi', message: `"${item.item_type}" iade edilsin mi?`, confirmText: 'İade Al' })
    if (!ok) return
    try { await api.post(`/safety/kkd/${item.id}/return`, {}); toast('KKD iade alındı'); invalidate() }
    catch (e) { toast(e.response?.data?.error || 'İade başarısız', 'error') }
  }

  const inventoryRows = inventory.data || []
  const kkdRows = kkd.data || []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <DossierSection title="ENVANTER ZİMMETLERİ" subtitle={inventory.isLoading ? 'Yükleniyor…' : `${inventoryRows.length} kayıt`}>
        {inventory.isLoading ? <Loading /> : inventoryRows.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {inventoryRows.slice(0, 12).map(item => {
              const active = !item.returned_at && ((item.quantity || 0) - (item.returned_qty || 0)) > 0
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: `3px solid ${active ? 'var(--accent)' : 'var(--green)'}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{item.item_name} · {item.quantity} adet</div>
                    <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 2 }}>
                      {item.serial_no ? `SN: ${item.serial_no} · ` : ''}{formatDossierDate(item.checked_out_at)}{item.checked_out_by_name ? ` · ${item.checked_out_by_name}` : ''}
                    </div>
                  </div>
                  {active
                    ? (canManage ? <button className="btn btn-ghost btn-sm" onClick={() => returnInventory(item)}>İade</button> : <span className="badge badge-amber">Aktif</span>)
                    : <span className="badge badge-green">İade</span>}
                </div>
              )
            })}
          </div>
        ) : <Empty label="Envanter zimmeti yok." />}
      </DossierSection>

      <DossierSection title="KKD KAYITLARI" subtitle={kkd.isLoading ? 'Yükleniyor…' : `${kkdRows.length} kayıt`}>
        {kkd.isLoading ? <Loading /> : kkdRows.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {kkdRows.slice(0, 12).map(item => {
              const active = !item.returned_at
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: `3px solid ${active ? 'var(--accent)' : 'var(--green)'}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{item.item_type}{item.size ? ` · ${item.size}` : ''}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 2 }}>
                      {item.serial_no ? `SN: ${item.serial_no} · ` : ''}{formatDossierDate(item.assigned_at)}
                    </div>
                  </div>
                  {active
                    ? (canManage ? <button className="btn btn-ghost btn-sm" onClick={() => returnKkd(item)}>İade</button> : <span className="badge badge-amber">Aktif</span>)
                    : <span className="badge badge-green">İade</span>}
                </div>
              )
            })}
          </div>
        ) : <Empty label="KKD kaydı yok." />}
      </DossierSection>
    </div>
  )
}

/* ─── İşe Giriş / Çıkış Süreci ─────────────────────────────── */
export function StaffChecklistPanel({ staffId, canManage }) {
  const qc = useQueryClient()
  const checklists = useStaffResource('staff-checklists', staffId, `/hr/checklists?staff_id=${staffId}`)
  const [openId, setOpenId] = useState(null)
  const detail = useQuery({
    queryKey: ['staff-checklist-detail', String(openId)],
    queryFn: () => api.get(`/hr/checklists/${openId}`).then(r => r.data),
    enabled: !!openId,
  })
  const toggleMutation = useMutation({
    mutationFn: ({ itemId, done }) => api.patch(`/hr/items/${itemId}/toggle`, { done }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-checklist-detail', String(openId)] })
      qc.invalidateQueries({ queryKey: ['staff-checklists', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
    },
    onError: (e) => toast(e.response?.data?.error || 'Güncellenemedi', 'error'),
  })

  const lists = checklists.data || []
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <DossierSection title="İŞE GİRİŞ / ÇIKIŞ SÜREÇLERİ" subtitle={checklists.isLoading ? 'Yükleniyor…' : `${lists.length} süreç`}>
        {checklists.isLoading ? <Loading /> : lists.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {lists.map(list => (
              <div key={list.id} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{list.kind === 'onboarding' ? 'İşe Giriş' : 'İşten Çıkış'}</span>
                    <span className={`badge ${list.status === 'open' ? 'badge-amber' : list.status === 'completed' ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 8 }}>{list.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                      %{list.total_items ? Math.round(((list.done_items || 0) / list.total_items) * 100) : 0}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(openId === list.id ? null : list.id)}>{openId === list.id ? 'Kapat' : 'Aç'}</button>
                  </div>
                </div>
                {openId === list.id && (
                  <div style={{ marginTop: 9, display: 'grid', gap: 4 }}>
                    {detail.isLoading ? <Loading /> : (detail.data?.items || []).map(item => (
                      <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <input type="checkbox" checked={!!item.done} disabled={!canManage || toggleMutation.isPending}
                          onChange={(e) => toggleMutation.mutate({ itemId: item.id, done: e.target.checked })} />
                        <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text3)' : 'var(--text)' }}>{item.label}</span>
                        {item.required ? <span className="badge badge-red" style={{ fontSize: 7 }}>ZORUNLU</span> : null}
                      </label>
                    ))}
                    {list.kind === 'offboarding' && list.status !== 'open' && (
                      <a className="btn btn-ghost btn-sm" href={`/api/hr/checklists/${list.id}/ibra/pdf`} target="_blank" rel="noreferrer" style={{ marginTop: 6, fontSize: 9 }}>İbra PDF →</a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <Empty label="İşe giriş/çıkış süreci yok." />}
      </DossierSection>
    </div>
  )
}
