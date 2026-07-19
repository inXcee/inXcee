import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { DossierMetric, DossierSection, formatDossierDate } from './StaffDossierShared.jsx'

const REVIEW_FIELDS = [
  ['productivity', 'Üretkenlik'],
  ['teamwork', 'Takım çalışması'],
  ['attendance', 'Devam'],
  ['attitude', 'Tutum'],
  ['skills', 'Mesleki beceri'],
  ['initiative', 'İnisiyatif'],
  ['reliability', 'Güvenilirlik'],
  ['communication', 'İletişim'],
]

const GOAL_STATUS = {
  pending: { label: 'Bekliyor', badge: 'badge-amber' },
  in_progress: { label: 'Devam ediyor', badge: 'badge-blue' },
  done: { label: 'Tamamlandı', badge: 'badge-green' },
  cancelled: { label: 'İptal', badge: 'badge-gray' },
}

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)
const asArray = value => Array.isArray(value) ? value : []

function useStaffResource(key, staffId, url) {
  return useQuery({
    queryKey: [key, String(staffId)],
    queryFn: () => api.get(url).then(response => response.data),
    enabled: !!staffId,
    staleTime: 30000,
  })
}

function Empty({ children }) {
  return <div style={{ color: 'var(--text3)', fontSize: 11 }}>{children}</div>
}

function Loading() {
  return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div>
}

function ErrorNote({ error }) {
  return (
    <div style={{ color: 'var(--red)', fontSize: 11, padding: '8px 10px', borderRadius: 8, background: 'rgba(231,76,60,.07)', border: '1px solid rgba(231,76,60,.2)' }}>
      Kayıtlar yüklenemedi: {error?.response?.data?.error || error?.message || 'bağlantı hatası'}
    </div>
  )
}

function GoalCard({ goal, canManage, isPending, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})

  useEffect(() => {
    setDraft({
      title: goal.title || '',
      description: goal.description || '',
      target_date: goal.target_date || '',
      status: goal.status || 'pending',
      progress: Number(goal.progress || 0),
    })
  }, [goal])

  const status = GOAL_STATUS[goal.status] || GOAL_STATUS.pending
  const today = new Date().toISOString().slice(0, 10)
  const overdue = goal.target_date && goal.target_date < today && !['done', 'cancelled'].includes(goal.status)

  return (
    <div style={{ padding: '10px 11px', borderRadius: 9, background: 'var(--surface2)', border: `1px solid ${overdue ? 'rgba(231,76,60,.35)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{goal.title}</div>
          {goal.description && <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 3 }}>{goal.description}</div>}
        </div>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>
      <div style={{ height: 7, borderRadius: 5, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Number(goal.progress || 0))}%`, background: goal.progress >= 100 ? 'var(--green)' : 'var(--blue)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, color: overdue ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>
        <span>%{goal.progress || 0} tamamlandı</span>
        <span>{goal.target_date ? `${overdue ? 'Gecikti · ' : ''}${formatDossierDate(goal.target_date)}` : 'Hedef tarihi yok'}</span>
      </div>

      {canManage && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(value => !value)}>
            {editing ? 'Düzenlemeyi kapat' : 'Hedefi düzenle'}
          </button>
          {editing && (
            <div style={{ display: 'grid', gap: 8, marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
              <input className="input" aria-label="Hedef başlığı" value={draft.title || ''} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
              <textarea className="input" aria-label="Hedef açıklaması" rows={2} value={draft.description || ''} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <input className="input" aria-label="Hedef tarihi" type="date" value={draft.target_date || ''} onChange={event => setDraft(current => ({ ...current, target_date: event.target.value }))} />
                <select className="input" aria-label="Hedef durumu" value={draft.status || 'pending'} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}>
                  {Object.entries(GOAL_STATUS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input aria-label="Hedef ilerlemesi" type="range" min="0" max="100" step="5" value={draft.progress || 0}
                  onChange={event => setDraft(current => ({ ...current, progress: Number(event.target.value) }))} style={{ flex: 1 }} />
                <span style={{ width: 38, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9 }}>%{draft.progress || 0}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={isPending || !draft.title?.trim()}
                  onClick={() => onSave(goal.id, { ...draft, status: draft.progress >= 100 ? 'done' : draft.status })}>Değişiklikleri kaydet</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={isPending} onClick={() => onDelete(goal)}>Sil</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function StaffPerformancePanel({ staffId, canManage }) {
  const queryClient = useQueryClient()
  const reviews = useStaffResource('staff-perf-reviews', staffId, `/performance/reviews?staff_id=${staffId}`)
  const goals = useStaffResource('staff-perf-goals', staffId, `/performance/goals?staff_id=${staffId}`)
  const positive = useStaffResource('staff-perf-positive', staffId, `/performance/positive/${staffId}`)

  const reviewRows = asArray(reviews.data)
  const goalRows = asArray(goals.data)
  const positiveRows = Array.isArray(positive.data) ? positive.data : asArray(positive.data?.items)
  const positiveTotal = Number(positive.data?.total ?? positiveRows.reduce((sum, point) => sum + Number(point.points || 0), 0))
  const averageScore = reviewRows.length
    ? (reviewRows.reduce((sum, review) => sum + Number(review.total_score || 0), 0) / reviewRows.length).toFixed(1)
    : '—'
  const activeGoals = goalRows.filter(goal => !['done', 'cancelled'].includes(goal.status)).length
  const completedGoals = goalRows.filter(goal => goal.status === 'done').length

  const invalidatePerformance = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-perf-reviews', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['staff-perf-goals', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['staff-perf-positive', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }

  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState(() => ({
    period: String(new Date().getFullYear()),
    ...Object.fromEntries(REVIEW_FIELDS.map(([key]) => [key, 3])),
    strengths: '', improvement_areas: '', manager_notes: '',
  }))
  const reviewMutation = useMutation({
    mutationFn: () => api.post('/performance/reviews', { staff_id: Number(staffId), ...reviewForm }),
    onSuccess: () => { invalidatePerformance(); setShowReviewForm(false); toast('Değerlendirme kaydedildi') },
    onError: error => toast(error.response?.data?.error || 'Değerlendirme kaydedilemedi', 'error'),
  })

  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ title: '', description: '', target_date: '' })
  const goalCreateMutation = useMutation({
    mutationFn: () => api.post('/performance/goals', { staff_id: Number(staffId), ...goalForm }),
    onSuccess: () => {
      invalidatePerformance()
      setGoalForm({ title: '', description: '', target_date: '' })
      setShowGoalForm(false)
      toast('Yeni hedef oluşturuldu')
    },
    onError: error => toast(error.response?.data?.error || 'Hedef oluşturulamadı', 'error'),
  })
  const goalUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/performance/goals/${id}`, data),
    onSuccess: () => { invalidatePerformance(); toast('Hedef güncellendi') },
    onError: error => toast(error.response?.data?.error || 'Hedef güncellenemedi', 'error'),
  })
  const goalDeleteMutation = useMutation({
    mutationFn: id => api.delete(`/performance/goals/${id}`),
    onSuccess: () => { invalidatePerformance(); toast('Hedef silindi') },
    onError: error => toast(error.response?.data?.error || 'Hedef silinemedi', 'error'),
  })

  const [pointForm, setPointForm] = useState({ reason: '', points: 1 })
  const pointMutation = useMutation({
    mutationFn: () => api.post('/performance/positive', { staff_id: Number(staffId), reason: pointForm.reason, points: pointForm.points }),
    onSuccess: () => { invalidatePerformance(); setPointForm({ reason: '', points: 1 }); toast('Pozitif puan eklendi') },
    onError: error => toast(error.response?.data?.error || 'Pozitif puan eklenemedi', 'error'),
  })

  const deleteGoal = async goal => {
    const ok = await confirmDialog({ title: 'Hedefi sil', message: `“${goal.title}” hedefi kalıcı olarak silinsin mi?`, confirmText: 'Sil' })
    if (ok) goalDeleteMutation.mutate(goal.id)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 8 }}>
        <DossierMetric label="ORTALAMA PUAN" value={averageScore} detail={`${reviewRows.length} değerlendirme`} color="var(--accent)" />
        <DossierMetric label="AKTİF HEDEF" value={activeGoals} color={activeGoals ? 'var(--blue)' : 'var(--text3)'} />
        <DossierMetric label="TAMAMLANAN" value={completedGoals} color="var(--green)" />
        <DossierMetric label="POZİTİF PUAN" value={positiveTotal} color="var(--green)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <DossierSection title="DEĞERLENDİRME GEÇMİŞİ" subtitle={reviews.isLoading ? 'Yükleniyor…' : `${reviewRows.length} değerlendirme`}
          action={canManage && <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowReviewForm(value => !value)}>{showReviewForm ? 'Kapat' : '+ Değerlendirme'}</button>}>
          {showReviewForm && (
            <form onSubmit={event => { event.preventDefault(); reviewMutation.mutate() }} style={{ display: 'grid', gap: 9, marginBottom: 12, padding: 11, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div>
                <label className="form-label">Dönem</label>
                <input className="input" aria-label="Değerlendirme dönemi" value={reviewForm.period} placeholder="2026 veya 2026-Q3" onChange={event => setReviewForm(current => ({ ...current, period: event.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                {REVIEW_FIELDS.map(([key, label]) => (
                  <label key={key} style={{ color: 'var(--text3)', fontSize: 9 }}>{label}
                    <select className="input" aria-label={label} value={reviewForm[key]} onChange={event => setReviewForm(current => ({ ...current, [key]: Number(event.target.value) }))} style={{ marginTop: 3 }}>
                      {[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score} / 5</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <textarea className="input" aria-label="Güçlü yönler" placeholder="Güçlü yönler" rows={2} value={reviewForm.strengths} onChange={event => setReviewForm(current => ({ ...current, strengths: event.target.value }))} />
              <textarea className="input" aria-label="Gelişim alanları" placeholder="Gelişim alanları" rows={2} value={reviewForm.improvement_areas} onChange={event => setReviewForm(current => ({ ...current, improvement_areas: event.target.value }))} />
              <textarea className="input" aria-label="Yönetici notu" placeholder="Yönetici notu" rows={2} value={reviewForm.manager_notes} onChange={event => setReviewForm(current => ({ ...current, manager_notes: event.target.value }))} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={reviewMutation.isPending || !/^\d{4}(-Q[1-4])?$/.test(reviewForm.period)}>{reviewMutation.isPending ? 'Kaydediliyor…' : 'Değerlendirmeyi kaydet'}</button>
            </form>
          )}
          {reviews.isLoading ? <Loading /> : reviews.isError ? <ErrorNote error={reviews.error} /> : reviewRows.length ? (
            <div style={{ display: 'grid', gap: 7 }}>
              {reviewRows.slice(0, 8).map(review => (
                <div key={review.id} style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: '3px solid var(--blue)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                    <span>{review.period}</span><span style={{ color: 'var(--accent)' }}>Puan: {review.total_score ?? '—'} / 5</span>
                  </div>
                  <div style={{ color: 'var(--text4)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 4 }}>{formatDossierDate(review.reviewed_at)}</div>
                </div>
              ))}
            </div>
          ) : <Empty>Değerlendirme kaydı yok.</Empty>}
        </DossierSection>

        <DossierSection title="HEDEFLER" subtitle={goals.isLoading ? 'Yükleniyor…' : `${goalRows.length} hedef`}
          action={canManage && <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowGoalForm(value => !value)}>{showGoalForm ? 'Kapat' : '+ Yeni hedef'}</button>}>
          {showGoalForm && (
            <form onSubmit={event => { event.preventDefault(); goalCreateMutation.mutate() }} style={{ display: 'grid', gap: 8, marginBottom: 11, padding: 11, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <input className="input" aria-label="Yeni hedef başlığı" placeholder="Hedef başlığı *" value={goalForm.title} onChange={event => setGoalForm(current => ({ ...current, title: event.target.value }))} />
              <textarea className="input" aria-label="Yeni hedef açıklaması" placeholder="Açıklama / başarı ölçütü" rows={2} value={goalForm.description} onChange={event => setGoalForm(current => ({ ...current, description: event.target.value }))} />
              <input className="input" aria-label="Yeni hedef tarihi" type="date" value={goalForm.target_date} onChange={event => setGoalForm(current => ({ ...current, target_date: event.target.value }))} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={goalCreateMutation.isPending || !goalForm.title.trim()}>{goalCreateMutation.isPending ? 'Oluşturuluyor…' : 'Hedefi oluştur'}</button>
            </form>
          )}
          {goals.isLoading ? <Loading /> : goals.isError ? <ErrorNote error={goals.error} /> : goalRows.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {goalRows.slice(0, 10).map(goal => (
                <GoalCard key={goal.id} goal={goal} canManage={canManage}
                  isPending={goalUpdateMutation.isPending || goalDeleteMutation.isPending}
                  onSave={(id, data) => goalUpdateMutation.mutate({ id, data })} onDelete={deleteGoal} />
              ))}
            </div>
          ) : <Empty>Tanımlı hedef yok.</Empty>}
        </DossierSection>

        <DossierSection title="POZİTİF PUANLAR" subtitle={positive.isLoading ? 'Yükleniyor…' : `Toplam ${positiveTotal} puan · ${positiveRows.length} kayıt`}>
          {canManage && (
            <form onSubmit={event => { event.preventDefault(); if (pointForm.reason.trim()) pointMutation.mutate() }} style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
              <input className="input" aria-label="Pozitif puan gerekçesi" placeholder="Gerekçe" value={pointForm.reason} onChange={event => setPointForm(current => ({ ...current, reason: event.target.value }))} style={{ flex: 1 }} />
              <input className="input" aria-label="Pozitif puan" type="number" min="1" max="100" value={pointForm.points} onChange={event => setPointForm(current => ({ ...current, points: Number(event.target.value) }))} style={{ width: 70 }} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={pointMutation.isPending || !pointForm.reason.trim()}>+ Puan</button>
            </form>
          )}
          {positive.isLoading ? <Loading /> : positive.isError ? <ErrorNote error={positive.error} /> : positiveRows.length ? (
            <div style={{ display: 'grid', gap: 5 }}>
              {positiveRows.slice(0, 8).map(point => (
                <div key={point.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
                  <span>{point.reason}{point.created_at && <span style={{ display: 'block', color: 'var(--text4)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 2 }}>{formatDossierDate(point.created_at)}</span>}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>+{point.points}</span>
                </div>
              ))}
            </div>
          ) : <Empty>Pozitif puan kaydı yok.</Empty>}
        </DossierSection>
      </div>
    </div>
  )
}
