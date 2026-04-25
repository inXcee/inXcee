import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { useMobileAuth } from '../auth/useMobileAuth.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'
import { enqueue } from '../../../shared/utils/offlineDB.js'

const today = new Date().toISOString().slice(0, 10)

const STATUS_LABEL = { pending: 'Bekliyor', done: 'Tamamlandı', skipped: 'Atlandı' }
const STATUS_COLOR = { pending: '#f59e0b', done: '#10b981', skipped: '#9ca3af' }

function taskStatus(t) {
  if (t.completed_at) return 'done'
  if (t.skipped) return 'skipped'
  return 'pending'
}

export default function HousekeeperHome() {
  const [filter, setFilter] = useState('pending')
  const { user } = useMobileAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-hk-tasks', today],
    queryFn: () => mobileApi.get('/housekeeping/tasks', {
      params: { date: today, ...(user?.assigned_block ? { block: user.assigned_block } : {}) },
    }).then(r => r.data),
    refetchInterval: 60000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  const completeMut = useMutation({
    mutationFn: id => mobileApi.post(`/housekeeping/tasks/${id}/complete`, {}),
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: ['mobile-hk-tasks', today] })
      const prev = qc.getQueryData(['mobile-hk-tasks', today])
      qc.setQueryData(['mobile-hk-tasks', today], old =>
        (old || []).map(t => t.id === taskId ? { ...t, completed_at: new Date().toISOString() } : t)
      )
      return { prev }
    },
    onError: (_, taskId, ctx) => {
      qc.setQueryData(['mobile-hk-tasks', today], ctx.prev)
      if (!navigator.onLine) enqueue('complete_task', { taskId, checklist: [] })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }),
  })

  const counts = { pending: 0, done: 0, skipped: 0 }
  tasks.forEach(t => counts[taskStatus(t)]++)
  const filtered = tasks.filter(t => taskStatus(t) === filter)

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && (
        <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>
      )}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Günlük Görevler</h1>
        <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>{today}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {['pending', 'done', 'skipped'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '12px 8px', borderRadius: '10px', border: `2px solid ${filter === s ? STATUS_COLOR[s] : '#e5e7eb'}`, background: filter === s ? STATUS_COLOR[s] + '18' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: STATUS_COLOR[s] }}>{counts[s]}</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>{STATUS_LABEL[s]}</div>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: '14px', background: '#e5e7eb', borderRadius: '4px', marginBottom: '8px', width: '60%' }} />
                <div style={{ height: '11px', background: '#f3f4f6', borderRadius: '4px', width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
          {filter === 'pending' ? '🎉 Tüm görevler tamamlandı!' : 'Görev yok'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(t => (
            <div key={t.id}
              onClick={() => navigate(`task/${t.id}`, { state: { task: t } })}
              style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: STATUS_COLOR[taskStatus(t)], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.block} — {t.area}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{t.task_type}</div>
              </div>
              {filter === 'pending' && (
                <button
                  onClick={e => { e.stopPropagation(); navigator.vibrate?.([15, 30, 15]); completeMut.mutate(t.id) }}
                  disabled={completeMut.isPending}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  ✓
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
