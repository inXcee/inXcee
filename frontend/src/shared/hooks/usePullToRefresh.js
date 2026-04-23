import { useState, useRef } from 'react'

export function usePullToRefresh(onRefresh) {
  const [isPulling, setIsPulling] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  function onTouchStart(e) {
    startY.current = e.touches[0].clientY
    pulling.current = false
  }

  function onTouchMove(e) {
    const dy = e.touches[0].clientY - startY.current
    if (dy > 70 && window.scrollY === 0 && !pulling.current) {
      pulling.current = true
      setIsPulling(true)
    }
  }

  function onTouchEnd() {
    if (pulling.current) {
      pulling.current = false
      setIsPulling(false)
      onRefresh()
    }
  }

  return { isPulling, handlers: { onTouchStart, onTouchMove, onTouchEnd } }
}
