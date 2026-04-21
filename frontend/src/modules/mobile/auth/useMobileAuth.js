import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useMobileAuth = create(persist(
  set => ({
    token: null,
    user: null,
    login: (token, user) => set({ token, user }),
    logout: () => set({ token: null, user: null }),
  }),
  { name: 'yys-mobile-auth' }
))
