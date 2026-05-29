import { useEffect, useRef, useState } from 'react'

// [ref, visible] döner. Element viewport'a girince visible=true (bir kez). reduced ise hep true.
export function useReveal(reduced = false) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(reduced)
  useEffect(() => {
    if (reduced || !ref.current) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { setVisible(true); io.disconnect() } })
    }, { threshold: 0.15 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [reduced])
  return [ref, visible]
}
