import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { BLOCKS } from '../../shared/blocks.js'

// Tahliye / yoklama paneli — bu an blokta kim var? Drill ve gerçek tahliye için.
export default function RosterPanel() {
  const token = useAuthStore(s => s.token)
  const [block, setBlock] = useState('')
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['drills-roster', block],
    queryFn: () => api.get('/drills/roster' + (block ? `?block=${block}` : '')).then(r => r.data),
    staleTime: 30_000,
  })

  const generatedLabel = useMemo(() => {
    if (!data?.generated_at) return '—'
    return new Date(data.generated_at).toLocaleString('tr-TR')
  }, [data?.generated_at])

  async function downloadPdf() {
    setDownloading(true)
    try {
      const url = `/api/drills/roster.pdf${block ? `?block=${block}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const today = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `tahliye-listesi-${block || 'tum-bloklar'}-${today}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } finally {
      setDownloading(false)
    }
  }

  function printRoster() {
    window.print()
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ height: 2, background: 'var(--red, #ef4444)' }} />
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="panel-title">🚨 TAHLİYE / YOKLAMA LİSTESİ</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          Üretildi: {generatedLabel} · Toplam: <strong style={{ color: 'var(--text)' }}>{data?.total ?? '—'}</strong>
        </div>
      </div>
      <div className="panel-body">
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="form-label" style={{ margin: 0 }}>BLOK</label>
          <select className="form-select" value={block} onChange={e => setBlock(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">Tüm bloklar</option>
            {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block} ({b.type})</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'YENİLENİYOR...' : '↻ YENİLE'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={printRoster}>🖨 YAZDIR</button>
          <button className="btn btn-primary btn-sm" onClick={downloadPdf} disabled={downloading}>
            {downloading ? 'PDF...' : '↓ PDF'}
          </button>
        </div>

        {isLoading ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Yükleniyor...</div>
        ) : !data?.blocks?.length ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', padding: 16, textAlign: 'center' }}>
            Bu filtreye uyan aktif sakin yok.
          </div>
        ) : (
          <div className="print-area">
            {data.blocks.map(g => (
              <div key={g.block} style={{ marginBottom: 16, breakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2 }}>BLOK {g.block}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{g.count} kişi</div>
                </div>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={th}>ODA</th>
                      <th style={th}>KAT</th>
                      <th style={th}>YATAK</th>
                      <th style={{ ...th, textAlign: 'left' }}>AD SOYAD</th>
                      <th style={{ ...th, textAlign: 'left' }}>FİRMA</th>
                      <th style={{ ...th, textAlign: 'left' }}>TELEFON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.people.map((p, i) => (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'transparent' : 'var(--surface)' }}>
                        <td style={tdMono}>{p.room_no || '-'}</td>
                        <td style={tdMono}>{p.floor ?? '-'}</td>
                        <td style={tdMono}>{p.bed_no ?? '-'}</td>
                        <td style={td}>{p.full_name || '-'}</td>
                        <td style={td}>{p.company || '-'}</td>
                        <td style={tdMono}>{p.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const th = { padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }
const td = { padding: '5px 8px' }
const tdMono = { padding: '5px 8px', fontFamily: 'var(--mono)', textAlign: 'center' }
