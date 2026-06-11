import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import HelpHint from '../../shared/components/HelpHint.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

// Yerel gün (toISOString UTC basar — 00:00-03:00 TR arası dünü gösterirdi)
const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE')
// meal_logs.logged_at UTC saklanır (CURRENT_TIMESTAMP) — gösterimde yerele çevir
const fmtUtcTime = (ts) => ts ? new Date(ts.replace(' ', 'T') + 'Z').toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''

const MEALS = {
  breakfast: { label: '🌅 Kahvaltı', color: 'var(--amber)' },
  lunch:     { label: '☀ Öğle',     color: 'var(--accent)' },
  dinner:    { label: '🌙 Akşam',   color: 'var(--purple)' },
  snack:     { label: '☕ Ara',      color: 'var(--text3)' },
}

function nowMealType() {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

const TABS = [
  { key: 'scan',     label: '📱 OKUTMA' },
  { key: 'daily',    label: '📊 GÜNLÜK' },
  { key: 'forecast', label: '🔮 TAHMİN' },
  { key: 'cost',     label: '💰 MALİYET' },
  { key: 'menu',     label: '🍽 MENÜ' },
]

export default function MealsPage() {
  const [tab, setTab] = useUrlParamState('tab', 'scan')

  return (
    <div style={{ maxWidth: 1200 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>YEMEKHANE<HelpHint topic="meals" title="YEMEKHANE" /></h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          ÖĞÜN OKUTMA · GÜNLÜK SAYIM · YARIN TAHMİNİ · KİŞİ BAŞI MALİYET
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: 9,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'scan' && <ScanTab />}
      {tab === 'daily' && <DailyTab />}
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'cost' && <CostTab />}
      {tab === 'menu' && <MenuTab />}
    </div>
  )
}

function ScanTab() {
  const qc = useQueryClient()
  const [mealType, setMealType] = useState(nowMealType())
  const [manual, setManual] = useState('')
  const [history, setHistory] = useState([])
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const videoRef = useRef(null)

  const logMut = useMutation({
    mutationFn: (data) => api.post('/meals/log', { meal_type: mealType, ...data }),
    onSuccess: (r) => {
      toast(`✓ ${r.data.staff_name || 'kayıt'} → ${MEALS[mealType].label}`)
      setHistory(h => [{ ts: new Date(), ok: true, ...r.data, meal_type: mealType }, ...h.slice(0, 19)])
      setManual('')
      qc.invalidateQueries({ queryKey: ['meals-daily'] })
    },
    onError: (e) => {
      const err = e?.response?.data?.error || 'Hata'
      toast(err, 'error')
      setHistory(h => [{ ts: new Date(), ok: false, error: err, meal_type: mealType }, ...h.slice(0, 19)])
    },
  })

  function submitManual(e) {
    e?.preventDefault()
    if (!manual.trim()) return
    logMut.mutate({ qr_token: manual.trim(), method: 'qr' })
  }

  useEffect(() => {
    if (!cameraEnabled) return
    let stream, interval, active = true
    async function start() {
      try {
        if (!('BarcodeDetector' in window)) {
          toast('Tarayıcı kamera QR desteklemiyor', 'error'); setCameraEnabled(false); return
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
        // eslint-disable-next-line no-undef
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        let lastCode = null
        interval = setInterval(async () => {
          if (!videoRef.current || !active) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes?.length) {
              const code = codes[0].rawValue
              if (code && code !== lastCode) {
                lastCode = code
                logMut.mutate({ qr_token: code, method: 'qr' })
              }
            }
          } catch {}
        }, 1000)
      } catch { toast('Kamera reddedildi', 'error'); setCameraEnabled(false) }
    }
    start()
    return () => { active = false; if (interval) clearInterval(interval); if (stream) stream.getTracks().forEach(t => t.stop()) }
  }, [cameraEnabled, mealType])

  return (
    <div>
      {/* Öğün seçici */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {Object.entries(MEALS).map(([k, v]) => (
          <button key={k} onClick={() => setMealType(k)} style={{
            padding: '14px 8px', borderRadius: 12,
            background: mealType === k ? v.color : 'var(--surface)',
            color: mealType === k ? '#000' : 'var(--text3)',
            border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer',
          }}>{v.label}</button>
        ))}
      </div>

      <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14 }}>
        <button onClick={() => setCameraEnabled(c => !c)} className={`btn ${cameraEnabled ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ borderRadius: 10, width: '100%', marginBottom: 12 }}>
          {cameraEnabled ? '⏹ KAMERA DURDUR' : '📷 KAMERA BAŞLAT'}
        </button>
        {cameraEnabled && (
          <div style={{ position: 'relative', marginBottom: 12, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
            <video ref={videoRef} style={{ width: '100%', maxHeight: 320, display: 'block' }} playsInline muted />
            <div style={{ position: 'absolute', inset: 24, border: `2px solid ${MEALS[mealType].color}`, borderRadius: 12, pointerEvents: 'none' }} />
          </div>
        )}
        <form onSubmit={submitManual} style={{ display: 'flex', gap: 6 }}>
          <input className="form-input" placeholder="QR kodu veya AVS:xxx" value={manual}
            onChange={e => setManual(e.target.value)} style={{ flex: 1, fontFamily: 'var(--mono)' }} autoFocus />
          <button type="submit" disabled={!manual.trim() || logMut.isPending} className="btn btn-primary btn-sm">OKUT</button>
        </form>
      </div>

      {history.length > 0 && (
        <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
            OTURUM ({history.length})
          </div>
          {history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, marginTop: 4,
              background: h.ok ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)',
              borderLeft: `3px solid ${h.ok ? 'var(--green)' : 'var(--red)'}`,
            }}>
              <span style={{ fontSize: 12 }}>
                {h.ok ? `✓ ${h.staff_name}` : `✗ ${h.error}`}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {MEALS[h.meal_type]?.label} · {h.ts.toLocaleTimeString('tr-TR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DailyTab() {
  const [date, setDate] = useState(localDate())
  const { data, isLoading } = useQuery({
    queryKey: ['meals-daily', date],
    queryFn: () => api.get(`/meals/daily?date=${date}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: 'auto', fontSize: 12 }} />
      </div>

      {isLoading ? <SkeletonTable rows={4} cols={4} /> : !data ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {Object.entries(MEALS).map(([k, v]) => {
              const c = data.counts.find(x => x.meal_type === k)
              return (
                <div key={k} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `4px solid ${v.color}` }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{v.label}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: v.color, marginTop: 4, lineHeight: 1 }}>{c?.count || 0}</div>
                  {c?.total_cost > 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>₺{c.total_cost.toFixed(2)}</div>}
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>
              OKUTMA LOGU ({data.logs.length})
            </div>
            {!data.logs.length ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text4)' }}>Bu tarihte öğün kaydı yok</div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {data.logs.map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <div>
                      <strong>{l.full_name}</strong>
                      {l.dept_name && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>{l.dept_name}</span>}
                      {l.diet_flags && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', marginLeft: 8 }}>🚫 {l.diet_flags}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: MEALS[l.meal_type]?.color }}>{MEALS[l.meal_type]?.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>{l.method}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{fmtUtcTime(l.logged_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ForecastTab() {
  const tomorrow = localDate(new Date(Date.now() + 86400000))
  const [date, setDate] = useState(tomorrow)
  const { data, isLoading } = useQuery({
    queryKey: ['meals-forecast', date],
    queryFn: () => api.get(`/meals/forecast?date=${date}`).then(r => r.data),
  })
  // Faz 8 — personelin yaptığı kesin öğün seçimi (mutfak sayımı)
  const { data: sel } = useQuery({
    queryKey: ['meals-selection-counts', date],
    queryFn: () => api.get(`/meals/selection-counts?date=${date}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: 'auto', fontSize: 12 }} />
      </div>

      {sel?.counts?.length > 0 && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1.5, marginBottom: 10 }}>✅ KESİN SEÇİM (personel kiosktan onayladı)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {Object.entries(MEALS).map(([k, v]) => {
              const c = sel.counts.find(x => x.meal_type === k)
              return (
                <div key={k} style={{ padding: 12, background: 'var(--surface2)', borderRadius: 10, borderLeft: `4px solid ${v.color}` }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{v.label}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: v.color, marginTop: 4 }}>{c?.count || 0}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 2 }}>kişi seçti</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {isLoading ? <SkeletonTable rows={4} cols={4} /> : !data ? null : (
        <>
          <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>VARDİYADA BEKLENEN</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 40, color: 'var(--accent)' }}>{data.scheduled}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>kişi {date} tarihinde vardiyada olacak</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            {Object.entries(MEALS).map(([k, v]) => {
              const avg = data.averages.find(a => a.meal_type === k)
              return (
                <div key={k} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `4px solid ${v.color}` }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{v.label}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: v.color, marginTop: 4 }}>
                    ~{Math.round(avg?.avg_count || 0)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 4 }}>son 14g ortalama</div>
                </div>
              )
            })}
          </div>

          {data.diet_summary?.length > 0 && (
            <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', letterSpacing: 1.5, marginBottom: 8 }}>🚫 DİYET/ALERJI BİLDİRİMLERİ</div>
              {data.diet_summary.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span>{d.diet_flags}</span>
                  <strong>{d.c} kişi</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CostTab() {
  const thisMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const { data, isLoading } = useQuery({
    queryKey: ['meals-cost', month],
    queryFn: () => api.get(`/meals/cost-summary?month=${month}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
      </div>
      {isLoading ? <SkeletonTable rows={4} cols={4} /> : !data ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            {data.by_meal.map(m => (
              <div key={m.meal_type} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `4px solid ${MEALS[m.meal_type]?.color}` }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{MEALS[m.meal_type]?.label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--text)', marginTop: 4 }}>{m.count} öğün</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>₺{(m.total_cost || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                  <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEP</th>
                  <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TOPLAM</th>
                  <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>KHV</th>
                  <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>ÖĞL</th>
                  <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--purple)' }}>AKŞ</th>
                  <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>₺</th>
                </tr>
              </thead>
              <tbody>
                {data.by_staff.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 10 }}><strong>{r.full_name}</strong></td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.meal_count}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.breakfast}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.lunch}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.dinner}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{(r.total_cost || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function MenuTab() {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => localDate())
  const [draft, setDraft] = useState({})
  const { data: rows = [] } = useQuery({
    queryKey: ['meal-menu', date],
    queryFn: () => api.get(`/meals/menu?date=${date}`).then(r => r.data),
  })
  useEffect(() => {
    const m = {}
    for (const r of rows) m[r.meal_type] = r.items || ''
    setDraft(m)
  }, [rows])
  const save = useMutation({
    mutationFn: (meal_type) => api.put('/meals/menu', { meal_date: date, meal_type, items: draft[meal_type] || '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meal-menu', date] }); toast('Menü kaydedildi') },
    onError: toastErr,
  })
  return (
    <div style={{ maxWidth: 700 }}>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
      {Object.entries(MEALS).map(([key, meta]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, color: 'var(--text2)', fontSize: 14 }}>{meta.label}</div>
          <textarea value={draft[key] || ''} onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
            rows={3} placeholder="Her satıra bir yemek…"
            style={{ width: '100%', padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit' }} />
          <button onClick={() => save.mutate(key)} disabled={save.isPending}
            style={{ marginTop: 6, padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Kaydet
          </button>
        </div>
      ))}
    </div>
  )
}
