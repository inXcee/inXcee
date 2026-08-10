import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../shared/api/client.js'

// Faz 5 — Bordro güvenlik kapısı (ekran tarafı).
//
// Banka dosyası ve kesin bordro, dönem hazır olmasa da üretilebiliyordu. Canlıda
// önceki aylarda 1299 gün hâlâ "planlı"; o aylardan biri için dosya çekilirse
// eksik ödeme çıkar ve bu geri alınması en zor hatalardan biridir.
//
// Şerit dönemin hazır olup olmadığını ve NEDEN hazır olmadığını gösterir; her
// engelin düzeltme yolu vardır.

const DURUM = {
  ok: { renk: 'var(--green)', simge: '✓' },
  blocked: { renk: 'var(--red)', simge: '●' },
  // "Ölçemedim" ile "sorun yok" aynı şey değil; kapı bu durumda da açılmaz.
  unknown: { renk: 'var(--text3)', simge: '?' },
}

export default function PayrollGateBar({ month }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['payroll-gate', month],
    queryFn: () => api.get('/shifts/payroll/gate', { params: { month } }).then(r => r.data),
    enabled: !!month,
  })

  if (isPending || !month) return null
  if (isError) {
    return (
      <div className="panel" style={{ marginBottom: 12, padding: '9px 14px', fontSize: 12, borderLeft: '3px solid var(--red)' }}>
        Dönem hazırlık durumu alınamadı — {error?.response?.data?.error || error?.message}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
      </div>
    )
  }

  const engeller = data.checks.filter(c => c.status !== 'ok')

  return (
    <div className="panel" style={{
      marginBottom: 12, borderLeft: `3px solid ${data.ready ? 'var(--green)' : 'var(--red)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{data.ready ? '✓ DÖNEM KESİN BORDROYA HAZIR' : '⛔ DÖNEM HAZIR DEĞİL'}</strong>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>
          {data.ready
            ? `${month} · kesin banka dosyası üretilebilir`
            : `${month} · ${engeller.length} koşul tamamlanmadı — kesin dosya üretilemez, taslak alınabilir`}
        </span>
      </div>

      {engeller.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          {engeller.map(c => {
            const stil = DURUM[c.status] || DURUM.unknown
            return (
              <div key={c.key} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                padding: '6px 0', borderTop: '1px dashed var(--border)', fontSize: 11,
              }}>
                <span style={{ color: stil.renk, width: 10 }} aria-hidden="true">{stil.simge}</span>
                <strong style={{ minWidth: 160 }}>{c.label}</strong>
                <span style={{ color: 'var(--text2)', flex: '1 1 220px' }}>{c.detail}</span>
                <Link to={c.action.route} className="btn btn-ghost btn-xs">{c.action.label} →</Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
