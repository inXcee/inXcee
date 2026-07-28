import RoutesTab from './RoutesTab.jsx'
import PointsTab from './PointsTab.jsx'
import MapTab from './MapTab.jsx'

const VIEWS = [
  { key: 'routes', label: 'HATLAR', icon: '🛣️', help: 'Rota ve durak sırası' },
  { key: 'points', label: 'DURAKLAR', icon: '📍', help: 'Biniş noktaları' },
  { key: 'map', label: 'HARİTA', icon: '🗺️', help: 'Güzergâh çalışma alanı' },
]

export default function LinesTab({ view = 'routes', onViewChange }) {
  const safeView = VIEWS.some(item => item.key === view) ? view : 'routes'
  return (
    <div>
      <div className="transport-lines__toolbar">
        <div>
          <strong>Hat çalışma alanı</strong>
          <small>Rota, durak ve haritayı aynı bağlamda yönetin.</small>
        </div>
        <div className="transport-lines__switch" role="tablist" aria-label="Hat görünümü">
          {VIEWS.map(item => (
            <button key={item.key} type="button" role="tab"
              aria-selected={safeView === item.key}
              className={safeView === item.key ? 'is-active' : ''}
              onClick={() => onViewChange(item.key)}
              title={item.help}>
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {safeView === 'routes' && <RoutesTab />}
        {safeView === 'points' && <PointsTab />}
        {safeView === 'map' && <MapTab />}
      </div>
    </div>
  )
}
