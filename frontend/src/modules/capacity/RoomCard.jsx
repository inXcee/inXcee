import { useState } from 'react'
import api from '../../shared/api/client.js'
import BedEditor from './BedEditor.jsx'

const STATUS_LABELS = { active: 'Aktif', quarantine: 'Karantina', maintenance: 'Bakım' }
const STATUS_COLORS = { active: 'text-green-400', quarantine: 'text-blue-400', maintenance: 'text-yellow-400' }

export default function RoomCard({ room, onUpdated }) {
  const [expanded, setExpanded] = useState(false)
  const [personnel, setPersonnel] = useState(null)
  const [loadingPersonnel, setLoadingPersonnel] = useState(false)

  const occupancy = room.occupied / Math.max(room.active_beds, 1)
  const bgColor = room.status === 'quarantine' ? 'border-blue-500 bg-blue-950/30' :
    occupancy >= 1 ? 'border-red-500 bg-red-950/20' :
    occupancy >= 0.6 ? 'border-yellow-500 bg-yellow-950/20' :
    'border-slate-700 bg-slate-900'

  const handleExpand = async () => {
    setExpanded(e => !e)
    if (!personnel && !loadingPersonnel) {
      setLoadingPersonnel(true)
      try {
        const res = await api.get(`/capacity/rooms/${room.id}/personnel`)
        setPersonnel(res.data)
      } catch { setPersonnel([]) }
      finally { setLoadingPersonnel(false) }
    }
  }

  const changeStatus = async (status) => {
    try {
      await api.patch(`/capacity/rooms/${room.id}/status`, { status })
      onUpdated?.()
    } catch (e) {
      alert(e.response?.data?.error || 'Durum değiştirilemedi')
    }
  }

  return (
    <div className={`border rounded-lg p-3 cursor-pointer ${bgColor}`} onClick={handleExpand}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-sm font-medium">{room.room_no}</div>
          <div className="text-xs text-slate-500">{room.occupied}/{room.active_beds} kişi</div>
        </div>
        <span className={`text-xs ${STATUS_COLORS[room.status]}`}>{STATUS_LABELS[room.status]}</span>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-slate-700 pt-3 space-y-3" onClick={e => e.stopPropagation()}>
          <BedEditor room={room} onUpdated={onUpdated} />
          <div className="flex gap-2">
            {room.status !== 'active' && <button onClick={() => changeStatus('active')} className="text-xs px-2 py-1 bg-green-900 text-green-300 rounded">Aktife Al</button>}
            {room.status !== 'quarantine' && <button onClick={() => changeStatus('quarantine')} className="text-xs px-2 py-1 bg-blue-900 text-blue-300 rounded">Karantina</button>}
            {room.status !== 'maintenance' && <button onClick={() => changeStatus('maintenance')} className="text-xs px-2 py-1 bg-yellow-900 text-yellow-300 rounded">Bakım</button>}
          </div>
          {loadingPersonnel ? <div className="text-xs text-slate-500">Yükleniyor...</div> :
            personnel && personnel.length > 0 ? (
              <div className="space-y-1">
                {personnel.map(p => (
                  <div key={p.id} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="font-mono text-slate-500">Yatak {p.bed_no}</span>
                    <span>{p.full_name}</span>
                    {p.company && <span className="text-slate-500">{p.company}</span>}
                  </div>
                ))}
              </div>
            ) : personnel && <div className="text-xs text-slate-500">Oda boş</div>
          }
        </div>
      )}
    </div>
  )
}
