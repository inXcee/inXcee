import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import { todayStr } from './shared.jsx'
import SetupWizard from './SetupWizard.jsx'
import LinesTab from './tabs/LinesTab.jsx'
import PlanningTab from './tabs/PlanningTab.jsx'
import ResourcesTab from './tabs/ResourcesTab.jsx'
import PeopleTab from './tabs/PeopleTab.jsx'
import ReportsTab from './tabs/ReportsTab.jsx'
import DailyTab from './tabs/DailyTab.jsx'

const TABS = [
  { key: 'operation', label: 'OPERASYON', icon: '🚌', description: 'Bugünün seferleri' },
  { key: 'planning', label: 'PLANLAMA', icon: '📅', description: 'Öner ve yayınla' },
  { key: 'lines', label: 'HATLAR', icon: '🛣️', description: 'Rota, durak, harita' },
  { key: 'resources', label: 'KAYNAKLAR', icon: '🚐', description: 'Araç ve şoförler' },
  { key: 'people', label: 'PERSONEL', icon: '👥', description: 'Tercih ve geçmiş' },
  { key: 'analytics', label: 'ANALİZ', icon: '📊', description: 'KPI ve çıktılar' },
]

const LEGACY_TAB = {
  daily: { tab: 'operation' },
  routes: { tab: 'lines', view: 'routes' },
  points: { tab: 'lines', view: 'points' },
  map: { tab: 'lines', view: 'map' },
  reports: { tab: 'analytics' },
}

export default function TransportPage() {
  const [tab, setTab] = useUrlParamState('tab', 'operation')
  const [lineView, setLineView] = useUrlParamState('view', 'routes')
  const [date, setDate] = useState(todayStr())
  const [searchOpen, setSearchOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(true)

  useEffect(() => {
    const legacy = LEGACY_TAB[tab]
    if (!legacy) return
    if (legacy.view) setLineView(legacy.view)
    setTab(legacy.tab)
  }, [lineView, setLineView, setTab, tab])

  useEffect(() => {
    const onKey = event => {
      const target = event.target
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      const shortcut = Number(event.key)
      if (shortcut >= 1 && shortcut <= TABS.length) setTab(TABS[shortcut - 1].key)
      else if (event.key.toLowerCase() === 'h') setDate(todayStr())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab])

  const navigate = (nextTab, view) => {
    if (view) setLineView(view)
    setTab(nextTab)
  }

  return (
    <main className="transport-v2 fade-up">
      <header className="transport-v2__header">
        <div>
          <h1 className="transport-v2__title">
            SERVİSLER
            <HelpHint topic="transport" title="SERVİSLER" />
          </h1>
          <p className="transport-v2__subtitle">PLANLAMA · SAHA OPERASYONU · KAYNAK YÖNETİMİ</p>
        </div>
        <div className="transport-v2__header-actions">
          <button className="btn btn-ghost btn-sm transport-v2__search" onClick={() => setSearchOpen(true)}
            aria-label="Servislerde ara">
            🔎 ARA <kbd>/</kbd>
          </button>
          {tab === 'operation' && (
            <input type="date" className="form-input" value={date} aria-label="Operasyon tarihi"
              onChange={event => setDate(event.target.value)} />
          )}
        </div>
      </header>

      <nav className="transport-v2__tabs" aria-label="Servisler bölümleri">
        {TABS.map((item, index) => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)}
            className={tab === item.key ? 'is-active' : ''}
            aria-current={tab === item.key ? 'page' : undefined}
            title={`${item.description} · Kısayol ${index + 1}`}>
            <span aria-hidden="true">{item.icon}</span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </nav>

      {wizardOpen && (
        <SetupWizard onNavigate={navigate} onClose={() => setWizardOpen(false)} />
      )}

      <section className="transport-v2__content" aria-live="polite">
        {tab === 'operation' && <DailyTab date={date} />}
        {tab === 'planning' && <PlanningTab />}
        {tab === 'lines' && <LinesTab view={lineView} onViewChange={setLineView} />}
        {tab === 'resources' && <ResourcesTab />}
        {tab === 'people' && <PeopleTab />}
        {tab === 'analytics' && <ReportsTab />}
      </section>

      {searchOpen && (
        <GlobalSearch onClose={() => setSearchOpen(false)} onNavigate={navigate} />
      )}
    </main>
  )
}

function GlobalSearch({ onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const { data: points = [] } = useQuery({
    queryKey: ['transport-points'],
    queryFn: () => api.get('/transport/pickup-points').then(response => response.data),
  })
  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes'],
    queryFn: () => api.get('/transport/routes').then(response => response.data),
  })
  const { data: staff = [] } = useQuery({
    queryKey: ['transport-staff', 'all'],
    queryFn: () => api.get('/transport/staff').then(response => response.data),
  })

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR')
    if (!normalized) return []
    const contains = value => String(value || '').toLocaleLowerCase('tr-TR').includes(normalized)
    const found = []
    points.filter(point => contains(`${point.name} ${point.district} ${point.neighborhood}`)).slice(0, 5)
      .forEach(point => found.push({
        type: 'Durak', icon: '📍', label: point.name, sub: point.district || 'İlçe yok',
        tab: 'lines', view: 'points',
      }))
    routes.filter(route => contains(`${route.name} ${route.vehicle_plate} ${route.driver_name}`)).slice(0, 5)
      .forEach(route => found.push({
        type: 'Hat', icon: '🛣️', label: route.name,
        sub: `${route.vehicle_plate || 'Araç yok'} · ${route.capacity || 0} kişi`,
        tab: 'lines', view: 'routes',
      }))
    staff.filter(person => contains(`${person.full_name} ${person.tc_no} ${person.role_label} ${person.dept_name} ${person.pickup_name}`)).slice(0, 10)
      .forEach(person => found.push({
        type: 'Personel', icon: '👤', label: person.full_name,
        sub: `${person.dept_name || 'Birim yok'} · ${person.pickup_name || 'Durak yok'}`,
        tab: 'people',
      }))
    return found
  }, [points, query, routes, staff])

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectResult = result => {
    onNavigate(result.tab, result.view)
    onClose()
  }

  return (
    <div className="transport-search" role="presentation" onMouseDown={onClose}>
      <div className="transport-search__dialog" role="dialog" aria-modal="true"
        aria-label="Servislerde ara" onMouseDown={event => event.stopPropagation()}>
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Durak, hat, personel adı veya TC ara…"
          aria-label="Arama metni" />
        {!query.trim() ? (
          <div className="transport-search__hint">
            <span>Kısayollar</span>
            <kbd>1–6</kbd> bölüm · <kbd>H</kbd> bugün · <kbd>Esc</kbd> kapat
          </div>
        ) : results.length === 0 ? (
          <div className="transport-search__empty">Sonuç bulunamadı</div>
        ) : (
          <div className="transport-search__results">
            {results.map((result, index) => (
              <button key={`${result.type}-${result.label}-${index}`} onClick={() => selectResult(result)}>
                <span className="transport-search__icon" aria-hidden="true">{result.icon}</span>
                <span>
                  <strong>{result.label}</strong>
                  <small>{result.sub}</small>
                </span>
                <em>{result.type}</em>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
