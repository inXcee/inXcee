import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import QRScanner from './QRScanner.jsx'
import DistributionRoute from './DistributionRoute.jsx'

const TABS = ['Toplama', 'Yükleme', 'Dağıtım']
const BLOCKS = ['M1', 'M2', 'S1', 'S2', 'S3']

export default function LaundryPage() {
  const [tab, setTab] = useState(0)
  const [selectedMachine, setSelectedMachine] = useState(1)
  const [selectedBlock, setSelectedBlock] = useState('M1')
  const [selectedBags, setSelectedBags] = useState([])
  const qc = useQueryClient()

  const { data: bags = [] } = useQuery({
    queryKey: ['laundry-collected'],
    queryFn: () =>
      api.get('/laundry/distribution-route').then(() => null).catch(() => null)
        .then(() => fetch('/api/laundry/bags/collected', { headers: { Authorization: `Bearer ${localStorage.getItem?.('yys-auth') || ''}` } })
          .catch(() => ({ json: () => [] }))),
    enabled: tab === 1
  })

  // For loading tab - get collected bags from DB directly via a workaround
  // We'll just show a simple form
  const loadMachine = useMutation({
    mutationFn: () => api.post(`/laundry/machines/${selectedMachine}/load`, { bag_ids: selectedBags, block: selectedBlock }),
    onSuccess: () => { setSelectedBags([]); qc.invalidateQueries() }
  })

  const finishMachine = useMutation({
    mutationFn: (id) => api.post(`/laundry/machines/${id}/finish`),
    onSuccess: () => qc.invalidateQueries()
  })

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-100 mb-6">Çamaşırhane Yönetimi</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === i ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab 0: Toplama */}
      {tab === 0 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">QR ile Torba Toplama</h2>
          <p className="text-sm text-slate-500">Odadan alınan çamaşır torbasının QR kodunu okutun.</p>
          <QRScanner onCollected={() => qc.invalidateQueries()} />
        </div>
      )}

      {/* Tab 1: Yükleme */}
      {tab === 1 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">Makineye Yükleme</h2>
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Makine</label>
              <select value={selectedMachine} onChange={e => setSelectedMachine(+e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100">
                {[1, 2, 3].map(m => <option key={m} value={m}>Makine {m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Blok</label>
              <select value={selectedBlock} onChange={e => setSelectedBlock(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100">
                {BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Torba ID'lerini virgülle girin (örn: 1,2,3)</p>
          <input
            type="text"
            placeholder="Torba ID'leri (1,2,3)"
            onChange={e => setSelectedBags(e.target.value.split(',').map(s => +s.trim()).filter(Boolean))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
          />
          <div className="flex gap-2">
            <button
              onClick={() => loadMachine.mutate()}
              disabled={loadMachine.isPending || !selectedBags.length}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm"
            >
              {loadMachine.isPending ? 'Yükleniyor...' : 'Makineye Yükle'}
            </button>
            {[1, 2, 3].map(id => (
              <button
                key={id}
                onClick={() => finishMachine.mutate(id)}
                className="px-3 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-xs"
              >
                Makine {id} Bitti
              </button>
            ))}
          </div>
          {loadMachine.isSuccess && <div className="text-green-400 text-sm">✅ Yükleme başarılı</div>}
          {loadMachine.isError && <div className="text-red-400 text-sm">{loadMachine.error?.response?.data?.error || 'Hata'}</div>}
        </div>
      )}

      {/* Tab 2: Dağıtım */}
      {tab === 2 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">Dağıtım Rotası</h2>
          <DistributionRoute />
        </div>
      )}
    </div>
  )
}
