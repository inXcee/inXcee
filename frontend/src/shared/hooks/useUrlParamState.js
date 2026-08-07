import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'

// URL query parametresine bağlı state. Paylaşılabilir URL + geri tuşu uyumu.
//
//   const [tab, setTab] = useUrlParamState('tab', 'search')
//   const [date, setDate] = useUrlParamState('date', todayStr)   // shared/logic/localDate.js
//
// Boş string ve default value URL'den temizlenir (URL kirli kalmasın diye).
export function useUrlParamState(key, defaultValue) {
  const [params, setParams] = useSearchParams()
  const computedDefault = typeof defaultValue === 'function' ? defaultValue() : defaultValue
  const value = params.get(key) ?? computedDefault

  const setValue = useCallback((next) => {
    setParams((prev) => {
      const newParams = new URLSearchParams(prev)
      if (next == null || next === '' || next === computedDefault) {
        newParams.delete(key)
      } else {
        newParams.set(key, String(next))
      }
      return newParams
    }, { replace: true })
  }, [key, computedDefault, setParams])

  return [value, setValue]
}
