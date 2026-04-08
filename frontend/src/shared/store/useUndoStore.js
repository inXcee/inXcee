import { create } from 'zustand'

let _nextId = 1

export const useUndoStore = create((set, get) => ({
  stack: [], // [{ id, label, timestamp, undo }], max 10, LIFO

  push({ label, undo }) {
    const entry = { id: _nextId++, label, timestamp: Date.now(), undo }
    set(s => ({ stack: [entry, ...s.stack].slice(0, 10) }))
    return entry.id
  },

  remove(id) {
    set(s => ({ stack: s.stack.filter(e => e.id !== id) }))
  },

  peek() {
    return get().stack[0] || null
  },

  clear() {
    set({ stack: [] })
  },
}))
