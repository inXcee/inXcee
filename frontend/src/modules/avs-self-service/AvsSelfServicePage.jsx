import { useState, useRef } from 'react'
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
    if (!selected) return setLoginError(t('avs_kiosk.no_results'))
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
          </button>
        ))}
      </div>
      <div className="mb-2 flex justify-end"><LanguageSwitcher compact /></div>

      {/* Tab içerikleri Task 12-17'de eklenir */}
    </div>
  )
}
