import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import DashCard from './DashCard.jsx'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PulseRow({ label, value, sub, onClick, isLast }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'opacity .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.opacity = '0.7' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

export default function TodaysPulse() {
  const navigate = useNavigate()

  const { data: trends } = useQuery({
    queryKey: ['trends-2d-pulse'],
    queryFn: () => api.get('/dashboard/trends?metrics=checkins&days=2').then(r => r.data),
    refetchInterval: 60000,
  })
  const { data: openMaint = [] } = useQuery({
    queryKey: ['maint-open-pulse'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data).catch(() => []),
    refetchInterval: 60000,
  })
  const { data: hkTasks = [] } = useQuery({
    queryKey: ['hk-tasks-pulse'],
    queryFn: () => api.get('/housekeeping/tasks').then(r => r.data).catch(() => []),
    refetchInterval: 60000,
  })
  const { data: visitors } = useQuery({
    queryKey: ['visitors-pulse'],
    queryFn: () => api.get('/visitors/stats').then(r => r.data).catch(() => null),
    refetchInterval: 60000,
  })

  const today = todayDateStr()
  const todayPoint = trends?.checkins?.find(p => p.date === today)
  const inToday = todayPoint?.in ?? 0
  const outToday = todayPoint?.out ?? 0
  const maintToday = openMaint.filter(r => (r.opened_at || '').startsWith(today)).length
  const hkDoneToday = hkTasks.filter(t => (t.completed_at || '').startsWith(today)).length
  const activeVisitors = visitors?.active ?? 0

  const rows = [
    { label: 'Giriş', value: inToday, sub: 'Bugün kayıt', onClick: () => navigate('/checkin') },
    { label: 'Çıkış', value: outToday, sub: 'Bugün kayıt', onClick: () => navigate('/checkin') },
    { label: 'Yeni arıza', value: maintToday, sub: `${openMaint.length} açık toplam`, onClick: () => navigate('/maintenance') },
    { label: 'Temizlik tamam', value: hkDoneToday, sub: `${hkTasks.length} toplam görev`, onClick: () => navigate('/housekeeping') },
    { label: 'Aktif ziyaretçi', value: activeVisitors, onClick: () => navigate('/settings/visitors') },
  ]

  return (
    <DashCard title="Bugünün nabzı">
      {rows.map((r, i) => (
        <PulseRow key={r.label} {...r} isLast={i === rows.length - 1} />
      ))}
    </DashCard>
  )
}
