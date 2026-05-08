import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

export default function SearchPerson() {
  const [name, setName] = useState('')
  const [committedName, setCommittedName] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['mobile-laundry-person', committedName],
    queryFn: () => mobileApi.get(`/laundry/person/${encodeURIComponent(committedName)}`).then(r => r.data),
    enabled: committedName.length >= 2,
    staleTime: 30_000,
  })

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>Kişi Ara</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setCommittedName(name.trim())}
          placeholder="Ad veya soyad..."
          style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '14px' }} />
        <button onClick={() => setCommittedName(name.trim())} disabled={name.trim().length < 2}
          style={{ padding: '0 18px', borderRadius: '10px', background: '#3b82f6', color: '#fff',
            border: 'none', fontSize: '14px', fontWeight: 600, cursor: name.trim().length < 2 ? 'not-allowed' : 'pointer',
            opacity: name.trim().length < 2 ? 0.5 : 1 }}>
          Ara
        </button>
      </div>

      {!committedName ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px 24px', fontSize: '14px' }}>
          Aramak için ad/soyad gir, en az 2 karakter
        </div>
      ) : isLoading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>Aranıyor...</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px 24px' }}>
          "{committedName}" için kayıt bulunamadı
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(it => (
            <div key={it.id} style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{it.intake_name || `#${it.id}`}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px',
                  background: '#f3f4f6', color: '#6b7280' }}>
                  {it.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {it.item_count} parça · {it.room_label || '—'}
              </div>
              {it.item_details && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{it.item_details}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
