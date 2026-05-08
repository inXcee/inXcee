import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

export default function ManagerHome() {
  const navigate = useNavigate()

  const { data: kpi, isLoading, refetch } = useQuery({
    queryKey: ['mobile-mgr-kpi'],
    queryFn: () => mobileApi.get('/dashboard/kpi').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Yönetim Paneli</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {isLoading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
            <Kpi label="DOLULUK" value={`%${kpi?.occupancy_pct ?? 0}`}
                 sub={`${kpi?.occupied ?? 0} / ${kpi?.total_beds ?? 0}`} color="#3b82f6" />
            <Kpi label="AKTİF PERSONEL" value={kpi?.active_personnel ?? 0} sub="Kişi" color="#10b981" />
            <Kpi label="AÇIK ARIZA" value={kpi?.open_maintenance ?? 0} sub="Talep" color="#f59e0b"
                 onClick={() => navigate('maintenance')} />
            <Kpi label="KARANTİNA" value={kpi?.quarantine_rooms ?? 0} sub="Oda"
                 color={kpi?.quarantine_rooms > 0 ? '#ef4444' : '#6b7280'} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <NavBtn label="🗺️ Blok Doluluk Haritası" onClick={() => navigate('heatmap')} />
            <NavBtn label="🔔 Tüm Bildirimler" onClick={() => navigate('notifications')} />
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background: '#fff', borderRadius: '12px', padding: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,.08)',
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color, marginTop: '4px', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function NavBtn({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ padding: '14px', borderRadius: '10px', border: '1px solid #e5e7eb',
        background: '#fff', textAlign: 'left', fontSize: '14px', fontWeight: 600,
        cursor: 'pointer', color: '#111' }}>
      {label}
    </button>
  )
}
