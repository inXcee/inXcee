import { useMemo, useState } from 'react'
import { buildCampusCommandSummary } from './logic/campusCommandCenter.js'

const QUICK_ACTIONS = [
  { id: 'checkin', icon: '↗', label: 'Check-in', desc: 'Yeni yerleşim', path: '/checkin', color: '#16a34a' },
  { id: 'checkout', icon: '↙', label: 'Check-out', desc: 'Çıkış işlemi', path: '/checkout', color: '#38bdf8' },
  { id: 'bulk', icon: '☷', label: 'Toplu işlem', desc: 'Çoklu personel', path: '/bulk-actions', color: '#a78bfa' },
  { id: 'cleaning', icon: '◈', label: 'Temizlik', desc: 'Görevleri yönet', path: '/housekeeping', color: '#f59e0b' },
  { id: 'maintenance', icon: '⚙', label: 'Teknik servis', desc: 'Arıza merkezi', path: '/maintenance', color: '#ef4444' },
  { id: 'shifts', icon: '⧗', label: 'Vardiyalar', desc: 'Plan ve puantaj', path: '/shifts', color: '#8b5cf6' },
  { id: 'inventory', icon: '▨', label: 'Envanter', desc: 'Stok ve zimmet', path: '/inventory', color: '#14b8a6' },
  { id: 'reports', icon: '↧', label: 'Raporlar', desc: 'Analiz ve çıktı', path: '/reports-advanced', color: '#64748b' },
]

function MetricButton({ label, value, color, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minWidth: 0, textAlign: 'left', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
        cursor: 'pointer', color: 'var(--text)', transition: 'border-color .15s, transform .15s',
      }}
      onMouseEnter={event => {
        event.currentTarget.style.borderColor = color
        event.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={event => {
        event.currentTarget.style.borderColor = 'var(--border)'
        event.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 22, color }}>{value}</strong>
        <span style={{ fontSize: 9, color: 'var(--text3)' }}>{hint}</span>
      </div>
    </button>
  )
}

export default function CampusCommandCenter({ stats, operations, onNavigate, onModeChange, onSelectBlock }) {
  const [open, setOpen] = useState(true)
  const summary = useMemo(() => buildCampusCommandSummary(stats, operations), [operations, stats])
  const topRisks = summary.criticalBlocks.slice(0, 4)

  return (
    <section style={{
      marginBottom: 10, border: '1px solid var(--border)', borderRadius: 12,
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', border: 0, borderBottom: open ? '1px solid var(--border)' : 0,
          background: 'transparent', color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8,
          background: 'rgba(240,165,0,.14)', color: 'var(--accent)', fontSize: 15,
        }}>⌘</span>
        <span>
          <strong style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 1.8 }}>
            YÖNETİM MERKEZİ
          </strong>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
            KAMPÜSÜ TEK EKRANDAN YÖNET
          </span>
        </span>
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--mono)', fontSize: 9, color: summary.status.color,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: summary.status.color }} />
          {summary.status.label.toUpperCase()} · {summary.healthScore}/100
        </span>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 12,
            background: 'rgba(0,0,0,.08)', minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{
                width: 58, height: 58, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: `conic-gradient(${summary.status.color} ${summary.healthScore * 3.6}deg, var(--surface3) 0deg)`,
                position: 'relative', flexShrink: 0,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: '50%', background: 'var(--surface)',
                  display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 16,
                }}>{summary.healthScore}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.2 }}>
                  OPERASYON SAĞLIĞI
                </div>
                <div style={{ color: summary.status.color, fontWeight: 700, marginTop: 3 }}>{summary.status.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>
                  {summary.dataIssueCount > 0
                    ? `${summary.dataIssueCount} eşleşmemiş arıza konumu incelenmeli.`
                    : 'Açık iş yükü ve kapasite baskısından hesaplanır.'}
                </div>
              </div>
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 6 }}>
              ÖNCELİKLİ BLOKLAR
            </div>
            {topRisks.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, color: '#16a34a', fontSize: 11 }}>
                ✓ Kritik iş yükü görünmüyor
              </div>
            ) : topRisks.map(item => (
              <button
                key={item.block}
                type="button"
                onClick={() => onSelectBlock(item.block)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'transparent', border: 0, borderTop: '1px solid var(--border)',
                  color: 'var(--text)', padding: '7px 2px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <strong style={{ fontFamily: 'var(--display)', color: item.score >= 50 ? '#dc2626' : '#f59e0b', minWidth: 30 }}>
                  {item.block}
                </strong>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: 'var(--text2)' }}>
                  {item.reasons.join(' · ')}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{item.score}</span>
                <span style={{ color: 'var(--text3)' }}>›</span>
              </button>
            ))}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 7, marginBottom: 10 }}>
              <MetricButton label="AÇIK ARIZA" value={summary.openFaults} color={summary.openFaults ? '#dc2626' : '#16a34a'} hint="teknik" onClick={() => onModeChange('faults')} />
              <MetricButton label="TEMİZLİK KALAN" value={summary.cleaningBacklog} color={summary.cleaningBacklog ? '#f59e0b' : '#16a34a'} hint="görev" onClick={() => onModeChange('cleaning')} />
              <MetricButton label="İZOLE ODA" value={summary.quarantineRooms + summary.maintenanceRooms} color={summary.quarantineRooms + summary.maintenanceRooms ? '#a855f7' : '#16a34a'} hint="oda" onClick={() => onModeChange('quarantine')} />
              <MetricButton label="BOŞ YATAK" value={summary.availableBeds} color="#16a34a" hint="müsait" onClick={() => onModeChange('occupancy')} />
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 6 }}>
              HIZLI İŞLEMLER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 7 }}>
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onNavigate(action.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9,
                    padding: '9px 10px', color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={event => { event.currentTarget.style.borderColor = action.color }}
                  onMouseLeave={event => { event.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center',
                    background: `${action.color}1f`, color: action.color, fontSize: 15, flexShrink: 0,
                  }}>{action.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 10, whiteSpace: 'nowrap' }}>{action.label}</strong>
                    <span style={{ display: 'block', fontSize: 8, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap' }}>{action.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
