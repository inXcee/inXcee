import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'

const today = new Date().toISOString().slice(0, 10)

const STATUS_LABEL = {
  worked: { label: 'Geldi',     color: '#10b981' },
  absent: { label: 'Gelmedi',   color: '#ef4444' },
  on_leave: { label: 'İzinli',  color: '#f59e0b' },
  overtime: { label: 'Mesai',   color: '#6366f1' },
  scheduled: { label: 'Planlı', color: '#9ca3af' },
}

export default function AttendanceList() {
  const [filter, setFilter] = useState('all')
  const qc = useQueryClient()

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-sup-attendance', today],
    queryFn: () => mobileApi.get('/shifts/attendance', { params: { date: today } }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  const checkInMut = useMutation({
    mutationFn: (personnel_id) => mobileApi.post('/shifts/attendance/checkin', { personnel_id, date: today, status: 'worked' }),
    onSuccess: () => { navigator.vibrate?.([15]); qc.invalidateQueries({ queryKey: ['mobile-sup-attendance'] }) },
  })

  const filtered = filter === 'all' ? rows
    : filter === 'present' ? rows.filter(r => r.status === 'worked')
    : rows.filter(r => r.status === 'absent' || !r.status)

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Devamsızlık</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>{today}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
        {[['all', 'Tümü'], ['present', 'Gelenler'], ['absent', 'Eksikler']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${filter === key ? '#3b82f6' : '#e5e7eb'}`,
              background: filter === key ? '#3b82f615' : '#fff',
              fontSize: '12px', fontWeight: 600,
              color: filter === key ? '#3b82f6' : '#6b7280', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} cols={3} />
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px' }}>Kayıt yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(r => {
            const s = STATUS_LABEL[r.status] || { label: r.status || 'Yok', color: '#9ca3af' }
            return (
              <div key={r.id || r.personnel_id} style={{ background: '#fff', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{r.full_name || r.personnel_name || '—'}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>
                    {r.department || ''} {r.shift_name ? ` · ${r.shift_name}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: s.color }}>{s.label}</span>
                {(r.status === 'absent' || !r.status) && r.personnel_id && (
                  <button onClick={() => checkInMut.mutate(r.personnel_id)}
                    disabled={checkInMut.isPending}
                    style={{ padding: '6px 10px', borderRadius: '6px', background: '#10b981', color: '#fff',
                      border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                    ✓ Geldi
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
