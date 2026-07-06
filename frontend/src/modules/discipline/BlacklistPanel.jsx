// Kara liste sekmesi: tüm kara listedeki personeli listeler ve listeden çıkarma
// işlemini yönetir. Kendi query/mutation'ını içerir (bağımsız sekme).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { fmt } from './shared.jsx'

export default function BlacklistPanel() {
  const qc = useQueryClient()
  const { data: list = [] } = useQuery({
    queryKey: ['discipline-blacklisted'],
    queryFn: () => api.get('/discipline/blacklisted').then(r => r.data),
  })

  const removeMut = useMutation({
    mutationFn: id => api.post('/discipline/blacklist/remove', { personnel_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
    },
  })

  if (list.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header"><div className="panel-title">KARA LİSTE</div></div>
        <div className="panel-body" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '30px' }}>
          Kara listede kimse yok
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">KARA LİSTE</div>
        <span className="badge badge-red">{list.length}</span>
      </div>
      <div style={{ padding: '4px 16px' }}>
        {list.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '12px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '6px',
              background: 'rgba(231,76,60,.12)', border: '1px solid rgba(231,76,60,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', flexShrink: 0,
            }}>
              ⛔
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                {p.company || '—'} · {p.job_title || '—'} · TC: {p.tc_no || '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>
                Sebep: {p.blacklist_reason}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                {fmt(p.blacklisted_at)} · {p.blacklisted_by_name || ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <span className="badge badge-red">{p.discipline_points} PUAN</span>
              <button
                onClick={async () => { if (await confirmDialog({ title: 'Kara Listeden Çıkar', body: `${p.full_name} kara listeden çıkarılsın mı?` })) removeMut.mutate(p.id) }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '9px', color: 'var(--green)' }}
              >
                ÇIKAR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
