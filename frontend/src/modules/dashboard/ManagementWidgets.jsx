import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function fmtTL(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function Card({ label, value, hint, color = 'var(--text)', onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: '1 1 160px', minWidth: 160, padding: '14px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--accent)' } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, fontFamily: 'var(--mono)', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export default function ManagementWidgets() {
  const nav = useNavigate()

  const { data: visitors } = useQuery({
    queryKey: ['dash-visitors'],
    queryFn: () => api.get('/visitors/stats').then(r => r.data).catch(() => null),
  })
  const { data: surveyStats } = useQuery({
    queryKey: ['dash-surveys', 30],
    queryFn: () => api.get('/surveys/stats?days=30').then(r => r.data).catch(() => null),
  })
  const { data: expensesSum } = useQuery({
    queryKey: ['dash-expenses'],
    queryFn: () => api.get('/expenses/summary?months=1').then(r => r.data).catch(() => null),
  })
  const { data: drillStats } = useQuery({
    queryKey: ['dash-drills'],
    queryFn: () => api.get('/drills/stats').then(r => r.data).catch(() => null),
  })
  const { data: expiring = [] } = useQuery({
    queryKey: ['dash-expiring'],
    queryFn: () => api.get('/companies/expiring?days=30').then(r => r.data).catch(() => []),
  })

  const avgOverall = surveyStats?.summary?.avg_overall
  const avgColor = avgOverall == null ? 'var(--text)' :
    avgOverall >= 4 ? 'var(--green, #22c55e)' :
    avgOverall >= 3 ? 'var(--orange, #f97316)' : 'var(--red, #ef4444)'

  const expiringSoon = expiring.filter(e => e.days_left >= 0 && e.days_left <= 30).length
  const expiredCount = expiring.filter(e => e.days_left < 0).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>
        YÖNETİM ÖZETİ
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Card
          label="ZİYARETÇİ İÇERDE"
          value={visitors?.active || 0}
          hint={visitors?.today != null ? `Bugün ${visitors.today} kayıt` : null}
          color={visitors?.active > 0 ? 'var(--accent)' : 'var(--text)'}
          onClick={() => nav('/visitors')}
        />
        <Card
          label="MEMNUNİYET (30g)"
          value={avgOverall != null ? `★ ${avgOverall}` : '—'}
          hint={surveyStats?.summary?.total ? `${surveyStats.summary.total} cevap` : 'Henüz cevap yok'}
          color={avgColor}
          onClick={() => nav('/surveys')}
        />
        <Card
          label="BU AY GİDER"
          value={fmtTL(expensesSum?.this_month_total)}
          hint={expensesSum?.per_resident ? `Kişi başı: ${fmtTL(expensesSum.per_resident)}` : null}
          onClick={() => nav('/expenses')}
        />
        <Card
          label="SON TATBİKAT"
          value={drillStats?.last_drill || '—'}
          hint={drillStats?.upcoming ? `Sonraki: ${drillStats.upcoming}` : 'Planlanmış yok'}
          color={drillStats?.upcoming ? 'var(--text)' : 'var(--orange, #f97316)'}
          onClick={() => nav('/drills')}
        />
        <Card
          label="SÖZLEŞMESİ YAKLAŞAN"
          value={`${expiringSoon} firma`}
          hint={expiredCount > 0 ? `⚠ ${expiredCount} süresi dolmuş` : '30 gün içinde'}
          color={expiredCount > 0 ? 'var(--red, #ef4444)' : expiringSoon > 0 ? 'var(--orange, #f97316)' : 'var(--text)'}
          onClick={() => nav('/companies')}
        />
      </div>
    </div>
  )
}
