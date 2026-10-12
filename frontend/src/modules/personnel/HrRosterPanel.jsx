// İK kadro mutabakatı — PC ajanının her akşam gönderdiği puantaj Excel'i kadrosu ile YYS personeli.
// Farklar ayrıca Takip Merkezi'nde uyarı olarak da açılır; burada topluca görülür ve çözülür
// (ad eşleştirme, boş alanları doldurma, personel kartına geçiş).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { StaffSearch } from '../shifts/shared.jsx'
import { SECTIONS, ageLabel, fmtDate, fillSummary, runLine } from './logic/hrRoster.js'

const TONE = { red: '239,68,68', amber: '245,158,11', blue: '59,130,246', green: '16,185,129' }
const toast = (msg, kind = 'success') => useToastStore.getState().addToast(msg, kind)
const cell = { padding: '5px 8px', borderTop: '1px solid var(--border)', fontSize: 11, verticalAlign: 'top' }

function Section({ def, rows, open, onToggle, children }) {
  return (
    <div style={{ border: `1px solid rgba(${TONE[def.tone]},.3)`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px',
          background: `rgba(${TONE[def.tone]},.08)`, border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{def.title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: rows.length ? `rgb(${TONE[def.tone]})` : 'var(--text3)' }}>
          {rows.length} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>{def.hint}</div>
          {rows.length === 0 ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>Fark yok.</div> : children}
        </div>
      )}
    </div>
  )
}

export default function HrRosterPanel({ onPersonClick }) {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role) === 'campus_manager'
  const [openKeys, setOpenKeys] = useState(() => new Set(['exit_pending', 'archived_present', 'roster_only']))
  const [manualPick, setManualPick] = useState(null) // roster_only adı → elle personel seçimi
  const toggle = key => setOpenKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-roster'],
    queryFn: () => api.get('/personnel/hr-roster').then(r => r.data),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-roster'] })
    // Takip Merkezi anahtarları ayrı ('personnel-tracking-alerts', '-overview'…): önekle tazele
    qc.invalidateQueries({ predicate: q => String(q.queryKey?.[0] || '').startsWith('personnel-tracking') })
  }

  const linkAlias = useMutation({
    mutationFn: ({ staffId, alias }) => api.post('/personnel/aliases', { staff_id: staffId, alias }).then(r => r.data),
    onSuccess: (row) => { toast(`"${row.alias}" eşleştirildi — bundan sonra her aktarımda tanınır`); setManualPick(null); refresh() },
    onError: e => toast(e?.response?.data?.error || 'Eşleştirilemedi', 'error'),
  })
  const applyFills = useMutation({
    mutationFn: () => api.post('/personnel/hr-roster/apply-fills', {}).then(r => r.data),
    onSuccess: r => { toast(`${r.staff} kişide ${r.fields} alan dolduruldu`); refresh() },
    onError: e => toast(e?.response?.data?.error || 'Doldurulamadı', 'error'),
  })

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text3)', fontSize: 12 }}>Yükleniyor…</div>
  if (error) return <div style={{ padding: 16, color: 'var(--red)', fontSize: 12 }}>{error?.response?.data?.error || 'Kadro mutabakatı alınamadı'}</div>
  const snap = data?.snapshot
  const person = (id, name) => (
    <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 6px' }} onClick={() => onPersonClick?.(id)}>{name}</button>
  )

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">İK KADRO MUTABAKATI</div>
          <div className="panel-subtitle">PUANTAJ EXCEL'İ (RESMİ KADRO) ↔ YYS PERSONELİ</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        {!snap ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Henüz kadro listesi gelmedi. Bilgisayardaki puantaj ajanı her akşam 20:00'de gönderir.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Son liste: <b>{ageLabel(snap.age_hours)}</b> · {snap.people_count} kişi{snap.month ? ` · ${snap.month}` : ''}
              {runLine(snap.run) && <> · Excel'e yazım: {runLine(snap.run)}</>}
            </div>
            {snap.stale && (
              <div role="alert" style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6, color: 'var(--red)',
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
                Liste {ageLabel(snap.age_hours)} geldi — bayat. Takip uyarıları bu listeyle üretilmiyor.
                Bilgisayar kapalı ya da ajan çalışmıyor olabilir.
              </div>
            )}
            {(snap.run?.conflicts?.length > 0 || snap.run?.manual?.length > 0) && (
              <details>
                <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}>
                  Ajanın dokunmadığı hücreler ({(snap.run.conflicts?.length || 0) + (snap.run.manual?.length || 0)})
                </summary>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.6 }}>
                  {(snap.run.conflicts || []).map((c, i) => (
                    <div key={`c${i}`}>⚠ {c.name} {fmtDate(c.date)} ({c.cell}): Excel "{c.excel}", YYS "{c.yys}" — {c.reason}</div>
                  ))}
                  {(snap.run.manual || []).map((m, i) => (
                    <div key={`m${i}`}>✎ {m.name} {fmtDate(m.date)} ({m.cell}): {m.yys} — Excel kodunu elle girin</div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {snap && SECTIONS.map(def => {
          const rows = data[def.key] || []
          return (
            <Section key={def.key} def={def} rows={rows} open={openKeys.has(def.key)} onToggle={() => toggle(def.key)}>
              {def.key === 'fillable' && isManager && (
                <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 8 }}
                  disabled={applyFills.isPending || snap.stale}
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Boş alanları doldur', body: `${rows.length} kişinin boş alanları İK puantajından doldurulacak. Dolu alanlara dokunulmaz. Devam edilsin mi?` })) applyFills.mutate()
                  }}>
                  Boş alanları doldur ({rows.length})
                </button>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.staff_id ?? `${r.name}-${i}`}>
                      {def.key === 'exit_pending' && <>
                        <td style={cell}>{person(r.staff_id, r.full_name)}</td>
                        <td style={cell}>çıkış {fmtDate(r.exit_date)}</td>
                        <td style={{ ...cell, color: 'var(--text3)' }}>{r.project || ''}</td>
                      </>}
                      {def.key === 'archived_present' && <>
                        <td style={cell}>{person(r.staff_id, r.full_name)}</td>
                        <td style={cell}>{r.archive_reason || 'pasif'}</td>
                        <td style={{ ...cell, color: 'var(--text3)' }}>{[r.position, r.project].filter(Boolean).join(' · ')}</td>
                      </>}
                      {def.key === 'roster_only' && <>
                        <td style={cell}><b>{r.name}</b>{r.ambiguous && <span style={{ color: 'var(--accent)' }}> (birden çok aday)</span>}
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{[r.position, r.project, r.hire_date && `giriş ${fmtDate(r.hire_date)}`].filter(Boolean).join(' · ')}</div></td>
                        <td style={cell}>
                          {isManager ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {r.candidates.map(c => (
                                <button key={c.staff_id} type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                                  disabled={linkAlias.isPending} title="Bu puantaj adını bu personele kalıcı olarak bağla"
                                  onClick={() => linkAlias.mutate({ staffId: c.staff_id, alias: r.name })}>
                                  = {c.full_name}{c.score ? ` (%${Math.round(c.score * 100)})` : ''}
                                </button>
                              ))}
                              {manualPick === r.name ? (
                                <div style={{ minWidth: 200 }}>
                                  <StaffSearch value="" placeholder="Personel ara…" onChange={sid => sid && linkAlias.mutate({ staffId: sid, alias: r.name })} />
                                </div>
                              ) : (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setManualPick(r.name)}>başka kişi…</button>
                              )}
                            </div>
                          ) : <span style={{ fontSize: 10, color: 'var(--text3)' }}>{r.candidates.map(c => c.full_name).join(' / ') || '—'}</span>}
                        </td>
                      </>}
                      {def.key === 'missing' && <>
                        <td style={cell}>{person(r.staff_id, r.full_name)}</td>
                        <td style={{ ...cell, color: 'var(--text3)' }}>{[r.department, r.project].filter(Boolean).join(' · ')}</td>
                      </>}
                      {def.key === 'mismatches' && <>
                        <td style={cell}>{person(r.staff_id, r.full_name)}</td>
                        <td style={cell}>{r.diffs.map(d => `${d.field === 'hire_date' ? 'işe giriş' : 'proje'}: YYS ${d.field === 'hire_date' ? fmtDate(d.yys) : d.yys} ≠ puantaj ${d.field === 'hire_date' ? fmtDate(d.roster) : d.roster}`).join(' · ')}</td>
                      </>}
                      {def.key === 'fillable' && <>
                        <td style={cell}>{person(r.staff_id, r.full_name)}</td>
                        <td style={cell}>{fillSummary(r.fields)}{r.project_name ? ` (${r.project_name})` : ''}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )
        })}
      </div>
    </div>
  )
}
