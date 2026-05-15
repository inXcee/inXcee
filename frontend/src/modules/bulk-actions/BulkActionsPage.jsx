import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { BLOCKS } from '../../shared/blocks.js'

export default function BulkActionsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [filters, setFilters] = useState({ block: '', floor: '', company: '', q: '' })
  const [selected, setSelected] = useState(new Set())
  const [report, setReport] = useState(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)

  const params = useMemo(() => {
    const sp = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) sp.set(k, v) })
    return sp.toString()
  }, [filters])

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['bulk-personnel', params],
    queryFn: () => api.get(`/bulk-actions/personnel?${params}`).then(r => r.data),
  })

  const allIds = useMemo(() => rows.map(r => r.id), [rows])
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))

  function toggle(id) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  const transferMut = useMutation({
    mutationFn: () => api.post('/bulk-actions/transfer', {
      ids: [...selected],
      target_block: transferTarget,
    }).then(r => r.data),
    onSuccess: (data) => {
      setReport(data)
      setSelected(new Set())
      setShowTransfer(false)
      setTransferTarget('')
      qc.invalidateQueries({ queryKey: ['bulk-personnel'] })
      toast({ kind: 'success', text: `${data.success.length} kişi taşındı, ${data.skipped.length} atlandı` })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  async function handleTransfer() {
    if (selected.size === 0 || !transferTarget) return
    const ok = await confirmDialog({
      title: 'Toplu Transfer',
      body: `${selected.size} kişi ${transferTarget} bloğuna taşınacak. Mevcut oda atamaları kapatılıp yeni oda verilecek. Uygun yatak bulunamayan kişiler atlanacak.`,
      confirmLabel: 'Transfer Et',
      danger: false,
    })
    if (ok) transferMut.mutate()
  }

  const checkoutMut = useMutation({
    mutationFn: () => api.post('/bulk-actions/checkout', { ids: [...selected] }).then(r => r.data),
    onSuccess: (data) => {
      setReport(data)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['bulk-personnel'] })
      toast({ kind: 'success', text: `${data.success.length} kişi çıkış yaptırıldı, ${data.skipped.length} atlandı` })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  async function handleCheckout() {
    if (selected.size === 0) return
    const ok = await confirmDialog({
      title: 'Toplu Çıkış',
      body: `${selected.size} kişi için çıkış işlemi yapılacak. Zimmeti olan kişiler atlanacaktır. Devam edilsin mi?`,
      confirmLabel: 'Çıkışı Yap',
      danger: true,
    })
    if (ok) checkoutMut.mutate()
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">TOPLU İŞLEM — AKTIF SAKİNLER</div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
            <div>
              <label className="form-label">BLOK</label>
              <select className="form-select" value={filters.block} onChange={e => setFilters(f => ({ ...f, block: e.target.value }))}>
                <option value="">Hepsi</option>
                {BLOCKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">KAT</label>
              <input className="form-input" type="number" value={filters.floor} onChange={e => setFilters(f => ({ ...f, floor: e.target.value }))} placeholder="1, 2, 3" />
            </div>
            <div>
              <label className="form-label">FİRMA</label>
              <input className="form-input" value={filters.company} onChange={e => setFilters(f => ({ ...f, company: e.target.value }))} placeholder="firma adı" />
            </div>
            <div>
              <label className="form-label">ARAMA (isim / TC / oda)</label>
              <input className="form-input" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
            <span>{isFetching ? 'Yükleniyor...' : `${rows.length} kişi`}</span>
            <span>·</span>
            <span style={{ color: selected.size > 0 ? 'var(--accent)' : 'var(--text3)' }}>{selected.size} seçili</span>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-ghost"
              disabled={selected.size === 0}
              onClick={() => setShowTransfer(s => !s)}
            >
              ⇄ TRANSFER ({selected.size})
            </button>
            <button
              className="btn btn-primary"
              disabled={selected.size === 0 || checkoutMut.isPending}
              onClick={handleCheckout}
            >
              {checkoutMut.isPending ? 'İŞLENİYOR...' : `↘ TOPLU ÇIKIŞ (${selected.size})`}
            </button>
          </div>

          {showTransfer && (
            <div style={{ padding: 12, marginBottom: 8, border: '1px solid var(--accent)', borderRadius: 6, background: 'rgba(240,165,0,.05)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>HEDEF BLOK:</span>
              <select className="form-select" style={{ width: 120 }} value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                <option value="">— seç —</option>
                {BLOCKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', flex: 1 }}>
                Blok içinde boş yataklara otomatik dağıtım. Vardiya/karantina uyumsuzlukları atlanır.
              </span>
              <button className="btn btn-primary" disabled={!transferTarget || transferMut.isPending} onClick={handleTransfer}>
                {transferMut.isPending ? 'TAŞINIYOR...' : 'TRANSFER ET'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowTransfer(false); setTransferTarget('') }}>İPTAL</button>
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'auto', maxHeight: '60vh' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 1 }}>
                <tr>
                  <th style={{ width: 36, padding: 8 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Ad Soyad</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>TC</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Firma</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Oda</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Giriş</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Zimmet</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !isFetching && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Kayıt yok</td></tr>
                )}
                {rows.map(r => {
                  const isSel = selected.has(r.id)
                  const hasZimmet = r.unreturned_zimmet > 0
                  return (
                    <tr key={r.id}
                      style={{ borderTop: '1px solid var(--border)', background: isSel ? 'rgba(240,165,0,.05)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => toggle(r.id)}
                    >
                      <td style={{ padding: 8 }}><input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} /></td>
                      <td style={{ padding: 8 }}>{r.full_name}</td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{r.tc_no}</td>
                      <td style={{ padding: 8 }}>{r.company || '-'}</td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {r.block ? `${r.block}-${r.room_no}${r.bed_no ? '/' + r.bed_no : ''}` : '-'}
                      </td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{r.check_in_date || '-'}</td>
                      <td style={{ padding: 8 }}>
                        {hasZimmet ? (
                          <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>{r.unreturned_zimmet} adet</span>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {report && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>SON İŞLEM RAPORU</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span style={{ color: 'var(--green, #22c55e)' }}>✓ {report.success.length} başarılı</span>
                <span style={{ color: 'var(--red, #ef4444)' }}>✗ {report.skipped.length} atlandı</span>
              </div>
              {report.skipped.length > 0 && (
                <ul style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                  {report.skipped.map((s, i) => (
                    <li key={i}>{s.name || `#${s.id}`}: {s.reason}</li>
                  ))}
                </ul>
              )}
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setReport(null)}>Kapat</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
