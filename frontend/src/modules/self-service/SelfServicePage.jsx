import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STATUS_LABELS = {
  clean: 'Temiz',
  dirty: 'Kirli',
  collected: 'Toplandı',
  washing: 'Yıkanıyor',
  ready: 'Hazır',
  distributed: 'Teslim Edildi'
}

const STATUS_COLORS = {
  clean: 'text-green-400',
  dirty: 'text-red-400',
  collected: 'text-yellow-400',
  washing: 'text-blue-400',
  ready: 'text-green-400',
  distributed: 'text-slate-400'
}

export default function SelfServicePage() {
  const [tcNo, setTcNo] = useState('')
  const [pin, setPin] = useState('')
  const [kioskToken, setKioskToken] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [maintenanceForm, setMaintenanceForm] = useState({ location: '', description: '' })
  const [maintenanceSuccess, setMaintenanceSuccess] = useState(false)

  // Create an axios instance with kiosk token
  const kioskApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${kioskToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${kioskToken}` } })
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      const res = await api.post('/auth/kiosk-login', { tc_no: tcNo, pin })
      setKioskToken(res.data.token)
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Giris basarisiz')
    }
  }

  const { data: myInfo } = useQuery({
    queryKey: ['kiosk-info', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-info').then(r => r.data),
    enabled: !!kioskToken
  })

  const { data: laundryStatus = [] } = useQuery({
    queryKey: ['kiosk-laundry', kioskToken],
    queryFn: () => kioskApi.get('/self-service/laundry-status').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'laundry'
  })

  const submitMaintenance = useMutation({
    mutationFn: () => kioskApi.post('/self-service/maintenance', maintenanceForm),
    onSuccess: () => { setMaintenanceSuccess(true); setMaintenanceForm({ location: '', description: '' }) }
  })

  // Login screen
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl mb-4">🏨</div>
            <h1 className="text-2xl font-bold text-slate-100">Personel Self-Servis</h1>
            <p className="text-slate-500 text-sm mt-2">TC kimlik numaranızı girerek giriş yapın</p>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">TC Kimlik No</label>
              <input
                type="text"
                value={tcNo}
                onChange={e => setTcNo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-slate-100 text-center font-mono tracking-widest focus:outline-none focus:border-blue-500"
                maxLength={11}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">PIN (4 hane)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                placeholder="····"
                required
              />
            </div>
            {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
            <button type="submit" disabled={tcNo.length < 11 || pin.length !== 4} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
              Giris Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Main kiosk screen
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-4">
        <div>
          <div className="font-semibold text-slate-100">{myInfo?.full_name}</div>
          {myInfo?.room && (
            <div className="text-xs text-slate-500">{myInfo.room.block} Blok - Oda {myInfo.room.room_no} · Yatak {myInfo.room.bed_no}</div>
          )}
        </div>
        <button onClick={() => setKioskToken(null)} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">
          Çıkış
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[{ key: 'info', label: '👤 Bilgilerim' }, { key: 'laundry', label: '🧺 Çamaşır' }, { key: 'maintenance', label: '🔧 Arıza Bildir' }].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {activeTab === 'info' && myInfo && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">Kişisel Bilgiler</h2>
            {[
              { label: 'Şirket', value: myInfo.company },
              { label: 'Telefon', value: myInfo.phone_number },
              { label: 'Giriş Tarihi', value: myInfo.check_in_date ? new Date(myInfo.check_in_date).toLocaleDateString('tr-TR') : '-' },
              { label: 'Disiplin Puanı', value: myInfo.discipline_points ?? 0 },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.label === 'Disiplin Puanı' && item.value >= 3 ? 'text-red-400' : 'text-slate-200'}`}>{item.value || '-'}</span>
              </div>
            ))}
          </div>
          {myInfo.room && (
            <div className="bg-slate-900 rounded-2xl p-5">
              <h2 className="font-medium text-slate-300 mb-3">Oda Bilgisi</h2>
              <div className="text-3xl font-bold text-blue-400">{myInfo.room.block} — {myInfo.room.room_no}</div>
              <div className="text-sm text-slate-500 mt-1">Kat {myInfo.room.floor} · Yatak {myInfo.room.bed_no}</div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Laundry */}
      {activeTab === 'laundry' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium text-slate-300 mb-2">Çamaşır Torbası Durumu</h2>
          {laundryStatus.length === 0 ? (
            <div className="text-slate-500 text-sm">Çamaşır kaydı yok</div>
          ) : laundryStatus.map(bag => (
            <div key={bag.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <div className="text-xs text-slate-500">{bag.collected_at ? new Date(bag.collected_at).toLocaleDateString('tr-TR') : 'Son Torba'}</div>
              <span className={`text-sm font-medium ${STATUS_COLORS[bag.status]}`}>{STATUS_LABELS[bag.status]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Maintenance */}
      {activeTab === 'maintenance' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-slate-300">Arıza Bildir</h2>
          {maintenanceSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-green-400 font-medium">Arıza kaydınız iletildi</div>
              <button onClick={() => setMaintenanceSuccess(false)} className="mt-4 text-xs text-blue-400">Yeni Bildirim</button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Konum</label>
                <input
                  value={maintenanceForm.location}
                  onChange={e => setMaintenanceForm(p => ({ ...p, location: e.target.value }))}
                  placeholder="Oda 101, Banyo vb."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Açıklama</label>
                <textarea
                  value={maintenanceForm.description}
                  onChange={e => setMaintenanceForm(p => ({ ...p, description: e.target.value }))}
                  rows={4}
                  placeholder="Arızayı açıklayın..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => submitMaintenance.mutate()}
                disabled={submitMaintenance.isPending || !maintenanceForm.location || !maintenanceForm.description}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium"
              >
                {submitMaintenance.isPending ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
