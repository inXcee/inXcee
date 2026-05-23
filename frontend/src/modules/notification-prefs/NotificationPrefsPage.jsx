import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const CHANNELS = [
  { key: 'in_app',   label: 'Uygulama' },
  { key: 'desktop',  label: 'Tarayıcı' },
  { key: 'push',     label: 'Mobil Push' },
  { key: 'whatsapp', label: 'WhatsApp' },
]
const SEVERITIES = [
  { key: 'info',     label: 'Bilgi' },
  { key: 'warning',  label: 'Uyarı+' },
  { key: 'critical', label: 'Kritik' },
]

function minutesToHHMM(m) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function hhmmToMinutes(s) {
  const [h, mm] = (s || '00:00').split(':').map(n => parseInt(n, 10) || 0)
  return Math.min(1439, Math.max(0, h * 60 + mm))
}

export default function NotificationPrefsPage() {
  const qc = useQueryClient()
  const [matrix, setMatrix] = useState(null)
  const [quiet, setQuiet] = useState(null)
  const [saved, setSaved] = useState(false)

  const { data: matrixData, isLoading } = useQuery({
    queryKey: ['notif-prefs-v2'],
    queryFn: () => api.get('/notification-prefs/v2').then(r => r.data),
  })
  const { data: quietData } = useQuery({
    queryKey: ['notif-quiet-hours'],
    queryFn: () => api.get('/notification-prefs/quiet-hours').then(r => r.data),
  })

  useEffect(() => { if (matrixData && !matrix) setMatrix(matrixData) }, [matrixData, matrix])
  useEffect(() => { if (quietData && !quiet) setQuiet(quietData) }, [quietData, quiet])

  const modules = useMemo(() => {
    if (!matrix) return []
    const map = new Map()
    for (const p of matrix) {
      if (!map.has(p.module)) map.set(p.module, { module: p.module, label: p.label })
    }
    return [...map.values()]
  }, [matrix])

  const cell = (module, channel) => matrix?.find(p => p.module === module && p.channel === channel) || null

  const updateCell = (module, channel, patch) => {
    setMatrix(prev => prev.map(p =>
      p.module === module && p.channel === channel ? { ...p, ...patch } : p
    ))
  }

  const saveMatrix = useMutation({
    mutationFn: (prefs) => api.put('/notification-prefs/v2', { preferences: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-prefs-v2'] })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    },
  })
  const saveQuiet = useMutation({
    mutationFn: (q) => api.put('/notification-prefs/quiet-hours', q),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-quiet-hours'] })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    },
  })

  const sendTest = useMutation({
    mutationFn: () => api.post('/notification-prefs/test', {}),
  })

  const allOnFor = (channel) => setMatrix(prev => prev.map(p => p.channel === channel ? { ...p, enabled: true } : p))
  const allOffFor = (channel) => setMatrix(prev => prev.map(p => p.channel === channel ? { ...p, enabled: false } : p))

  if (isLoading || !matrix) {
    return <SkeletonTable rows={6} cols={4} />
  }

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>
          BİLDİRİM TERCİHLERİ
          <HelpHint title="BİLDİRİM TERCİHLERİ">
            Her modül için 4 kanalı ayrı ayrı yönetin: Uygulama (in-app dropdown/sayfa), Tarayıcı bildirimi, Mobil Push (PWA), WhatsApp.
            Her hücrede ayrıca bir kritiklik eşiği seçebilirsiniz — sadece eşik ve üzeri o kanaldan gönderilir.
            Sessiz saatler dilimi tüm kanallarda baskılama uygular (kritik bildirimler hariç bırakılabilir).
          </HelpHint>
        </h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          KİŞİYE ÖZEL · MODÜL × KANAL × KRİTİKLİK
        </p>
      </div>

      <div className="panel fade-up-1" style={{ marginBottom: 16 }}>
        <div className="panel-header"><div className="panel-title">TERCİH MATRİSİ</div></div>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text3)', fontSize: 9, letterSpacing: 1 }}>MODÜL</th>
                {CHANNELS.map(c => (
                  <th key={c.key} style={{ textAlign: 'center', padding: '8px 10px', color: 'var(--text3)', fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                    {c.label.toUpperCase()}
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                      <button onClick={() => allOnFor(c.key)} title="Hepsi açık"
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', padding: '0 4px', fontSize: 8, borderRadius: 3, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => allOffFor(c.key)} title="Hepsi kapalı"
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', padding: '0 4px', fontSize: 8, borderRadius: 3, cursor: 'pointer' }}>✕</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(m => (
                <tr key={m.module}>
                  <td style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <div style={{ color: 'var(--text)', fontSize: 11 }}>{m.label}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 9 }}>{m.module}</div>
                  </td>
                  {CHANNELS.map(c => {
                    const p = cell(m.module, c.key)
                    if (!p) return <td key={c.key} style={{ borderTop: '1px solid var(--border)' }} />
                    return (
                      <td key={c.key} style={{ padding: '6px 8px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <input type="checkbox" checked={p.enabled}
                            onChange={() => updateCell(m.module, c.key, { enabled: !p.enabled })}
                            style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
                          <select value={p.min_severity}
                            disabled={!p.enabled}
                            onChange={e => updateCell(m.module, c.key, { min_severity: e.target.value })}
                            style={{
                              fontSize: 9, fontFamily: 'var(--mono)', padding: '1px 4px',
                              background: 'var(--bg)', color: p.enabled ? 'var(--text2)' : 'var(--text3)',
                              border: '1px solid var(--border)', borderRadius: 3,
                              opacity: p.enabled ? 1 : 0.5,
                            }}>
                            {SEVERITIES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" disabled={saveMatrix.isPending}
              onClick={() => saveMatrix.mutate(matrix)}
              style={{
                padding: '10px 20px', background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: 6, cursor: saveMatrix.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                opacity: saveMatrix.isPending ? 0.6 : 1,
              }}>{saveMatrix.isPending ? 'KAYDEDİLİYOR...' : 'MATRİSİ KAYDET'}</button>
            <button type="button" onClick={() => sendTest.mutate()}
              style={{
                padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text2)', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
              }}>🧪 Test Bildirim Gönder</button>
            {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green, #10b981)' }}>✓ Kaydedildi</span>}
            {sendTest.isSuccess && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green, #10b981)' }}>✓ Test gönderildi</span>}
          </div>
        </div>
      </div>

      {/* Sessiz Saatler */}
      <div className="panel fade-up-2">
        <div className="panel-header"><div className="panel-title">SESSİZ SAATLER</div></div>
        <div className="panel-body">
          {quiet && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
                <input type="checkbox" checked={!!quiet.enabled}
                  onChange={() => setQuiet(q => ({ ...q, enabled: q.enabled ? 0 : 1 }))}
                  style={{ accentColor: 'var(--accent)' }} />
                Sessiz saatleri etkinleştir
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>BAŞLANGIÇ</div>
                <input type="time" value={minutesToHHMM(quiet.start_minute || 0)}
                  onChange={e => setQuiet(q => ({ ...q, start_minute: hhmmToMinutes(e.target.value) }))}
                  className="form-input" style={{ width: 100 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>BİTİŞ</div>
                <input type="time" value={minutesToHHMM(quiet.end_minute || 0)}
                  onChange={e => setQuiet(q => ({ ...q, end_minute: hhmmToMinutes(e.target.value) }))}
                  className="form-input" style={{ width: 100 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
                <input type="checkbox" checked={!!quiet.allow_critical}
                  onChange={() => setQuiet(q => ({ ...q, allow_critical: q.allow_critical ? 0 : 1 }))}
                  style={{ accentColor: 'var(--accent)' }} />
                Kritik bildirimleri yine de al
              </label>
              <button type="button" disabled={saveQuiet.isPending}
                onClick={() => saveQuiet.mutate(quiet)}
                style={{
                  padding: '8px 16px', background: 'var(--accent)', color: '#000',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 10,
                  opacity: saveQuiet.isPending ? 0.6 : 1,
                }}>SESSİZ KAYDET</button>
            </div>
          )}
          <p style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
            Sessiz saatler aralığında, &quot;Kritik bildirimleri yine de al&quot; işaretli değilse hiçbir bildirim gönderilmez.
            İşaretliyse sadece kritik (acil) bildirimler ulaşır. Aralık gece yarısını geçebilir (örn. 22:00 → 08:00).
          </p>
        </div>
      </div>
    </div>
  )
}
