import axios from 'axios'
import { useMobileAuth } from './useMobileAuth.js'

const mobileApi = axios.create({ baseURL: '/api', timeout: 30000 })

mobileApi.interceptors.request.use(cfg => {
  const token = useMobileAuth.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

mobileApi.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      useMobileAuth.getState().logout()
      window.location.href = '/mobile'
    }
    return Promise.reject(err)
  }
)

export default mobileApi
