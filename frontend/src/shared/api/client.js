import axios from 'axios'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

const api = axios.create({ baseURL: '/api', timeout: 45000 })

api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  const { addToast } = useToastStore.getState()

  if (err.response?.status === 401) {
    useAuthStore.getState().logout()
  } else if (err.response?.status === 429) {
    addToast('Cok fazla istek — lutfen bekleyin', 'warning')
  } else if (!err.response) {
    addToast('Sunucuya baglanilamiyor — ag baglantinizi kontrol edin', 'error')
  } else if (err.response?.status >= 500) {
    addToast(err.response.data?.error || 'Sunucu hatasi — tekrar deneyin', 'error')
  }

  return Promise.reject(err)
})

export default api
