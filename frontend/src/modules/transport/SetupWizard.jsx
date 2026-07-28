import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

const STEPS = [
  {
    key: 'workSite',
    number: 1,
    title: 'İş yerini doğrula',
    description: 'Servislerin varış noktasını haritada kontrol edin.',
    tab: 'lines',
    view: 'map',
    action: 'HARİTADA AÇ',
  },
  {
    key: 'points',
    number: 2,
    title: 'Durakları ekle',
    description: 'Personelin bineceği konumları tek tek veya toplu tanımlayın.',
    tab: 'lines',
    view: 'points',
    action: 'DURAKLARA GİT',
  },
  {
    key: 'routes',
    number: 3,
    title: 'Hatları oluştur',
    description: 'Durak sırasını, vardiyayı ve güzergâhı belirleyin.',
    tab: 'lines',
    view: 'routes',
    action: 'HATLARI AÇ',
  },
  {
    key: 'resources',
    number: 4,
    title: 'Araç ve şoför ekle',
    description: 'Kapasite ve müsaitlik bilgilerini tanımlayın.',
    tab: 'resources',
    action: 'KAYNAKLARA GİT',
  },
  {
    key: 'people',
    number: 5,
    title: 'Personeli eşleştir',
    description: 'Durak tercihlerini ID/TC ile güvenli biçimde eşleştirin.',
    tab: 'people',
    action: 'PERSONELİ AÇ',
  },
]

export default function SetupWizard({ onNavigate, onClose }) {
  const user = useAuthStore(state => state.user)
  const enabled = user?.role === 'campus_manager'
  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['transport-routes'],
    queryFn: () => api.get('/transport/routes').then(response => response.data),
    enabled,
  })
  const { data: points = [], isLoading: pointsLoading } = useQuery({
    queryKey: ['transport-points'],
    queryFn: () => api.get('/transport/pickup-points').then(response => response.data),
    enabled,
  })
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['transport-v2-vehicles'],
    queryFn: () => api.get('/transport/vehicles').then(response => response.data),
    enabled,
  })
  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['transport-v2-drivers'],
    queryFn: () => api.get('/transport/drivers').then(response => response.data),
    enabled,
  })
  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['transport-staff', 'all'],
    queryFn: () => api.get('/transport/staff').then(response => response.data),
    enabled,
  })

  if (!enabled) return null
  const loading = routesLoading || pointsLoading || vehiclesLoading || driversLoading || staffLoading
  if (loading) return <div className="transport-setup transport-setup--loading">Kurulum durumu kontrol ediliyor…</div>

  const progress = {
    workSite: true,
    points: points.length > 0,
    routes: routes.length > 0,
    resources: vehicles.some(row => row.status === 'active') && drivers.some(row => row.status === 'active'),
    people: staff.length > 0 && staff.every(row => row.pickup_point_id),
  }
  const completed = Object.values(progress).filter(Boolean).length
  if (completed === STEPS.length) return null

  const nextStep = STEPS.find(step => !progress[step.key])

  return (
    <aside className="transport-setup" aria-label="Servisler ilk kurulum">
      <div className="transport-setup__header">
        <div>
          <span className="transport-setup__eyebrow">İLK KURULUM · {completed}/5 TAMAM</span>
          <h2>Servis operasyonunu kullanıma hazırlayın</h2>
          <p>Adımları sırayla tamamlayın; mevcut veriler otomatik olarak işaretlenir.</p>
        </div>
        <button type="button" className="transport-setup__close" onClick={onClose}
          aria-label="Kurulum rehberini gizle">×</button>
      </div>
      <div className="transport-setup__progress" aria-label={`Kurulum yüzde ${completed * 20}`}>
        <span style={{ width: `${completed * 20}%` }} />
      </div>
      <ol className="transport-setup__steps">
        {STEPS.map(step => {
          const done = progress[step.key]
          const current = nextStep?.key === step.key
          return (
            <li key={step.key} className={`${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
              <span className="transport-setup__number" aria-hidden="true">{done ? '✓' : step.number}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </div>
              {!done && (
                <button type="button" onClick={() => onNavigate(step.tab, step.view)}>
                  {current ? step.action : 'AÇ'}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
