import { useEffect, useState } from 'react'

// Belirtilen baslangic timestamp'inden gecen saniyeyi 1sn'de bir gunceller.
// startedAt null ise duraklar. Format: "MM:SS" veya "H:MM:SS".

export function useElapsedTimer(startedAt) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!startedAt) { setSeconds(0); return }
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  const formatted = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`

  return { seconds, formatted }
}
