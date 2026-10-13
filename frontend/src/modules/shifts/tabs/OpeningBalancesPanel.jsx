// İzin açılış bakiyeleri — İK Excel'i gibi dış kaynaktan gelen kalan günler.
// "Yıllık hak" alanına yazılmaz: tarihli açılış olarak beklemeye düşer, müdür kişi kişi onaylar.
// Onaylanan kayıt, kalan izin hesabının (ekran, onay, kiosk, personel dosyası) başlangıcı olur.
import { useState } from 'react'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { parseOpeningLines } from '../logic/openingBalanceParse.js'

const toast = (msg, kind = 'success') => useToastStore.getState().addToast(msg, kind)
const fmt = d => (d ? d.split('-').reverse().join('.') : '—')
const BASIS = { opening: 'açılış', legal: 'yasal', unknown: 'bilinmiyor' }
const cell = { padding: '5px 8px', borderTop: '1px solid var(--border)', fontSize: 11 }

export default function OpeningBalancesPanel() {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role) === 'campus_manager'
  const [open, setOpen] = useState(false)
  const [asOf, setAsOf] = useState('')
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)

  const { data: list = [] } = useQuery({
    queryKey: ['leave-opening-balances'],
    queryFn: () => api.get('/shifts/leave/opening-balances').then(r => r.data),
    enabled: open,
  })
  const pending = list.filter(r => r.status === 'pending')
  const decided = list.filter(r => r.status !== 'pending').slice(0, 30)

  const parsed = parseOpeningLines(text)
  const body = { as_of_date: asOf, source: 'excel', source_label: label || null, rows: parsed.rows }
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leave-opening-balances'] })
    qc.invalidateQueries({ queryKey: ['leave-balance'] })
  }

  const send = useMutation({
    mutationFn: (dryRun) => api.post(`/shifts/leave/opening-balances${dryRun ? '?dryRun=1' : ''}`, body)
      .then(r => ({ ...r.data, dryRun }))
      .catch(e => { if (e?.response?.status === 422) return { ...e.response.data, dryRun }; throw e }),
    onSuccess: (res) => {
      setPreview(res)
      if (!res.dryRun && res.ok) {
        toast(`${res.ids.length} açılış bakiyesi İK onayına gönderildi`)
        setText(''); setPreview(null); invalidate()
      }
    },
    onError: e => toast(e?.response?.data?.error || 'Gönderilemedi', 'error'),
  })

  const [selected, setSelected] = useState(() => new Set())
  const toggleRow = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulk = useMutation({
    mutationFn: ({ ids, decision }) => api.post('/shifts/leave/opening-balances/decision-bulk', { ids, decision }).then(r => r.data),
    onSuccess: (r) => {
      toast(`${r.decided} kayıt ${r.status === 'approved' ? 'onaylandı' : 'reddedildi'}${r.skipped.length ? ` · ${r.skipped.length} zaten karara bağlıydı` : ''}`)
      setSelected(new Set()); invalidate()
    },
    onError: e => toast(e?.response?.data?.error || 'Toplu karar kaydedilemedi', 'error'),
  })
  const bulkDecide = async (decision) => {
    const ids = [...selected].filter(id => pending.some(r => r.id === id))
    if (!ids.length) return
    const verb = decision === 'approve' ? 'onaylansın' : 'reddedilsin'
    if (await confirmDialog({ title: 'Toplu karar', body: `${ids.length} açılış bakiyesi ${verb} mı? Onaylananlar kalan izin hesabının başlangıcı olur.`, danger: decision === 'reject' })) {
      bulk.mutate({ ids, decision })
    }
  }

  const decide = useMutation({
    mutationFn: ({ id, decision }) => api.post(`/shifts/leave/opening-balances/${id}/decision`, { decision }).then(r => r.data),
    onSuccess: (row) => { toast(row.status === 'approved' ? 'Onaylandı — kalan izin bu bakiyeden hesaplanıyor' : 'Reddedildi'); invalidate() },
    onError: e => toast(e?.response?.data?.error || 'Karar kaydedilemedi', 'error'),
  })

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div className="panel-title">İZİN AÇILIŞ BAKİYELERİ {pending.length > 0 && `· ${pending.length} onay bekliyor`}</div>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
            Dış kaynaktaki (ör. İK Excel'i) kalan izin günleri <b>yıllık hak alanına yazılmaz</b>. Belirli bir tarih itibarıyla
            açılış bakiyesi olarak girilir; müdür kişi kişi onaylar. Onaydan sonra kalan = açılış + sonraki yıl dönümü hakları − sonraki onaylı izinler.
          </p>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11 }}>Bakiye tarihi{' '}
                <input type="date" className="form-input" style={{ width: 'auto', display: 'inline-block' }} value={asOf} onChange={e => { setAsOf(e.target.value); setPreview(null) }} />
              </label>
              <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Kaynak (ör. 30.09 İK Excel)" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <textarea className="form-input" rows={5} value={text} onChange={e => { setText(e.target.value); setPreview(null) }}
              placeholder={'Excel\'den iki sütun yapıştırın ya da satır satır yazın:\nAYŞE KAYA\t12\nALİ VELİ ; 3,5'} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
            {parsed.errors.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--red)' }}>Okunamayan satır: {parsed.errors.map(e => e.line).join(', ')}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={!asOf || !parsed.rows.length || send.isPending} onClick={() => send.mutate(true)}>
                Önizle ({parsed.rows.length})
              </button>
              <button className="btn btn-primary btn-sm" disabled={!preview?.dryRun || !preview.ok || send.isPending} onClick={() => send.mutate(false)}>
                İK onayına gönder
              </button>
            </div>
          </div>

          {preview && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 240, overflowY: 'auto' }}>
              {preview.errors?.length > 0 && (
                <div style={{ padding: 8, fontSize: 11, color: 'var(--red)' }}>
                  Düzeltilmeden hiçbir satır kaydedilmez:
                  {preview.errors.map(e => <div key={e.line}>Satır {e.line}: {e.error}</div>)}
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {(preview.rows || []).map(r => (
                    <tr key={r.staff_id}>
                      <td style={cell}>{r.full_name}{r.fuzzy && <span style={{ color: 'var(--accent)' }}> (yazım farkı: {r.input_name})</span>}</td>
                      <td style={cell}>{r.days} gün @ {fmt(r.as_of_date)}</td>
                      <td style={{ ...cell, color: 'var(--text3)' }}>şu an: {r.current?.remaining ?? '—'} ({BASIS[r.current?.basis] || '—'})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>ONAY BEKLEYEN</div>
            {pending.length > 0 && isManager && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" aria-label="Tümünü seç"
                    checked={pending.length > 0 && pending.every(r => selected.has(r.id))}
                    onChange={e => setSelected(e.target.checked ? new Set(pending.map(r => r.id)) : new Set())} />
                  Tümünü seç
                </label>
                <button className="btn btn-primary btn-sm" disabled={!selected.size || bulk.isPending} onClick={() => bulkDecide('approve')}>
                  Seçilenleri onayla ({selected.size})
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!selected.size || bulk.isPending} onClick={() => bulkDecide('reject')}>
                  Seçilenleri reddet
                </button>
              </div>
            )}
            {pending.length === 0 ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>Yok</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {pending.map(r => (
                    <tr key={r.id}>
                      {isManager && (
                        <td style={{ ...cell, width: 22 }}>
                          <input type="checkbox" aria-label={`${r.full_name} seç`} checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} />
                        </td>
                      )}
                      <td style={cell}>{r.full_name}
                        <div style={{ fontSize: 9, color: 'var(--text3)' }}>{r.dept_name || ''} {r.source_label ? `· ${r.source_label}` : ''}</div>
                        {r.note && <div style={{ fontSize: 9, color: /boş|farklı/.test(r.note) ? 'var(--accent)' : 'var(--text3)' }}>{r.note}</div>}
                      </td>
                      <td style={cell}>{r.days} gün @ {fmt(r.as_of_date)}</td>
                      <td style={{ ...cell, color: 'var(--text3)' }}>
                        şu an: {r.current_remaining ?? '—'} ({BASIS[r.current_basis] || '—'})
                        {r.projected_remaining != null && <div style={{ color: 'var(--text)' }}>onaylanırsa: <b>{r.projected_remaining}</b> gün</div>}
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {isManager ? (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'approve' })}>Onayla</button>{' '}
                            <button className="btn btn-ghost btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'reject' })}>Reddet</button>
                          </>
                        ) : <span style={{ fontSize: 10, color: 'var(--text3)' }}>müdür onayı</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {decided.length > 0 && (
            <details>
              <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}>Karar verilenler ({decided.length})</summary>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                <tbody>
                  {decided.map(r => (
                    <tr key={r.id}>
                      <td style={cell}>{r.full_name}</td>
                      <td style={cell}>{r.days} gün @ {fmt(r.as_of_date)}</td>
                      <td style={{ ...cell, color: r.status === 'approved' ? 'var(--green)' : 'var(--red)' }}>
                        {r.status === 'approved' ? 'onaylandı' : 'reddedildi'} · {r.decided_by_name || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
