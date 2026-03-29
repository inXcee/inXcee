import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

/* ── Inject styles once ─────────────────────────────────────── */
const STYLE_ID = 'ms-styles'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes machineGlow {
      0%,100% { box-shadow: 0 0 0 0 rgba(240,165,0,0); }
      50%      { box-shadow: 0 0 24px 4px rgba(240,165,0,0.18); }
    }
    @keyframes machineDone {
      0%,100% { box-shadow: 0 0 0 0 rgba(231,76,60,0); }
      50%      { box-shadow: 0 0 20px 4px rgba(231,76,60,0.2); }
    }
    @keyframes ringFill { from { stroke-dashoffset: 126; } }
    .ms-card {
      flex-shrink: 0;
      width: 158px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 14px 12px;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }
    .ms-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      border-radius: 12px 12px 0 0;
      transition: background 0.3s;
    }
    .ms-card.running::before { background: linear-gradient(90deg, var(--accent), #e67e22); }
    .ms-card.done::before    { background: linear-gradient(90deg, var(--red), var(--red2)); }
    .ms-card.idle::before    { background: var(--border); }
    .ms-card.running { animation: machineGlow 3s ease-in-out infinite; border-color: rgba(240,165,0,0.2); }
    .ms-card.done    { animation: machineDone 2.5s ease-in-out infinite; border-color: rgba(231,76,60,0.2); }
    .ms-timer-btn {
      padding: 4px 8px; border-radius: 6px; font-family: var(--mono); font-size: 9px;
      font-weight: 700; cursor: pointer; border: 1px solid var(--border);
      background: var(--surface2); color: var(--text2); transition: all 0.15s;
      letter-spacing: 0.5px;
    }
    .ms-timer-btn:hover:not(:disabled) {
      border-color: var(--accent); color: var(--accent);
      background: rgba(240,165,0,0.08);
    }
    .ms-timer-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  `
  document.head.appendChild(s)
}

/* ── SVG ring timer ─────────────────────────────────────────── */
const R = 20
const C = 2 * Math.PI * R // ≈ 125.7

function RingTimer({ minutesLeft, totalMinutes, color }) {
  const pct = totalMinutes > 0 ? Math.max(0, minutesLeft / totalMinutes) : 0
  const offset = C * (1 - pct)
  const h = String(Math.floor(minutesLeft / 60)).padStart(2, '0')
  const m = String(minutesLeft % 60).padStart(2, '0')

  return (
    <div style={{ position: 'relative', width: 56, height: 56, margin: '4px auto 8px' }}>
      <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx="28" cy="28" r={R}
          fill="none" stroke="var(--border)" strokeWidth="3" />
        {/* Progress */}
        <circle cx="28" cy="28" r={R}
          fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear', animation: 'ringFill 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: minutesLeft >= 60 ? 13 : 16,
          letterSpacing: 1, color, lineHeight: 1,
        }}>
          {h}:{m}
        </span>
      </div>
    </div>
  )
}

/* ── Single machine card ────────────────────────────────────── */
function MachineCard({ m, onTimer, onReset, loading }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (m.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [m.status])

  const minutesLeft = m.timer_end
    ? Math.max(0, Math.round((new Date(m.timer_end) - now) / 60000))
    : null

  const totalMinutes = m.timer_started_at && m.timer_end
    ? Math.round((new Date(m.timer_end) - new Date(m.timer_started_at)) / 60000)
    : 60

  const typeLabel = m.type === 'dryer' ? 'D' : 'W'
  const typeColor = m.type === 'dryer' ? 'var(--accent2)' : 'var(--blue)'

  return (
    <div className={`ms-card ${m.status}`}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
          color: 'var(--text)', letterSpacing: 0.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {m.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
            background: `${typeColor}18`, color: typeColor,
            border: `1px solid ${typeColor}30`,
            borderRadius: 3, padding: '1px 5px',
          }}>{typeLabel}</span>
          {m.status === 'running' && (
            <span className="live-dot" style={{ width: 5, height: 5 }} />
          )}
        </div>
      </div>

      {/* Body */}
      {m.status === 'running' && minutesLeft !== null ? (
        <RingTimer
          minutesLeft={minutesLeft}
          totalMinutes={totalMinutes}
          color={minutesLeft < 5 ? 'var(--red)' : minutesLeft < 15 ? 'var(--accent)' : 'var(--blue)'}
        />
      ) : m.status === 'done' ? (
        <div style={{ textAlign: 'center', padding: '8px 0 10px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, color: 'var(--red)', marginBottom: 8 }}>
            BİTTİ
          </div>
          <button className="ms-timer-btn"
            style={{ background: 'rgba(231,76,60,0.1)', color: 'var(--red)', borderColor: 'rgba(231,76,60,0.3)' }}
            onClick={() => onReset(m.id)} disabled={loading}>
            Sıfırla
          </button>
        </div>
      ) : (
        <div style={{ padding: '4px 0 8px' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
            textAlign: 'center', letterSpacing: 1, marginBottom: 8,
          }}>BOŞ</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {[30, 45, 60].map(min => (
              <button key={min} className="ms-timer-btn"
                onClick={() => onTimer(m.id, min)} disabled={loading}>
                {min}dk
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {(m.active_items > 0 || m.total_runs > 0) && (
        <div style={{
          marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
          textAlign: 'center', letterSpacing: 0.5,
          display: 'flex', justifyContent: 'center', gap: 8,
        }}>
          {m.active_items > 0 && <span>{m.active_items} yüklü</span>}
          {m.total_runs > 0 && (
            <span style={{ color: 'var(--text4)' }}>{m.total_runs}× çalıştı</span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Strip ──────────────────────────────────────────────────── */
export default function MachineStrip({ machines = [], hideHeader = false }) {
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

  const running = machines.filter(m => m.status === 'running').length
  const done    = machines.filter(m => m.status === 'done').length

  return (
    <div style={{ marginBottom: 18 }}>
      {!hideHeader && (
        <div className="sect" style={{ marginBottom: 10 }}>
          <span className="sect-title">MAKİNELER</span>
          {running > 0 && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
              marginLeft: 10, letterSpacing: 0.5,
            }}>
              {running} çalışıyor
            </span>
          )}
          {done > 0 && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)',
              marginLeft: 10, letterSpacing: 0.5,
            }}>
              {done} bekleniyor
            </span>
          )}
          <span className="sect-line" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, paddingTop: 2 }}>
        {machines.map(m => (
          <MachineCard
            key={m.id}
            m={m}
            onTimer={(id, min) => setTimer.mutate({ id, minutes: min })}
            onReset={(id) => resetMachine.mutate(id)}
            loading={setTimer.isPending || resetMachine.isPending}
          />
        ))}
      </div>
    </div>
  )
}
