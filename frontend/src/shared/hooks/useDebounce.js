import { useEffect, useState } from 'react'

// Bir değeri belirtilen ms sonra "yansıtır". Hızlı keystroke'larda
// tetiklenen query/filtre işlemlerinde kullanılır.
// useEffect cleanup ile arka arkaya tetiklenen timer'lar iptal edilir.
export function useDebounce(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
