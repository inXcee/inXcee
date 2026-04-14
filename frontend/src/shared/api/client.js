import axios from 'axios'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

const api = axios.create({ baseURL: '/api', timeout: 45000 })

api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  r => r,
  async error => {
    const { addToast } = useToastStore.getState()
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
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
        const token = useAuthStore.getState().token
        if (!token) throw new Error('no token')
        const res = await axios.post('/api/auth/refresh', null, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const newToken = res.data.token
        useAuthStore.setState(s => ({ ...s, token: newToken, user: res.data.user ?? s.user }))
        refreshQueue.forEach(p => p.resolve(newToken))
        refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
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
