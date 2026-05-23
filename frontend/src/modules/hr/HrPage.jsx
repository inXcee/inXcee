import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { SkeletonGrid, SkeletonCard } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const TABS = [
  { key: 'onboarding', label: '➕ İŞE GİRİŞ', kind: 'onboarding' },
  { key: 'offboarding', label: '➖ AYRILMA', kind: 'offboarding' },
  { key: 'expiring', label: '⏰ SÖZLEŞME BİTİYOR' },
]

export default function HrPage() {
  const [tab, setTab] = useUrlParamState('tab', 'onboarding')
  const [statusFilter, setStatusFilter] = useState('open')
  const [openId, setOpenId] = useState(null)

  return (
    <div style={{ maxWidth: 1280 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>İK / HR AKIŞLARI</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          İŞE GİRİŞ CHECKLIST · AYRILMA + İBRA PDF · SÖZLEŞME UYARILARI
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

      {tab !== 'expiring' && (
        <ChecklistsTab kind={TABS.find(t => t.key === tab).kind} statusFilter={statusFilter} setStatusFilter={setStatusFilter} setOpenId={setOpenId} />
      )}
      {tab === 'expiring' && <ExpiringTab />}

      {openId && <ChecklistDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function ChecklistsTab({ kind, statusFilter, setStatusFilter, setOpenId }) {
  const qc = useQueryClient()
  const [staffPicker, setStaffPicker] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['hr-checklists', kind, statusFilter],
    queryFn: () => api.get(`/hr/checklists?kind=${kind}${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => r.data),
  })

  const startMut = useMutation({
    mutationFn: (staffId) => api.post('/hr/checklists', { staff_id: staffId, kind }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['hr-checklists'] })
      setStaffPicker(false); setSearch('')
      setOpenId(r.data.id)
      toast('Checklist başlatıldı')
    },
    onError: toastErr,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['staff-search', debouncedSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(debouncedSearch)}`).then(r => r.data),
    enabled: debouncedSearch.length >= 2,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['', 'TÜMÜ'], ['open', 'AÇIK'], ['completed', 'TAMAM'], ['cancelled', 'İPTAL']].map(([s, l]) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="btn btn-ghost btn-xs"
              style={{ borderRadius: 8, ...(statusFilter === s ? { background: 'var(--accent)', color: '#000' } : {}) }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setStaffPicker(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>
          + YENİ {kind === 'onboarding' ? 'İŞE GİRİŞ' : 'AYRILMA'} BAŞLAT
        </button>
      </div>

      {staffPicker && (
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <input className="form-input" autoFocus placeholder="Personel ara (en az 2 karakter)" value={search}
            onChange={e => setSearch(e.target.value)} style={{ fontSize: 12, marginBottom: 8 }} />
          {search.length >= 2 && searchResults.length === 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)' }}>Sonuç yok</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
            {searchResults.map(s => (
              <button key={s.id} onClick={() => startMut.mutate(s.id)} disabled={startMut.isPending}
                style={{ padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{s.dept_name || '—'} · {s.tc_no || '—'}</div>
              </button>
            ))}
          </div>
          <button onClick={() => { setStaffPicker(false); setSearch('') }} className="btn btn-ghost btn-xs" style={{ marginTop: 8 }}>İPTAL</button>
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : !items.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>{kind === 'onboarding' ? '➕' : '➖'}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>HENÜZ KAYIT YOK</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {items.map(c => {
            const pct = c.total_count > 0 ? Math.round((c.completed_count / c.total_count) * 100) : 0
            const isDone = c.status === 'completed'
            const isCancel = c.status === 'cancelled'
            return (
              <div key={c.id} onClick={() => setOpenId(c.id)}
                style={{ padding: 14, borderRadius: 12, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${isDone ? 'var(--green)' : isCancel ? 'var(--text4)' : 'var(--accent)'}`, transition: 'transform .15s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{c.staff_name}</strong>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4, background: isDone ? 'rgba(34,197,94,.15)' : isCancel ? 'var(--surface3)' : 'rgba(59,130,246,.15)', color: isDone ? 'var(--green)' : isCancel ? 'var(--text3)' : 'var(--accent)', letterSpacing: 1 }}>
                    {c.status === 'completed' ? '✓ TAMAM' : c.status === 'cancelled' ? '✕ İPTAL' : 'AÇIK'}
                  </span>
                </div>
                {c.dept_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{c.dept_name}</div>}
                <div style={{ marginTop: 10, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--accent)', transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                  <span>{c.completed_count}/{c.total_count} adım</span>
                  <span>{c.started_at?.slice(0, 10)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChecklistDrawer({ id, onClose }) {
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['hr-checklist', id],
    queryFn: () => api.get(`/hr/checklists/${id}`).then(r => r.data),
  })
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['hr-checklist', id] })
    qc.invalidateQueries({ queryKey: ['hr-checklists'] })
  }
  const toggleMut = useMutation({
    mutationFn: ({ itemId, done }) => api.patch(`/hr/items/${itemId}/toggle`, { done }),
    onSuccess: inv, onError: toastErr,
  })
  const addMut = useMutation({
    mutationFn: () => api.post(`/hr/checklists/${id}/items`, { label: newItem }),
    onSuccess: () => { setNewItem(''); inv() }, onError: toastErr,
  })
  const delItemMut = useMutation({
    mutationFn: (itemId) => api.delete(`/hr/items/${itemId}`),
    onSuccess: inv, onError: toastErr,
  })
  const completeMut = useMutation({
    mutationFn: () => api.post(`/hr/checklists/${id}/complete`),
    onSuccess: () => { toast('Tamamlandı'); inv() }, onError: toastErr,
  })
  const cancelMut = useMutation({
    mutationFn: () => api.post(`/hr/checklists/${id}/cancel`),
    onSuccess: () => { toast('İptal edildi'); inv() }, onError: toastErr,
  })

  async function downloadIbra() {
    try {
      const res = await api.get(`/hr/checklists/${id}/ibra/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `ibra-${data?.staff_name?.replace(/\s+/g, '_') || id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toastErr(e) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, height: '100%', overflowY: 'auto',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
      }}>
        {isLoading || !data ? (
          <SkeletonCard lines={6} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.kind === 'onboarding' ? '➕ İŞE GİRİŞ' : '➖ AYRILMA'}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  {data.staff_name} {data.dept_name && `· ${data.dept_name}`} {data.tc_no && `· TC: ${data.tc_no}`}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                {data.completed_count}/{data.total_count} tamamlandı (%{Math.round(data.completed_count / Math.max(data.total_count, 1) * 100)})
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: data.status === 'completed' ? 'var(--green)' : data.status === 'cancelled' ? 'var(--text4)' : 'var(--accent)' }}>
                {data.status === 'completed' ? '✓ TAMAMLANDI' : data.status === 'cancelled' ? '✕ İPTAL' : 'AÇIK'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {data.items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: item.done ? 'rgba(34,197,94,.08)' : 'var(--surface2)', borderRadius: 8 }}>
                  <input type="checkbox" checked={item.done === 1} disabled={data.status !== 'open'}
                    onChange={e => toggleMut.mutate({ itemId: item.id, done: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <span style={{ flex: 1, fontSize: 13, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text3)' : 'var(--text)' }}>
                    {item.label}
                  </span>
                  {item.done_at && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
                      {new Date(item.done_at).toLocaleDateString('tr-TR')}
                    </span>
                  )}
                  {data.status === 'open' && (
                    <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Adım silinecek', confirmLabel: 'Sil' })) delItemMut.mutate(item.id) }}
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {data.status === 'open' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <input className="form-input" placeholder="Yeni adım ekle…" value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) addMut.mutate() }}
                    style={{ fontSize: 12 }} />
                  <button onClick={() => addMut.mutate()} disabled={!newItem.trim() || addMut.isPending}
                    className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>+ EKLE</button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={async () => { if (await confirmDialog({ title: 'Tamamla', body: 'Checklist kapatılacak.', confirmLabel: 'Tamamla' })) completeMut.mutate() }}
                    className="btn btn-primary" style={{ flex: 1, borderRadius: 10 }}>✓ TAMAMLA</button>
                  <button onClick={async () => { if (await confirmDialog({ title: 'İptal', body: 'Checklist iptal edilecek.', confirmLabel: 'İptal et' })) cancelMut.mutate() }}
                    className="btn btn-ghost">✕ İPTAL ET</button>
                </div>
              </>
            )}

            {data.kind === 'offboarding' && (data.status === 'completed' || data.completed_count > 0) && (
              <button onClick={downloadIbra} className="btn btn-ghost" style={{ width: '100%', marginTop: 10, borderRadius: 10 }}>
                📄 İBRA BELGESİ PDF İNDİR
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ExpiringTab() {
  const nav = useNavigate()
  const [days, setDays] = useState(30)
  const { data = [], isLoading } = useQuery({
    queryKey: ['hr-expiring', days],
    queryFn: () => api.get(`/hr/expiring-contracts?days=${days}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>SONRAKİ</span>
        {[15, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, ...(days === d ? { background: 'var(--accent)', color: '#000' } : {}) }}>{d} GÜN</button>
        ))}
      </div>
      {isLoading ? (
        <SkeletonGrid count={4} />
      ) : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>SÖZLEŞMESİ BİTECEK PERSONEL YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TELEFON</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>BİTİŞ TARİHİ</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const daysLeft = Math.ceil((new Date(r.contract_end) - new Date()) / 86400000)
                return (
                  <tr key={r.id} onClick={() => nav(`/personnel/${r.id}`)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: 10 }}>
                      <strong>{r.full_name}</strong>
                      {r.tc_no && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{r.tc_no}</div>}
                    </td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.phone || '—'}</td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: daysLeft <= 7 ? 'var(--red)' : 'var(--amber)' }}>
                      {r.contract_end} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({daysLeft}g)</span>
                    </td>
                    <td style={{ padding: 10 }}>👁</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
