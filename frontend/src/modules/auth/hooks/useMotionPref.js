import { useCallback, useState } from 'react'

const MK = 'yys-login-motion', RK = 'yys-login-rain'
const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

// Hareket tercihi: 'calm' | 'slow' | 'normal' + yağmur aç/kapa. reduced-motion'da calm + yağmur kapalı.
export function useMotionPref() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [motion, setMotionState] = useState(() => reduced ? 'calm' : read(MK, 'slow'))
  const [rain, setRainState] = useState(() => reduced ? false : read(RK, 'on') === 'on')

  const setMotion = useCallback((m) => {
    setMotionState(m); try { localStorage.setItem(MK, m) } catch { /* yoksay */ }
  }, [])
  const setRain = useCallback((on) => {
    setRainState(on); try { localStorage.setItem(RK, on ? 'on' : 'off') } catch { /* yoksay */ }
  }, [])

  return { motion, setMotion, rain, setRain, reduced: !!reduced }
}
