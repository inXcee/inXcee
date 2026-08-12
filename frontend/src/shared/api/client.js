import axios from 'axios'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'
import { readDeviceIdentityCached } from '../kiosk/deviceIdentity.js'

const api = axios.create({ baseURL: '/api', timeout: 45000, withCredentials: true })

api.interceptors.request.use(async cfg => {
  // Staff oturumları httpOnly cookie ile taşınır (withCredentials: true).
  // Kiosk/mobile token'ları hala header'da — token varsa ekle.
  const token = useAuthStore.getState().token
  if (token && !cfg.headers.Authorization) cfg.headers.Authorization = `Bearer ${token}`
  const deviceIdentity = await readDeviceIdentityCached()
  if (deviceIdentity?.device_key && !cfg.headers['X-Kiosk-Device-Key']) {
    cfg.headers['X-Kiosk-Device-Key'] = deviceIdentity.device_key
  }
  return cfg
})

let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  r => r,
  async error => {
    const { addToast } = useToastStore.getState()
    const original = error.config

    if (error.response?.data?.code && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kiosk-session-state', { detail: error.response.data }))
    }

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        // 100+ user'da paralel istek burst'leri 10'u kolay aşar, mass logout'a yol açıyordu.
        if (refreshQueue.length >= 50) {
          refreshQueue.forEach(p => p.reject(new Error('Refresh queue dolu')))
          refreshQueue = []
          useAuthStore.getState().logout()
          return Promise.reject(error)
        }
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        // Cookie tabanlı session: refresh isteği credentials:include ile gönderilir,
        // backend yeni cookie set eder. Kiosk/mobile için mevcut token header'da.
        const token = useAuthStore.getState().token
        const res = await axios.post('/api/auth/refresh', null, {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const newToken = res.data.token // kiosk/mobile için; staff'ta null
        useAuthStore.setState(s => ({ ...s, token: newToken ?? s.token, user: res.data.user ?? s.user }))
        refreshQueue.forEach(p => p.resolve(newToken))
        refreshQueue = []
        if (newToken) original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        refreshQueue.forEach(p => p.reject(error))
        refreshQueue = []
        useAuthStore.getState().logout()
      } finally {
        isRefreshing = false
      }
    }

    if (error.response?.status === 429) {
      addToast('Cok fazla istek — lutfen bekleyin', 'warning')
    } else if (!error.response) {
      addToast('Sunucuya baglanilamiyor — ag baglantinizi kontrol edin', 'error')
    } else if (error.response?.status >= 500) {
      addToast(error.response.data?.error || 'Sunucu hatasi — tekrar deneyin', 'error')
    }

    return Promise.reject(error)
  }
)

export default api
