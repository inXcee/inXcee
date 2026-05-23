import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid, SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const REVIEW_FIELDS = [
  ['productivity', '⚡ Verimlilik'], ['teamwork', '🤝 Takım'], ['attendance', '📅 Devamlılık'],
  ['attitude', '😊 Tutum'], ['skills', '🎯 Yetkinlik'], ['initiative', '💡 İnisiyatif'],
  ['reliability', '🛡 Güvenilirlik'], ['communication', '💬 İletişim'],
]

const TABS = [
  { key: 'reviews', label: '📋 DEĞERLENDİRME' },
  { key: 'goals',   label: '🎯 HEDEFLER' },
  { key: 'leaders', label: '⭐ LİDERLER' },
]

export default function PerformancePage() {
  const [tab, setTab] = useState('reviews')

  return (
    <div style={{ maxWidth: 1200 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>PERFORMANS</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          DEĞERLENDIRME · HEDEF TAKİBİ · POZİTİF PUAN (DİSİPLİN DENGELEYİCİ)
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: 9,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'goals' && <GoalsTab />}
      {tab === 'leaders' && <LeadersTab />}
    </div>
  )
}

function ReviewsTab() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(new Date().getFullYear().toString())
  const [creating, setCreating] = useState(null) // {staff_id, staff_name}
  const [staffSearch, setStaffSearch] = useState('')
  const [openId, setOpenId] = useState(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['perf-reviews', period],
    queryFn: () => api.get(`/performance/reviews?period=${period}`).then(r => r.data),
  })
  const { data: staffResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <input className="form-input" placeholder="Dönem (2026 veya 2026-Q1)" value={period}
          onChange={e => setPeriod(e.target.value)} style={{ width: 200, fontSize: 12 }} />
        <input className="form-input" placeholder="+ Yeni — personel ara…" value={staffSearch}
          onChange={e => setStaffSearch(e.target.value)} style={{ width: 240, fontSize: 12 }} />
      </div>

      {staffSearch.length >= 2 && (
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          {staffResults.map(s => (
            <button key={s.id} onClick={() => { setCreating({ staff_id: s.id, staff_name: s.full_name }); setStaffSearch('') }}
              style={{ display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 4, cursor: 'pointer', fontSize: 12 }}>
              <strong>{s.full_name}</strong> <span style={{ color: 'var(--text3)' }}>· {s.dept_name || '—'}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>📋</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14 }}>{period} İÇİN DEĞERLENDİRME YOK</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {data.map(r => {
            const color = r.total_score >= 4 ? 'var(--green)' : r.total_score >= 3 ? 'var(--amber)' : 'var(--red)'
            return (
              <div key={r.id} onClick={() => setOpenId(r.id)} style={{
                padding: 14, borderRadius: 12, cursor: 'pointer', background: 'var(--surface)',
                border: '1px solid var(--border)', borderLeft: `4px solid ${color}`,
              }}>
                <strong style={{ fontSize: 14 }}>{r.full_name}</strong>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{r.dept_name || '—'} · {r.period}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.reviewed_at?.slice(0, 10)}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 22, color }}>{r.total_score?.toFixed(1) || '—'}<span style={{ fontSize: 12, color: 'var(--text3)' }}>/5</span></span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && <ReviewForm initial={creating} period={period} onClose={() => setCreating(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['perf-reviews'] })} />}
      {openId && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['perf-reviews'] })} />}
    </div>
  )
}

function ReviewForm({ initial, period, onClose, onSaved }) {
  const [form, setForm] = useState({
    staff_id: initial.staff_id, period,
    productivity: 3, teamwork: 3, attendance: 3, attitude: 3,
    skills: 3, initiative: 3, reliability: 3, communication: 3,
    strengths: '', improvement_areas: '', manager_notes: '',
  })
  const mut = useMutation({
    mutationFn: () => api.post('/performance/reviews', form),
    onSuccess: () => { toast('Kaydedildi'); onSaved(); onClose() }, onError: toastErr,
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, padding: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>📋 PERFORMANS DEĞERLENDİRME</h2>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 14 }}>
          {initial.staff_name} · Dönem: {period}
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {REVIEW_FIELDS.map(([k, l]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 40px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>{l}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(v => (
                  <button key={v} onClick={() => setForm({ ...form, [k]: v })}
                    style={{
                      flex: 1, padding: 6, border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: form[k] === v ? 'var(--accent)' : 'var(--surface2)',
                      color: form[k] === v ? '#000' : 'var(--text3)',
                      fontFamily: 'var(--mono)', fontWeight: 700,
                    }}>{v}</button>
                ))}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>{form[k]}/5</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <textarea className="form-input" rows={2} placeholder="Güçlü yönler" value={form.strengths}
            onChange={e => setForm({ ...form, strengths: e.target.value })} style={{ fontSize: 12 }} />
          <textarea className="form-input" rows={2} placeholder="Gelişim alanları" value={form.improvement_areas}
            onChange={e => setForm({ ...form, improvement_areas: e.target.value })} style={{ fontSize: 12 }} />
          <textarea className="form-input" rows={2} placeholder="Yönetici notu" value={form.manager_notes}
            onChange={e => setForm({ ...form, manager_notes: e.target.value })} style={{ fontSize: 12 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button onClick={onClose} className="btn btn-ghost">İPTAL</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn btn-primary">KAYDET</button>
        </div>
      </div>
    </div>
  )
}

function ReviewDrawer({ id, onClose, onSaved }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['perf-review', id],
    queryFn: () => api.get(`/performance/reviews/${id}`).then(r => r.data),
  })
  const delMut = useMutation({
    mutationFn: () => api.delete(`/performance/reviews/${id}`),
    onSuccess: () => { toast('Silindi'); onSaved(); onClose() }, onError: toastErr,
  })
  if (!data) return null
  const color = data.total_score >= 4 ? 'var(--green)' : data.total_score >= 3 ? 'var(--amber)' : 'var(--red)'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{data.dept_name || '—'} · {data.period}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ textAlign: 'center', padding: 14, background: 'var(--surface2)', borderRadius: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 40, color }}>{data.total_score?.toFixed(2) || '—'}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>TOPLAM SKOR (5 üzerinden)</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          {REVIEW_FIELDS.map(([k, l]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
              <span>{l}</span>
              <strong style={{ color: data[k] >= 4 ? 'var(--green)' : data[k] >= 3 ? 'var(--amber)' : data[k] ? 'var(--red)' : 'var(--text4)' }}>
                {data[k] || '—'}/5
              </strong>
            </div>
          ))}
        </div>

        {data.strengths && (
          <div style={{ marginBottom: 10, padding: 10, background: 'rgba(34,197,94,.05)', borderRadius: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1, marginBottom: 4 }}>✓ GÜÇLÜ YÖNLER</div>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{data.strengths}</div>
          </div>
        )}
        {data.improvement_areas && (
          <div style={{ marginBottom: 10, padding: 10, background: 'rgba(245,158,11,.05)', borderRadius: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: 1, marginBottom: 4 }}>↑ GELİŞİM ALANLARI</div>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{data.improvement_areas}</div>
          </div>
        )}
        {data.manager_notes && (
          <div style={{ marginBottom: 14, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>YÖNETİCİ NOTU</div>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{data.manager_notes}</div>
          </div>
        )}

        <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Değerlendirme silinecek', confirmLabel: 'Sil' })) delMut.mutate() }}
          className="btn btn-ghost" style={{ width: '100%', color: 'var(--red)' }}>🗑 SİL</button>
      </div>
    </div>
  )
}

function GoalsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ staff_id: null, staff_name: '', title: '', description: '', target_date: '' })
  const [staffSearch, setStaffSearch] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['perf-goals', statusFilter],
    queryFn: () => api.get(`/performance/goals${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  })
  const { data: staffResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })
  const inv = () => qc.invalidateQueries({ queryKey: ['perf-goals'] })
  const addMut = useMutation({
    mutationFn: () => api.post('/performance/goals', form),
    onSuccess: () => { toast('Hedef eklendi'); setCreating(false); setForm({ staff_id: null, staff_name: '', title: '', description: '', target_date: '' }); inv() },
    onError: toastErr,
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/performance/goals/${id}`, data),
    onSuccess: inv, onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['', 'TÜMÜ'], ['open', 'AÇIK'], ['in_progress', 'DEVAM'], ['done', 'TAMAM'], ['cancelled', 'İPTAL']].map(([s, l]) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="btn btn-ghost btn-xs"
              style={{ borderRadius: 8, ...(statusFilter === s ? { background: 'var(--accent)', color: '#000' } : {}) }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ HEDEF</button>
      </div>

      {creating && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <input className="form-input" placeholder="Personel ara (en az 2 char)" value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)} style={{ fontSize: 12 }} />
              {form.staff_id && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', marginTop: 4 }}>✓ {form.staff_name}</div>}
              {!form.staff_id && staffSearch.length >= 2 && (
                <div style={{ marginTop: 4, maxHeight: 120, overflowY: 'auto' }}>
                  {staffResults.map(s => (
                    <button key={s.id} onClick={() => { setForm({ ...form, staff_id: s.id, staff_name: s.full_name }); setStaffSearch('') }}
                      style={{ display: 'block', width: '100%', padding: '4px 8px', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 2, cursor: 'pointer', fontSize: 11 }}>
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className="form-input" placeholder="Hedef başlığı *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ fontSize: 12 }} />
            <input type="date" className="form-input" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} style={{ fontSize: 12 }} />
            <textarea className="form-input" rows={2} placeholder="Açıklama" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} style={{ fontSize: 12, gridColumn: '1/-1' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setCreating(false)} className="btn btn-ghost btn-sm">İPTAL</button>
            <button onClick={() => addMut.mutate()} disabled={!form.staff_id || !form.title || addMut.isPending} className="btn btn-primary btn-sm">KAYDET</button>
          </div>
        </div>
      )}

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>🎯</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>HEDEF YOK</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {data.map(g => (
            <div key={g.id} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `4px solid ${g.status === 'done' ? 'var(--green)' : g.status === 'cancelled' ? 'var(--text4)' : g.status === 'in_progress' ? 'var(--accent)' : 'var(--amber)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{g.title}</strong>
                <select className="form-select" value={g.status} onChange={e => updateMut.mutate({ id: g.id, status: e.target.value })}
                  style={{ fontSize: 10, padding: '2px 4px', width: 'auto' }}>
                  <option value="open">Açık</option>
                  <option value="in_progress">Devam</option>
                  <option value="done">Tamam</option>
                  <option value="cancelled">İptal</option>
                </select>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{g.full_name} {g.dept_name && `· ${g.dept_name}`}</div>
              {g.description && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text3)' }}>{g.description}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <input type="range" min="0" max="100" value={g.progress} onChange={e => updateMut.mutate({ id: g.id, progress: +e.target.value })}
                  style={{ flex: 1, marginRight: 8 }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>%{g.progress}</span>
              </div>
              {g.target_date && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 6 }}>📅 {g.target_date}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeadersTab() {
  const nav = useNavigate()
  const [days, setDays] = useState(90)
  const { data = [], isLoading } = useQuery({
    queryKey: ['perf-leaders', days],
    queryFn: () => api.get(`/performance/leaderboard?days=${days}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>SON</span>
        {[30, 90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)} className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, ...(days === d ? { background: 'var(--accent)', color: '#000' } : {}) }}>{d}G</button>
        ))}
      </div>

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>⭐</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>HENÜZ POZİTİF PUAN YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', width: 40 }}>#</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEP</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>POZİTİF</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ADET</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={r.id} onClick={() => nav(`/personnel/${r.id}`)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--display)', fontSize: 16, color: i < 3 ? 'var(--amber)' : 'var(--text3)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td style={{ padding: 10 }}><strong>{r.full_name}</strong></td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--display)', fontSize: 18, color: 'var(--green)' }}>+{r.positive_points}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.positive_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
