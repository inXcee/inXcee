const KEY = 'yys-offline-queue'

export function enqueue(item) {
  const q = getQueue()
  q.push({ ...item, ts: Date.now() })
  localStorage.setItem(KEY, JSON.stringify(q))
}

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function clearQueue() {
  localStorage.removeItem(KEY)
}
