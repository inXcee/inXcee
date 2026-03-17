import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import QRScanner from './QRScanner.jsx'
import DistributionRoute from './DistributionRoute.jsx'

const TABS = [
  { label: 'TOPLAMA', icon: '↓' },
  { label: 'YÜKLEME', icon: '⊙' },
  { label: 'DAĞITIM', icon: '↗' },
]
const BLOCKS = ['M1', 'M2', 'S1', 'S2', 'S3']
const MACHINES = [1, 2, 3]

export default function LaundryPage() {
  const [tab, setTab] = useState(0)
  const [selectedMachine, setSelectedMachine] = useState(1)
  const [selectedBlock, setSelectedBlock] = useState('M1')
  const [bagInput, setBagInput] = useState('')
  const qc = useQueryClient()

  const { data: bags = [] } = useQuery({
    queryKey: ['laundry-bags'],
    queryFn: () => api.get('/laundry/bags').then(r => r.data),
    refetchInterval: 30000,
  })

  const loadMachine = useMutation({
    mutationFn: () => {
      const bag_ids = bagInput.split(',').map(s => +s.trim()).filter(Boolean)
      return api.post(`/laundry/machines/${selectedMachine}/load`, { bag_ids, block: selectedBlock })
    },
    onSuccess: () => { setBagInput(''); qc.invalidateQueries() },
  })

  const finishMachine = useMutation({
    mutationFn: (id) => api.post(`/laundry/machines/${id}/finish`),
    onSuccess: () => qc.invalidateQueries(),
  })

  const statusCounts = {
    collected: bags.filter(b => b.status === 'collected').length,
    in_laundry: bags.filter(b => b.status === 'in_laundry').length,
    delivered: bags.filter(b => b.status === 'delivered').length,
  }

  return (
    <div style={{ maxWidth: '780px', position: 'relative', zIndex: 1 }} className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>ÇAMAŞIRHANE</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          TORBA TAKİP VE DAĞITIM YÖNETİMİ
        </p>
      </div>

      {/* Status strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }} className="fade-up-1">
        {[
          { label: 'TOPLANAN', value: statusCounts.collected, color: 'var(--accent)' },
          { label: 'YIKAMADA', value: statusCounts.in_laundry, color: 'var(--blue)' },
          { label: 'TESLİM', value: statusCounts.delivered, color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: s.color, letterSpacing: '1px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0', marginBottom: '16px',
        background: 'var(--surface2)', borderRadius: '8px', padding: '4px',
        border: '1px solid var(--border)',
      }} className="fade-up-1">
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{
              flex: 1, padding: '8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: tab === i ? 'var(--surface3)' : 'transparent',
              color: tab === i ? 'var(--text)' : 'var(--text3)',
              borderLeft: tab === i ? '1px solid var(--border)' : '1px solid transparent',
              borderRight: tab === i ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab 0: Toplama */}
      {tab === 0 && (
        <div className="panel fade-up-2">
          <div className="panel-header">
            <div>
              <div className="panel-title">QR TORBA TOPLAMA</div>
              <div className="panel-subtitle">ODA ÇAMAŞIR TORBASI OKUT</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="alert alert-info" style={{ marginBottom: '14px' }}>
              <span>ℹ</span>
              <span>Odadan alınan çamaşır torbasının QR kodunu kameraya gösterin.</span>
            </div>
            <QRScanner onCollected={() => qc.invalidateQueries()} />
          </div>
        </div>
      )}

      {/* Tab 1: Yükleme */}
      {tab === 1 && (
        <div className="panel fade-up-2">
          <div className="panel-header">
            <div>
              <div className="panel-title">MAKİNEYE YÜKLEME</div>
              <div className="panel-subtitle">TORBA → MAKİNE ATAMASI</div>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">Makine</label>
                <select
                  value={selectedMachine}
                  onChange={e => setSelectedMachine(+e.target.value)}
                  className="form-select"
                >
                  {MACHINES.map(m => <option key={m} value={m}>Makine {m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">Blok</label>
                <select
                  value={selectedBlock}
                  onChange={e => setSelectedBlock(e.target.value)}
                  className="form-select"
                >
                  {BLOCKS.map(b => <option key={b} value={b}>{b} Blok</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Torba ID Listesi (virgülle ayırın)</label>
              <input
                value={bagInput}
                onChange={e => setBagInput(e.target.value)}
                placeholder="1, 2, 3, 4..."
                className="form-input"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => loadMachine.mutate()}
                disabled={loadMachine.isPending || !bagInput.trim()}
                className="btn btn-primary"
                style={{ opacity: (loadMachine.isPending || !bagInput.trim()) ? 0.6 : 1 }}
              >
                {loadMachine.isPending ? 'YÜKLENİYOR...' : '⊙ MAKİNEYE YÜKLE'}
              </button>
            </div>
            {loadMachine.isSuccess && (
              <div className="alert alert-success"><span>✓</span><span>Yükleme başarılı</span></div>
            )}
            {loadMachine.isError && (
              <div className="alert alert-danger"><span>⚠</span><span>{loadMachine.error?.response?.data?.error || 'Yükleme hatası'}</span></div>
            )}

            {/* Machine finish buttons */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <label className="form-label" style={{ marginBottom: '10px' }}>Makine Tamamla</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {MACHINES.map(id => (
                  <button
                    key={id}
                    onClick={() => finishMachine.mutate(id)}
                    disabled={finishMachine.isPending}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--green)', borderColor: 'rgba(39,201,106,0.3)' }}
                  >
                    ✓ MAKİNE {id} BİTTİ
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Dağıtım */}
      {tab === 2 && (
        <div className="panel fade-up-2">
          <div className="panel-header">
            <div>
              <div className="panel-title">DAĞITIM ROTASI</div>
              <div className="panel-subtitle">YIKANMIŞ TORBA TESLİMATI</div>
            </div>
          </div>
          <div className="panel-body">
            <DistributionRoute />
          </div>
        </div>
      )}

      {/* Bags quick table */}
      {bags.length > 0 && (
        <div className="panel fade-up-3" style={{ marginTop: '16px' }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">TORBA DURUMU</div>
              <div className="panel-subtitle">TÜM AKTIF TORBALAR</div>
            </div>
            <span className="badge badge-gray">{bags.length}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>TORBA</th>
                  <th>KİŞİ</th>
                  <th>ODA</th>
                  <th>DURUM</th>
                </tr>
              </thead>
              <tbody>
                {bags.slice(0, 10).map(bag => (
                  <tr key={bag.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>
                      {bag.bag_code || `#${bag.id}`}
                    </td>
                    <td style={{ fontWeight: 500 }}>{bag.person_name || bag.personnel_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
                      {bag.room_no ? `${bag.block}-${bag.room_no}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${bag.status === 'delivered' ? 'badge-green' : bag.status === 'in_laundry' ? 'badge-blue' : 'badge-amber'}`}>
                        {bag.status === 'delivered' ? 'TESLİM' : bag.status === 'in_laundry' ? 'YIKAMA' : 'TOPLANDI'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
