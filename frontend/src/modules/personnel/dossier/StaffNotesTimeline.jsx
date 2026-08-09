import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { DossierSection, DossierMetric, formatDossierDate } from './StaffDossierShared.jsx'

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)

const CATEGORIES = [
  ['general', 'Genel'], ['document', 'Belge'], ['attendance', 'Devam'],
  ['performance', 'Performans'], ['safety', 'İSG'], ['equipment', 'Zimmet'],
  ['onboarding', 'İşe giriş'], ['offboarding', 'İşten çıkış'], ['transport', 'Servis'], ['dormitory', 'Yatakhane'],
]
const PRIORITY_TONE = {
  low: { label: 'Düşük', color: 'var(--text3)' },
  medium: { label: 'Orta', color: 'var(--blue)' },
  high: { label: 'Yüksek', color: 'var(--accent)' },
  critical: { label: 'Kritik', color: 'var(--red)' },
}

/* ─── Notlar + Görevler ─────────────────────────────── */
function useNotes(staffId) {
  return useQuery({ queryKey: ['staff-notes', String(staffId)], queryFn: () => api.get(`/personnel/${staffId}/notes`).then(r => r.data), enabled: !!staffId, staleTime: 30000 })
}
function useFollowups(staffId) {
  return useQuery({ queryKey: ['staff-followups', String(staffId)], queryFn: () => api.get(`/personnel/${staffId}/followups`).then(r => r.data), enabled: !!staffId, staleTime: 30000 })
}

function NotesCard({ staffId, canManage, canSensitive }) {
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useNotes(staffId)
  const [form, setForm] = useState({ note: '', category: 'general', visibility: 'operational', pinned: false })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-notes', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }
  const add = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/notes`, form),
    onSuccess: () => { invalidate(); toast('Not eklendi'); setForm({ note: '', category: 'general', visibility: 'operational', pinned: false }) },
    onError: (e) => toast(e.response?.data?.error || 'Eklenemedi', 'error'),
  })
  const pin = async (id) => { try { await api.patch(`/personnel/notes/${id}/pin`); invalidate() } catch (e) { toast(e.response?.data?.error || 'Hata', 'error') } }
  const archive = async (id) => {
    const ok = await confirmDialog({ title: 'Notu arşivle', message: 'Bu not arşivlensin mi?', confirmText: 'Arşivle' })
    if (!ok) return
    try { await api.post(`/personnel/notes/${id}/archive`); invalidate(); toast('Not arşivlendi') } catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }
  return (
    <DossierSection title="YÖNETİCİ NOTLARI" subtitle={isLoading ? 'Yükleniyor…' : `${notes.length} not`}>
      {canManage && (
        <form onSubmit={(e) => { e.preventDefault(); if (form.note.trim()) add.mutate() }} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <textarea className="input" rows={2} placeholder="Not ekle…" value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: 130 }}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm(f => ({ ...f, pinned: e.target.checked }))} /> Sabitle
            </label>
            {canSensitive && (
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
                <input type="checkbox" checked={form.visibility === 'sensitive'} onChange={(e) => setForm(f => ({ ...f, visibility: e.target.checked ? 'sensitive' : 'operational' }))} /> Hassas
              </label>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={add.isPending || !form.note.trim()}>+ Not</button>
          </div>
        </form>
      )}
      {isLoading ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div> : notes.length ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {notes.map(note => (
            <div key={note.id} style={{ padding: '8px 10px', borderRadius: 8, background: note.pinned ? 'rgba(59,140,240,.07)' : 'var(--surface2)', borderLeft: `3px solid ${note.pinned ? 'var(--blue)' : 'var(--border)'}` }}>
              <div style={{ fontSize: 11 }}>{note.note}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>
                  {note.author_name} · {note.category}{note.visibility === 'sensitive' ? ' · HASSAS' : ''} · {formatDossierDate(note.created_at)}
                </span>
                {canManage && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => pin(note.id)} title="Sabitle">{note.pinned ? '📌' : '📍'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => archive(note.id)} title="Arşivle">🗄</button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Kayıtlı not yok.</div>}
    </DossierSection>
  )
}

function FollowupsCard({ staffId, canManage, users, prefill, onPrefillConsumed }) {
  const qc = useQueryClient()
  const { data, isLoading } = useFollowups(staffId)
  const [form, setForm] = useState({ title: '', priority: 'medium', category: 'general', assigned_user_id: '', due_at: '' })
  useEffect(() => {
    if (!prefill?.title) return
    setForm(current => ({ ...current, title: prefill.title, priority: prefill.priority || 'medium', category: prefill.category || 'general' }))
  }, [prefill?.category, prefill?.priority, prefill?.title])
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-followups', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }
  const add = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/followups`, { ...form, assigned_user_id: form.assigned_user_id || null, due_at: form.due_at || null }),
    onSuccess: () => { invalidate(); toast('Görev eklendi'); setForm({ title: '', priority: 'medium', category: 'general', assigned_user_id: '', due_at: '' }); onPrefillConsumed?.() },
    onError: (e) => toast(e.response?.data?.error || 'Eklenemedi', 'error'),
  })
  const act = async (id, action, label) => {
    try { await api.post(`/personnel/followups/${id}/${action}`); invalidate(); toast(label) }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }
  const followups = data?.followups || []
  return (
    <DossierSection title="GÖREVLER VE HATIRLATMALAR"
      subtitle={isLoading ? 'Yükleniyor…' : `${data?.summary?.open || 0} açık · ${data?.summary?.overdue || 0} gecikmiş`}>
      {canManage && (
        <form onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) add.mutate() }} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <input className="input" placeholder="Görev başlığı" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <select className="input" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} style={{ width: 100 }}>
              {Object.entries(PRIORITY_TONE).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: 120 }}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="input" value={form.assigned_user_id} onChange={(e) => setForm(f => ({ ...f, assigned_user_id: e.target.value }))} style={{ width: 140 }}>
              <option value="">Atanan yok</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
            <input type="date" className="input" value={form.due_at} onChange={(e) => setForm(f => ({ ...f, due_at: e.target.value }))} style={{ width: 140 }} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={add.isPending || !form.title.trim()}>+ Görev</button>
          </div>
        </form>
      )}
      {isLoading ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div> : followups.length ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {followups.map(f => {
            const tone = PRIORITY_TONE[f.priority] || PRIORITY_TONE.medium
            return (
              <div key={f.id} style={{
                padding: '9px 10px', borderRadius: 8, background: 'var(--surface2)',
                borderLeft: `3px solid ${f.is_overdue ? 'var(--red)' : tone.color}`,
                opacity: f.status === 'open' ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textDecoration: f.status !== 'open' ? 'line-through' : 'none' }}>{f.title}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: tone.color }}>{tone.label}{f.is_overdue ? ' · GECİKTİ' : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>
                    {f.category}{f.assigned_user_name ? ` · ${f.assigned_user_name}` : ''}{f.due_at ? ` · son ${String(f.due_at).slice(0, 10)}` : ''}
                    {f.status !== 'open' ? ` · ${f.status}` : ''}
                  </span>
                  {canManage && f.status === 'open' && (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => act(f.id, 'complete', 'Görev tamamlandı')}>✓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => act(f.id, 'cancel', 'Görev iptal edildi')}>✕</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Açık görev yok.</div>}
    </DossierSection>
  )
}

export function StaffNotesPanel({ staffId, access }) {
  const [params, setParams] = useSearchParams()
  const canManage = access?.can_manage_followups
  const canSensitive = access?.can_view_sensitive_fields
  const prefill = params.get('new_followup') === '1' ? {
    title: params.get('followup_title') || '', priority: params.get('followup_priority') || 'medium', category: params.get('followup_category') || 'general',
  } : null
  const consumePrefill = () => setParams(previous => {
    const next = new URLSearchParams(previous)
    ;['new_followup', 'followup_title', 'followup_priority', 'followup_category'].forEach(key => next.delete(key))
    return next
  }, { replace: true })
  // Görev ataması için kullanıcı listesi (yalnız yönetici görebilir; hata sessiz)
  const { data: users } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => api.get('/users').then(r => r.data).catch(() => []),
    enabled: !!canManage, staleTime: 300000,
  })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
      <NotesCard staffId={staffId} canManage={canManage} canSensitive={canSensitive} />
      <FollowupsCard staffId={staffId} canManage={canManage} users={Array.isArray(users) ? users : users?.users} prefill={prefill} onPrefillConsumed={consumePrefill} />
    </div>
  )
}

/* ─── Zaman Çizelgesi ─────────────────────────────── */
const TIMELINE_LABELS = {
  shift: 'Vardiya', leave: 'İzin', overtime: 'Mesai', attendance: 'Devam', document: 'Belge',
  performance: 'Performans', goal: 'Hedef', training: 'Eğitim', safety: 'İSG', equipment: 'Zimmet',
  checklist: 'Checklist', transport: 'Servis', discipline: 'Disiplin', note: 'Not', followup: 'Görev',
}

export function StaffTimelinePanel({ staffId }) {
  const [types, setTypes] = useState([])
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['staff-timeline', String(staffId), types.join(','), page],
    queryFn: () => api.get(`/personnel/${staffId}/dossier/timeline`, {
      params: { types: types.join(',') || undefined, page, limit: 30 },
    }).then(r => r.data),
    enabled: !!staffId, keepPreviousData: true, staleTime: 30000,
  })
  const data = query.data
  const items = data?.items || []
  const toggleType = (kind) => { setPage(1); setTypes(prev => prev.includes(kind) ? prev.filter(t => t !== kind) : [...prev, kind]) }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <DossierSection title="ZAMAN ÇİZELGESİ" subtitle={query.isLoading ? 'Yükleniyor…' : `${data?.total || 0} olay`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          <button className={`btn btn-sm ${types.length === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTypes([]); setPage(1) }}>Tümü</button>
          {Object.entries(TIMELINE_LABELS).map(([kind, label]) => (
            <button key={kind} className={`btn btn-sm ${types.includes(kind) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleType(kind)} style={{ fontSize: 9 }}>{label}</button>
          ))}
        </div>
        {query.isLoading ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div> : items.length ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {items.map(item => {
              const color = item.severity === 'critical' ? 'var(--red)' : item.severity === 'warning' ? 'var(--accent)' : 'var(--blue)'
              const content = (
                <div style={{ display: 'grid', gridTemplateColumns: '90px 70px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '7px 8px', borderRadius: 7, background: 'var(--surface2)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{String(item.date).slice(0, 10)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color }}>{TIMELINE_LABELS[item.kind] || item.kind}</span>
                  <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </div>
              )
              return item.route
                ? <a key={item.id} href={item.route} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</a>
                : <div key={item.id}>{content}</div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Bu filtrede olay bulunmuyor.</div>}
        {data && data.total_pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Önceki</button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', alignSelf: 'center' }}>{page} / {data.total_pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}>Sonraki →</button>
          </div>
        )}
      </DossierSection>
    </div>
  )
}
