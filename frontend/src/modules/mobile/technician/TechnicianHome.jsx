import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
const PRIORITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }

const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress', 'review'])

export default function TechnicianHome() {
  const [tab, setTab] = useState('active')
  const navigate = useNavigate()

  const { data: allRequests = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-tech-requests'],
    queryFn: () => mobileApi.get('/maintenance/requests').then(r => r.data),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  const active = allRequests.filter(r => ACTIVE_STATUSES.has(r.status))
  const assigned = allRequests.filter(r => ACTIVE_STATUSES.has(r.status) && r.technician_name)
  const done = allRequests.filter(r => r.status === 'done')

  const displayed = tab === 'active' ? active : tab === 'assigned' ? assigned : done

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && (
        <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>
      )}
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Teknik Talepler</h1>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <TabBtn label={`Tüm Aktif (${active.length})`} active={tab === 'active'} color="#3b82f6" onClick={() => setTab('active')} />
        <TabBtn label={`Atanmış (${assigned.length})`} active={tab === 'assigned'} color="#6366f1" onClick={() => setTab('assigned')} />
        <TabBtn label={`Bitti (${done.length})`} active={tab === 'done'} color="#10b981" onClick={() => setTab('done')} />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ height: '14px', background: '#e5e7eb', borderRadius: '4px', width: '55%' }} />
                <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '4px', width: '15%' }} />
              </div>
              <div style={{ height: '11px', background: '#f3f4f6', borderRadius: '4px', width: '80%', marginBottom: '10px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '4px', width: '30%' }} />
                <div style={{ height: '18px', background: '#e5e7eb', borderRadius: '6px', width: '20%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
          {tab === 'done' ? 'Tamamlanan talep yok' : 'Aktif talep yok 🎉'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayed.map(r => (
            <div key={r.id} onClick={() => navigate(`request/${r.id}`)}
              style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', flex: 1, marginRight: '8px' }}>{r.location}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: PRIORITY_COLOR[r.priority], flexShrink: 0 }}>
                  {PRIORITY_LABEL[r.priority]}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px', lineHeight: 1.4 }}>
                {r.description.length > 80 ? r.description.slice(0, 80) + '...' : r.description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>#{r.id} · {r.opened_at?.slice(0, 10)}</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {r.technician_name && (
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#dbeafe', color: '#1d4ed8' }}>
                      {r.technician_name}
                    </span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_MAP = {
  open: { label: 'Açık', bg: '#dbeafe', color: '#1d4ed8' },
  assigned: { label: 'Atandı', bg: '#e0e7ff', color: '#4338ca' },
  in_progress: { label: 'Devam', bg: '#fef3c7', color: '#92400e' },
  review: { label: 'İnceleme', bg: '#f3e8ff', color: '#6b21a8' },
  done: { label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d' },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function TabBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, padding: '9px 6px', borderRadius: '10px', border: `2px solid ${active ? color : '#e5e7eb'}`, background: active ? color + '15' : '#fff', color: active ? color : '#9ca3af', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
      {label}
    </button>
  )
}
