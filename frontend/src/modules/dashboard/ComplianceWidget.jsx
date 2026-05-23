import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import DashCard from './DashCard.jsx'

function Row({ label, value, color, hint, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 0', borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        minWidth: 32, height: 32, borderRadius: 8,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14,
        color, fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>
        {value}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{hint}</div>}
      </div>
      {onClick && (
        <div style={{ fontSize: 10, color: 'var(--text4)' }}>→</div>
      )}
    </div>
  )
}

export default function ComplianceWidget() {
  const nav = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['safety-compliance-summary'],
    queryFn: () => api.get('/safety/compliance-summary').then(r => r.data),
    refetchInterval: 300000,
  })

  const allOk = data &&
    data.expired_certs === 0 &&
    data.expiring_soon === 0 &&
    data.untrained_12m === 0

  const certColor = !data ? 'var(--text3)'
    : data.expired_certs > 0 ? 'var(--red)'
    : data.expiring_soon > 0 ? 'var(--accent)' : 'var(--green)'

  const trainColor = !data ? 'var(--text3)'
    : data.untrained_12m > 0 ? 'var(--accent)' : 'var(--green)'

  const kkdColor = !data ? 'var(--text3)'
    : data.kkd_outstanding > 10 ? 'var(--accent)' : 'var(--text2)'

  return (
    <DashCard
      title="İSG uyum durumu"
      action={
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => nav('/safety')}
          style={{ fontSize: 10 }}
        >
          Detay →
        </button>
      }
    >
      {isLoading || !data ? (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
          Yükleniyor…
        </div>
      ) : allOk ? (
        <div style={{
          padding: '20px', textAlign: 'center',
          color: 'var(--green)', fontSize: 13, fontWeight: 600,
        }}>
          ✓ Tüm sertifikalar güncel
        </div>
      ) : (
        <div>
          {data.expired_certs > 0 && (
            <Row
              label="Süresi dolmuş sertifika"
              value={data.expired_certs}
              color="var(--red)"
              hint="Aktif personel — yenileme gerekli"
              onClick={() => nav('/safety?tab=certs&filter=expired')}
            />
          )}
          {data.expiring_soon > 0 && (
            <Row
              label="30 gün içinde süresi dolacak"
              value={data.expiring_soon}
              color="var(--accent)"
              hint="Eğitim planlanmalı"
              onClick={() => nav('/safety?tab=certs&filter=expiring')}
            />
          )}
          <Row
            label="Son 12 ayda eğitim almamış"
            value={data.untrained_12m}
            color={trainColor}
            hint={data.untrained_12m === 0 ? 'Tüm personel eğitimli' : 'Aktif çalışanlar'}
            onClick={data.untrained_12m > 0 ? () => nav('/safety?tab=untrained') : undefined}
          />
          <Row
            label="KKD zimmetinde"
            value={data.kkd_outstanding}
            color={kkdColor}
            hint="İade edilmemiş ekipman"
            onClick={() => nav('/safety?tab=kkd')}
          />
          {data.total_active > 0 && (
            <div style={{ padding: '10px 0 0', fontSize: 10, color: 'var(--text4)', textAlign: 'right' }}>
              Toplam {data.total_active} aktif personel
            </div>
          )}
        </div>
      )}
    </DashCard>
  )
}
