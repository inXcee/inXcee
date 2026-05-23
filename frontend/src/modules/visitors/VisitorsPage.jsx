import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { BLOCKS } from '../../shared/blocks.js'
import { useStickyForm, StickyDraftBanner } from '../../shared/hooks/useStickyForm.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'
import HelpHint from '../../shared/components/HelpHint.jsx'

function fmt(dt) {
  if (!dt) return '-'
  try { return new Date(dt).toLocaleString('tr-TR') } catch { return dt }
}

export default function VisitorsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [tab, setTab] = useUrlParamState('tab', 'active')
  const [showForm, setShowForm] = useState(false)
  const initialForm = { full_name: '', tc_no: '', phone: '', purpose: '', visiting_block: '', notes: '' }
  const [form, setForm] = useState(initialForm)
  const sticky = useStickyForm('visitor', form, setForm, initialForm)

  const { data: rows = [] } = useQuery({
    queryKey: ['visitors', tab],
    queryFn: () => api.get(`/visitors?active=${tab === 'active' ? '1' : '0'}`).then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['visitors-stats'],
    queryFn: () => api.get('/visitors/stats').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/visitors', form),
    onSuccess: () => {
      setShowForm(false)
      setForm(initialForm)
      sticky.clear()
      qc.invalidateQueries({ queryKey: ['visitors'] })
      qc.invalidateQueries({ queryKey: ['visitors-stats'] })
      toast({ kind: 'success', text: 'Ziyaretçi kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const outMut = useMutation({
    mutationFn: (id) => api.post(`/visitors/${id}/checkout`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitors'] })
      qc.invalidateQueries({ queryKey: ['visitors-stats'] })
      toast({ kind: 'success', text: 'Çıkış yapıldı' })
    },
  })

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>ZİYARETÇİLER<HelpHint topic="visitors" title="ZİYARETÇİLER" /></h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            MISAFIR GIRIS-CIKIS TAKIBI
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ ZİYARETÇİ KAYDI</button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Şu anda içerde" value={stats.active || 0} color="green" />
          <Stat label="Bugün gelen" value={stats.today || 0} />
          <Stat label="Toplam kayıt" value={stats.total || 0} />
        </div>
      )}

      {showForm && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header"><div className="panel-title">YENİ ZİYARETÇİ</div></div>
          <div className="panel-body">
            <StickyDraftBanner hasDraft={sticky.hasDraft} onRestore={sticky.restore} onDiscard={sticky.discard} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label">AD SOYAD *</label>
                <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="form-label">TC NO</label>
                <input className="form-input" value={form.tc_no} onChange={e => setForm(f => ({ ...f, tc_no: e.target.value }))} maxLength={11} />
              </div>
              <div>
                <label className="form-label">TELEFON</label>
                <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">ZİYARET SEBEBİ</label>
                <input className="form-input" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="aile, iş, vb." />
              </div>
              <div>
                <label className="form-label">BLOK</label>
                <select className="form-select" value={form.visiting_block} onChange={e => setForm(f => ({ ...f, visiting_block: e.target.value }))}>
                  <option value="">-</option>
                  {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">NOT</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!form.full_name || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'KAYDEDİLİYOR...' : 'GİRİŞ YAP'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>İPTAL</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', gap: 12 }}>
          <button className={`btn ${tab === 'active' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('active')}>İçerde ({stats?.active || 0})</button>
          <button className={`btn ${tab === 'past' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('past')}>Geçmiş</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportRowsToCsv([
            { key: 'full_name', label: 'AD SOYAD' },
            { key: 'tc_no', label: 'TC NO' },
            { key: 'phone', label: 'TELEFON' },
            { key: 'purpose', label: 'SEBEP' },
            { key: 'visiting_block', label: 'BLOK' },
            { key: 'check_in_at', label: 'GİRİŞ' },
            { key: 'check_out_at', label: 'ÇIKIŞ' },
            { key: 'notes', label: 'NOTLAR' },
          ], rows, `ziyaretciler_${tab}.csv`)}>↓ CSV</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ overflow: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Ad Soyad</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>TC</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Telefon</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Sebep</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Blok</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Giriş</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Çıkış</th>
                  <th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Kayıt yok</td></tr>
                )}
                {rows.map(v => (
                  <tr key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}><strong>{v.full_name}</strong></td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{v.tc_no || '-'}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{v.phone || '-'}</td>
                    <td style={{ padding: 8, fontSize: 12 }}>{v.purpose || '-'}</td>
                    <td style={{ padding: 8 }}>{v.visiting_block || '-'}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(v.check_in_at)}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{v.check_out_at ? fmt(v.check_out_at) : '—'}</td>
                    <td style={{ padding: 8 }}>
                      {!v.check_out_at && (
                        <button className="btn btn-ghost btn-sm" onClick={() => outMut.mutate(v.id)}>Çıkış</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  const c = color === 'green' ? 'var(--green, #22c55e)' : 'var(--text)'
  return (
    <div className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: c }}>{value}</div>
    </div>
  )
}
