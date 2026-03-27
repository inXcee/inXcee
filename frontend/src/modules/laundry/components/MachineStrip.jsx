import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_MAP = {
  idle:        { label: 'Boş',       badgeClass: 'badge-green' },
  running:     { label: 'Çalışıyor', badgeClass: 'badge-amber' },
  done:        { label: 'BİTTİ!',    badgeClass: 'badge-red'   },
  maintenance: { label: 'Bakım',     badgeClass: 'badge-gray'  },
}

export default function MachineStrip({ machines = [] }) {
  const qc = useQueryClient()

  const setTimer = useMutation({
    mutationFn: ({ id, minutes }) => {
      const end = new Date(Date.now() + minutes * 60000).toISOString()
      return laundryApi.updateMachine(id, { status: 'running', timer_end: end })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  const resetMachine = useMutation({
    mutationFn: (id) => laundryApi.updateMachine(id, { status: 'idle', timer_end: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  if (!machines.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="sect">
        <span className="sect-title">MAKİNELER</span>
        <span className="sect-line" />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {machines.map(m => {
          const s = STATUS_MAP[m.status] || STATUS_MAP.idle
          const minutesLeft = m.timer_end
            ? Math.max(0, Math.round((new Date(m.timer_end) - Date.now()) / 60000))
            : null

          return (
            <div key={m.id} className="panel" style={{
              flexShrink: 0, minWidth: 110, padding: '10px 12px',
              borderLeft: `3px solid ${m.status === 'running' ? 'var(--accent)' : m.status === 'done' ? 'var(--red)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>
                  {m.name}
                </span>
                {m.status === 'running' && (
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                )}
              </div>

              {m.status === 'running' && minutesLeft !== null ? (
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 2, color: 'var(--accent)' }}>
                  {String(Math.floor(minutesLeft / 60)).padStart(2, '0')}:{String(minutesLeft % 60).padStart(2, '0')}
                </div>
              ) : (
                <span className={`badge ${s.badgeClass}`}>{s.label}</span>
              )}

              {m.status === 'idle' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                  {[30, 45, 60].map(min => (
                    <button key={min} className="btn btn-ghost btn-xs"
                      onClick={() => setTimer.mutate({ id: m.id, minutes: min })}
                      disabled={setTimer.isPending}
                    >
                      {min}dk
                    </button>
                  ))}
                </div>
              )}

              {m.status === 'done' && (
                <button className="btn btn-primary btn-xs" style={{ marginTop: 8 }}
                  onClick={() => resetMachine.mutate(m.id)}>
                  Sıfırla
                </button>
              )}

              {m.active_items > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                  {m.active_items} aktif yıkama
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
