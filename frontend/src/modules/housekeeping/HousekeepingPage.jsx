import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function HousekeepingPage() {
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['cleaning-tasks', today],
    queryFn: () => api.get(`/housekeeping/tasks?date=${today}`).then(r => r.data)
  })

  const { data: dndRooms = [] } = useQuery({
    queryKey: ['dnd-rooms'],
    queryFn: () => api.get('/housekeeping/dnd-rooms').then(r => r.data)
  })

  const generateTasks = useMutation({
    mutationFn: () => api.post('/housekeeping/tasks/generate-daily'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cleaning-tasks'] })
  })

  const completeTask = useMutation({
    mutationFn: (id) => api.post(`/housekeeping/tasks/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cleaning-tasks'] })
  })

  const pendingTasks = tasks.filter(t => !t.completed_at)
  const completedTasks = tasks.filter(t => t.completed_at)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">Housekeeping</h1>
        <button
          onClick={() => generateTasks.mutate()}
          disabled={generateTasks.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm"
        >
          {generateTasks.isPending ? 'Oluşturuluyor...' : '+ Günlük Görevler Oluştur'}
        </button>
      </div>

      {/* DND Rooms */}
      {dndRooms.length > 0 && (
        <div className="mb-6 bg-slate-900 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-400 mb-3">🔕 DND Odaları ({dndRooms.length})</h2>
          <div className="flex flex-wrap gap-2">
            {dndRooms.map(r => (
              <span key={r.id} className="px-2 py-1 bg-slate-800 text-slate-400 rounded text-xs font-mono">
                {r.block}-{r.room_no}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {isLoading ? (
        <div className="text-slate-500 text-sm">Yükleniyor...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 text-center text-slate-500 text-sm">
          Bugün için görev yok. "Günlük Görevler Oluştur" butonunu kullanın.
        </div>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-400 mb-3">Bekleyen ({pendingTasks.length})</h2>
              <div className="space-y-2">
                {pendingTasks.map(task => (
                  <div key={task.id} className="bg-slate-900 rounded-lg p-4 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-200">{task.area}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(task.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {task.task_type}
                      </div>
                    </div>
                    <button
                      onClick={() => completeTask.mutate(task.id)}
                      disabled={completeTask.isPending}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs"
                    >
                      ✓ Tamamla
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {completedTasks.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-400 mb-3">Tamamlanan ({completedTasks.length})</h2>
              <div className="space-y-2">
                {completedTasks.map(task => (
                  <div key={task.id} className="bg-slate-900/50 rounded-lg p-3 flex items-center gap-3 opacity-60">
                    <div className="flex-1">
                      <div className="text-sm text-slate-400 line-through">{task.area}</div>
                    </div>
                    <span className="text-xs text-green-500">✓</span>
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
