import { useEffect, useRef, useState } from 'react'

// Web Speech API wrapper'i — Turkce dikte icin.
// onResult(text) FINAL chunk'larda cagrilir (interim sonuclar burada filtrelenir).
// onError(msg) basarisiz olursa.
//
// Kullanim:
//   const { listening, supported, start, stop } = useSpeechRecognition({
//     onResult: (text) => setDescription(d => d + ' ' + text),
//   })

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

export function useSpeechRecognition({ lang = 'tr-TR', onResult, onError } = {}) {
  const recRef = useRef(null)
  const callbacksRef = useRef({ onResult, onError })
  callbacksRef.current = { onResult, onError }

  const [listening, setListening] = useState(false)
  const supported = !!SR

  useEffect(() => () => {
    try { recRef.current?.stop() } catch {}
  }, [])

  function start() {
    if (!supported || listening) return
    try {
      const rec = new SR()
      rec.lang = lang
      rec.continuous = true
      rec.interimResults = false
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) callbacksRef.current.onResult?.(r[0].transcript.trim())
        }
      }
      rec.onerror = (e) => {
        callbacksRef.current.onError?.(e.error || 'Mikrofon hatasi')
        setListening(false)
      }
      rec.onend = () => setListening(false)
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch (e) {
      callbacksRef.current.onError?.(e.message || 'Baslatilamadi')
    }
  }

  function stop() {
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }

  return { listening, supported, start, stop }
}
