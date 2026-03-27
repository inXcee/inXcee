import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function QueuePanel() {
  const qc = useQueryClient()
  const { data: queue = [] } = useQuery({
    queryKey: ['laundry-queue'],
    queryFn: () => laundryApi.getQueue(),
    refetchInterval: 15000,
  })

  const remove = useMutation({
    mutationFn: (id) => laundryApi.removeFromQueue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-queue'] }),
  })

  if (!queue.length) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">YIKAMA KUYRUĞU</span>
        </div>
        <div className="panel-body">
          <div className="empty-state" style={{ padding: '20px 10px' }}>
            <div className="empty-sub">Kuyruk boş</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">YIKAMA KUYRUĞU</span>
        <span className="badge badge-amber">{queue.length} bekleyen</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Oda</th>
              <th>Parça</th>
              <th>Öncelik</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q, idx) => (
              <tr key={q.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{q.block || '?'} · {q.room_no || '?'}</td>
                <td>{q.item_count}</td>
                <td>
                  <span className={q.priority === 'urgent' ? 'badge badge-red' : 'badge badge-gray'}>
                    {q.priority === 'urgent' ? 'ACİL' : 'Normal'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-xs"
                    onClick={() => remove.mutate(q.id)}>
                    Çıkar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
