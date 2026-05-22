import { create } from 'zustand'

// Token artık httpOnly cookie'de — JS tarafında saklanmıyor (XSS koruması).
// Sadece user metadata memory'de tutulur; sayfa yenilemede /api/auth/me ile restore edilir.
export const useAuthStore = create(set => ({
  token: null,   // memory-only (kiosk/mobile backward compat için hala var)
  user: null,
  login: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
  restoreUser: (user) => set({ user }),
}))
