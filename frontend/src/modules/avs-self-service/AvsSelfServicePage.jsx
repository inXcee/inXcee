import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useTranslation } from '../../shared/i18n/index.js'
import { useIdleTimeout } from '../../shared/hooks/useIdleTimeout.js'
import LanguageSwitcher from '../../shared/components/LanguageSwitcher.jsx'

const TAB_KEYS = [
  { key: 'shifts',        i18n: 'avs_kiosk.tabs.shifts' },
  { key: 'transport',     i18n: 'avs_kiosk.tabs.transport' },
  { key: 'tasks',         i18n: 'avs_kiosk.tabs.tasks' },
  { key: 'announcements', i18n: 'avs_kiosk.tabs.announcements' },
  { key: 'quick_fault',   i18n: 'avs_kiosk.tabs.quick_fault' },
  { key: 'profile',       i18n: 'avs_kiosk.tabs.profile' },
]

export default function AvsSelfServicePage() {
  const { t } = useTranslation()
  const [avsToken, setAvsToken] = useState(null)
  const [activeTab, setActiveTab] = useState('shifts')

  // İsimle giriş
  const [nameQuery, setNameQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const searchTimeout = useRef(null)

  // Okunmamış duyuru takibi (Task 15)
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('avs_kiosk_read_ann') || '[]') } catch { return [] }
  })

  // Task 16 — Hızlı Arıza
  const [faultForm, setFaultForm] = useState({ location: '', description: '', priority: 'medium' })
  const [faultSuccess, setFaultSuccess] = useState(false)
  const [faultError, setFaultError] = useState('')

  // Task 17 — Profil PIN değiştir
  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', new_pin2: '' })
  const [pinMsg, setPinMsg] = useState({ type: '', text: '' })

  // 5dk inaktivite → logout (son 30sn'de toast uyarısı)
  useIdleTimeout({
    timeoutMs: 5 * 60 * 1000,
    warnBeforeMs: 30 * 1000,
    token: avsToken,
    onLogout: () => setAvsToken(null),
  })

  const avsApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  // Task 12 — Vardiyam
  const { data: shiftsData } = useQuery({
    queryKey: ['avs-shifts', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-shifts').then(r => r.data),
    enabled: !!avsToken && activeTab === 'shifts',
  })

  // Task 13 — Servisim
  const { data: transportData } = useQuery({
    queryKey: ['avs-transport', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-transport').then(r => r.data),
    enabled: !!avsToken && activeTab === 'transport',
  })

  // Task 14 — Görevlerim
  const { data: tasksData } = useQuery({
    queryKey: ['avs-tasks', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-tasks').then(r => r.data),
    enabled: !!avsToken && activeTab === 'tasks',
  })

  // Task 15 — Duyurular
  const { data: announcements = [] } = useQuery({
    queryKey: ['avs-ann', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/announcements').then(r => r.data),
    enabled: !!avsToken && activeTab === 'announcements',
  })

  useEffect(() => {
    if (activeTab === 'announcements' && announcements.length > 0) {
      setReadIds(prev => {
        const ids = [...new Set([...prev, ...announcements.map(a => a.id)])]
        localStorage.setItem('avs_kiosk_read_ann', JSON.stringify(ids))
        return ids
      })
    }
  }, [activeTab, announcements])

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length

  // Task 16 — Hızlı Arıza mutation
  const submitFault = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/maintenance', faultForm),
    onSuccess: () => { setFaultSuccess(true); setFaultError(''); setFaultForm({ location: '', description: '', priority: 'medium' }) },
    onError: (err) => setFaultError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })

  // Task 17 — Profil: info query + PIN mutation
  const { data: myInfo } = useQuery({
    queryKey: ['avs-info', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-info').then(r => r.data),
    enabled: !!avsToken && activeTab === 'profile',
  })

  const submitPin = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/change-pin', { current_pin: pinForm.current_pin, new_pin: pinForm.new_pin }),
    onSuccess: () => { setPinMsg({ type: 'ok', text: t('avs_kiosk.profile.pin_success') }); setPinForm({ current_pin: '', new_pin: '', new_pin2: '' }) },
    onError: (err) => setPinMsg({ type: 'err', text: err.response?.data?.error || t('avs_kiosk.login_failed') }),
  })

  const handlePinSubmit = () => {
    setPinMsg({ type: '', text: '' })
    if (pinForm.new_pin !== pinForm.new_pin2) {
      return setPinMsg({ type: 'err', text: t('avs_kiosk.profile.pin_mismatch') })
    }
    submitPin.mutate()
  }

  const handleSearch = (val) => {
    setNameQuery(val); setSelected(null)
    clearTimeout(searchTimeout.current)
    if (val.length < 2) { setResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/avs-search?q=${encodeURIComponent(val)}`)
        setResults(res.data)
      } catch { setResults([]) }
    }, 300)
  }

  const handleLogin = async (e) => {
    e.preventDefault(); setLoginError('')
    if (!selected) return setLoginError(t('avs_kiosk.select_required'))
    try {
      const res = await api.post('/auth/avs-login', { worker_id: selected.id, pin })
      setAvsToken(res.data.token)
      setActiveTab('shifts')
    } catch (err) { setLoginError(err.response?.data?.error || t('avs_kiosk.login_failed')) }
  }

  // ─── Login ekranı ───────────────────────────────────────────
  if (!avsToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-4"><LanguageSwitcher /></div>
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">👷</div>
            <h1 className="text-2xl font-bold text-slate-100">{t('avs_kiosk.title')}</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.name_search')}</label>
              <input type="text" value={nameQuery} onChange={e => handleSearch(e.target.value)}
                placeholder={t('avs_kiosk.name_search')} autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
            </div>

            {results.length > 0 && !selected && (
              <div className="bg-slate-800 rounded-xl overflow-hidden">
                {results.map(w => (
                  <button key={w.id} type="button" disabled={!w.has_pin}
                    onClick={() => { setSelected(w); setResults([]) }}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-0 ${!w.has_pin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="text-sm text-slate-200 font-medium">{w.full_name}</div>
                    <div className="text-xs text-slate-500">{w.role_label || '—'} {!w.has_pin ? t('avs_kiosk.pin_not_set') : ''}</div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm text-slate-200 font-medium">{selected.full_name}</div>
                  <div className="text-xs text-slate-500">{selected.role_label || '—'}</div>
                </div>
                <button type="button" onClick={() => { setSelected(null); setPin(''); setNameQuery('') }}
                  className="text-xs text-slate-500 hover:text-slate-300">{t('avs_kiosk.change')}</button>
              </div>
            )}

            {selected && (
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.pin')}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" />
              </div>
            )}

            {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
            <button type="submit" disabled={!selected || pin.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
              {t('avs_kiosk.login_button')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Ana ekran ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4">
      <div className="flex items-center justify-between py-4 mb-4">
        <div className="font-semibold text-slate-100">{selected?.full_name}</div>
        <button onClick={() => setAvsToken(null)}
          className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">
          {t('avs_kiosk.logout')}
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TAB_KEYS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`relative flex-shrink-0 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {t(tab.i18n)}
            {tab.key === 'announcements' && unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mb-2 flex justify-end"><LanguageSwitcher compact /></div>

      {/* Task 12 — Vardiyam */}
      {activeTab === 'shifts' && (
        <div className="space-y-2">
          {!shiftsData ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('avs_kiosk.loading')}</div>
          ) : (shiftsData.shifts || []).length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.shifts.none')}</div>
          ) : shiftsData.shifts.map(s => {
            const today = new Date().toISOString().slice(0, 10)
            const isToday = s.work_date === today
            const color = s.status === 'worked' ? 'text-green-400' : s.status === 'absent' ? 'text-red-400'
              : s.status === 'on_leave' ? 'text-amber-400' : s.status === 'overtime' ? 'text-purple-400' : 'text-slate-400'
            return (
              <div key={s.work_date} className={`flex justify-between items-center px-4 py-3 rounded-xl ${isToday ? 'bg-blue-900 border border-blue-700' : 'bg-slate-900'}`}>
                <div>
                  <div className="text-sm text-slate-200">{new Date(s.work_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  {s.shift_name && (
                    <div className="text-xs text-slate-500">
                      {s.shift_name}{s.start_hour != null && ` · ${String(s.start_hour).padStart(2, '0')}:00–${String(s.end_hour).padStart(2, '0')}:00`}
                    </div>
                  )}
                </div>
                <div className={`text-xs font-medium ${color}`}>{s.status}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task 13 — Servisim */}
      {activeTab === 'transport' && (
        <div className="space-y-4">
          {!transportData ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('avs_kiosk.loading')}</div>
          ) : !transportData.pickup ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm text-center py-6">{t('avs_kiosk.transport.none')}</div>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-5">
              <h2 className="font-medium text-slate-300 mb-3">📍 {t('avs_kiosk.transport.stop')}</h2>
              <div className="text-xl font-bold text-blue-400">{transportData.pickup.name}</div>
              {(transportData.pickup.district || transportData.pickup.neighborhood) && (
                <div className="text-sm text-slate-500 mt-1">
                  {transportData.pickup.district}{transportData.pickup.neighborhood ? ` · ${transportData.pickup.neighborhood}` : ''}
                </div>
              )}
              {transportData.pickup.notes && (
                <div className="text-sm text-slate-400 mt-2 whitespace-pre-line">{transportData.pickup.notes}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task 14 — Görevlerim */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {!tasksData ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('avs_kiosk.loading')}</div>
          ) : tasksData.type === 'laundry' ? (
            <div className="bg-slate-900 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🧺</div>
              <div className="text-slate-300 text-sm mb-4">{t('avs_kiosk.tasks.laundry_redirect')}</div>
              <a href="/laundry-kiosk" className="inline-block bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 text-sm font-medium">
                {t('avs_kiosk.tasks.go_laundry')}
              </a>
            </div>
          ) : tasksData.type === 'housekeeping' ? (
            <>
              <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.housekeeping_title')}</h2>
              {tasksData.items.length === 0 ? (
                <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
              ) : tasksData.items.map(task => (
                <div key={task.id} className="bg-slate-900 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-slate-200">{task.area}{task.block ? ` · ${task.block}` : ''}{task.floor != null ? ` · Kat ${task.floor}` : ''}</div>
                    <div className="text-xs text-slate-500">{task.task_type}</div>
                  </div>
                  {task.completed_at && <span className="text-xs text-green-400">{t('avs_kiosk.tasks.done')}</span>}
                </div>
              ))}
            </>
          ) : tasksData.type === 'maintenance' ? (
            <>
              <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.maintenance_title')}</h2>
              {tasksData.items.length === 0 ? (
                <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
              ) : tasksData.items.map(m => (
                <div key={m.id} className="bg-slate-900 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm text-slate-200 font-medium">{m.location}</span>
                    <span className={`text-xs font-medium ${m.priority === 'high' ? 'text-red-400' : m.priority === 'low' ? 'text-slate-400' : 'text-amber-400'}`}>{m.priority}</span>
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2">{m.description}</div>
                </div>
              ))}
            </>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm text-center py-6">{t('avs_kiosk.tasks.none')}</div>
          )}
        </div>
      )}

      {/* Task 15 — Duyurular */}
      {activeTab === 'announcements' && (
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('avs_kiosk.announcements.none')}</div>
          ) : announcements.map(a => (
            <div key={a.id} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{a.title}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{a.body}</div>
              <div className="text-xs text-slate-600 mt-3">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Task 16 — Hızlı Arıza */}
      {activeTab === 'quick_fault' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          {faultSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-green-400 font-medium">{t('avs_kiosk.fault.success')}</div>
              <button onClick={() => setFaultSuccess(false)} className="mt-4 text-xs text-blue-400">{t('avs_kiosk.fault.submit')}</button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.location')}</label>
                <input value={faultForm.location} onChange={e => setFaultForm(p => ({ ...p, location: e.target.value }))}
                  placeholder={t('avs_kiosk.fault.location')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.description')}</label>
                <textarea value={faultForm.description} onChange={e => setFaultForm(p => ({ ...p, description: e.target.value }))}
                  rows={4} placeholder={t('avs_kiosk.fault.description')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.priority')}</label>
                <div className="flex gap-2">
                  {[['high', t('avs_kiosk.fault.high')], ['medium', t('avs_kiosk.fault.medium')], ['low', t('avs_kiosk.fault.low')]].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setFaultForm(p => ({ ...p, priority: val }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${faultForm.priority === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {faultError && <div className="text-red-400 text-sm text-center">{faultError}</div>}
              <button onClick={() => submitFault.mutate()}
                disabled={submitFault.isPending || faultForm.location.trim().length < 3 || faultForm.description.trim().length < 10}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                {submitFault.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.fault.submit')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Task 17 — Profil */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.info')}</h2>
            {myInfo?.department_name && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.department')}</span><span className="text-slate-200 font-medium">{myInfo.department_name}</span></div>
            )}
            {myInfo?.role_label && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.role')}</span><span className="text-slate-200 font-medium">{myInfo.role_label}</span></div>
            )}
            {myInfo?.phone && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.phone')}</span><span className="text-slate-200 font-medium">{myInfo.phone}</span></div>
            )}
            {myInfo?.pickup_name && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.pickup')}</span><span className="text-slate-200 font-medium">{myInfo.pickup_name}</span></div>
            )}
            <div className="text-xs text-slate-600 pt-2">{t('avs_kiosk.profile.readonly_note')}</div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.change_pin')}</h2>
            {[['current_pin', t('avs_kiosk.profile.current_pin')], ['new_pin', t('avs_kiosk.profile.new_pin')], ['new_pin2', t('avs_kiosk.profile.new_pin2')]].map(([field, lbl]) => (
              <div key={field}>
                <label className="block text-sm text-slate-400 mb-2">{lbl}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinForm[field]}
                  onChange={e => setPinForm(p => ({ ...p, [field]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" />
              </div>
            ))}
            {pinMsg.text && <div className={`text-sm text-center ${pinMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{pinMsg.text}</div>}
            <button onClick={handlePinSubmit}
              disabled={submitPin.isPending || pinForm.current_pin.length !== 4 || pinForm.new_pin.length !== 4 || pinForm.new_pin2.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
              {submitPin.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.profile.change_pin')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
