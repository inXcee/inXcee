import { create } from 'zustand'
import { clearAuthenticatedApiCache } from '../kiosk/deviceIdentity.js'

// Token artık httpOnly cookie'de — JS tarafında saklanmıyor (XSS koruması).
// Sadece user metadata memory'de tutulur; sayfa yenilemede /api/auth/me ile restore edilir.
export const useAuthStore = create(set => ({
  token: null,   // memory-only (kiosk/mobile backward compat için hala var)
  user: null,
  login: (token, user) => { clearAuthenticatedApiCache(); set({ token, user }) },
  logout: () => { clearAuthenticatedApiCache(); set({ token: null, user: null }) },
  restoreUser: (user) => set({ user }),
}))
