import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STATUS_LABELS = { open: 'Açık', in_progress: 'Devam Ediyor', done: 'Tamamlandı' }
const STATUS_COLORS = { open: 'text-red-400', in_progress: 'text-yellow-400', done: 'text-green-400' }

export default function MaintenancePage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ location: '', description: '' })
  const [photo, setPhoto] = useState(null)
  const [filter, setFilter] = useState('open')

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['maintenance-requests', filter],
    queryFn: () => api.get(`/maintenance/requests${filter !== 'all' ? `?status=${filter}` : ''}`).then(r => r.data)
  })

  const createRequest = useMutation({
    mutationFn: () => api.post('/maintenance/requests', form),
    onSuccess: () => { setShowForm(false); setForm({ location: '', description: '' }); qc.invalidateQueries({ queryKey: ['maintenance-requests'] }) }
  })

  const closeRequest = useMutation({
    mutationFn: ({ id, photoUrl }) => {
      const formData = new FormData()
      if (photoUrl) formData.append('photo_url', photoUrl)
      return api.patch(`/maintenance/requests/${id}/close`, formData)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">Teknik Servis</h1>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
          + Yeni Arıza
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="bg-slate-900 rounded-xl p-6 mb-6 space-y-4">
          <h2 className="font-medium text-slate-200">Yeni Arıza Kaydı</h2>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Konum</label>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="M1 Kat 1 Banyo" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Açıklama</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fotoğraf (opsiyonel)</label>
            <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} className="text-sm text-slate-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">İptal</button>
            <button onClick={() => createRequest.mutate()} disabled={createRequest.isPending || !form.location || !form.description} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm">
              {createRequest.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['open', 'in_progress', 'done', 'all'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-xs ${filter === s ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {s === 'all' ? 'Tümü' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? <div className="text-slate-500 text-sm">Yükleniyor...</div> :
        requests.length === 0 ? <div className="text-slate-500 text-sm">Arıza kaydı yok</div> :
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-slate-900 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${STATUS_COLORS[req.status]}`}>{STATUS_LABELS[req.status]}</span>
                    {req.is_preventive ? <span className="text-xs bg-purple-900/50 text-purple-300 px-1 rounded">Önleyici</span> : null}
                  </div>
                  <div className="font-medium text-sm text-slate-200 mt-1">{req.location}</div>
                  <div className="text-sm text-slate-400">{req.description}</div>
                  {req.assignee_name && <div className="text-xs text-slate-500 mt-1">Atanan: {req.assignee_name}</div>}
                  <div className="text-xs text-slate-600 mt-1">{new Date(req.opened_at).toLocaleDateString('tr-TR')}</div>
                </div>
                {req.status !== 'done' && (
                  <button
                    onClick={() => closeRequest.mutate({ id: req.id })}
                    className="px-3 py-1 bg-green-800 hover:bg-green-700 text-white rounded text-xs shrink-0"
                  >
                    Kapat
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  )
}
