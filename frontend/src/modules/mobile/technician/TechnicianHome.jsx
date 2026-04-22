import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
const PRIORITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }

const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress', 'review'])

export default function TechnicianHome() {
  const [showDone, setShowDone] = useState(false)
  const navigate = useNavigate()

  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ['mobile-tech-requests'],
    queryFn: () => mobileApi.get('/maintenance/requests').then(r => r.data),
    refetchInterval: 60000,
  })

  const active = allRequests.filter(r => ACTIVE_STATUSES.has(r.status))
  const done = allRequests.filter(r => r.status === 'done')
  const displayed = showDone ? done : active

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Teknik Talepler</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <TabBtn label={`Aktif (${active.length})`} active={!showDone} color="#3b82f6" onClick={() => setShowDone(false)} />
        <TabBtn label={`Tamamlanan (${done.length})`} active={showDone} color="#10b981" onClick={() => setShowDone(true)} />
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
          {showDone ? 'Tamamlanan talep yok' : 'Aktif talep yok 🎉'}
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
                <StatusBadge status={r.status} />
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
      style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid ${active ? color : '#e5e7eb'}`, background: active ? color + '15' : '#fff', color: active ? color : '#9ca3af', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
      {label}
    </button>
  )
}
