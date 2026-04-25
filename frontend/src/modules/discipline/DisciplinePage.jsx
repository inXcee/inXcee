import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'

/* ── helpers ─────────────────────────────────────────────────────────────── */
const fmt = d => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const fmtFull = d => d ? new Date(d).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

const PREDEFINED_REASONS = [
  'Alkol kullanımı',
  'Kavga / fiziksel şiddet',
  'Oda kurallarına uymama',
  'Sessizlik saatlerine uymama',
  'Ortak alan kurallarına uymama',
  'İzinsiz misafir getirme',
  'Temizlik kurallarına uymama',
  'Sigara ihlali',
  'Malzeme hasarı',
  'Hırsızlık',
  'Tehdit / hakaret',
  'İzinsiz blok değişikliği',
]

/* ── KPI Card ────────────────────────────────────────────────────────────── */
function KPI({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      flex: 1, minWidth: '100px', padding: '14px 16px',
      background: 'rgba(15,23,42,.3)', borderRadius: '8px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color, letterSpacing: '1px' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

/* ── AutoReason ──────────────────────────────────────────────────────────── */
function AutoReason({ value, onChange, suggestions = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const allSuggestions = [...new Set([
    ...PREDEFINED_REASONS,
    ...suggestions.map(s => s.reason),
  ])]
  const filtered = value.length >= 1
    ? allSuggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : allSuggestions

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="İhlal sebebi yazın veya seçin..."
        className="form-input"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
          maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {filtered.map(s => (
            <div key={s} onClick={() => { onChange(s); setOpen(false) }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)',
                borderBottom: '1px solid rgba(35,45,63,.3)',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Stats Dashboard ─────────────────────────────────────────────────────── */
function StatsDashboard({ stats }) {
  const [companyExpanded, setCompanyExpanded] = useState(null)

  if (!stats) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <KPI label="TOPLAM KART" value={stats.total_records || 0} sub={`${stats.yellow_cards || 0} sarı · ${stats.red_cards || 0} kırmızı`} />
        <KPI label="KARA LİSTE" value={stats.blacklisted_count || 0} color="var(--red)" />
        <KPI label="KRİTİK" value={stats.critical_count || 0} color="var(--red)" sub="3+ puan" />
        <KPI label="UYARILI" value={stats.warned_count || 0} color="var(--accent)" sub="1-2 puan" />
      </div>

      {/* Top offenders */}
      {stats.topOffenders?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">EN ÇOK CEZA ALAN PERSONEL</div>
            <span className="badge badge-gray">{stats.topOffenders.length}</span>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.topOffenders.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  background: p.discipline_points >= 3 ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.12)',
                  border: `1px solid ${p.discipline_points >= 3 ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.25)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--display)', fontSize: '14px',
                  color: p.discipline_points >= 3 ? 'var(--red)' : 'var(--accent)',
                }}>
                  {p.discipline_points}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                    {p.company || '—'} · {p.job_title || '—'} · {p.yellow}S {p.red}K
                  </div>
                </div>
                {p.is_blacklisted ? (
                  <span className="badge badge-red">KARA LİSTE</span>
                ) : p.discipline_points >= 3 ? (
                  <span className="badge badge-red">KRİTİK</span>
                ) : (
                  <span className="badge badge-amber">UYARI</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company distribution */}
      {stats.byCompany?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">ŞİRKET BAZLI DAĞILIM</div>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.byCompany.map(c => (
              <div key={c.company}
                onClick={() => setCompanyExpanded(companyExpanded === c.company ? null : c.company)}
                style={{
                  padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{c.company}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="badge badge-amber">{c.yellow}S</span>
                    <span className="badge badge-red">{c.red}K</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      Toplam: {c.total}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Chart (last 30 days) */}
      {stats.trend?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">30 GUNLUK TREND</div>
          </div>
          <div style={{ padding: '16px', overflowX: 'auto' }}>
            {(() => {
              const maxVal = Math.max(...stats.trend.map(d => d.yellow + d.red), 1)
              const barW = Math.max(16, Math.min(32, 600 / stats.trend.length))
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', minWidth: stats.trend.length * (barW + 2) }}>
                  {stats.trend.map(d => {
                    const yH = (d.yellow / maxVal) * 100
                    const rH = (d.red / maxVal) * 100
                    const dateLabel = d.date.slice(5)
                    return (
                      <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: barW + 'px' }} title={`${d.date}: ${d.yellow}S ${d.red}K`}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                          {d.red > 0 && <div style={{ height: rH + '%', minHeight: '3px', background: 'var(--red)', borderRadius: '2px 2px 0 0' }} />}
                          {d.yellow > 0 && <div style={{ height: yH + '%', minHeight: '3px', background: 'var(--amber)', borderRadius: d.red ? '0' : '2px 2px 0 0' }} />}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', marginTop: '4px', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                          {dateLabel}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: '16px', marginTop: '20px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--amber)' }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>SARI KART</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--red)' }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>KIRMIZI KART</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reason distribution */}
      {stats.reasonStats?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">SEBEP DAGILIMI</div>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {stats.reasonStats.map((r, i) => {
              const maxCnt = stats.reasonStats[0]?.cnt || 1
              const pct = (r.cnt / maxCnt) * 100
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid rgba(35,45,63,.2)' }}>
                  <div style={{ flex: 1, fontSize: '11px', color: 'var(--text2)' }}>{r.reason || '—'}</div>
                  <div style={{ width: '100px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', borderRadius: '3px', background: r.card_type === 'yellow' ? 'var(--amber)' : 'var(--red)' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', width: '24px', textAlign: 'right' }}>{r.cnt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {stats.recentActivity?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">SON İŞLEMLER</div>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.recentActivity.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px', flexShrink: 0,
                  background: a.card_type === 'yellow' ? 'var(--accent)' : 'var(--red)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                    <strong>{a.personnel_name}</strong> — {a.reason}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                    {a.company || '—'} · {a.created_by_name} · {fmtFull(a.created_at)}
                  </div>
                </div>
                <span className={`badge ${a.card_type === 'yellow' ? 'badge-amber' : 'badge-red'}`}>
                  {a.card_type === 'yellow' ? 'SARI' : 'KIRMIZI'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Blacklist Panel ─────────────────────────────────────────────────────── */
function BlacklistPanel() {
  const qc = useQueryClient()
  const { data: list = [] } = useQuery({
    queryKey: ['discipline-blacklisted'],
    queryFn: () => api.get('/discipline/blacklisted').then(r => r.data),
  })

  const removeMut = useMutation({
    mutationFn: id => api.post('/discipline/blacklist/remove', { personnel_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
    },
  })

  if (list.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header"><div className="panel-title">KARA LİSTE</div></div>
        <div className="panel-body" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '30px' }}>
          Kara listede kimse yok
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">KARA LİSTE</div>
        <span className="badge badge-red">{list.length}</span>
      </div>
      <div style={{ padding: '4px 16px' }}>
        {list.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '12px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '6px',
              background: 'rgba(231,76,60,.12)', border: '1px solid rgba(231,76,60,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', flexShrink: 0,
            }}>
              ⛔
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                {p.company || '—'} · {p.job_title || '—'} · TC: {p.tc_no || '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>
                Sebep: {p.blacklist_reason}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                {fmt(p.blacklisted_at)} · {p.blacklisted_by_name || ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <span className="badge badge-red">{p.discipline_points} PUAN</span>
              <button
                onClick={() => { if (confirm(`${p.full_name} kara listeden çıkarılsın mı?`)) removeMut.mutate(p.id) }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '9px', color: 'var(--green)' }}
              >
                ÇIKAR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const INIT_CARD = { card_type: 'yellow', reason: '' }

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function DisciplinePage() {
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [tab, setTab] = useState('search') // search | stats | blacklist
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [cardForm, setCardForm] = useState(INIT_CARD)
  const { hasDraft: hasDraftCard, restoreDraft: restoreDraftCard, discardDraft: discardDraftCard, onSubmitSuccess: onCardSubmitSuccess } = useDraft('draft:discipline', cardForm, setCardForm, INIT_CARD)
  const [blacklistReason, setBlacklistReason] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [searching, setSearching] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const debounceRef = useRef(null)

  // Stats
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

  // Reason suggestions
  const { data: reasonSuggestions = [] } = useQuery({
    queryKey: ['discipline-reason-suggestions'],
    queryFn: () => api.get('/discipline/reason-suggestions').then(r => r.data),
  })

  // Records for selected person
  const { data: records = [] } = useQuery({
    queryKey: ['discipline-records', selectedPerson?.id],
    queryFn: () => api.get(`/discipline/records/${selectedPerson.id}`).then(r => r.data),
    enabled: !!selectedPerson,
  })

  // Debounced search
  const doSearch = useCallback(async (term) => {
    if (!term || term.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await api.get('/discipline/search', { params: { q: term } })
      setSearchResults(res.data)
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleSearchChange = val => {
    setSearchTerm(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const selectPerson = async (p) => {
    // Re-fetch fresh data
    try {
      const res = await api.get(`/discipline/personnel/${p.id}`)
      setSelectedPerson(res.data)
    } catch {
      setSelectedPerson(p)
    }
    setSearchResults([])
    setSearchTerm('')
    setShowBlacklist(false)
    setCardForm({ card_type: 'yellow', reason: '' })
  }

  const addCard = useMutation({
    mutationFn: () => api.post('/discipline/records', { personnel_id: selectedPerson.id, ...cardForm }),
    onSuccess: async () => {
      onCardSubmitSuccess()
      setCardForm(INIT_CARD)
      qc.invalidateQueries({ queryKey: ['discipline-records'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-reason-suggestions'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kart eklenemedi', 'error'),
  })

  const deleteCard = useMutation({
    mutationFn: (id) => api.delete(`/discipline/records/${id}`),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['discipline-records'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kart silinemedi', 'error'),
  })

  const addBlacklist = useMutation({
    mutationFn: () => api.post('/discipline/blacklist', { personnel_id: selectedPerson.id, reason: blacklistReason }),
    onSuccess: async () => {
      setShowBlacklist(false); setBlacklistReason('')
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kara listeye eklenemedi', 'error'),
  })

  const removeBlacklist = useMutation({
    mutationFn: () => api.post('/discipline/blacklist/remove', { personnel_id: selectedPerson.id }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kara listeden çıkarılamadı', 'error'),
  })

  const disciplineColor = !selectedPerson ? 'var(--text2)'
    : selectedPerson.discipline_points >= 3 ? 'var(--red)'
    : selectedPerson.discipline_points >= 1 ? 'var(--accent)'
    : 'var(--green)'

  const tabs = [
    { key: 'search', label: 'PERSONEL ARA' },
    { key: 'stats', label: 'İSTATİSTİK' },
    { key: 'blacklist', label: 'KARA LİSTE' },
  ]

  return (
    <div style={{ maxWidth: '800px', width: '100%', position: 'relative', zIndex: 1 }} className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>DİSİPLİN YÖNETİMİ</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          KART · KARA LİSTE · İSTATİSTİK
        </p>
      </div>

      {/* Tab row */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'rgba(15,23,42,.3)', borderRadius: '8px', padding: '3px' }}>
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setSelectedPerson(null); setSearchResults([]); setSearchTerm('') }}
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
      {tab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Search panel */}
          <div className="panel fade-up-1">
            <div className="panel-header">
              <div className="panel-title">PERSONEL ARA</div>
            </div>
            <div className="panel-body" style={{ position: 'relative' }}>
              <input
                value={searchTerm}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="İsim, şirket, TC veya meslek ile arayın..."
                className="form-input"
                style={{ width: '100%' }}
              />
              {searching && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>Aranıyor...</div>
              )}

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  background: 'var(--bg2)', maxHeight: '300px', overflowY: 'auto',
                }}>
                  {searchResults.map(p => (
                    <div key={p.id}
                      onClick={() => selectPerson(p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', cursor: 'pointer',
                        borderBottom: '1px solid rgba(35,45,63,.3)',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '6px',
                        background: p.is_blacklisted ? 'rgba(231,76,60,.15)' : p.discipline_points >= 3 ? 'rgba(231,76,60,.1)' : p.discipline_points >= 1 ? 'rgba(240,165,0,.1)' : 'rgba(46,204,113,.1)',
                        border: `1px solid ${p.is_blacklisted ? 'rgba(231,76,60,.3)' : p.discipline_points >= 3 ? 'rgba(231,76,60,.2)' : p.discipline_points >= 1 ? 'rgba(240,165,0,.2)' : 'rgba(46,204,113,.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--display)', fontSize: '12px',
                        color: p.is_blacklisted ? 'var(--red)' : p.discipline_points >= 3 ? 'var(--red)' : p.discipline_points >= 1 ? 'var(--accent)' : 'var(--green)',
                        flexShrink: 0,
                      }}>
                        {p.discipline_points ?? 0}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                          {p.company || '—'} · {p.job_title || '—'}{p.block ? ` · ${p.block}-${p.floor}/${p.room_no}` : ''}{p.shift_type ? ` · ${p.shift_type === 'day' ? 'Gündüz' : 'Gece'}` : ''}
                        </div>
                      </div>
                      {p.is_blacklisted && <span className="badge badge-red" style={{ fontSize: '8px' }}>KARA LİSTE</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Selected Person ──────────────────────────────────────────────── */}
          {selectedPerson && (
            <>
              {/* Person card */}
              <div className="panel fade-up-1">
                <div style={{ height: '2px', background: `linear-gradient(90deg, ${disciplineColor}, transparent)` }} />
                <div className="panel-body" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '2px', color: 'var(--text)', marginBottom: '4px' }}>
                      {selectedPerson.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: '4px' }}>
                      {selectedPerson.company || '—'} · {selectedPerson.job_title || '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '10px' }}>
                      TC: {selectedPerson.tc_no || '—'}
                      {selectedPerson.block && ` · Oda: ${selectedPerson.block}-${selectedPerson.floor}/${selectedPerson.room_no}`}
                      {selectedPerson.shift_type && ` · ${selectedPerson.shift_type === 'day' ? 'Gündüz' : 'Gece'} Vardiyası`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>DİSİPLİN PUANI</span>
                        <span style={{ fontFamily: 'var(--display)', fontSize: '26px', color: disciplineColor }}>
                          {selectedPerson.discipline_points ?? 0}
                        </span>
                      </div>
                      {selectedPerson.is_blacklisted && selectedPerson.blacklist_reason?.includes('Otomatik') ? (
                        <span className="badge badge-red">OTOMATİK KARA LİSTE</span>
                      ) : selectedPerson.is_blacklisted ? (
                        <span className="badge badge-red">KARA LİSTE</span>
                      ) : null}
                      {selectedPerson.discipline_points >= 3 && !selectedPerson.is_blacklisted && (
                        <span className="badge badge-red">KRİTİK — FESİH GEREKLİ</span>
                      )}
                      {selectedPerson.discipline_points >= 1 && selectedPerson.discipline_points < 3 && (
                        <span className="badge badge-amber">UYARI</span>
                      )}
                      {(selectedPerson.discipline_points ?? 0) === 0 && !selectedPerson.is_blacklisted && (
                        <span className="badge badge-green">TEMİZ</span>
                      )}
                    </div>
                    {selectedPerson.discipline_points === 4 && !selectedPerson.is_blacklisted && (
                      <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(240,165,0,.08)', borderRadius: '6px', border: '1px solid rgba(240,165,0,.25)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.5px' }}>
                          UYARI: 1 puan daha kara listeye otomatik eklenecek
                        </div>
                      </div>
                    )}
                    {selectedPerson.is_blacklisted && (
                      <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(231,76,60,.06)', borderRadius: '6px', border: '1px solid rgba(231,76,60,.15)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1px', marginBottom: '2px' }}>KARA LİSTE SEBEBİ</div>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{selectedPerson.blacklist_reason}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{fmt(selectedPerson.blacklisted_at)}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    {selectedPerson.is_blacklisted ? (
                      <button
                        onClick={() => { if (confirm('Kara listeden çıkarılsın mı?')) removeBlacklist.mutate() }}
                        className="btn btn-sm"
                        style={{ background: 'var(--green)', color: '#fff', border: 'none', fontSize: '10px' }}
                      >
                        KARA LİSTEDEN ÇIKAR
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowBlacklist(s => !s)}
                        className="btn btn-danger btn-sm"
                      >
                        KARA LİSTEYE AL
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedPerson(null); setSearchTerm('') }}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '9px' }}
                    >
                      KAPAT
                    </button>
                  </div>
                </div>

                {/* Blacklist form */}
                {showBlacklist && (
                  <div style={{
                    margin: '0 20px 16px',
                    padding: '14px',
                    background: 'rgba(231,76,60,.06)',
                    border: '1px solid rgba(231,76,60,.2)',
                    borderRadius: '7px',
                  }}>
                    <label className="form-label">Kara Listeye Alma Sebebi</label>
                    <input
                      value={blacklistReason}
                      onChange={e => setBlacklistReason(e.target.value)}
                      className="form-input"
                      placeholder="Sebep yazın..."
                      style={{ marginBottom: '10px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setShowBlacklist(false)} className="btn btn-ghost btn-sm">İPTAL</button>
                      <button
                        onClick={() => addBlacklist.mutate()}
                        disabled={!blacklistReason || addBlacklist.isPending}
                        className="btn btn-danger btn-sm"
                        style={{ opacity: (!blacklistReason || addBlacklist.isPending) ? 0.5 : 1 }}
                      >
                        ONAYLA
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Add card ─────────────────────────────────────────────────── */}
              {!selectedPerson.is_blacklisted && (
                <div className="panel fade-up-2">
                  <div className="panel-header">
                    <div className="panel-title">KART VER</div>
                  </div>
                  <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Point preview */}
                    <div style={{
                      padding: '8px 12px', borderRadius: '6px',
                      background: 'rgba(15,23,42,.3)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>KART SONRASI PUAN</span>
                      <span style={{
                        fontFamily: 'var(--display)', fontSize: '18px',
                        color: ((selectedPerson.discipline_points ?? 0) + (cardForm.card_type === 'red' ? 2 : 1)) >= 3 ? 'var(--red)' : 'var(--accent)',
                      }}>
                        {(selectedPerson.discipline_points ?? 0)} + {cardForm.card_type === 'red' ? 2 : 1} = {(selectedPerson.discipline_points ?? 0) + (cardForm.card_type === 'red' ? 2 : 1)}
                      </span>
                    </div>

                    <DraftBanner hasDraft={hasDraftCard} onRestore={restoreDraftCard} onDiscard={discardDraftCard} />
                    {/* Card type buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setCardForm(p => ({ ...p, card_type: 'yellow' }))}
                        style={{
                          flex: 1, padding: '12px', borderRadius: '7px', cursor: 'pointer',
                          border: `2px solid ${cardForm.card_type === 'yellow' ? 'rgba(240,165,0,0.6)' : 'var(--border)'}`,
                          background: cardForm.card_type === 'yellow' ? 'rgba(240,165,0,.1)' : 'transparent',
                          color: cardForm.card_type === 'yellow' ? 'var(--accent)' : 'var(--text2)',
                          fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
                          transition: 'all 0.15s',
                        }}
                      >
                        SARI KART (+1)
                      </button>
                      <button
                        onClick={() => setCardForm(p => ({ ...p, card_type: 'red' }))}
                        style={{
                          flex: 1, padding: '12px', borderRadius: '7px', cursor: 'pointer',
                          border: `2px solid ${cardForm.card_type === 'red' ? 'rgba(231,76,60,0.6)' : 'var(--border)'}`,
                          background: cardForm.card_type === 'red' ? 'rgba(231,76,60,.1)' : 'transparent',
                          color: cardForm.card_type === 'red' ? 'var(--red)' : 'var(--text2)',
                          fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
                          transition: 'all 0.15s',
                        }}
                      >
                        KIRMIZI KART (+2)
                      </button>
                    </div>

                    {/* Reason with autocomplete */}
                    <div>
                      <label className="form-label">İhlal Sebebi</label>
                      <AutoReason
                        value={cardForm.reason}
                        onChange={v => setCardForm(p => ({ ...p, reason: v }))}
                        suggestions={reasonSuggestions}
                      />
                    </div>

                    <button
                      onClick={() => addCard.mutate()}
                      disabled={addCard.isPending || !cardForm.reason}
                      className="btn btn-danger"
                      style={{ alignSelf: 'flex-start', opacity: (addCard.isPending || !cardForm.reason) ? 0.5 : 1 }}
                    >
                      {addCard.isPending ? 'KAYDEDİLİYOR...' : 'KART VER'}
                    </button>
                    {addCard.isSuccess && (
                      <div className="alert alert-success" style={{ margin: 0 }}>
                        <span>✓</span><span>Kart başarıyla eklendi</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── History ──────────────────────────────────────────────────── */}
              <div className="panel fade-up-3">
                <div className="panel-header">
                  <div className="panel-title">DİSİPLİN GEÇMİŞİ</div>
                  <span className="badge badge-gray">{records.length}</span>
                </div>
                {records.length === 0 ? (
                  <div className="panel-body" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '24px' }}>
                    Henüz disiplin kaydı yok
                  </div>
                ) : (
                  <div style={{ padding: '6px 16px' }}>
                    {records.map(r => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        padding: '12px 4px', borderBottom: '1px solid rgba(35,45,63,.4)',
                      }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '4px', flexShrink: 0,
                          background: r.card_type === 'yellow' ? 'rgba(240,165,0,.2)' : 'rgba(231,76,60,.2)',
                          border: `1px solid ${r.card_type === 'yellow' ? 'rgba(240,165,0,.4)' : 'rgba(231,76,60,.4)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--mono)', fontSize: '8px', fontWeight: 700,
                          color: r.card_type === 'yellow' ? 'var(--accent)' : 'var(--red)',
                          letterSpacing: '0.5px',
                        }}>
                          {r.card_type === 'yellow' ? 'S' : 'K'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '3px' }}>{r.reason}</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.5px' }}>
                            {r.created_by_name} · {fmtFull(r.created_at)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`badge ${r.card_type === 'yellow' ? 'badge-amber' : 'badge-red'}`}>
                            {r.card_type === 'yellow' ? 'SARI' : 'KIRMIZI'}
                          </span>
                          <button
                            onClick={() => { if (confirm('Bu kart silinsin mi? Puan düşecektir.')) deleteCard.mutate(r.id) }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text3)', fontSize: '12px', padding: '4px',
                              opacity: 0.5, transition: 'opacity .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                            title="Kartı sil"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
