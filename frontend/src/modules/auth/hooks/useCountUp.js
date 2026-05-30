import { useEffect, useState } from 'react'

// `active` true olunca `to` değerine `durationMs` içinde yükselir. reduced ise anında.
export function useCountUp(to, active, durationMs = 1200, reduced = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    if (reduced) { setVal(to); return }
    let raf, start
    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / durationMs)
      setVal(Math.round(to * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, active, durationMs, reduced])
  return val
}
