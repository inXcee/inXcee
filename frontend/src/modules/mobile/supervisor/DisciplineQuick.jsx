import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { useToastStore } from '../../../shared/store/toastStore.js'

const QUICK_REASONS = [
  { reason: 'İşe geç geldi',         points: 2 },
  { reason: 'Üniforma eksik',         points: 1 },
  { reason: 'İş emrine uymadı',       points: 3 },
  { reason: 'Kavga / sözlü tartışma', points: 5 },
  { reason: 'İzinsiz devamsızlık',    points: 5 },
]

export default function DisciplineQuick() {
  const [search, setSearch] = useState('')
  const [committed, setCommitted] = useState('')
  const [selected, setSelected] = useState(null)
  const { addToast } = useToastStore()

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['mobile-sup-disc-search', committed],
    queryFn: () => mobileApi.get('/discipline/search', { params: { q: committed } }).then(r => r.data),
    enabled: committed.length >= 2,
    staleTime: 30_000,
  })

  const mut = useMutation({
    mutationFn: ({ personnel_id, reason, points }) =>
      mobileApi.post('/discipline/records', { personnel_id, reason, points }),
    onSuccess: (_, vars) => {
      navigator.vibrate?.([15, 30, 15])
      addToast(`✓ ${vars.points} puan eklendi`, 'success')
      setSelected(null)
      setSearch('')
      setCommitted('')
    },
    onError: (e) => addToast(e.response?.data?.error || 'Hata', 'error'),
  })

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>Hızlı Disiplin</h1>

      {!selected ? (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setCommitted(search.trim())}
              placeholder="Personel ara (ad/TC/şirket)..."
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '14px' }} />
            <button onClick={() => setCommitted(search.trim())} disabled={search.trim().length < 2}
              style={{ padding: '0 18px', borderRadius: '10px', background: '#3b82f6', color: '#fff',
                border: 'none', fontSize: '14px', fontWeight: 600,
                cursor: search.trim().length < 2 ? 'not-allowed' : 'pointer',
                opacity: search.trim().length < 2 ? 0.5 : 1 }}>
              Ara
            </button>
          </div>

          {!committed ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px 24px', fontSize: '14px' }}>
              Personel ad/TC ile arayın (min 2 karakter)
            </div>
          ) : isLoading ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>Aranıyor...</div>
          ) : results.length === 0 ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px' }}>Sonuç yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {results.slice(0, 20).map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff',
                    textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.full_name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {p.tc_no || '—'} · {p.company || '—'} · Puan: <strong>{p.discipline_points || 0}</strong>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>{selected.full_name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              {selected.tc_no} · {selected.company} · Mevcut: <strong>{selected.discipline_points || 0} puan</strong>
            </div>
            <button onClick={() => setSelected(null)}
              style={{ marginTop: '8px', background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
              ← Başka personel ara
            </button>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', marginBottom: '8px' }}>
            HIZLI SEBEP SEÇ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {QUICK_REASONS.map(qr => (
              <button key={qr.reason} disabled={mut.isPending}
                onClick={() => mut.mutate({ personnel_id: selected.id, reason: qr.reason, points: qr.points })}
                style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff',
                  textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer' }}>
                <span style={{ fontSize: '13px' }}>{qr.reason}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: qr.points >= 5 ? '#ef4444' : '#f59e0b' }}>
                  +{qr.points} puan
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
