import { useEffect, useState, useCallback } from 'react'
import { DICT, DEFAULT_LOCALE, LOCALES } from './dict.js'

const STORAGE_KEY = 'yys-locale'

function readLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALES[stored]) return stored
  } catch { /* localStorage devre dışı */ }
  // Kiosk/Türk iş gücü: tarayıcı dili yerine her zaman varsayılan (tr). Kullanıcı switcher'dan değiştirebilir.
  return DEFAULT_LOCALE
}

// Dot-notation lookup: 'kiosk.tabs.info' → DICT[locale].kiosk.tabs.info
function lookup(dict, key) {
  let cur = dict
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

// Aboneler — locale değişince re-render tetiklemek için.
const subscribers = new Set()
let currentLocale = typeof window !== 'undefined' ? readLocale() : DEFAULT_LOCALE

function notifySubscribers() {
  for (const cb of subscribers) cb(currentLocale)
}

export function setLocale(next) {
  if (!LOCALES[next] || next === currentLocale) return
  currentLocale = next
  try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* yoksay */ }
  // HTML dir attribute — Arapça için RTL
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', next)
    document.documentElement.setAttribute('dir', LOCALES[next].dir)
  }
  notifySubscribers()
}

export function getLocale() {
  return currentLocale
}

// Bileşen-içi: değişince re-render olur, t() hazır gelir.
export function useTranslation() {
  const [locale, setLocaleState] = useState(currentLocale)

  useEffect(() => {
    const cb = (next) => setLocaleState(next)
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  }, [])

  const t = useCallback((key, fallback) => {
    const dict = DICT[locale] || DICT[DEFAULT_LOCALE]
    const val = lookup(dict, key)
    if (val != null) return val
    // Eksik çevirilerde TR'ye düş
    if (locale !== DEFAULT_LOCALE) {
      const trVal = lookup(DICT[DEFAULT_LOCALE], key)
      if (trVal != null) return trVal
    }
    return fallback ?? key
  }, [locale])

  return { t, locale, setLocale, locales: LOCALES }
}

// İlk yüklemede HTML dir/lang attribute'larını ayarla.
if (typeof document !== 'undefined') {
  const meta = LOCALES[currentLocale]
  document.documentElement.setAttribute('lang', currentLocale)
  document.documentElement.setAttribute('dir', meta?.dir || 'ltr')
}
