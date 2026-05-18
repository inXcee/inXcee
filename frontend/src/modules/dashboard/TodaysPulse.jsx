import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PulseRow({ icon, label, value, color, sub, onClick }) {
  const iconBg = `color-mix(in srgb, ${color} 10%, transparent)`
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width: '28px', height: '28px', borderRadius: '7px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px',
        background: iconBg,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px' }}>{label}</div>
        {sub && <div style={{ fontSize: '10px', color: 'var(--text2)' }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, lineHeight: 1, letterSpacing: '1px' }}>{value}</div>
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

  return (
    <div className="panel card-glass cat-stripe cat-stripe-personnel">
      <div className="panel-header">
        <div>
          <div className="panel-title">BUGÜNÜN NABZI</div>
          <div className="panel-subtitle">CANLI HAREKET ÖZETİ</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <PulseRow
          icon="▲" label="GİRİŞ" value={inToday}
          color="var(--green)" sub="Bugün kayıt"
          onClick={() => navigate('/checkin')}
        />
        <PulseRow
          icon="▼" label="ÇIKIŞ" value={outToday}
          color="var(--red)" sub="Bugün kayıt"
          onClick={() => navigate('/checkin')}
        />
        <PulseRow
          icon="🔧" label="YENİ ARIZA" value={maintToday}
          color="var(--accent2)" sub={`${openMaint.length} açık toplam`}
          onClick={() => navigate('/maintenance')}
        />
        <PulseRow
          icon="🧹" label="TEMİZLİK TAMAM" value={hkDoneToday}
          color="var(--teal)" sub={`${hkTasks.length} toplam görev`}
          onClick={() => navigate('/housekeeping')}
        />
        <PulseRow
          icon="👥" label="AKTİF ZİYARETÇİ" value={activeVisitors}
          color="var(--blue)"
          onClick={() => navigate('/settings/visitors')}
        />
      </div>
    </div>
  )
}
