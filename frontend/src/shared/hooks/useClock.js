import { useState, useEffect } from 'react'
import { getLocale } from '../i18n/index.js'

// Canlı saat (HH:MM) + locale'e göre tarih. 30sn'de bir günceller.
const LOCALE_MAP = { tr: 'tr-TR', en: 'en-US', ar: 'ar-SA' }

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const intl = LOCALE_MAP[getLocale()] || 'tr-TR'
  const time = now.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short' })
  return { time, date }
}
