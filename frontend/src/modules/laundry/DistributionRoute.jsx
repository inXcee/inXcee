import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../../shared/api/client.js'

export default function DistributionRoute() {
  const qc = useQueryClient()
  const { data: bags = [], isLoading } = useQuery({
    queryKey: ['distribution-route'],
    queryFn: () => api.get('/laundry/distribution-route').then(r => r.data)
  })

  const distribute = useMutation({
    mutationFn: ({ id, damageNote }) => api.post(`/laundry/bags/${id}/distribute`, { damage_note: damageNote }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['distribution-route'] })
  })

  const [damageNotes, setDamageNotes] = useState({})

  if (isLoading) return <div className="text-slate-500 text-sm">Yükleniyor...</div>
  if (!bags.length) return <div className="text-slate-500 text-sm">Dağıtılacak torba yok</div>

  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-400 mb-3">{bags.length} torba dağıtılacak</div>
      {bags.map(bag => (
        <div key={bag.id} className="bg-slate-800 rounded-lg p-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="font-medium text-sm">{bag.block} - Oda {bag.room_no}</div>
            <div className="text-xs text-slate-500">Kat {bag.floor}</div>
          </div>
          <input
            type="text"
            placeholder="Hasar notu (opsiyonel)"
            value={damageNotes[bag.id] || ''}
            onChange={e => setDamageNotes(p => ({ ...p, [bag.id]: e.target.value }))}
            className="w-40 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100"
          />
          <button
            onClick={() => distribute.mutate({ id: bag.id, damageNote: damageNotes[bag.id] })}
            className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs"
          >
            Teslim
          </button>
        </div>
      ))}
    </div>
  )
}
