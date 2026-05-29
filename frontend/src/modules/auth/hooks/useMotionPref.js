import { useCallback, useEffect, useState } from 'react'

const MK = 'yys-login-motion', RK = 'yys-login-rain'
const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Hareket tercihi: 'calm' | 'slow' | 'normal' + yağmur aç/kapa. reduced-motion'da calm + yağmur kapalı.
export function useMotionPref() {
  const [reduced, setReduced] = useState(prefersReduced)
  const [motion, setMotionState] = useState(() => prefersReduced() ? 'calm' : read(MK, 'slow'))
  const [rain, setRainState] = useState(() => prefersReduced() ? false : read(RK, 'on') === 'on')

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq?.addEventListener) return
    const handler = (e) => {
      setReduced(e.matches)
      if (e.matches) { setMotionState('calm'); setRainState(false) }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setMotion = useCallback((m) => {
    setMotionState(m); try { localStorage.setItem(MK, m) } catch { /* yoksay */ }
  }, [])
  const setRain = useCallback((on) => {
    setRainState(on); try { localStorage.setItem(RK, on ? 'on' : 'off') } catch { /* yoksay */ }
  }, [])

  return { motion, setMotion, rain, setRain, reduced }
}
