import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import RoomCard from './RoomCard.jsx'

export default function BlockView({ block }) {
  const { data: rooms = [], refetch } = useQuery({
    queryKey: ['rooms', block],
    queryFn: () => api.get(`/capacity/rooms?block=${block}`).then(r => r.data),
    enabled: !!block
  })

  const floors = [...new Set(rooms.map(r => r.floor))].sort()

  return (
    <div className="space-y-6">
      {floors.map(floor => (
        <div key={floor}>
          <h3 className="text-sm font-medium text-slate-400 mb-3">Kat {floor}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {rooms.filter(r => r.floor === floor).map(room => (
              <RoomCard key={room.id} room={room} onUpdated={refetch} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
