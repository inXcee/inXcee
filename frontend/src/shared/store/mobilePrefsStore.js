import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useMobilePrefs = create(persist(
  set => ({
    darkMode: false,
    toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),
  }),
  { name: 'yys-mobile-prefs' }
))
