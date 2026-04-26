import { useQuery } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { useMobileAuth } from '../auth/useMobileAuth.js'

const today = new Date().toISOString().slice(0, 10)

export default function TaskHistory() {
  const { user } = useMobileAuth()

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['mobile-hk-history', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
    staleTime: 30_000,
    gcTime: 300_000,
  })

  const done = tasks.filter(t => t.completed_at)
  const skipped = tasks.filter(t => t.skipped && !t.completed_at)

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Geçmiş</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 20px' }}>{today} tarihli görevler</p>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
      ) : done.length === 0 && skipped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>Henüz tamamlanan görev yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {done.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', letterSpacing: '0.5px', marginBottom: '8px' }}>
                ✅ TAMAMLANANLAR ({done.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {done.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
          {skipped.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.5px', marginBottom: '8px' }}>
                ⏭️ ATLANANLAR ({skipped.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {skipped.map(t => <TaskRow key={t.id} task={t} showSkipReason />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, showSkipReason }) {
  return (
    <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
      <div style={{ fontWeight: 600, fontSize: '14px' }}>{task.block} — {task.area}</div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{task.task_type}</div>
      {showSkipReason && task.skip_reason && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Sebep: {task.skip_reason}</div>
      )}
      {task.assignee_name && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{task.assignee_name}</div>
      )}
    </div>
  )
}
