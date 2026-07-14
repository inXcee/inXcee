import { Component, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { toastErr, toastOk } from '../shared.jsx'

const STATE_META = {
  worked: ['Calisti', 'var(--green)'],
  matched: ['Kart eslesti', 'var(--green)'],
  scanned: ['Okutma var', 'var(--blue)'],
  pending_scan: ['Okutma bekliyor', 'var(--red)'],
  review: ['Kontrol gerekli', 'var(--accent)'],
  on_leave: ['Izinli', 'var(--teal)'],
  off: ['OFF', 'var(--purple)'],
  absent: ['Devamsiz', 'var(--red)'],
  unassigned: ['Vardiya yok', 'var(--accent)'],
  unplanned_scan: ['Plansiz okutma', 'var(--red)'],
  not_due: ['Henuz gelmedi', 'var(--text3)'],
}

const ACTION_CATEGORY_LABELS = {
  card: 'Kart',
  schedule: 'Cizelge',
  coverage: 'Kapsama',
  attendance: 'Yoklama',
  request: 'Talep',
}

const RISK_LABELS = {
  missing_document: 'Eksik belge',
  consecutive_work: 'Ardışık çalışma',
  high_overtime: 'Yüksek mesai',
  low_leave_balance: 'Düşük izin bakiyesi',
  ending_report: 'Biten rapor',
}

const CANDIDATE_REASON_LABELS = {
  approved_leave: 'Onayli izin',
  time_conflict: 'Saat cakismasi',
  rest_before: 'Onceki vardiyadan dinlenme az',
  rest_after: 'Sonraki vardiyaya dinlenme az',
  already_scheduled: 'Ayni gun gorevi var',
}

const PAGE_SIZE = {
  actions: 25,
  roster: 35,
  planner: 40,
  risks: 25,
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function dateForMonth(month) {
  const today = localDate()
  return today.startsWith(`${month}-`) ? today : `${month}-01`
}

function moveDate(date, offset) {
  const parsed = new Date(`${date}T12:00:00`)
  parsed.setDate(parsed.getDate() + offset)
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

function shortDate(value) {
  if (!value) return '-'
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })
}

function clock(value) {
  if (!value) return '-'
  const raw = String(value)
  const embeddedTime = raw.match(/(?:T|\s)(\d{2}:\d{2})/) || raw.match(/^(\d{2}:\d{2})/)
  if (embeddedTime) return embeddedTime[1]
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function shiftHours(row) {
  if (row.segment_start || row.segment_end) return `${row.segment_start || '--:--'}-${row.segment_end || '--:--'}`
  if (row.start_hour == null || row.end_hour == null) return '-'
  return `${String(row.start_hour).padStart(2, '0')}:00-${String(row.end_hour).padStart(2, '0')}:00`
}

function money(value) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' TL'
}

function StatusBadge({ state }) {
  const [label, color] = STATE_META[state] || [state || 'Bilinmiyor', 'var(--text3)']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function SectionTitle({ children, count, action }) {
  return (
    <div style={{
      minHeight: 38, display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: '1px solid var(--border)', padding: '0 12px', background: 'var(--surface2)',
    }}>
      <strong style={{ fontFamily: 'var(--display)', fontSize: 11, letterSpacing: 1 }}>{children}</strong>
      {count != null && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{count}</span>}
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  )
}

function ProgressiveFooter({ shown, total, pageSize, onMore, label = 'Liste' }) {
  if (!total || shown >= total) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 8, borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>{shown} / {total} gosteriliyor</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onMore} aria-label={`${label}: daha fazla goster`}>
        {Math.min(pageSize, total - shown)} daha goster
      </button>
    </div>
  )
}

class OperationsErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  retry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ display: 'grid', justifyItems: 'start', gap: 8, padding: 16, border: '1px solid color-mix(in srgb, var(--red) 45%, var(--border))', borderRadius: 8, background: 'var(--surface)', color: 'var(--red)' }}>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 12 }}>OPERASYON EKRANI ACILAMADI</strong>
        <span style={{ color: 'var(--text2)', fontSize: 10 }}>Verilerden biri beklenmeyen bicimde geldi. Sayfayi kapatmadan tekrar deneyebilirsiniz.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={this.retry}>Tekrar dene</button>
      </div>
    )
  }
}

function MetricBand({ metrics }) {
  const items = [
    ['Aktif personel', metrics.active_staff, 'var(--text)'],
    ['Planli / calisan', `${metrics.scheduled || 0} / ${metrics.worked || 0}`, 'var(--green)'],
    ['Izinli', metrics.on_leave, 'var(--teal)'],
    ['Devamsiz', metrics.absent, metrics.absent ? 'var(--red)' : 'var(--green)'],
    ['Kart bekleyen', metrics.pending_scan, metrics.pending_scan ? 'var(--red)' : 'var(--green)'],
    ['Vardiya girilmemis', metrics.unassigned_staff, metrics.unassigned_staff ? 'var(--accent)' : 'var(--green)'],
    ['Plansiz okutma', metrics.unplanned_scans, metrics.unplanned_scans ? 'var(--red)' : 'var(--green)'],
    ['Kapsama acigi', metrics.coverage_missing, metrics.coverage_missing ? 'var(--red)' : 'var(--green)'],
    ['Bekleyen talep', (metrics.pending_leave_requests || 0) + (metrics.pending_overtime_requests || 0), 'var(--accent)'],
    ['Aylik mesai', `${Number(metrics.overtime_hours_month || 0).toLocaleString('tr-TR')} s`, 'var(--purple)'],
    ['Tahmini maliyet', money(metrics.employer_cost_month), 'var(--accent)'],
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
      border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
    }}>
      {items.map(([label, value, color], index) => (
        <div key={label} style={{ padding: '10px 12px', borderRight: index < items.length - 1 ? '1px solid var(--border)' : 0, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, color, marginTop: 4, overflowWrap: 'anywhere' }}>{value ?? 0}</div>
        </div>
      ))}
    </div>
  )
}

function RosterTable({ rows, onPersonClick }) {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE.roster)
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR')
    return rows.filter(row => {
      if (stateFilter !== 'all' && row.attendance_state !== stateFilter) return false
      if (!needle) return true
      return `${row.full_name || ''} ${row.dept_name || ''} ${row.role_name || ''} ${row.work_location_name || ''}`
        .toLocaleLowerCase('tr-TR').includes(needle)
    })
  }, [rows, search, stateFilter])
  const visibleRows = filtered.slice(0, limit)
  useEffect(() => setLimit(PAGE_SIZE.roster), [search, stateFilter, rows.length])
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        <input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Personel, rol veya nokta ara" aria-label="Gunluk personel ara" style={{ minWidth: 190, flex: 1 }} />
        <select className="form-input" value={stateFilter} onChange={event => setStateFilter(event.target.value)} aria-label="Gunluk durum filtresi" style={{ width: 150 }}>
          <option value="all">Tum durumlar</option>
          <option value="worked">Calisti</option>
          <option value="pending_scan">Kart bekleyen</option>
          <option value="review">Kontrol gerekli</option>
          <option value="on_leave">Izinli</option>
          <option value="off">OFF</option>
          <option value="absent">Devamsiz</option>
          <option value="unassigned">Vardiya yok</option>
          <option value="unplanned_scan">Plansiz okutma</option>
        </select>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 440 }}>
        <table className="data-table" style={{ minWidth: 820, fontSize: 10 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <tr>
            <th>Personel</th><th>Departman / Rol</th><th>Vardiya</th><th>Calisma noktasi</th>
            <th>Kart giris</th><th>Kart cikis</th><th>Durum</th><th style={{ textAlign: 'right' }}>FM</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => (
            <tr data-testid="operations-roster-row" key={row.schedule_id || `unassigned-${row.staff_id}`} style={{ background: ['pending_scan', 'review', 'unplanned_scan'].includes(row.attendance_state) ? 'color-mix(in srgb, var(--red) 5%, transparent)' : undefined }}>
              <td>
                <button type="button" onClick={() => onPersonClick?.(row.staff_id)} style={{ border: 0, background: 'none', color: 'var(--text)', padding: 0, cursor: 'pointer', fontWeight: 800, textAlign: 'left' }}>
                  {row.full_name}
                </button>
                <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 2 }}>{row.position || '-'}</div>
              </td>
              <td>{row.dept_name || '-'}<div style={{ color: 'var(--text3)', fontSize: 9 }}>{row.role_name || 'Rolsuz'}</div></td>
              <td><strong>{row.shift_name || '-'}</strong><div style={{ color: 'var(--text3)', fontSize: 9 }}>{shiftHours(row)}</div></td>
              <td>{row.work_location_name || 'Nokta tanimsiz'}</td>
              <td>{clock(row.actual_check_in || row.first_event_at)}</td>
              <td>{clock(row.actual_check_out || (Number(row.event_count) > 1 ? row.last_event_at : null))}</td>
              <td><StatusBadge state={row.attendance_state} />{row.open_exception_count > 0 && <div style={{ color: 'var(--red)', fontSize: 9 }}>{row.open_exception_count} istisna</div>}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(row.overtime_hours || 0) || '-'}</td>
            </tr>
          ))}
          {!filtered.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 28 }}>Filtreye uyan personel kaydi yok.</td></tr>}
        </tbody>
      </table>
      </div>
      <ProgressiveFooter shown={visibleRows.length} total={filtered.length} pageSize={PAGE_SIZE.roster} onMore={() => setLimit(current => current + PAGE_SIZE.roster)} label="Gunluk personel" />
    </div>
  )
}

function ActionCenter({ rows, onPersonClick, onResolveException, resolvingExceptionId, onCoverageRecoveryOpen }) {
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE.actions)
  const filtered = filter === 'all'
    ? rows
    : filter === 'urgent'
      ? rows.filter(row => row.severity === 'critical')
      : rows.filter(row => row.category === filter)
  const filters = [
    ['all', 'Tumu'],
    ['urgent', 'Kritik'],
    ['card', 'Kart'],
    ['schedule', 'Cizelge'],
    ['coverage', 'Kapsama'],
    ['attendance', 'Yoklama'],
    ['request', 'Talepler'],
  ]
  const visibleRows = filtered.slice(0, limit)
  useEffect(() => setLimit(PAGE_SIZE.actions), [filter, rows.length])
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {filters.map(([value, label]) => {
          const count = value === 'all'
            ? rows.length
            : value === 'urgent'
              ? rows.filter(row => row.severity === 'critical').length
              : rows.filter(row => row.category === value).length
          return (
            <button key={value} type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter(value)} aria-pressed={filter === value}
              style={{ flexShrink: 0, background: filter === value ? 'var(--surface3)' : undefined, color: filter === value ? 'var(--text)' : 'var(--text3)' }}>
              {label} <span style={{ fontFamily: 'var(--mono)', fontSize: 8 }}>{count}</span>
            </button>
          )
        })}
      </div>
      <div style={{ overflow: 'auto', maxHeight: 390 }}>
        {visibleRows.map(row => (
          <div data-testid="operations-action-row" key={row.key} style={{ display: 'grid', gridTemplateColumns: '10px 70px minmax(150px, .7fr) minmax(220px, 1.4fr) auto', gap: 9, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', minWidth: 720 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.severity === 'critical' ? 'var(--red)' : row.severity === 'warning' ? 'var(--accent)' : 'var(--blue)' }} />
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, textTransform: 'uppercase' }}>{ACTION_CATEGORY_LABELS[row.category] || row.category}</span>
            <button type="button" onClick={() => row.staff_id && onPersonClick?.(row.staff_id)} disabled={!row.staff_id}
              style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'var(--text)', cursor: row.staff_id ? 'pointer' : 'default', fontWeight: 800, fontSize: 10 }}>
              {row.title || '-'}
              {row.dept_name && <span style={{ display: 'block', color: 'var(--text3)', fontSize: 8, fontWeight: 500 }}>{row.dept_name}</span>}
            </button>
            <span style={{ color: row.severity === 'critical' ? 'var(--red)' : 'var(--text2)', fontSize: 9 }}>{row.detail}</span>
            {row.coverage_target ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCoverageRecoveryOpen?.(row.coverage_target)} aria-label={`Aday bul: ${row.title}`}>Aday bul</button>
            ) : row.can_resolve ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolveException?.(row.exception_id, 'resolved')} disabled={resolvingExceptionId === row.exception_id}>Coz</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolveException?.(row.exception_id, 'ignored')} disabled={resolvingExceptionId === row.exception_id}>Yok say</button>
              </div>
            ) : <span />}
          </div>
        ))}
        {!filtered.length && <div style={{ padding: 20, color: 'var(--green)', fontSize: 10, textAlign: 'center' }}>Bu filtrede bekleyen aksiyon yok.</div>}
      </div>
      <ProgressiveFooter shown={visibleRows.length} total={filtered.length} pageSize={PAGE_SIZE.actions} onMore={() => setLimit(current => current + PAGE_SIZE.actions)} label="Aksiyonlar" />
    </div>
  )
}

function DailyPlanner({ rows, shiftDefs, workLocations, date, onApply, onClose, isPending }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [mode, setMode] = useState('scheduled')
  const [shiftDefId, setShiftDefId] = useState('')
  const [workLocationId, setWorkLocationId] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE.planner)
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR')
    if (!needle) return rows
    return rows.filter(row => `${row.full_name || ''} ${row.dept_name || ''} ${row.role_name || ''} ${row.work_location_name || ''}`
      .toLocaleLowerCase('tr-TR').includes(needle))
  }, [rows, search])
  const displayedRows = visibleRows.slice(0, limit)
  useEffect(() => setLimit(PAGE_SIZE.planner), [search, rows.length])
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.staff_id))
  const selectedRows = rows.filter(row => selected.has(row.staff_id))
  const toggleAllVisible = () => {
    setSelected(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleRows.forEach(row => next.delete(row.staff_id))
      else visibleRows.forEach(row => next.add(row.staff_id))
      return next
    })
  }
  const toggleRow = staffId => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }
  const canApply = selectedRows.length > 0 && (mode === 'off' || shiftDefId)
  const apply = () => {
    if (!canApply) return
    onApply?.({
      staffRows: selectedRows,
      status: mode,
      shiftDefId: mode === 'scheduled' ? Number(shiftDefId) : null,
      workLocationId: mode === 'scheduled' && workLocationId ? Number(workLocationId) : null,
    })
  }
  return (
    <section style={{ border: '1px solid var(--accent)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
      <SectionTitle count={`${rows.length} vardiyasiz`} action={<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Kapat</button>}>GUNLUK TOPLU PLANLAMA · {shortDate(date).toLocaleUpperCase('tr-TR')}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'stretch' }}>
        <div style={{ minWidth: 0, borderRight: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Personel, departman, rol veya nokta ara" style={{ minWidth: 180, flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAllVisible}>{allVisibleSelected ? 'Gorunenleri birak' : 'Gorunenleri sec'}</button>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 380 }}>
            <table className="data-table" style={{ minWidth: 680, fontSize: 10 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Gorunen personelin tumunu sec" checked={allVisibleSelected} onChange={toggleAllVisible} /></th><th>Personel</th><th>Departman / Rol</th><th>Ana nokta</th><th>Kart</th></tr></thead>
              <tbody>
                {displayedRows.map(row => (
                  <tr key={row.staff_id} onClick={() => toggleRow(row.staff_id)} style={{ cursor: 'pointer', background: selected.has(row.staff_id) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}>
                    <td onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`${row.full_name} sec`} checked={selected.has(row.staff_id)} onChange={() => toggleRow(row.staff_id)} /></td>
                    <td><strong>{row.full_name}</strong><span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>{row.position || '-'}</span></td>
                    <td>{row.dept_name || '-'}<span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>{row.role_name || 'Rolsuz'}</span></td>
                    <td>{row.work_location_name || 'Nokta tanimsiz'}</td>
                    <td><StatusBadge state={row.attendance_state} /></td>
                  </tr>
                ))}
                {!visibleRows.length && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Aramaya uyan vardiyasiz personel yok.</td></tr>}
              </tbody>
            </table>
          </div>
          <ProgressiveFooter shown={displayedRows.length} total={visibleRows.length} pageSize={PAGE_SIZE.planner} onMore={() => setLimit(current => current + PAGE_SIZE.planner)} label="Planlama personeli" />
        </div>
        <div style={{ padding: 12, display: 'grid', alignContent: 'start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 5 }}>PLANLAMA MODU</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7 }}>
              {[['scheduled', 'Vardiya'], ['off', 'OFF']].map(([value, label]) => <button key={value} type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(value)} aria-pressed={mode === value} style={{ background: mode === value ? 'var(--surface)' : 'transparent', color: mode === value ? 'var(--text)' : 'var(--text3)' }}>{label}</button>)}
            </div>
          </div>
          {mode === 'scheduled' && (
            <>
              <label className="form-label">Vardiya
                <select className="form-input" value={shiftDefId} onChange={event => setShiftDefId(event.target.value)}>
                  <option value="">Vardiya secin</option>
                  {shiftDefs.map(row => <option key={row.id} value={row.id}>{row.name} · {String(row.start_hour).padStart(2, '0')}:00-{String(row.end_hour).padStart(2, '0')}:00</option>)}
                </select>
              </label>
              <label className="form-label">Calisma noktasi
                <select className="form-input" value={workLocationId} onChange={event => setWorkLocationId(event.target.value)}>
                  <option value="">Nokta secilmedi</option>
                  {workLocations.filter(row => row.is_active !== 0).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
            </>
          )}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, color: 'var(--text3)', fontSize: 9, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)', fontSize: 12 }}>{selectedRows.length}</strong> personel secili
            <br />Kayitlar {date} tarihi icin uygulanacak.
          </div>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!canApply || isPending} style={{ width: '100%', opacity: !canApply ? .55 : 1 }}>
            {isPending ? 'Uygulaniyor' : `${selectedRows.length} Personele Uygula`}
          </button>
        </div>
      </div>
    </section>
  )
}

function CoverageList({ rows, onFindCandidates, activeRuleId }) {
  const missing = rows.filter(row => Number(row.missing || 0) > 0)
  const visible = missing.length ? missing : rows
  return (
    <div style={{ display: 'grid' }}>
      {visible.map(row => (
        <div key={`${row.rule_id}-${row.work_date}`} style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 10 }}>{row.name}</strong>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{[row.work_location_name, row.role_name, `${row.start_time}-${row.end_time}`].filter(Boolean).join(' / ')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right', color: row.missing ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 800 }}>
              {row.assigned}/{row.min_staff}
              <div style={{ fontSize: 8 }}>{row.missing ? `${row.missing} eksik` : 'tam'}</div>
            </div>
            {Number(row.missing || 0) > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFindCandidates?.(row)} aria-pressed={Number(activeRuleId) === Number(row.rule_id)} aria-label={`Aday bul: ${row.name}`}>
                Aday bul
              </button>
            )}
          </div>
        </div>
      ))}
      {!visible.length && <div style={{ padding: 16, color: 'var(--text3)', fontSize: 10 }}>Aktif kapsama kurali yok.</div>}
    </div>
  )
}

function CoverageRecoveryPanel({ target, candidates, loading, error, assigningId, onAssign, onClose }) {
  const eligible = candidates.filter(row => row?.eligible && Number(row.same_day_assignments || 0) === 0)
  const blocked = candidates.filter(row => row && (!row.eligible || Number(row.same_day_assignments || 0) > 0))
  const blockedReasons = blocked.reduce((summary, row) => {
    asArray(row.reasons).forEach(reason => summary.set(reason, (summary.get(reason) || 0) + 1))
    if (Number(row.same_day_assignments || 0) > 0) summary.set('already_scheduled', (summary.get('already_scheduled') || 0) + 1)
    return summary
  }, new Map())
  return (
    <section style={{ border: '1px solid color-mix(in srgb, var(--accent) 65%, var(--border))', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
      <SectionTitle
        count={`${target.missing || 0} kisi eksik`}
        action={<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Kapat</button>}
      >KAPSAMA TAMAMLAMA</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'stretch' }}>
        <div style={{ padding: 12, borderRight: '1px solid var(--border)', display: 'grid', alignContent: 'start', gap: 10 }}>
          <div>
            <strong style={{ fontSize: 13 }}>{target.name}</strong>
            <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 4 }}>{[target.dept_name, target.role_name, target.work_location_name].filter(Boolean).join(' / ') || 'Genel kapsama'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ padding: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }}><span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>SAAT</span><strong style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{target.start_time}-{target.end_time}</strong></div>
            <div style={{ padding: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }}><span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>MEVCUT / HEDEF</span><strong style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{target.assigned}/{target.min_staff}</strong></div>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--green)' }}>{eligible.length} uygun</strong> / {blocked.length} engelli aday
            {[...blockedReasons.entries()].map(([reason, count]) => (
              <span key={reason} style={{ display: 'block' }}>{CANDIDATE_REASON_LABELS[reason] || reason}: {count}</span>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {loading && <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center', fontSize: 10 }}>Uygun personel hesaplaniyor.</div>}
          {error && <div role="alert" style={{ padding: 14, color: 'var(--red)', fontSize: 10 }}>{error}</div>}
          {!loading && !error && eligible.slice(0, 8).map(candidate => {
            const roleMatch = !target.role_id || Number(candidate.role_id) === Number(target.role_id)
            const locationMatch = !target.work_location_id || Number(candidate.primary_work_location_id) === Number(target.work_location_id)
            return (
              <div key={candidate.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 150, flex: '1 1 180px' }}>
                  <strong style={{ fontSize: 10 }}>{candidate.full_name}</strong>
                  <span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>{candidate.dept_name || '-'} / {candidate.role_name || 'Rolsuz'}</span>
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 8, lineHeight: 1.55, minWidth: 160, flex: '1 1 200px' }}>
                  <span style={{ color: roleMatch ? 'var(--green)' : 'var(--accent)', marginRight: 8 }}>{roleMatch ? 'Rol uyumlu' : 'Gecici rol'}</span>
                  <span style={{ color: locationMatch ? 'var(--green)' : 'var(--accent)' }}>{locationMatch ? 'Nokta uyumlu' : 'Farkli nokta'}</span>
                  <span style={{ display: 'block' }}>{candidate.workload || 0} gorev / 7 gun{candidate.rest_before_hours != null ? ` / once ${candidate.rest_before_hours}s dinlenme` : ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginLeft: 'auto' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{candidate.score} puan</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign?.(candidate)} disabled={assigningId != null} aria-label={`Goreve ata: ${candidate.full_name}`}>
                    {Number(assigningId) === Number(candidate.id) ? 'Ataniyor' : 'Goreve ata'}
                  </button>
                </div>
              </div>
            )
          })}
          {!loading && !error && !eligible.length && <div style={{ padding: 24, color: 'var(--red)', textAlign: 'center', fontSize: 10 }}>Izin, cakisma ve dinlenme kontrollerini gecen uygun personel bulunamadi.</div>}
          {!loading && eligible.length > 8 && <div style={{ padding: 8, textAlign: 'center', color: 'var(--text3)', fontSize: 9 }}>En uygun 8 aday gosteriliyor / toplam {eligible.length}</div>}
        </div>
      </div>
    </section>
  )
}

function RequestList({ leaves, overtime, onPersonClick }) {
  const rows = [
    ...leaves.map(row => ({ ...row, kind: 'Izin', date: `${row.start_date} - ${row.end_date}`, detail: row.leave_type })),
    ...overtime.map(row => ({ ...row, kind: 'Mesai', date: row.work_date, detail: `${row.requested_hours || 0} saat` })),
  ].slice(0, 12)
  return (
    <div style={{ display: 'grid' }}>
      {rows.map(row => (
        <button key={`${row.kind}-${row.id}`} type="button" onClick={() => onPersonClick?.(row.staff_id)} style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 8 }}>
          <span style={{ color: row.kind === 'Izin' ? 'var(--teal)' : 'var(--purple)', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 800 }}>{row.kind}</span>
          <span style={{ minWidth: 0 }}><strong style={{ fontSize: 10 }}>{row.full_name}</strong><span style={{ display: 'block', color: 'var(--text3)', fontSize: 9 }}>{row.dept_name || '-'} / {row.detail}</span></span>
          <span style={{ color: 'var(--text3)', fontSize: 9, whiteSpace: 'nowrap' }}>{row.date}</span>
        </button>
      ))}
      {!rows.length && <div style={{ padding: 16, color: 'var(--text3)', fontSize: 10 }}>Bekleyen izin veya mesai talebi yok.</div>}
    </div>
  )
}

function RiskList({ rows, onPersonClick }) {
  const [limit, setLimit] = useState(PAGE_SIZE.risks)
  const visibleRows = rows.slice(0, limit)
  useEffect(() => setLimit(PAGE_SIZE.risks), [rows.length])
  return (
    <div>
      <div style={{ overflow: 'auto', maxHeight: 300 }}>
      {visibleRows.map((row, index) => (
        <button key={`${row.type}-${row.staff_id || index}-${row.value}`} type="button" onClick={() => row.staff_id && onPersonClick?.(row.staff_id)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '10px 120px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', padding: '8px 12px', textAlign: 'left', cursor: row.staff_id ? 'pointer' : 'default' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.severity === 'critical' ? 'var(--red)' : row.severity === 'warning' ? 'var(--accent)' : 'var(--blue)' }} />
          <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>{RISK_LABELS[row.type] || row.type}</span>
          <span style={{ minWidth: 0 }}><strong style={{ fontSize: 10 }}>{row.full_name || '-'}</strong><span style={{ color: 'var(--text3)', marginLeft: 7, fontSize: 9 }}>{row.dept_name || ''}</span></span>
          <span style={{ color: row.severity === 'critical' ? 'var(--red)' : 'var(--text2)', fontSize: 9, whiteSpace: 'nowrap' }}>{row.message}</span>
        </button>
      ))}
      {!rows.length && <div style={{ padding: 16, color: 'var(--green)', fontSize: 10 }}>Aylik risk uyarisi yok.</div>}
      </div>
      <ProgressiveFooter shown={visibleRows.length} total={rows.length} pageSize={PAGE_SIZE.risks} onMore={() => setLimit(current => current + PAGE_SIZE.risks)} label="Riskler" />
    </div>
  )
}

function TrendTable({ rows, selectedDate, onSelectDate }) {
  const dueRows = rows.filter(row => !row.not_due || row.scheduled > 0)
  const maxScheduled = Math.max(1, ...dueRows.map(row => Number(row.scheduled || 0)))
  return (
    <div style={{ overflow: 'auto', maxHeight: 360 }}>
      <table className="data-table" style={{ minWidth: 760, fontSize: 10 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}><tr><th>Tarih</th><th>Doluluk</th><th style={{ textAlign: 'right' }}>Planli</th><th style={{ textAlign: 'right' }}>Calisti</th><th style={{ textAlign: 'right' }}>Izin</th><th style={{ textAlign: 'right' }}>YOK</th><th style={{ textAlign: 'right' }}>FM</th><th style={{ textAlign: 'right' }}>Kart</th><th style={{ textAlign: 'right' }}>Eksik</th></tr></thead>
        <tbody>
          {dueRows.map(row => (
            <tr key={row.date} onClick={() => onSelectDate(row.date)} style={{ cursor: 'pointer', background: row.date === selectedDate ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}>
              <td><strong>{shortDate(row.date)}</strong></td>
              <td><div style={{ height: 7, width: '100%', minWidth: 100, background: 'var(--surface2)', border: '1px solid var(--border)' }}><div style={{ width: `${Math.round((Number(row.scheduled || 0) / maxScheduled) * 100)}%`, height: '100%', background: row.coverage_missing ? 'var(--accent)' : 'var(--green)' }} /></div></td>
              <td style={{ textAlign: 'right' }}>{row.scheduled}</td><td style={{ textAlign: 'right' }}>{row.worked}</td><td style={{ textAlign: 'right' }}>{row.on_leave}</td>
              <td style={{ textAlign: 'right', color: row.absent ? 'var(--red)' : undefined }}>{row.absent}</td><td style={{ textAlign: 'right' }}>{row.overtime_hours}</td>
              <td style={{ textAlign: 'right', color: row.open_exceptions ? 'var(--red)' : undefined }}>{row.open_exceptions}</td><td style={{ textAlign: 'right', color: row.coverage_missing ? 'var(--red)' : undefined }}>{row.coverage_missing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BreakdownTable({ rows, showCost = false }) {
  return (
    <div style={{ overflow: 'auto', maxHeight: 270 }}>
      <table className="data-table" style={{ minWidth: showCost ? 580 : 430, fontSize: 9 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}><tr><th>Grup</th><th style={{ textAlign: 'right' }}>Kisi</th><th style={{ textAlign: 'right' }}>Gun</th><th style={{ textAlign: 'right' }}>Calisti</th><th style={{ textAlign: 'right' }}>Izin</th><th style={{ textAlign: 'right' }}>YOK</th>{showCost && <><th style={{ textAlign: 'right' }}>FM</th><th style={{ textAlign: 'right' }}>Maliyet</th></>}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={`${row.dimension}-${row.dimension_id ?? row.name}`}><td><strong>{row.name}</strong></td><td style={{ textAlign: 'right' }}>{row.staff_count}</td><td style={{ textAlign: 'right' }}>{row.person_days}</td><td style={{ textAlign: 'right' }}>{row.worked_days}</td><td style={{ textAlign: 'right' }}>{row.leave_days}</td><td style={{ textAlign: 'right', color: row.absent_days ? 'var(--red)' : undefined }}>{row.absent_days}</td>{showCost && <><td style={{ textAlign: 'right' }}>{row.overtime_hours || 0}</td><td style={{ textAlign: 'right' }}>{money(row.employer_total_cost)}</td></>}</tr>)}
          {!rows.length && <tr><td colSpan={showCost ? 8 : 6} style={{ color: 'var(--text3)', textAlign: 'center', padding: 16 }}>Kayit yok.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function PuantajOperationsContent({
  payload, selectedDate, onSelectedDate, onPersonClick,
  onResolveException, resolvingExceptionId,
  plannerOpen, onPlannerOpen, onPlannerClose, onApplyPlan,
  planning, shiftDefs = [], workLocations = [],
  coverageRecovery, onCoverageRecoveryOpen, onCoverageRecoveryClose, onCoverageCandidateAssign,
}) {
  const metrics = payload?.metrics || {}
  const roster = asArray(payload?.roster)
  const unassignedStaff = asArray(payload?.unassigned_staff)
  const dailyRows = [...roster, ...unassignedStaff]
  const pending = payload?.pending || { leaves: [], overtime: [] }
  const breakdowns = payload?.breakdowns || { departments: [], roles: [], locations: [] }
  const actions = asArray(payload?.actions)
  const coverage = asArray(payload?.coverage)
  const coverageByActionKey = new Map(coverage.map(row => [`coverage:${row.rule_id}:${row.work_date}`, row]))
  const actionRows = actions.map(row => ({ ...row, coverage_target: coverageByActionKey.get(row.key) || null }))
  const dutyManagers = asArray(payload?.duty_managers)
  const risks = asArray(payload?.risks)
  const trends = asArray(payload?.trends)
  const pendingLeaves = asArray(pending.leaves)
  const pendingOvertime = asArray(pending.overtime)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <MetricBand metrics={metrics} />

      <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
        <SectionTitle count={`${payload?.action_summary?.by_severity?.critical || 0} kritik / ${actions.length} toplam`}>AKSIYON MERKEZI</SectionTitle>
        <ActionCenter
          rows={actionRows}
          onPersonClick={onPersonClick}
          onResolveException={onResolveException}
          resolvingExceptionId={resolvingExceptionId}
          onCoverageRecoveryOpen={onCoverageRecoveryOpen}
        />
      </section>

      {coverageRecovery?.target && (
        <CoverageRecoveryPanel
          {...coverageRecovery}
          onAssign={onCoverageCandidateAssign}
          onClose={onCoverageRecoveryClose}
        />
      )}

      {plannerOpen && (
        <DailyPlanner
          rows={unassignedStaff}
          shiftDefs={shiftDefs}
          workLocations={workLocations}
          date={selectedDate}
          onApply={onApplyPlan}
          onClose={onPlannerClose}
          isPending={planning}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 12, alignItems: 'start' }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
          <SectionTitle count={`${dailyRows.length} kisi · ${unassignedStaff.length} vardiyasiz`} action={unassignedStaff.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onPlannerOpen}>Vardiyasizlari planla</button>}>GUNLUK PERSONEL AKISI</SectionTitle>
          <RosterTable rows={dailyRows} onPersonClick={onPersonClick} />
        </section>
        <div style={{ display: 'grid', gap: 12 }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
            <SectionTitle count={`${metrics.coverage_missing || 0} eksik`}>KAPSAMA</SectionTitle>
            <CoverageList rows={coverage} onFindCandidates={onCoverageRecoveryOpen} activeRuleId={coverageRecovery?.target?.rule_id} />
          </section>
          <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
            <SectionTitle count={pendingLeaves.length + pendingOvertime.length}>BEKLEYEN TALEPLER</SectionTitle>
            <RequestList leaves={pendingLeaves} overtime={pendingOvertime} onPersonClick={onPersonClick} />
          </section>
          <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
            <SectionTitle count={dutyManagers.length}>GOREVLI AMIR</SectionTitle>
            {dutyManagers.map(row => <button key={row.staff_id} type="button" className="btn btn-ghost btn-sm" onClick={() => onPersonClick?.(row.staff_id)} style={{ width: '100%', border: 0, borderBottom: '1px solid var(--border)', borderRadius: 0, justifyContent: 'space-between' }}><span>{row.full_name}</span><span style={{ color: 'var(--text3)' }}>{row.shift_name || row.role_name || '-'}</span></button>)}
            {!dutyManagers.length && <div style={{ padding: 16, color: 'var(--accent)', fontSize: 10 }}>Bu gun icin amir atamasi bulunamadi.</div>}
          </section>
        </div>
      </div>

      <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
        <SectionTitle count={risks.length}>AYLIK RISK VE UYARI KUYRUGU</SectionTitle>
        <RiskList rows={risks} onPersonClick={onPersonClick} />
      </section>

      <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
        <SectionTitle>GUN GUN OPERASYON TRENDI</SectionTitle>
        <TrendTable rows={trends} selectedDate={selectedDate} onSelectDate={onSelectedDate} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12, alignItems: 'start' }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}><SectionTitle>DEPARTMAN / MALIYET</SectionTitle><BreakdownTable rows={asArray(breakdowns.departments)} showCost /></section>
        <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}><SectionTitle>ROL KIRILIMI</SectionTitle><BreakdownTable rows={asArray(breakdowns.roles)} /></section>
        <section style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}><SectionTitle>LOKAL / NOKTA KIRILIMI</SectionTitle><BreakdownTable rows={asArray(breakdowns.locations)} /></section>
      </div>
    </div>
  )
}

export default function PuantajOperationsView({ month, deptFilter, onPersonClick, shiftDefs = [] }) {
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(() => dateForMonth(month))
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [coverageTarget, setCoverageTarget] = useState(null)
  useEffect(() => {
    if (!selectedDate.startsWith(`${month}-`)) setSelectedDate(dateForMonth(month))
  }, [month, selectedDate])
  useEffect(() => {
    setPlannerOpen(false)
    setCoverageTarget(null)
  }, [selectedDate])

  const params = useMemo(() => ({
    month,
    date: selectedDate,
    ...(deptFilter ? { dept_id: deptFilter } : {}),
  }), [month, selectedDate, deptFilter])
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['shifts-operations-dashboard', month, selectedDate, deptFilter],
    queryFn: () => api.get('/shifts/operations/dashboard', { params }).then(response => response.data),
  })
  const { data: workLocations = [] } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(response => response.data),
  })
  const candidateParams = useMemo(() => ({
    date: selectedDate,
    dept_id: coverageTarget?.dept_id || undefined,
    role_id: coverageTarget?.role_id || undefined,
    work_location_id: coverageTarget?.work_location_id || undefined,
    shift_def_id: coverageTarget?.shift_def_id || undefined,
    start_time: coverageTarget?.start_time || undefined,
    end_time: coverageTarget?.end_time || undefined,
  }), [selectedDate, coverageTarget])
  const { data: candidateData, isFetching: candidatesLoading, error: candidatesError } = useQuery({
    queryKey: ['schedule-candidates', 'operations', candidateParams],
    queryFn: () => api.get('/shifts/schedule/candidates', { params: candidateParams }).then(response => response.data),
    enabled: !!coverageTarget,
  })
  const refreshOperations = () => {
    qc.invalidateQueries({ queryKey: ['shifts-operations-dashboard'] })
    qc.invalidateQueries({ queryKey: ['attendance-exceptions'] })
    qc.invalidateQueries({ queryKey: ['puantaj'] })
    qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
    qc.invalidateQueries({ queryKey: ['schedule'] })
    qc.invalidateQueries({ queryKey: ['shift-coverage'] })
    qc.invalidateQueries({ queryKey: ['schedule-candidates'] })
  }
  const reconcileMutation = useMutation({
    mutationFn: () => api.post('/shifts/attendance/reconcile', { date: selectedDate }),
    onSuccess: response => {
      refreshOperations()
      toastOk(`${response.data.processed} personel uzlastirildi · ${response.data.exceptions} kontrol kaydi`)
    },
    onError: toastErr,
  })
  const resolveExceptionMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/shifts/attendance/exceptions/${id}`, {
      status,
      note: 'Gunluk operasyon merkezinden guncellendi',
    }),
    onSuccess: () => {
      refreshOperations()
      toastOk('Kart istisnasi guncellendi')
    },
    onError: toastErr,
  })
  const planMutation = useMutation({
    mutationFn: plan => api.post('/shifts/schedule', {
      entries: plan.staffRows.map(row => ({
        staff_id: row.staff_id,
        dept_id: row.dept_id || null,
        work_date: selectedDate,
        status: plan.status,
        shift_def_id: plan.status === 'scheduled' ? plan.shiftDefId : null,
        work_location_id: plan.status === 'scheduled' ? plan.workLocationId : null,
        expected_version: 0,
      })),
    }),
    onSuccess: response => {
      setPlannerOpen(false)
      refreshOperations()
      qc.invalidateQueries({ queryKey: ['schedule'] })
      toastOk(`${response.data.rows?.length || 0} personelin gunluk plani kaydedildi`)
    },
    onError: toastErr,
  })
  const coverageAssignMutation = useMutation({
    mutationFn: candidate => api.post('/shifts/schedule/segments', {
      staff_id: candidate.id,
      dept_id: coverageTarget?.dept_id || candidate.dept_id || null,
      work_date: selectedDate,
      shift_def_id: coverageTarget?.shift_def_id || null,
      role_id: coverageTarget?.role_id || candidate.role_id || null,
      work_location_id: coverageTarget?.work_location_id || candidate.primary_work_location_id || null,
      start_time: coverageTarget?.start_time,
      end_time: coverageTarget?.end_time,
      break_minutes: 0,
      note: `Operasyon kapsama tamamlama: ${coverageTarget?.name || 'Kapsama kurali'}`,
    }),
    onSuccess: (_response, candidate) => {
      refreshOperations()
      setCoverageTarget(current => {
        if (!current) return null
        const remaining = Math.max(0, Number(current.missing || 0) - 1)
        if (!remaining) return null
        return { ...current, missing: remaining, assigned: Number(current.assigned || 0) + 1 }
      })
      toastOk(`${candidate.full_name} kapsama gorevine atandi`)
    },
    onError: toastErr,
  })

  const changeDate = (next) => {
    if (next.startsWith(`${month}-`)) setSelectedDate(next)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeDate(moveDate(selectedDate, -1))} aria-label="Onceki gun">&#8592;</button>
        <input type="date" className="form-input" value={selectedDate} min={`${month}-01`} max={`${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`} onChange={event => changeDate(event.target.value)} style={{ width: 150, fontSize: 11 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeDate(moveDate(selectedDate, 1))} aria-label="Sonraki gun">&#8594;</button>
        {localDate().startsWith(`${month}-`) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(localDate())}>Bugun</button>}
        <strong style={{ marginLeft: 6, fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 1 }}>{shortDate(selectedDate).toLocaleUpperCase('tr-TR')}</strong>
        <span style={{ marginLeft: 'auto', color: isFetching ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>{isFetching ? 'GUNCELLENIYOR' : `SON KONTROL ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending || isFetching}>
          {reconcileMutation.isPending ? 'Uzlastiriliyor' : 'Gunu uzlastir'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>Yenile</button>
      </div>

      {isLoading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Operasyon verileri yukleniyor.</div>}
      {error && <div style={{ padding: 14, border: '1px solid color-mix(in srgb, var(--red) 45%, var(--border))', color: 'var(--red)', borderRadius: 8 }}>{error.response?.data?.error || error.message}</div>}
      {data && (
        <OperationsErrorBoundary resetKey={`${month}:${selectedDate}:${deptFilter}:${data?.generated_at || ''}`} onRetry={() => refetch()}>
          <PuantajOperationsContent
            payload={data}
            selectedDate={selectedDate}
            onSelectedDate={setSelectedDate}
            onPersonClick={onPersonClick}
            onResolveException={(id, status) => resolveExceptionMutation.mutate({ id, status })}
            resolvingExceptionId={resolveExceptionMutation.isPending ? resolveExceptionMutation.variables?.id : null}
            plannerOpen={plannerOpen}
            onPlannerOpen={() => setPlannerOpen(true)}
            onPlannerClose={() => setPlannerOpen(false)}
            onApplyPlan={plan => planMutation.mutate(plan)}
            planning={planMutation.isPending}
            shiftDefs={asArray(shiftDefs)}
            workLocations={asArray(workLocations)}
            coverageRecovery={{
              target: coverageTarget,
              candidates: asArray(candidateData?.candidates),
              loading: candidatesLoading,
              error: candidatesError ? (candidatesError.response?.data?.error || candidatesError.message) : '',
              assigningId: coverageAssignMutation.isPending ? coverageAssignMutation.variables?.id : null,
            }}
            onCoverageRecoveryOpen={setCoverageTarget}
            onCoverageRecoveryClose={() => setCoverageTarget(null)}
            onCoverageCandidateAssign={candidate => coverageAssignMutation.mutate(candidate)}
          />
        </OperationsErrorBoundary>
      )}
    </div>
  )
}
