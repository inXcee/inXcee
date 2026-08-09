import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useDebounce } from '../../shared/hooks/useDebounce.js'

const METRIC_LABELS = {
  active: 'Aktif personel', offboarding: 'Çıkış sürecindeki personel', exited: 'İşten çıkanlar',
  hired: 'Yeni başlayanlar', transfer: 'Kalıcı transferler', temporary_work: 'Geçici proje çalışmaları',
  shift_change: 'Vardiya revizyonları', leave: 'İzin ve raporlar', overtime: 'Fazla mesai',
  absence: 'Devamsızlıklar', open_alerts: 'Açık aksiyonlar', overdue_critical: 'Gecikmiş / kritik aksiyonlar',
  people: 'Personel dağılımı', movement: 'Aylık hareketler',
}

const STATUS_LABELS = {
  active: 'Aktif', offboarding: 'Çıkış sürecinde', exited: 'İşten çıktı', approved: 'Onaylı',
  pending: 'Bekleyen', rejected: 'Reddedilen', returned: 'İade edilen', recorded: 'Kayıtlı',
  absent: 'Devamsız', open: 'Açık', acknowledged: 'Görüldü', resolved: 'Çözüldü',
}

const SUBTYPE_LABELS = {
  annual: 'Yıllık izin', sick: 'Rapor', other: 'Diğer izin', critical: 'Kritik',
  warning: 'Uyarı', info: 'Bilgi', assignment_changed: 'Atama değişikliği',
  shift_changed: 'Vardiya değişikliği', employment_ended: 'İşten çıkış', recorded: 'Kayıtlı',
}

const UNIT_LABELS = { person: 'kişi', record: 'kayıt', day: 'gün', hour: 'saat', action: 'aksiyon' }

const STATUS_OPTIONS = {
  leave: [['approved', 'Onaylı'], ['pending', 'Bekleyen'], ['rejected', 'Reddedilen']],
  overtime: [['recorded', 'Kayıtlı'], ['pending', 'Bekleyen'], ['approved', 'Onaylı'], ['rejected', 'Reddedilen'], ['returned', 'İade']],
}

function number(value, digits = 1) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

function date(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('tr-TR')
}

function dateRange(item) {
  const start = date(item.occurred_at || item.last_occurred_at)
  if (!item.end_at || String(item.end_at).slice(0, 10) === String(item.occurred_at).slice(0, 10)) return start
  return `${start} – ${date(item.end_at)}`
}

function quantity(item) {
  if (item.day_total || item.hour_total) {
    return [item.day_total ? `${number(item.day_total)} gün` : null, item.hour_total ? `${number(item.hour_total)} saat` : null]
      .filter(Boolean).join(' · ') || `${number(item.total_quantity)} kayıt`
  }
  return `${number(item.quantity)} ${UNIT_LABELS[item.unit] || item.unit || 'kayıt'}`
}

function compactChange(value) {
  if (!value) return '—'
  if (typeof value !== 'object') return String(value)
  return Object.entries(value).map(([key, item]) => `${key}: ${item ?? '—'}`).join(' · ')
}

function firstFocusable(container) {
  return container?.querySelector('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
}

function useFocusTrap(panelRef, onClose) {
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    firstFocusable(panel)?.focus()
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, panelRef])
}

function Summary({ summary }) {
  const cards = [
    ['Ana toplam', `${number(summary.primary_value)} ${UNIT_LABELS[summary.primary_unit] || summary.primary_unit || ''}`],
    ['Kişi', number(summary.people_count, 0)], ['Kayıt', number(summary.record_count, 0)],
    summary.day_total ? ['Gün', number(summary.day_total)] : null,
    summary.hour_total ? ['Saat', number(summary.hour_total)] : null,
    summary.undated_count ? ['Tarihsiz eski kayıt', number(summary.undated_count, 0)] : null,
  ].filter(Boolean)
  return <div className="tracking-drilldown__summary">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function Breakdowns({ breakdowns }) {
  const groups = [
    ['Durum', breakdowns.status], ['Tür', breakdowns.subtype], ['Proje', breakdowns.project], ['Departman', breakdowns.department],
  ].filter(([, items]) => items?.length)
  if (!groups.length) return null
  return <div className="tracking-drilldown__breakdowns">{groups.map(([label, items]) => (
    <div key={label}><b>{label}</b><span>{items.slice(0, 6).map(item => (
      <em key={`${label}-${item.key ?? item.label}`}>{STATUS_LABELS[item.key] || SUBTYPE_LABELS[item.key] || item.key || item.label || 'Belirsiz'} <strong>{number(item.value ?? item.count, 0)}</strong></em>
    ))}</span></div>
  ))}</div>
}

function PersonActions({ item, onPersonClick }) {
  return <div className="tracking-drilldown__actions">
    <button type="button" className="btn btn-ghost btn-xs" onClick={() => onPersonClick?.(item.staff_id)}>Hızlı Kart</button>
    <Link className="btn btn-primary btn-xs" to={`/shifts/personnel/${item.staff_id}?tab=work`}>Tam Dosya</Link>
  </div>
}

function PeopleTable({ items, onPersonClick }) {
  return <div className="tracking-drilldown__table-wrap"><table className="data-table tracking-drilldown__table"><thead><tr>
    <th>PERSONEL</th><th>PROJE / DEPARTMAN</th><th>KAYIT</th><th>TOPLAM</th><th>SON TARİH</th><th>DURUM</th><th>İŞLEMLER</th>
  </tr></thead><tbody>{items.map(item => <tr key={item.staff_id}>
    <td><strong>{item.full_name}</strong><small>{item.position || 'Pozisyon belirtilmemiş'}</small></td>
    <td>{item.project_name || 'Proje yok'}<small>{item.department_name || 'Departman yok'}</small></td>
    <td>{number(item.record_count, 0)}</td><td>{quantity(item)}</td><td>{date(item.last_occurred_at)}</td>
    <td><span className={`tracking-status tracking-status--${item.employment_status || item.status}`}>{STATUS_LABELS[item.status] || STATUS_LABELS[item.employment_status] || item.status || '—'}</span></td>
    <td><PersonActions item={item} onPersonClick={onPersonClick} /></td>
  </tr>)}</tbody></table></div>
}

function RecordsTable({ items, onPersonClick }) {
  return <div className="tracking-drilldown__table-wrap"><table className="data-table tracking-drilldown__table tracking-drilldown__table--records"><thead><tr>
    <th>PERSONEL</th><th>TARİH</th><th>TÜR / DURUM</th><th>MİKTAR</th><th>PROJE / DEPARTMAN</th><th>NEDEN / İŞLEM</th><th>İŞLEMLER</th>
  </tr></thead><tbody>{items.map(item => <tr key={`${item.source_type}-${item.record_id}`}>
    <td><strong>{item.full_name}</strong><small>{item.position || 'Pozisyon belirtilmemiş'}</small></td>
    <td>{dateRange(item)}</td><td>{SUBTYPE_LABELS[item.subtype] || item.subtype || item.metric_type || '—'}<small>{STATUS_LABELS[item.status] || item.status || '—'}</small></td>
    <td>{quantity(item)}</td><td>{item.work_project_name || item.project_name || 'Proje yok'}<small>{item.work_location_name || item.department_name || 'Departman / nokta yok'}</small></td>
    <td>{item.reason || 'Gerekçe yok'}<small>{item.actor_name ? `İşlemi yapan / onaylayan: ${item.actor_name}` : 'İşlem yapan bilgisi yok'}</small>
      {(item.before || item.after) && <small className="tracking-drilldown__change">{compactChange(item.before)} → {compactChange(item.after)}</small>}</td>
    <td><PersonActions item={item} onPersonClick={onPersonClick} /></td>
  </tr>)}</tbody></table></div>
}

export default function PersonnelTrackingDrilldown({ metric, baseFilters, onClose, onPersonClick }) {
  const [params, setParams] = useSearchParams()
  const panelRef = useRef(null)
  const titleId = useId()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const view = params.get('metric_view') === 'records' ? 'records' : 'people'
  const page = Math.max(1, Number(params.get('metric_page')) || 1)
  const recordStatus = params.get('metric_status') || (metric === 'leave' ? 'approved' : metric === 'overtime' ? 'recorded' : '')
  const sort = params.get('metric_sort') || (view === 'people' ? 'full_name' : 'occurred_at')
  const order = params.get('metric_order') || (view === 'people' ? 'asc' : 'desc')

  const patchParams = changes => setParams(previous => {
    const next = new URLSearchParams(previous)
    Object.entries(changes).forEach(([key, value]) => value == null || value === '' ? next.delete(key) : next.set(key, String(value)))
    return next
  }, { replace: true })

  const request = useMemo(() => ({
    ...baseFilters, metric, view, page, limit: 50, sort, order,
    ...(params.get('staff_id') ? { staff_id: params.get('staff_id') } : {}),
    ...(params.get('bucket') ? { bucket: params.get('bucket') } : {}),
    ...(recordStatus ? { record_status: recordStatus } : {}),
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
  }), [baseFilters, debouncedSearch, metric, order, page, params, recordStatus, sort, view])

  const query = useQuery({
    queryKey: ['personnel-tracking-drilldown', request],
    queryFn: () => api.get('/personnel/tracking/drilldown', { params: request }).then(response => response.data),
    enabled: Boolean(metric),
  })
  useFocusTrap(panelRef, onClose)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const data = query.data
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / Number(data?.limit || 50)))
  const statusOptions = STATUS_OPTIONS[metric] || []
  const periodText = data?.scope === 'current' ? 'Bugünkü durum' : `${data?.period?.from || baseFilters.from} – ${data?.period?.to || baseFilters.to}`

  return <div className="tracking-drilldown" aria-hidden="false">
    <div className="tracking-drilldown__backdrop" aria-hidden="true" onClick={onClose} />
    <aside id="personnel-tracking-drilldown" ref={panelRef} className="tracking-drilldown__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="tracking-drilldown__header">
        <div><span>PERSONEL TAKİP DETAYI</span><h2 id={titleId}>{METRIC_LABELS[metric] || 'Metrik ayrıntısı'}</h2><p>{data?.definition || 'Kişi ve ham kayıt ayrıntıları yükleniyor.'}</p></div>
        <button type="button" className="tracking-drilldown__close" aria-label="Detay panelini kapat" onClick={onClose}>×</button>
      </header>

      <div className="tracking-drilldown__scope"><strong>{periodText}</strong><span>Üstteki proje, departman, durum ve tarih filtreleri bu ayrıntıya aynen uygulanır.</span></div>

      {query.isLoading && <div className="tracking-drilldown__loading" role="status"><i /><span>Kişiler ve kayıtlar hazırlanıyor…</span></div>}
      {query.isError && <div className="tracking-drilldown__error" role="alert"><strong>Detaylar alınamadı.</strong><span>{query.error?.response?.data?.error || query.error?.message || 'Beklenmeyen bir hata oluştu.'}</span><button type="button" className="btn btn-primary btn-sm" onClick={() => query.refetch()}>Yeniden dene</button></div>}

      {data && <>
        <Summary summary={data.summary || {}} />
        <div className="tracking-drilldown__toolbar">
          <div className="tracking-drilldown__tabs" role="tablist" aria-label="Detay görünümü">
            <button type="button" role="tab" aria-selected={view === 'people'} onClick={() => patchParams({ metric_view: 'people', metric_page: 1, metric_sort: null, metric_order: null })}>Kişiler <b>{number(data.summary?.people_count, 0)}</b></button>
            <button type="button" role="tab" aria-selected={view === 'records'} onClick={() => patchParams({ metric_view: 'records', metric_page: 1, metric_sort: null, metric_order: null })}>Kayıtlar <b>{number(data.summary?.record_count, 0)}</b></button>
          </div>
          <input className="form-input" aria-label="Panel içinde personel ara" value={search} onChange={event => setSearch(event.target.value)} placeholder="Bu detayda personel ara" />
        </div>

        {statusOptions.length > 0 && <div className="tracking-drilldown__statuses" aria-label="Kayıt durumu">
          {statusOptions.map(([key, label]) => <button key={key} type="button" aria-pressed={recordStatus === key} onClick={() => patchParams({ metric_status: key, metric_page: 1 })}>{label}</button>)}
        </div>}
        <Breakdowns breakdowns={data.breakdowns || {}} />

        <div className="tracking-drilldown__sort">
          <span>{number(data.total, 0)} sonuç</span>
          <label>Sırala<select className="form-select" value={sort} onChange={event => patchParams({ metric_sort: event.target.value, metric_page: 1 })}>
            <option value="full_name">Personel</option><option value="occurred_at">Tarih</option>
            <option value={view === 'people' ? 'record_count' : 'quantity'}>{view === 'people' ? 'Kayıt sayısı' : 'Miktar'}</option>
            <option value="project_name">Proje</option><option value="department_name">Departman</option><option value="status">Durum</option>
          </select></label>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => patchParams({ metric_order: order === 'asc' ? 'desc' : 'asc', metric_page: 1 })}>{order === 'asc' ? 'Artan ↑' : 'Azalan ↓'}</button>
        </div>

        {data.items?.length > 0 ? (view === 'people' ? <PeopleTable items={data.items} onPersonClick={onPersonClick} /> : <RecordsTable items={data.items} onPersonClick={onPersonClick} />) : (
          <div className="tracking-drilldown__empty"><strong>Bu kapsamda kayıt yok.</strong><span>Sıfır değeri de doğrulanabilir kılmak için panel açık tutuldu. Dönemi veya filtreleri değiştirebilirsiniz.</span></div>
        )}

        <footer className="tracking-drilldown__footer">
          <span>Sayfa {page} / {totalPages}</span><div><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => patchParams({ metric_page: page - 1 })}>Önceki</button><button type="button" className="btn btn-primary btn-sm" disabled={page >= totalPages} onClick={() => patchParams({ metric_page: page + 1 })}>Sonraki</button></div>
        </footer>
      </>}
    </aside>
  </div>
}
