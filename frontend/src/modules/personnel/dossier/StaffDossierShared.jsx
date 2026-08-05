import { useQuery } from '@tanstack/react-query'
import ProjectBadge from '../../../shared/components/ProjectBadge.jsx'
import api from '../../../shared/api/client.js'

export function useStaffDossier(staffId) {
  return useQuery({
    queryKey: ['staff-dossier', String(staffId)],
    queryFn: () => api.get(`/personnel/${staffId}/dossier`).then(response => response.data),
    enabled: !!staffId,
    staleTime: 60000,
  })
}

export function formatDossierDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('tr-TR', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DossierSection({ title, subtitle, action, children, style }) {
  return (
    <section className="panel" style={{ overflow: 'hidden', ...style }}>
      <div className="panel-header" style={{ gap: 12 }}>
        <div>
          <div className="panel-title">{title}</div>
          {subtitle && <div className="panel-subtitle">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function DossierMetric({ label, value, detail, color = 'var(--text)' }) {
  return (
    <div style={{
      minWidth: 0, padding: '12px 14px', borderRadius: 10,
      border: '1px solid var(--border)', background: 'var(--surface2)',
    }}>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 8, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', color, fontSize: 22, lineHeight: 1.1, marginTop: 5 }}>{value ?? '—'}</div>
      {detail && <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 4 }}>{detail}</div>}
    </div>
  )
}

export function DossierField({ label, value, href, sensitive = false }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(105px, .7fr) minmax(0, 1.3fr)',
      gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 9, letterSpacing: .7 }}>{label}</div>
      <div style={{ minWidth: 0, color: value ? 'var(--text)' : 'var(--text4)', fontSize: 12, overflowWrap: 'anywhere' }}>
        {href && value ? <a href={href} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{value}</a> : value || '—'}
        {sensitive && <span style={{ marginLeft: 6, color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 7 }}>HASSAS</span>}
      </div>
    </div>
  )
}

const RISK_TONES = {
  critical: { color: 'var(--red)', bg: 'rgba(231,76,60,.10)', border: 'rgba(231,76,60,.32)' },
  warning: { color: 'var(--accent)', bg: 'rgba(240,165,0,.10)', border: 'rgba(240,165,0,.32)' },
  info: { color: 'var(--blue)', bg: 'rgba(59,140,240,.10)', border: 'rgba(59,140,240,.32)' },
}

export function DossierRisks({ risks = [], compact = false }) {
  if (!risks.length) {
    return (
      <div style={{
        padding: '11px 12px', borderRadius: 9, color: 'var(--green)',
        background: 'rgba(39,201,106,.08)', border: '1px solid rgba(39,201,106,.25)',
        fontFamily: 'var(--mono)', fontSize: 10,
      }}>Açık kritik risk görünmüyor.</div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {risks.slice(0, compact ? 4 : risks.length).map(risk => {
        const tone = RISK_TONES[risk.severity] || RISK_TONES.info
        return (
          <div key={risk.code} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderRadius: 8, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text)', fontSize: 11 }}>{risk.title}</span>
            {risk.count > 1 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>{risk.count}</span>}
          </div>
        )
      })}
      {compact && risks.length > 4 && (
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>+{risks.length - 4} ek uyarı</div>
      )}
    </div>
  )
}

export function DossierHeader({ dossier, actions }) {
  const person = dossier?.person
  if (!person) return null
  const todayShift = dossier.today?.shift
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
      padding: '16px 18px', borderRadius: 14, border: '1px solid var(--border)',
      background: 'linear-gradient(135deg, var(--surface), var(--surface2))',
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        color: person.gender === 'female' ? '#f472b6' : 'var(--blue)',
        background: person.gender === 'female' ? 'rgba(244,114,182,.15)' : 'rgba(59,140,240,.15)',
        border: '2px solid var(--border)', fontFamily: 'var(--display)', fontSize: 24,
      }}>{person.full_name?.charAt(0)?.toUpperCase() || '?'}</div>
      <div style={{ minWidth: 200, flex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 23, letterSpacing: 1.2 }}>{person.full_name}</h1>
          <span className={`badge ${person.is_active ? 'badge-green' : 'badge-gray'}`}>{person.is_active ? 'Aktif' : 'Pasif'}</span>
          {dossier.risk_score > 0 && <span className="badge badge-red">Risk {dossier.risk_score}</span>}
          <ProjectBadge project={person} size="md" />
        </div>
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 5 }}>
          {person.position || 'Pozisyon yok'} · {person.dept_name || 'Departman yok'} · {person.role_name || 'Rol yok'}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="badge badge-blue">{person.primary_work_location_name || 'Lokasyon atanmamış'}</span>
          <span className={`badge ${todayShift ? 'badge-green' : 'badge-gray'}`}>
            {todayShift ? `Bugün: ${todayShift.shift_name || todayShift.status}` : 'Bugün vardiya yok'}
          </span>
          {dossier.identity_link?.status !== 'confirmed' && <span className="badge badge-amber">Kimlik eşleşmesi kontrol edilmeli</span>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{actions}</div>}
    </div>
  )
}

export function DossierWorkMetrics({ dossier }) {
  const work = dossier?.work_30d || {}
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
      <DossierMetric label="30G ÇALIŞTI" value={work.worked || 0} color="var(--green)" />
      <DossierMetric label="DEVAMSIZ" value={work.absent || 0} color={work.absent ? 'var(--red)' : 'var(--green)'} />
      <DossierMetric label="İZİNLİ" value={work.on_leave || 0} color="var(--purple)" />
      <DossierMetric label="HAFTA TATİLİ" value={work.off_days || 0} color="var(--teal)" />
      <DossierMetric label="FAZLA MESAİ" value={`${work.overtime_hours || 0}s`} color="var(--accent)" />
    </div>
  )
}

export function DossierAnnualLeave({ annual, compact = false }) {
  if (!annual) return null
  const serviceLabel = annual.has_hire_date
    ? `${annual.service_years} yıl${annual.service_months ? ` ${annual.service_months} ay` : ''}`
    : '—'
  if (!annual.has_hire_date) {
    return (
      <div style={{ padding: '9px 11px', borderRadius: 8, color: 'var(--accent)', background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.25)', fontSize: 11 }}>
        İşe giriş tarihi eksik — yıllık izin hakkı hesaplanamıyor. "Düzenle" ile ekleyin.
      </div>
    )
  }
  if (!annual.has_started) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ padding: '9px 11px', borderRadius: 8, color: 'var(--blue)', background: 'rgba(59,140,240,.08)', border: '1px solid rgba(59,140,240,.25)', fontSize: 11 }}>
          Yıllık izin hakkı henüz doğmadı. <b>{annual.entitlement_start_date}</b> tarihinde başlayacak ({annual.days_to_start} gün kaldı).
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <DossierField label="İşe giriş" value={formatDossierDate(annual.hire_date)} />
          <DossierField label="Kıdem" value={serviceLabel} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
        <DossierMetric label="HAK EDİLEN" value={`${annual.entitled_days}g`} color="var(--blue)" />
        <DossierMetric label="KULLANILAN" value={`${annual.annual_used}g`} color={annual.annual_used ? 'var(--accent)' : 'var(--text3)'} />
        <DossierMetric label="KALAN" value={`${annual.remaining}g`} color={annual.remaining > 0 ? 'var(--green)' : 'var(--red)'} />
      </div>
      {!compact && (
        <div>
          <DossierField label="İşe giriş" value={formatDossierDate(annual.hire_date)} />
          <DossierField label="Kıdem" value={serviceLabel} />
          <DossierField label="Hak başlangıcı" value={formatDossierDate(annual.entitlement_start_date)} />
          <DossierField label="Sonraki yenilenme" value={formatDossierDate(annual.next_anniversary)} />
          {annual.age_rule_applied && <DossierField label="Yaş kuralı" value="Uygulandı (min 20 gün)" />}
          {annual.mismatch && <DossierField label="Uyarı" value="Takip edilen bakiye yasal hak ile uyuşmuyor" />}
        </div>
      )}
    </div>
  )
}

export function DossierUpcoming({ items = [], compact = false }) {
  if (!items.length) return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yaklaşan tarih bulunmuyor.</div>
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.slice(0, compact ? 5 : items.length).map(item => (
        <div key={`${item.kind}-${item.entity_id}-${item.date}`} style={{
          display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) auto', gap: 8,
          alignItems: 'center', padding: '7px 8px', borderRadius: 7, background: 'var(--surface2)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', color: item.severity === 'critical' ? 'var(--red)' : 'var(--text3)', fontSize: 9 }}>{item.date}</span>
          <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          <span style={{ fontFamily: 'var(--mono)', color: item.days_remaining < 0 ? 'var(--red)' : 'var(--text3)', fontSize: 8 }}>
            {item.days_remaining < 0 ? `${Math.abs(item.days_remaining)}g geçti` : `${item.days_remaining}g`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function DossierActivity({ items = [], compact = false }) {
  if (!items.length) return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Son işlem bulunmuyor.</div>
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.slice(0, compact ? 5 : items.length).map(item => (
        <div key={item.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: item.severity === 'critical' ? 'var(--red)' : item.severity === 'warning' ? 'var(--accent)' : 'var(--blue)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11 }}>{item.title}</div>
            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 8, marginTop: 2 }}>{formatDossierDate(item.date)} · {item.kind}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
