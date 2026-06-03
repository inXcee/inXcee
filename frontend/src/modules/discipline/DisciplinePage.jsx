// Disiplin yönetimi orkestratörü: sekme yönetimi (ara / istatistik / kara liste),
// istatistik query'si (sekme rozeti + StatsDashboard için) ve tarih filtresi.
// Sekme içerikleri ayrı bileşenlerde; sekme değişince ilgili bileşen unmount olur.
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import StatsDashboard from './StatsDashboard.jsx'
import BlacklistPanel from './BlacklistPanel.jsx'
import SearchTab from './SearchTab.jsx'

export default function DisciplinePage() {
  const [tab, setTab] = useUrlParamState('tab', 'search') // search | stats | blacklist
  const [dateFrom, setDateFrom] = useUrlParamState('from', '')
  const [dateTo, setDateTo] = useUrlParamState('to', '')

  // Stats — sekme rozeti (blacklisted_count) ve istatistik sekmesi için
  const { data: stats } = useQuery({
    queryKey: ['discipline-stats', dateFrom, dateTo],
    queryFn: () => {
      let url = '/discipline/stats'
      const params = []
      if (dateFrom) params.push(`date_from=${dateFrom}`)
      if (dateTo) params.push(`date_to=${dateTo}`)
      if (params.length) url += '?' + params.join('&')
      return api.get(url).then(r => r.data)
    },
  })

  const tabs = [
    { key: 'search', label: 'PERSONEL ARA' },
    { key: 'stats', label: 'İSTATİSTİK' },
    { key: 'blacklist', label: 'KARA LİSTE' },
  ]

  return (
    <div style={{ maxWidth: '800px', width: '100%', position: 'relative', zIndex: 1 }} className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>
          DİSİPLİN YÖNETİMİ<HelpHint topic="discipline" title="DİSİPLİN" />
        </h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          KART · KARA LİSTE · İSTATİSTİK
        </p>
      </div>

      {/* Tab row */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'rgba(15,23,42,.3)', borderRadius: '8px', padding: '3px' }}>
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? 'var(--bg)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600, letterSpacing: '1px',
              transition: 'all .15s',
            }}
          >
            {t.label}
            {t.key === 'blacklist' && stats?.blacklisted_count > 0 && (
              <span style={{
                marginLeft: '6px', background: 'var(--red)', color: '#fff',
                borderRadius: '8px', padding: '1px 6px', fontSize: '9px',
              }}>{stats.blacklisted_count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Stats Tab ───────────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Date range filter */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">TARİH ARALIĞI</div>
              {(dateFrom || dateTo) && (
                <button className="btn btn-ghost btn-xs" onClick={() => { setDateFrom(''); setDateTo('') }} style={{ fontSize: '9px' }}>
                  Temizle
                </button>
              )}
            </div>
            <div className="panel-body" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>BAŞLANGIÇ</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 10px', width: '150px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>BİTİŞ</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 10px', width: '150px' }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', letterSpacing: '0.5px' }}>
                  Filtre aktif
                </span>
              )}
            </div>
          </div>
          <StatsDashboard stats={stats} />
        </div>
      )}

      {/* ── Blacklist Tab ───────────────────────────────────────────────────── */}
      {tab === 'blacklist' && <BlacklistPanel />}

      {/* ── Search Tab ──────────────────────────────────────────────────────── */}
      {tab === 'search' && <SearchTab />}
    </div>
  )
}
