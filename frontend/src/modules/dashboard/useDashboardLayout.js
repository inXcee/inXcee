import { useState, useCallback } from 'react'

// Dashboard widget kişiselleştirme — göster/gizle + sıra, localStorage'da (cihaz başı).
// Saf yardımcılar test edilebilir; hook onları sarar.

const KEY = 'yys-dash-layout'

// Kayıtlı sıra + yeni eklenen widget'ları birleştir: bilinen kayıtlı sıra önce,
// kayıtta olmayan (yeni) id'ler sona; kayıttaki bilinmeyen id'ler düşer.
export function mergeOrder(allIds, savedOrder = []) {
  const known = savedOrder.filter(id => allIds.includes(id))
  const rest = allIds.filter(id => !known.includes(id))
  return [...known, ...rest]
}

// Bir id'yi komşusuyla takas ederek yukarı/aşağı taşı; sınırda değişmeden döner.
export function moveInOrder(order, id, dir) {
  const i = order.indexOf(id)
  if (i < 0) return order
  const j = dir === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= order.length) return order
  const next = order.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

function write(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* localStorage yoksa yoksay */ }
}

export function useDashboardLayout(allIds) {
  const [saved, setSaved] = useState(read)
  const order = mergeOrder(allIds, saved.order)
  const hidden = new Set(saved.hidden || [])

  const toggle = useCallback((id) => {
    setSaved(prev => {
      const h = new Set(prev.hidden || [])
      if (h.has(id)) h.delete(id); else h.add(id)
      const next = { ...prev, hidden: [...h] }
      write(next)
      return next
    })
  }, [])

  const move = useCallback((id, dir) => {
    setSaved(prev => {
      const next = { ...prev, order: moveInOrder(mergeOrder(allIds, prev.order), id, dir) }
      write(next)
      return next
    })
  }, [allIds])

  const reset = useCallback(() => { write({}); setSaved({}) }, [])

  return { order, hidden, isVisible: (id) => !hidden.has(id), toggle, move, reset }
}
