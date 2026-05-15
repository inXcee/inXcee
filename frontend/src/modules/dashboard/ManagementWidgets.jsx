import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

const LS_KEY = 'yys-mgmt-widgets'
const DEFAULT_ORDER = ['visitors', 'surveys', 'expenses', 'drills', 'contracts']
const DEFAULT_HIDDEN = []

function loadPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return {
      order: v.order || DEFAULT_ORDER,
      hidden: v.hidden || DEFAULT_HIDDEN,
    }
  } catch { return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN } }
}

function savePrefs(p) {
  localStorage.setItem(LS_KEY, JSON.stringify(p))
}

function fmtTL(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function Card({ id, label, value, hint, color = 'var(--text)', onClick, editing, onHide, onMove, isFirst, isLast }) {
  return (
    <div
      style={{
        flex: '1 1 160px', minWidth: 160, padding: '14px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        cursor: onClick && !editing ? 'pointer' : 'default',
        transition: 'transform 0.15s, border-color 0.15s',
        position: 'relative',
      }}
      onClick={editing ? undefined : onClick}
      onMouseEnter={e => { if (onClick && !editing) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--accent)' } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {editing && (
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
          <button onClick={e => { e.stopPropagation(); onMove(-1) }} disabled={isFirst} title="Sola al"
            style={btnMini}>‹</button>
          <button onClick={e => { e.stopPropagation(); onMove(1) }} disabled={isLast} title="Sağa al"
            style={btnMini}>›</button>
          <button onClick={e => { e.stopPropagation(); onHide(id) }} title="Gizle" style={{ ...btnMini, color: 'var(--red, #ef4444)' }}>×</button>
        </div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, fontFamily: 'var(--mono)', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

const btnMini = {
  width: 20, height: 20, padding: 0,
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
}

export default function ManagementWidgets() {
  const nav = useNavigate()
  const [prefs, setPrefs] = useState(loadPrefs())
  const [editing, setEditing] = useState(false)

  useEffect(() => { savePrefs(prefs) }, [prefs])

  function move(id, delta) {
    setPrefs(p => {
      const arr = [...p.order]
      const i = arr.indexOf(id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= arr.length) return p
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...p, order: arr }
    })
  }
  function hide(id) {
    setPrefs(p => ({ ...p, hidden: [...new Set([...p.hidden, id])] }))
  }
  function show(id) {
    setPrefs(p => ({ ...p, hidden: p.hidden.filter(x => x !== id) }))
  }
  function reset() {
    setPrefs({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN })
  }

  const { data: visitors } = useQuery({
    queryKey: ['dash-visitors'],
    queryFn: () => api.get('/visitors/stats').then(r => r.data).catch(() => null),
  })
  const { data: surveyStats } = useQuery({
    queryKey: ['dash-surveys', 30],
    queryFn: () => api.get('/surveys/stats?days=30').then(r => r.data).catch(() => null),
  })
  const { data: expensesSum } = useQuery({
    queryKey: ['dash-expenses'],
    queryFn: () => api.get('/expenses/summary?months=1').then(r => r.data).catch(() => null),
  })
  const { data: drillStats } = useQuery({
    queryKey: ['dash-drills'],
    queryFn: () => api.get('/drills/stats').then(r => r.data).catch(() => null),
  })
  const { data: expiring = [] } = useQuery({
    queryKey: ['dash-expiring'],
    queryFn: () => api.get('/companies/expiring?days=30').then(r => r.data).catch(() => []),
  })

  const avgOverall = surveyStats?.summary?.avg_overall
  const avgColor = avgOverall == null ? 'var(--text)' :
    avgOverall >= 4 ? 'var(--green, #22c55e)' :
    avgOverall >= 3 ? 'var(--orange, #f97316)' : 'var(--red, #ef4444)'

  const expiringSoon = expiring.filter(e => e.days_left >= 0 && e.days_left <= 30).length
  const expiredCount = expiring.filter(e => e.days_left < 0).length

  const widgetProps = {
    visitors: {
      label: 'ZİYARETÇİ İÇERDE',
      value: visitors?.active || 0,
      hint: visitors?.today != null ? `Bugün ${visitors.today} kayıt` : null,
      color: visitors?.active > 0 ? 'var(--accent)' : 'var(--text)',
      onClick: () => nav('/visitors'),
    },
    surveys: {
      label: 'MEMNUNİYET (30g)',
      value: avgOverall != null ? `★ ${avgOverall}` : '—',
      hint: surveyStats?.summary?.total ? `${surveyStats.summary.total} cevap` : 'Henüz cevap yok',
      color: avgColor,
      onClick: () => nav('/surveys'),
    },
    expenses: {
      label: 'BU AY GİDER',
      value: fmtTL(expensesSum?.this_month_total),
      hint: expensesSum?.per_resident ? `Kişi başı: ${fmtTL(expensesSum.per_resident)}` : null,
      onClick: () => nav('/expenses'),
    },
    drills: {
      label: 'SON TATBİKAT',
      value: drillStats?.last_drill || '—',
      hint: drillStats?.upcoming ? `Sonraki: ${drillStats.upcoming}` : 'Planlanmış yok',
      color: drillStats?.upcoming ? 'var(--text)' : 'var(--orange, #f97316)',
      onClick: () => nav('/drills'),
    },
    contracts: {
      label: 'SÖZLEŞMESİ YAKLAŞAN',
      value: `${expiringSoon} firma`,
      hint: expiredCount > 0 ? `⚠ ${expiredCount} süresi dolmuş` : '30 gün içinde',
      color: expiredCount > 0 ? 'var(--red, #ef4444)' : expiringSoon > 0 ? 'var(--orange, #f97316)' : 'var(--text)',
      onClick: () => nav('/companies'),
    },
  }

  const visible = prefs.order.filter(id => !prefs.hidden.includes(id) && widgetProps[id])
  const hiddenWithLabels = prefs.hidden.map(id => ({ id, label: widgetProps[id]?.label })).filter(x => x.label)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
          YÖNETİM ÖZETİ
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditing(e => !e)}
          style={{
            padding: '3px 10px', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: 1,
            background: editing ? 'var(--accent)' : 'transparent',
            color: editing ? '#000' : 'var(--text3)',
            border: '1px solid ' + (editing ? 'var(--accent)' : 'var(--border)'),
            borderRadius: 4, cursor: 'pointer',
          }}
        >
          {editing ? '✓ TAMAM' : '✎ DÜZENLE'}
        </button>
        {editing && (
          <button onClick={reset} style={{
            padding: '3px 10px', fontSize: 10, fontFamily: 'var(--mono)', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 4, cursor: 'pointer',
          }}>VARSAYILANA SIFIRLA</button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {visible.map((id, i) => (
          <Card
            key={id}
            id={id}
            editing={editing}
            isFirst={i === 0}
            isLast={i === visible.length - 1}
            onMove={(d) => move(id, d)}
            onHide={hide}
            {...widgetProps[id]}
          />
        ))}
      </div>
      {editing && hiddenWithLabels.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>GİZLİ:</span>
          {hiddenWithLabels.map(h => (
            <button key={h.id} onClick={() => show(h.id)} style={{
              padding: '3px 8px', fontSize: 10, fontFamily: 'var(--mono)',
              background: 'var(--surface2)', border: '1px dashed var(--border)',
              color: 'var(--text2)', borderRadius: 4, cursor: 'pointer',
            }}>+ {h.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
