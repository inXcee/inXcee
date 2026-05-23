import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export default function ArchivedPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [q, setQ] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['personnel-archived', q],
    queryFn: () => api.get(`/personnel/archived${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.data),
  })

  const restoreMut = useMutation({
    mutationFn: (id) => api.post(`/personnel/${id}/restore`),
    onSuccess: () => { toast('Geri alındı'); qc.invalidateQueries({ queryKey: ['personnel-archived'] }) },
    onError: toastErr,
  })

  return (
    <div style={{ maxWidth: 1200 }} className="fade-up">
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>ARŞİV</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
            AYRILMIŞ PERSONEL — geri alabilir veya KVKK silebilirsin
          </p>
        </div>
        <input className="form-input" placeholder="🔍 Ad ile ara…" value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 240, fontSize: 12, borderRadius: 10 }} />
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : !data.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 10 }}>🗄</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>ARŞİVDE PERSONEL YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TC</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ARŞİV TARİHİ</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>SEBEP</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 10 }}>
                    <strong>{r.full_name}</strong>
                    {r.phone && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{r.phone}</div>}
                  </td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.tc_no || '—'}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.archived_at ? new Date(r.archived_at).toLocaleDateString('tr-TR') : '—'}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.archive_reason || '—'}</td>
                  <td style={{ padding: 10, display: 'flex', gap: 4 }}>
                    <button onClick={() => nav(`/personnel/${r.id}`)} className="btn btn-ghost btn-xs">👁</button>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Geri al', body: `${r.full_name} aktif personele alınacak.`, confirmLabel: 'Geri al' })) restoreMut.mutate(r.id) }}
                      className="btn btn-primary btn-xs">↩ GERİ AL</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
