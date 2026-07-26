import { useEffect, useState } from 'react'

// CSS media query'sini React state'ine bağlar. Sunucu/tarayıcı-dışı ortamda
// (test, SSR) matchMedia olmayabilir → güvenli şekilde false döner.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const list = window.matchMedia(query)
    const onChange = event => setMatches(event.matches)
    setMatches(list.matches)
    // Safari <14 addEventListener desteklemiyor → addListener'a düş.
    if (list.addEventListener) list.addEventListener('change', onChange)
    else list.addListener(onChange)
    return () => {
      if (list.removeEventListener) list.removeEventListener('change', onChange)
      else list.removeListener(onChange)
    }
  }, [query])

  return matches
}

// Dar ekran eşiği — harita/panel dikey yığılmaya buradan geçer.
export const useIsNarrow = (maxWidth = 900) => useMediaQuery(`(max-width: ${maxWidth}px)`)
