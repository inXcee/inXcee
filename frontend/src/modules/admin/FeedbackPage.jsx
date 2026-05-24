import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const TYPE_LABEL = { complaint: 'Şikayet', suggestion: 'Öneri', other: 'Diğer' }

export default function FeedbackPage() {
  const qc = useQueryClient()
  const [type, setType] = useState('')
  const [resolved, setResolved] = useState('0')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['feedback', type, resolved],
    queryFn: () => {
      const p = new URLSearchParams()
      if (type) p.set('type', type)
      if (resolved) p.set('resolved', resolved)
      return api.get(`/feedback?${p.toString()}`).then(r => r.data)
    },
  })

  const resolveMut = useMutation({
    mutationFn: ({ id, val }) => api.patch(`/feedback/${id}/resolve`, { resolved: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })

  const openCount = items.filter(f => !f.resolved_at).length

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold">Geri Bildirim {resolved === '0' && openCount > 0 ? `(${openCount} açık)` : ''}</h1>
        <div className="flex gap-2 text-sm">
          <select value={type} onChange={e => setType(e.target.value)} className="border rounded-lg px-2 py-1">
            <option value="">Tüm tipler</option>
            <option value="complaint">Şikayet</option>
            <option value="suggestion">Öneri</option>
            <option value="other">Diğer</option>
          </select>
          <select value={resolved} onChange={e => setResolved(e.target.value)} className="border rounded-lg px-2 py-1">
            <option value="0">Açık</option>
            <option value="1">Çözüldü</option>
            <option value="">Tümü</option>
          </select>
        </div>
      </div>

      {isLoading ? <div className="text-slate-500 text-sm">Yükleniyor…</div>
        : items.length === 0 ? <div className="text-slate-500 text-sm">Kayıt yok</div>
        : (
          <div className="space-y-2">
            {items.map(f => (
              <div key={f.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100">{TYPE_LABEL[f.type] || f.type}</span>
                    <span className="text-sm font-medium">{f.source_name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(f.created_at).toLocaleString('tr-TR')}</span>
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-line">{f.message}</div>
                <div className="mt-2">
                  <button onClick={() => resolveMut.mutate({ id: f.id, val: !f.resolved_at })} disabled={resolveMut.isPending}
                    className={`text-xs rounded-lg px-3 py-1 ${f.resolved_at ? 'bg-slate-100 text-slate-500' : 'bg-green-600 text-white'}`}>
                    {f.resolved_at ? '↩ Tekrar aç' : '✓ Çözüldü'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
