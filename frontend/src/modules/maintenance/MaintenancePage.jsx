// Teknik servis orkestratörü: KPI'lar, teknisyen panelleri, yeni arıza formu,
// filtre/arama, liste/kanban görünümü ve detay panelini birbirine bağlar.
// Sunum/iş parçaları: ./shared, ./LocationPicker, ./KanbanView,
// ./TechnicianPanels, ./DetailPanel.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import {
  MAINTENANCE_EXPORT_COLS, PRIORITIES, SPECIALTIES, priInfo, statusInfo,
  SLACountdown, StatusTimeline, StatusActions, PhotoCapture,
} from './shared.jsx'
import LocationPicker from './LocationPicker.jsx'
import KanbanView from './KanbanView.jsx'
import { AvailableTechnicians, TechnicianManager } from './TechnicianPanels.jsx'
import DetailPanel from './DetailPanel.jsx'

const INIT_MAINTENANCE = { location: '', description: '', priority: 'medium', category: 'genel' }

/* ═══════════════════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function MaintenancePage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showTechs, setShowTechs] = useState(false)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-maintenance') setShowForm(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])
  const [form, setForm] = useState(INIT_MAINTENANCE)
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:maintenance', form, setForm, INIT_MAINTENANCE)
  const [formPhoto, setFormPhoto] = useState(null)
  const [filter, setFilter] = useState('open')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 250)
  const [selectedId, setSelectedId] = useState(null)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'

  const { data: stats } = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: () => api.get('/maintenance/stats').then(r => r.data),
    refetchInterval: 30000,
  })

  const buildQuery = () => {
    let url = '/maintenance/requests?'
    if (filter === 'overdue') url += 'status=open&'
    else if (filter === 'all' || filter === 'kanban') { /* no status filter */ }
    else url += `status=${filter}&`
    if (debouncedSearch.trim()) url += `search=${encodeURIComponent(debouncedSearch.trim())}&`
    if (categoryFilter !== 'all') url += `category=${categoryFilter}&`
    return url
  }

  const kanbanQuery = () => {
    let url = '/maintenance/requests?'
    if (debouncedSearch.trim()) url += `search=${encodeURIComponent(debouncedSearch.trim())}&`
    if (categoryFilter !== 'all') url += `category=${categoryFilter}&`
    return url
  }

  const { data: rawRequests = [], isLoading } = useQuery({
    queryKey: ['maintenance-requests', viewMode === 'kanban' ? 'all' : filter, categoryFilter, debouncedSearch],
    queryFn: () => api.get(viewMode === 'kanban' ? kanbanQuery() : buildQuery()).then(r => r.data),
  })

  const requests = filter === 'overdue'
    ? rawRequests.filter(r => r.sla_deadline && new Date(r.sla_deadline) < new Date())
    : rawRequests

  const createRequest = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', form.location)
      fd.append('description', form.description)
      fd.append('priority', form.priority)
      fd.append('category', form.category)
      if (formPhoto) fd.append('photo_before', formPhoto)
      return api.post('/maintenance/requests', fd)
    },
    onSuccess: () => {
      onSubmitSuccess()
      setShowForm(false)
      setForm(INIT_MAINTENANCE)
      setFormPhoto(null)
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    },
  })

  return (
    <div style={{ position: 'relative', zIndex: 1 }} className="fade-up">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>
            TEKNİK SERVİS<HelpHint topic="maintenance" title="TEKNİK SERVİS" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            ARIZA BİLDİRİM VE TAKİP
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const rows = requests.map(r => ({
                ...r,
                status_label: r.status === 'open' ? 'Açık' : r.status === 'in_progress' ? 'Devam' : 'Tamamlandı',
                priority_label: r.priority === 'high' ? 'Acil' : r.priority === 'medium' ? 'Normal' : 'Düşük',
              }))
              exportRowsToCsv(MAINTENANCE_EXPORT_COLS, rows, `arizalar-${filter}.csv`)
            }}
            title="Mevcut listeyi CSV olarak indir"
          >
            CSV
          </button>
          <button onClick={() => setShowTechs(s => !s)} className="btn btn-ghost">
            {showTechs ? '✕ TEKNİSYENLER' : '⚙ TEKNİSYENLER'}
          </button>
          <button onClick={() => setShowForm(s => !s)} className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}>
            {showForm ? '✕ KAPAT' : '+ YENİ ARIZA'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="fade-up-1" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--red)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--red)', lineHeight: 1 }}>{stats.open}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>AÇIK ARIZA</div>
          </div>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--amber)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--amber)', lineHeight: 1 }}>{stats.waiting}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BEKLEMEDE</div>
          </div>
          <div style={{
            flex: 1, minWidth: '110px', padding: '14px 16px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px',
            borderTop: '3px solid var(--green)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--green)', lineHeight: 1 }}>{stats.closedToday}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BUGÜN KAPANAN</div>
            {stats.avgHours && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '2px' }}>Ort: {stats.avgHours}s</div>}
          </div>
          {stats.overdue > 0 && (
            <div style={{
              flex: 1, minWidth: '110px', padding: '14px 16px',
              background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)', borderRadius: '10px',
              borderTop: '3px solid var(--red)',
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--red)', lineHeight: 1 }}>{stats.overdue}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', letterSpacing: '1.5px', marginTop: '6px' }}>SLA AŞILDI</div>
            </div>
          )}
        </div>
      )}

      {/* Available Technicians */}
      <AvailableTechnicians />

      {/* Technician manager */}
      {showTechs && <TechnicianManager />}

      {/* New request form */}
      {showForm && (
        <div className="panel fade-up" style={{ marginBottom: '16px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--red),var(--accent))' }} />
          <div className="panel-header">
            <div className="panel-title">YENİ ARIZA KAYDI</div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
            <LocationPicker value={form.location} onChange={v => setForm(p => ({ ...p, location: v }))} />
            <div>
              <label className="form-label">Açıklama</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="form-textarea" placeholder="Arıza detayını yazın..." rows={3} />
            </div>
            <div>
              <label className="form-label">Arıza Türü</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(SPECIALTIES).map(([key, label]) => (
                  <button key={key} type="button"
                    onClick={() => setForm(previous => ({ ...previous, category: key }))}
                    className={`filter-chip${form.category === key ? ' active' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Öncelik</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => setForm(f => ({ ...f, priority: p.key }))} style={{
                    flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer',
                    border: form.priority === p.key ? `2px solid color-mix(in srgb, ${p.color} 50%, transparent)` : '1px solid var(--border)',
                    background: form.priority === p.key ? `color-mix(in srgb, ${p.color} 8%, transparent)` : 'transparent',
                    color: form.priority === p.key ? p.color : 'var(--text2)',
                    fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600, letterSpacing: '1px',
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
            <PhotoCapture value={formPhoto} onChange={setFormPhoto} label="Arıza Fotoğrafı" />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost">İPTAL</button>
              <button onClick={() => createRequest.mutate()}
                disabled={createRequest.isPending || !form.location || !form.description}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', opacity: (createRequest.isPending || !form.location || !form.description) ? 0.5 : 1 }}>
                {createRequest.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'open', label: 'AÇIK' },
          { key: 'in_progress', label: 'DEVAM EDİYOR' },
          { key: 'overdue', label: 'GECİKEN' },
          { key: 'done', label: 'TAMAMLANDI' },
          { key: 'all', label: 'TÜMÜ' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setSelectedId(null) }}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}>
            {f.label}
            {f.key === 'open' && stats?.open > 0 && (
              <span style={{
                marginLeft: '4px', background: 'var(--red)', color: '#fff',
                borderRadius: '8px', padding: '0 5px', fontSize: '8px', fontWeight: 700,
              }}>{stats.open}</span>
            )}
            {f.key === 'overdue' && stats?.overdue > 0 && (
              <span style={{
                marginLeft: '4px', background: 'var(--red)', color: '#fff',
                borderRadius: '8px', padding: '0 5px', fontSize: '8px', fontWeight: 700,
              }}>{stats.overdue}</span>
            )}
          </button>
        ))}
        <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}
          className="form-select" aria-label="Arıza türü filtresi"
          style={{ minWidth: '130px', fontSize: '10px' }}>
          <option value="all">TÜM TÜRLER</option>
          {Object.entries(SPECIALTIES).map(([key, label]) => (
            <option key={key} value={key}>{label.toUpperCase()}</option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          <button onClick={() => setViewMode('list')}
            style={{
              padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', border: 'none',
              background: viewMode === 'list' ? 'var(--accent)' : 'var(--surface2)',
              color: viewMode === 'list' ? '#fff' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
            }}>LİSTE</button>
          <button onClick={() => setViewMode('kanban')}
            style={{
              padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', border: 'none',
              background: viewMode === 'kanban' ? 'var(--accent)' : 'var(--surface2)',
              color: viewMode === 'kanban' ? '#fff' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
            }}>KANBAN</button>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Konum veya açıklama ile ara..."
          className="form-input" style={{ width: '100%', fontSize: '12px' }} />
      </div>

      {/* Request list */}
      {isLoading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚙</div>
          <div className="empty-title">ARIZA YOK</div>
          <div className="empty-sub">{filter === 'open' ? 'Açık arıza kaydı bulunmuyor' : 'Bu filtrede kayıt yok'}</div>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView requests={requests} onSelect={id => setSelectedId(selectedId === id ? null : id)} />
      ) : (
        <div className="panel">
          <div style={{ padding: '4px 16px' }}>
            {requests.map(req => {
              const pri = priInfo(req.priority)
              const si = statusInfo(req.status)
              const isSelected = selectedId === req.id
              return (
                <div key={req.id}>
                  <div className="maint-row"
                    onClick={() => setSelectedId(isSelected ? null : req.id)}
                    style={{
                      opacity: req.status === 'done' ? 0.6 : 1,
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,.08)' : 'transparent',
                      borderRadius: isSelected ? '8px' : '0',
                      padding: isSelected ? '12px 8px' : '12px 0',
                      transition: 'all .15s',
                    }}>
                    {/* Priority bar */}
                    <div style={{
                      width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0,
                      background: pri.color,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          {req.location}
                        </span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: pri.color,
                          background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${pri.color} 25%, transparent)`,
                        }}>{pri.label}</span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: si.color,
                          background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${si.color} 25%, transparent)`,
                        }}>{si.label}</span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: 'var(--blue)', background: 'rgba(52,152,219,.1)',
                          border: '1px solid rgba(52,152,219,.2)',
                        }}>{SPECIALTIES[req.category] || SPECIALTIES.genel}</span>
                        {req.request_source === 'room_qr' && <span style={{
                          fontFamily: 'var(--mono)', fontSize: '8.5px', padding: '2px 8px', borderRadius: '4px',
                          color: 'var(--teal)', background: 'rgba(26,188,156,.1)',
                          border: '1px solid rgba(26,188,156,.25)',
                        }}>ODA QR · {req.identity_mode === 'resident_pin' ? 'PIN' : 'ANONİM'}</span>}
                        {req.photo_before && <span style={{ fontSize: '11px' }} title="Fotoğraf var">📷</span>}
                        {req.sla_deadline && req.status !== 'done' && (
                          <SLACountdown deadline={req.sla_deadline} />
                        )}
                      </div>
                      <div style={{
                        fontSize: '12px', color: 'var(--text2)', marginBottom: '4px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{req.description}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{new Date(req.opened_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        <span>#{req.id}</span>
                        {req.technician_name && (
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(52,152,219,.1)', border: '1px solid rgba(52,152,219,.2)',
                            color: 'var(--blue)', fontSize: '8px',
                          }}>{req.technician_name}</span>
                        )}
                        {req.wait_reason && (
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(240,165,0,.1)', border: '1px solid rgba(240,165,0,.2)',
                            color: 'var(--amber)', fontSize: '8px',
                          }}>{req.wait_reason}</span>
                        )}
                        <StatusTimeline status={req.status} />
                      </div>
                    </div>
                    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {req.status !== 'done' && (
                        <StatusActions request={req} />
                      )}
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '16px', color: 'var(--text4)', flexShrink: 0 }}>
                        {isSelected ? '▾' : '▸'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <DetailPanel key={selectedId} requestId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
