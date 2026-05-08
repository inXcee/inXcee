import { useRef } from 'react'

// Long press (uzun basma) gesture'i — touch ve mouse icin.
// Kullanim:
//   const longPress = useLongPress(() => navigate('/dnd'), 600)
//   <div {...longPress}>...</div>

export function useLongPress(onLongPress, ms = 600) {
  const timerRef = useRef(null)
  const triggeredRef = useRef(false)

  function start() {
    triggeredRef.current = false
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true
      navigator.vibrate?.([40])
      onLongPress?.()
    }, ms)
  }

  function cancel() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    // Click handler'i dis bilesen ekleyebilir; longPress tetiklendiyse iptal etmeli
    triggered: () => triggeredRef.current,
  }
}
