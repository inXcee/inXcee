import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'

const today = new Date().toISOString().slice(0, 10)

export default function SupervisorHome() {
  const navigate = useNavigate()

  const { data: stats = {} } = useQuery({
    queryKey: ['mobile-sup-stats', today],
    queryFn: () => mobileApi.get('/shifts/statistics', { params: { date: today } }).then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Vardiya Kontrol</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>{today}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        <Stat label="Toplam" value={stats.total ?? '—'} color="#6b7280" />
        <Stat label="Geldi" value={stats.worked ?? '—'} color="#10b981" />
        <Stat label="Yok" value={stats.absent ?? '—'} color="#ef4444" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <NavBtn label="📋 Devamsızlık Kontrol" onClick={() => navigate('attendance')} color="#3b82f6" />
        <NavBtn label="⚠️ Hızlı Disiplin" onClick={() => navigate('discipline')} color="#f59e0b" />
        <NavBtn label="🔔 Bildirimler" onClick={() => navigate('notifications')} color="#6366f1" />
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function NavBtn({ label, onClick, color }) {
  return (
    <button onClick={onClick}
      style={{ padding: '16px', borderRadius: '12px', border: `2px solid ${color}30`,
        background: '#fff', textAlign: 'left', fontSize: '15px', fontWeight: 600,
        cursor: 'pointer', color: '#111' }}>
      {label}
    </button>
  )
}
