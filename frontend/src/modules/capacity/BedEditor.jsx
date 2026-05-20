import { useState } from 'react'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

export default function BedEditor({ room, onUpdated }) {
  const [value, setValue] = useState(room.active_beds)
  const [loading, setLoading] = useState(false)

  const maxCap = room.capacity

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.patch(`/capacity/rooms/${room.id}/beds`, { active_beds: value })
      onUpdated?.()
    } catch (e) {
      useToastStore.getState().addToast(e.response?.data?.error || 'Güncelleme hatası', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setValue(v => Math.max(0, v - 1))} className="w-6 h-6 bg-slate-700 rounded text-slate-300 hover:bg-slate-600 text-sm">-</button>
      <span className="text-sm font-mono w-8 text-center">{value}/{maxCap}</span>
      <button onClick={() => setValue(v => Math.min(maxCap, v + 1))} className="w-6 h-6 bg-slate-700 rounded text-slate-300 hover:bg-slate-600 text-sm">+</button>
      {value !== room.active_beds && (
        <button onClick={handleSave} disabled={loading} className="ml-1 px-2 py-0.5 bg-blue-700 text-white rounded text-xs">
          {loading ? '...' : 'Kaydet'}
        </button>
      )}
    </div>
  )
}
