import { useQuery } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

export default function DndRooms() {
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['mobile-hk-dnd'],
    queryFn: () => mobileApi.get('/housekeeping/dnd-rooms').then(r => r.data),
    staleTime: 60000,
  })

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>DnD Odaları</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 20px' }}>Temizlik istememeyen odalar</p>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
      ) : rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
          Aktif DnD odası yok
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rooms.map(r => (
            <div key={r.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>🚫</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{r.block} — {r.room_no}</div>
                {r.notes && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{r.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
