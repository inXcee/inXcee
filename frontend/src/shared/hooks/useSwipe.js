import { useRef, useState } from 'react'

// Yatay swipe gesture'i yakalar — mobile kartlarda sag/sol kaydirma icin.
// dragX state'i visual feedback (kart kayar gibi gosterim) icin acik tutulur.
//
// Kullanim:
//   const { handlers, dragX, isSwiping } = useSwipe({
//     onSwipeLeft: () => handleSkip(),
//     onSwipeRight: () => handleComplete(),
//     threshold: 100,
//   })
//   <div {...handlers} style={{ transform: `translateX(${dragX}px)` }} />

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 80, vertical = false } = {}) {
  const start = useRef({ x: 0, y: 0 })
  const [dragX, setDragX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)

  function reset() {
    setDragX(0)
    setIsSwiping(false)
  }

  return {
    handlers: {
      onTouchStart: (e) => {
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        setIsSwiping(true)
      },
      onTouchMove: (e) => {
        const dx = e.touches[0].clientX - start.current.x
        const dy = e.touches[0].clientY - start.current.y
        // Dikey kaydirma daha baskinsa (>1.5x), swipe iptal — pull-to-refresh / scroll cakismasin
        if (!vertical && Math.abs(dy) > Math.abs(dx) * 1.5) {
          if (isSwiping) reset()
          return
        }
        setDragX(dx)
      },
      onTouchEnd: () => {
        if (dragX > threshold) onSwipeRight?.()
        else if (dragX < -threshold) onSwipeLeft?.()
        reset()
      },
      onTouchCancel: reset,
    },
    dragX,
    isSwiping,
  }
}
