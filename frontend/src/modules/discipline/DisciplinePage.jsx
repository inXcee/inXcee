import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function DisciplinePage() {
  const qc = useQueryClient()
  const [tcSearch, setTcSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [cardForm, setCardForm] = useState({ card_type: 'yellow', reason: '' })
  const [blacklistReason, setBlacklistReason] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)

  const { data: records = [] } = useQuery({
    queryKey: ['discipline-records', selectedPerson?.id],
    queryFn: () => api.get(`/discipline/records/${selectedPerson.id}`).then(r => r.data),
    enabled: !!selectedPerson
  })

  const searchPerson = async () => {
    try {
      const res = await api.post('/checkin/lookup', { tc_no: tcSearch })
      if (res.data.found) setSelectedPerson(res.data)
      else alert('Personel bulunamadı')
    } catch { alert('Arama hatası') }
  }

  const addCard = useMutation({
    mutationFn: () => api.post('/discipline/records', { personnel_id: selectedPerson.id, ...cardForm }),
    onSuccess: () => { setCardForm({ card_type: 'yellow', reason: '' }); qc.invalidateQueries({ queryKey: ['discipline-records'] }) }
  })

  const addBlacklist = useMutation({
    mutationFn: () => api.post('/discipline/blacklist', { personnel_id: selectedPerson.id, reason: blacklistReason }),
    onSuccess: () => { setShowBlacklist(false); setBlacklistReason('') }
  })

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-100 mb-6">Disiplin Yönetimi</h1>

      {/* Search */}
      <div className="bg-slate-900 rounded-xl p-4 mb-6 flex gap-3">
        <input
          value={tcSearch}
          onChange={e => setTcSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchPerson()}
          placeholder="TC Kimlik No"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          maxLength={11}
        />
        <button onClick={searchPerson} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">Ara</button>
      </div>

      {selectedPerson && (
        <div className="space-y-6">
          {/* Person info */}
          <div className="bg-slate-900 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-100">{selectedPerson.full_name}</div>
                <div className="text-sm text-slate-400">{selectedPerson.company} · {selectedPerson.hometown}</div>
                <div className="text-sm mt-1">
                  <span className={`font-medium ${selectedPerson.discipline_points >= 3 ? 'text-red-400' : selectedPerson.discipline_points >= 2 ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {selectedPerson.discipline_points} puan
                  </span>
                </div>
              </div>
              <button onClick={() => setShowBlacklist(s => !s)} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded text-xs">
                Kara Listeye Al
              </button>
            </div>
            {showBlacklist && (
              <div className="mt-4 space-y-2">
                <input value={blacklistReason} onChange={e => setBlacklistReason(e.target.value)} placeholder="Kara listeye alma sebebi" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100" />
                <button onClick={() => addBlacklist.mutate()} disabled={!blacklistReason} className="px-4 py-2 bg-red-800 text-white rounded text-sm disabled:opacity-50">Onayla</button>
              </div>
            )}
          </div>

          {/* Add card */}
          <div className="bg-slate-900 rounded-xl p-4 space-y-3">
            <h2 className="font-medium text-slate-200">Kart Ekle</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setCardForm(p => ({ ...p, card_type: 'yellow' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${cardForm.card_type === 'yellow' ? 'border-yellow-500 bg-yellow-900/30 text-yellow-300' : 'border-slate-700 text-slate-400'}`}
              >
                🟨 Sarı Kart
              </button>
              <button
                onClick={() => setCardForm(p => ({ ...p, card_type: 'red' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${cardForm.card_type === 'red' ? 'border-red-500 bg-red-900/30 text-red-300' : 'border-slate-700 text-slate-400'}`}
              >
                🟥 Kırmızı Kart
              </button>
            </div>
            <input
              value={cardForm.reason}
              onChange={e => setCardForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="İhlal sebebi"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => addCard.mutate()}
              disabled={addCard.isPending || !cardForm.reason}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 text-white rounded-lg text-sm"
            >
              {addCard.isPending ? 'Kaydediliyor...' : 'Kart Ver'}
            </button>
          </div>

          {/* History */}
          {records.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4">
              <h2 className="font-medium text-slate-200 mb-3">Disiplin Geçmişi</h2>
              <div className="space-y-2">
                {records.map(r => (
                  <div key={r.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0">{r.card_type === 'yellow' ? '🟨' : '🟥'}</span>
                    <div>
                      <div className="text-slate-300">{r.reason}</div>
                      <div className="text-xs text-slate-500">{r.created_by_name} · {new Date(r.created_at).toLocaleDateString('tr-TR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
