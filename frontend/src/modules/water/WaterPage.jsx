import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toastOk = (m) => useToastStore.getState().addToast(m, 'success')
const toastErr = (m) => useToastStore.getState().addToast(m, 'error')
const errMsg = (e, f) => e?.response?.data?.error || f

const UNITS = [['adet', 'Adet'], ['koli', 'Koli'], ['palet', 'Palet']]
const todayStr = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (s) => s.length === 7 ? s : (() => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}` })()
const nf = (n) => new Intl.NumberFormat('tr-TR').format(n || 0)
const multiplier = (p, unit) => unit === 'palet' ? (p.units_per_case * p.cases_per_pallet) : unit === 'koli' ? p.units_per_case : 1

const TABS = [
  ['ozet', '📊 Özet'],
  ['giris', '📥 Giriş (İrsaliye)'],
  ['dagitim', '🚚 Dağıtım'],
  ['bolgeler', '📍 Bölgeler'],
  ['urunler', '💧 Ürünler'],
]

export default function WaterPage() {
  const [tab, setTab] = useState('ozet')
  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">SU TAKİP</div><div className="sect-line" /></div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'var(--mono)',
              background: tab === id ? 'var(--accent)' : 'var(--surface2)',
              color: tab === id ? '#000' : 'var(--text3)',
            }}>{label}</button>
        ))}
      </div>
      {tab === 'ozet' && <OzetTab />}
      {tab === 'giris' && <IntakeTab />}
      {tab === 'dagitim' && <DistributeTab />}
      {tab === 'bolgeler' && <ZonesTab />}
      {tab === 'urunler' && <ProductsTab />}
    </div>
  )
}

// ─────────────────────────── ÖZET ───────────────────────────
function OzetTab() {
  const monthStart = todayStr().slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayStr())
  const [group, setGroup] = useState('day')
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['water-summary', from, to, group],
    queryFn: () => api.get('/water/summary', { params: { from, to, group } }).then(r => r.data),
  })

  const chartData = useMemo(() => (data?.daily || []).map(d => ({
    date: fmtDate(d.move_date), Giriş: d.in_base, Dağıtım: d.out_base,
  })), [data])

  const zoneMatrix = useMemo(() => {
    const zones = {}
    ;(data?.zones || []).forEach(z => {
      if (!zones[z.zone_id]) zones[z.zone_id] = { name: z.zone_name, items: [] }
      zones[z.zone_id].items.push(z)
    })
    return Object.values(zones)
  }, [data])

  const lowItems = (data?.stock || []).filter(s => s.low)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const [movements, ExcelJS] = await Promise.all([
        api.get('/water/movements', { params: { from, to } }).then(r => r.data),
        import('exceljs').then(m => m.default),
      ])
      const wb = new ExcelJS.Workbook()
      const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      const head = (ws, cols) => {
        ws.getRow(1).values = cols
        ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.border = border })
      }
      const s1 = wb.addWorksheet('Stok')
      head(s1, ['Ürün', 'Giriş', 'Dağıtım', 'Kalan', 'Min. Eşik', 'Durum'])
      ;(data?.stock || []).forEach(p => s1.addRow([p.name, p.total_in, p.total_out, p.balance, p.min_level || '', p.low ? 'DÜŞÜK' : 'OK']))
      s1.columns.forEach((c, i) => c.width = i === 0 ? 26 : 12)

      const s2 = wb.addWorksheet('Bölge Dağıtım')
      head(s2, ['Bölge', 'Ürün', 'Miktar (adet)', 'Paket'])
      ;(data?.zones || []).forEach(z => s2.addRow([z.zone_name, z.product_name, z.total_out, z.out_human]))
      s2.columns.forEach((c, i) => c.width = i < 2 ? 22 : 14)

      const s3 = wb.addWorksheet('Hareketler')
      head(s3, ['Tarih', 'Tip', 'Ürün', 'Bölge', 'Girilen', 'Adet', 'İrsaliye', 'Not'])
      movements.forEach(m => s3.addRow([m.move_date, m.type === 'in' ? 'Giriş' : 'Dağıtım', m.product_name, m.zone_name || '', `${m.input_qty} ${m.input_unit}`, m.qty_base, m.waybill_no || '', m.note || '']))
      s3.columns.forEach((c, i) => c.width = [12, 8, 24, 20, 12, 8, 14, 20][i])

      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `su-takip-${from}_${to}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('Excel oluşturulamadı') } finally { setExporting(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Aralık:</label>
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['day', 'Gün'], ['month', 'Ay']].map(([id, l]) => (
            <button key={id} onClick={() => setGroup(id)} style={{ border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', background: group === id ? 'var(--accent)' : 'transparent', color: group === id ? '#000' : 'var(--text3)' }}>{l}</button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting} style={{ marginLeft: 'auto', fontSize: '10px' }}>
          ⬇ {exporting ? 'Hazırlanıyor…' : 'Excel İndir'}
        </button>
      </div>

      {isLoading ? <div style={{ color: 'var(--text3)', padding: '20px' }}>Yükleniyor…</div> : (
        <>
          {lowItems.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 700, marginBottom: '4px' }}>⚠ DÜŞÜK STOK ({lowItems.length})</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                {lowItems.map(p => `${p.name}: ${p.balance_human} (eşik ${p.min_human})`).join(' · ')}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              ['Dönem Giriş', data?.totals.period_in, 'var(--green)'],
              ['Dönem Dağıtım', data?.totals.period_out, 'var(--accent)'],
              ['Kalan Stok (toplam)', data?.totals.balance, 'var(--teal)'],
              ['Düşük Stok Ürün', data?.totals.low_count, lowItems.length ? 'var(--red)' : 'var(--text2)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color, marginTop: '4px' }}>{nf(val)}</div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>{group === 'month' ? 'AYLIK' : 'GÜNLÜK'} GİRİŞ / DAĞITIM (adet)</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => nf(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Giriş" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Dağıtım" fill="#f0a500" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="panel" style={{ marginBottom: '16px' }}>
            <div className="panel-header"><div className="panel-title">ÜRÜN STOK DURUMU</div></div>
            <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead><tr>
                  <th>Ürün</th>
                  <th style={{ textAlign: 'right', color: 'var(--green)' }}>Giriş</th>
                  <th style={{ textAlign: 'right', color: 'var(--accent)' }}>Dağıtım</th>
                  <th style={{ textAlign: 'right', color: 'var(--teal)' }}>Kalan</th>
                  <th>Kalan (paket)</th>
                  <th>Eşik</th>
                </tr></thead>
                <tbody>
                  {(data?.stock || []).map(p => (
                    <tr key={p.product_id} style={{ background: p.low ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{p.low && <span title="Düşük stok">⚠ </span>}{p.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_in)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_out)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: p.balance < 0 ? 'var(--red)' : p.low ? 'var(--red)' : 'var(--teal)' }}>{nf(p.balance)}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text3)' }}>{p.balance_human}</td>
                      <td style={{ fontSize: '10px', color: 'var(--text3)' }}>{p.min_human || '—'}</td>
                    </tr>
                  ))}
                  {(data?.stock || []).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div className="panel-title">BÖLGE BAZLI DAĞITIM</div></div>
            <div className="panel-body">
              {zoneMatrix.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Bu aralıkta dağıtım yok</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                  {zoneMatrix.map(z => (
                    <div key={z.name} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: '13px', marginBottom: '6px' }}>📍 {z.name}</div>
                      {z.items.map(it => (
                        <div key={it.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
                          <span style={{ color: 'var(--text2)' }}>{it.product_name}</span>
                          <span style={{ fontFamily: 'var(--mono)' }}>{it.out_human}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── GİRİŞ (tek + toplu irsaliye) ───────────────────────────
function IntakeTab() {
  const qc = useQueryClient()
  const [mode, setMode] = useState('batch') // 'single' | 'batch'
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: movements = [] } = useQuery({ queryKey: ['water-movements', 'in'], queryFn: () => api.get('/water/movements', { params: { type: 'in' } }).then(r => r.data) })

  const [meta, setMeta] = useState({ move_date: todayStr(), waybill_no: '', note: '' })
  const emptyRow = () => ({ product_id: products[0]?.id?.toString() || '', input_qty: '', input_unit: 'palet' })
  const [rows, setRows] = useState([{ product_id: '', input_qty: '', input_unit: 'palet' }])

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-movements', 'in'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }) }

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/intake/batch', payload),
    onSuccess: (r) => { invalidate(); toastOk(`${r.data.count} satır kaydedildi`); setRows([emptyRow()]); setMeta(m => ({ ...m, waybill_no: '', note: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/movements/${id}`),
    onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const submitBatch = () => {
    const lines = rows.filter(r => r.product_id && Number(r.input_qty) > 0)
      .map(r => ({ product_id: +r.product_id, input_qty: Number(r.input_qty), input_unit: r.input_unit }))
    if (lines.length === 0) return toastErr('En az bir ürün satırı girin')
    saveBatch.mutate({ move_date: meta.move_date, waybill_no: meta.waybill_no, note: meta.note, lines })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['batch', '📋 Toplu İrsaliye'], ['single', 'Tek Kalem']].map(([id, l]) => (
          <button key={id} onClick={() => setMode(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: mode === id ? 'var(--accent)' : 'transparent', color: mode === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'batch' ? '1fr' : 'minmax(280px,360px) 1fr', gap: '16px', alignItems: 'start' }}>
        {mode === 'batch' ? (
          <div className="panel">
            <div className="panel-header"><div className="panel-title">TOPLU GİRİŞ (TEK İRSALİYE)</div></div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '8px' }}>
                <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={meta.move_date} onChange={e => setMeta(m => ({ ...m, move_date: e.target.value }))} /></div>
                <div><label className="form-label">İrsaliye No</label><input className="form-input" value={meta.waybill_no} onChange={e => setMeta(m => ({ ...m, waybill_no: e.target.value }))} placeholder="IRS-2026-…" /></div>
                <div><label className="form-label">Not</label><input className="form-input" value={meta.note} onChange={e => setMeta(m => ({ ...m, note: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px' }}>
                    <select className="form-select" value={r.product_id} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, product_id: e.target.value } : x))}>
                      <option value="">Ürün seçin…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="number" min="0" step="any" className="form-input" placeholder="Miktar" value={r.input_qty} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, input_qty: e.target.value } : x))} />
                    <select className="form-select" value={r.input_unit} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, input_unit: e.target.value } : x))}>
                      {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text3)', cursor: 'pointer', width: '32px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setRows(rs => [...rs, emptyRow()])}>+ Satır Ekle</button>
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={submitBatch} disabled={saveBatch.isPending}>{saveBatch.isPending ? 'Kaydediliyor…' : 'İrsaliyeyi Kaydet'}</button>
              </div>
            </div>
          </div>
        ) : (
          <SingleMovementForm kind="in" products={products} onSaved={invalidate} />
        )}

        <div className="panel" style={{ gridColumn: mode === 'batch' ? '1' : undefined }}>
          <div className="panel-header"><div className="panel-title">SON GİRİŞLER</div><div className="panel-subtitle">{movements.length}</div></div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>Ürün</th><th>Miktar</th><th>İrsaliye</th><th></th></tr></thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                    <td>{m.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({m.qty_human})</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{m.waybill_no || '—'}</td>
                    <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Kaydı Sil', body: 'Silinsin mi?', danger: true })) del.mutate(m.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tek kalem giriş/dağıtım formu
function SingleMovementForm({ kind, products, zones = [], onSaved }) {
  const isIn = kind === 'in'
  const [form, setForm] = useState({ product_id: '', zone_id: '', input_qty: '', input_unit: 'koli', move_date: todayStr(), waybill_no: '', note: '' })
  const save = useMutation({
    mutationFn: (payload) => api.post(isIn ? '/water/intake' : '/water/distribute', payload),
    onSuccess: () => { onSaved(); toastOk('Kaydedildi'); setForm(f => ({ ...f, input_qty: '', waybill_no: '', note: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!isIn && !form.zone_id) return toastErr('Bölge seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({ product_id: +form.product_id, ...(isIn ? {} : { zone_id: +form.zone_id }), input_qty: Number(form.input_qty), input_unit: form.input_unit, move_date: form.move_date, waybill_no: form.waybill_no, note: form.note })
  }
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">{isIn ? 'TEK KALEM GİRİŞ' : 'YENİ DAĞITIM'}</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div><label className="form-label">Ürün</label>
          <select className="form-select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
            <option value="">Seçin…</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        {!isIn && <div><label className="form-label">Bölge</label>
          <select className="form-select" value={form.zone_id} onChange={e => setForm(f => ({ ...f, zone_id: e.target.value }))}>
            <option value="">Seçin…</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label className="form-label">Miktar</label><input type="number" min="0" step="any" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
          <div><label className="form-label">Birim</label><select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} /></div>
        {isIn && <div><label className="form-label">İrsaliye No</label><input className="form-input" value={form.waybill_no} onChange={e => setForm(f => ({ ...f, waybill_no: e.target.value }))} /></div>}
        <div><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    </div>
  )
}

// ─────────────────────────── DAĞITIM (form + metinden) ───────────────────────────
function DistributeTab() {
  const qc = useQueryClient()
  const [mode, setMode] = useState('text') // 'text' | 'form'
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const { data: movements = [] } = useQuery({ queryKey: ['water-movements', 'out'], queryFn: () => api.get('/water/movements', { params: { type: 'out' } }).then(r => r.data) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-movements', 'out'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }) }
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/movements/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['text', '📝 Metinden (rapor yapıştır)'], ['form', 'Form']].map(([id, l]) => (
          <button key={id} onClick={() => setMode(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: mode === id ? 'var(--accent)' : 'transparent', color: mode === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'form' ? 'minmax(280px,360px) 1fr' : '1fr', gap: '16px', alignItems: 'start' }}>
        {mode === 'text'
          ? <TextDistribute products={products} zones={zones} onSaved={invalidate} />
          : <SingleMovementForm kind="out" products={products} zones={zones} onSaved={invalidate} />}

        <div className="panel">
          <div className="panel-header"><div className="panel-title">SON DAĞITIMLAR</div><div className="panel-subtitle">{movements.length}</div></div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>Bölge</th><th>Ürün</th><th>Miktar</th><th></th></tr></thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                    <td>{m.zone_name || '—'}</td>
                    <td>{m.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({m.qty_human})</span></td>
                    <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Kaydı Sil', body: 'Silinsin mi?', danger: true })) del.mutate(m.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// Metinden dağıtım: yapıştır → çözümle → önizle/düzelt → kaydet
function TextDistribute({ products, zones, onSaved }) {
  const [text, setText] = useState('')
  const [moveDate, setMoveDate] = useState(todayStr())
  const [items, setItems] = useState(null)

  const parse = useMutation({
    mutationFn: () => api.post('/water/distribute/parse', { text }).then(r => r.data),
    onSuccess: (d) => {
      if (!d.items.length) { toastErr('Metinden satır çıkarılamadı'); return }
      setItems(d.items.map((it, i) => ({ ...it, _id: i })))
    },
    onError: (e) => toastErr(errMsg(e, 'Çözümlenemedi')),
  })
  const saveBatch = useMutation({
    mutationFn: (lines) => api.post('/water/distribute/batch', { move_date: moveDate, lines }),
    onSuccess: (r) => { onSaved(); toastOk(`${r.data.count} dağıtım kaydedildi`); setItems(null); setText('') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const upd = (id, patch) => setItems(items.map(it => it._id === id ? { ...it, ...patch } : it))
  const validCount = items?.filter(it => it.zone_id && it.product_id && Number(it.input_qty) > 0).length || 0

  const save = () => {
    const lines = items.filter(it => it.zone_id && it.product_id && Number(it.input_qty) > 0)
      .map(it => ({ zone_id: +it.zone_id, product_id: +it.product_id, input_qty: Number(it.input_qty), input_unit: it.input_unit }))
    if (!lines.length) return toastErr('Kaydedilecek geçerli satır yok')
    saveBatch.mutate(lines)
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">METİNDEN DAĞITIM</div><div className="panel-subtitle">Günlük raporu yapıştır, sistem çözümlesin</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!items ? (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              Her satıra bir bölge yaz. Örnek:<br />
              <code style={{ fontSize: '10px' }}>B Blok Yemekhane 5 koli 0.5, 10 damacana</code><br />
              <code style={{ fontSize: '10px' }}>C Blok Şantiye 2 palet 0.33</code>
            </div>
            <textarea className="form-input" rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Dağıtım raporunu buraya yapıştır…" style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' }} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>Tarih:</label>
              <input type="date" className="form-input" value={moveDate} onChange={e => setMoveDate(e.target.value)} style={{ width: 'auto' }} />
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => parse.mutate()} disabled={!text.trim() || parse.isPending}>{parse.isPending ? 'Çözümleniyor…' : '🔍 Çözümle'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{validCount}/{items.length} satır hazır. Eksikleri (kırmızı) düzeltip kaydet.</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead><tr><th>Bölge</th><th>Ürün</th><th>Miktar</th><th>Birim</th><th></th></tr></thead>
                <tbody>
                  {items.map(it => {
                    const bad = !it.zone_id || !it.product_id || !(Number(it.input_qty) > 0)
                    return (
                      <tr key={it._id} style={{ background: bad ? 'rgba(239,68,68,.06)' : undefined }}>
                        <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.zone_id || ''} onChange={e => upd(it._id, { zone_id: e.target.value })}>
                          <option value="">— seç —</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></td>
                        <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.product_id || ''} onChange={e => upd(it._id, { product_id: e.target.value })}>
                          <option value="">— seç —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                        <td><input type="number" min="0" step="any" className="form-input" style={{ fontSize: '11px', width: '70px' }} value={it.input_qty ?? ''} onChange={e => upd(it._id, { input_qty: e.target.value })} /></td>
                        <td><select className="form-select" style={{ fontSize: '11px' }} value={it.input_unit} onChange={e => upd(it._id, { input_unit: e.target.value })}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                        <td style={{ textAlign: 'right' }}><button onClick={() => setItems(items.filter(x => x._id !== it._id))} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems(null)}>← Geri</button>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Tarih: {moveDate}</span>
                <button className="btn btn-primary" onClick={save} disabled={saveBatch.isPending || validCount === 0}>{saveBatch.isPending ? 'Kaydediliyor…' : `${validCount} Dağıtımı Kaydet`}</button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── BÖLGELER ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); setForm({ name: '', code: '', note: '' }); toastOk('Bölge eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div style={{ maxWidth: '700px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">YENİ BÖLGE</div></div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Bölge adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. A Blok Yemekhane" /></div>
          <div style={{ width: '110px' }}><label className="form-label">Kod</label><input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
          <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim() })}>Ekle</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header"><div className="panel-title">BÖLGELER</div><div className="panel-subtitle">{zones.length}</div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table" style={{ fontSize: '12px' }}>
            <thead><tr><th>Ad</th><th>Kod</th><th>Not</th><th></th></tr></thead>
            <tbody>
              {zones.map(z => (
                <tr key={z.id}>
                  <td style={{ fontWeight: 600 }}>{z.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{z.code || '—'}</td>
                  <td style={{ color: 'var(--text3)' }}>{z.note || '—'}</td>
                  <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Bölgeyi Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
                </tr>
              ))}
              {zones.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Bölge yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER (min eşik dahil, create+edit) ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const blank = { id: null, name: '', unit_label: 'şişe', units_per_case: '12', cases_per_pallet: '70', min_qty: '', min_unit: 'koli' }
  const [form, setForm] = useState(blank)
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); qc.invalidateQueries({ queryKey: ['water-products'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }) }
  const payload = () => {
    const upc = +form.units_per_case || 1, cpp = +form.cases_per_pallet || 1
    const mult = form.min_unit === 'palet' ? upc * cpp : form.min_unit === 'koli' ? upc : 1
    return { name: form.name.trim(), unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp, min_level: Math.round((+form.min_qty || 0) * mult) }
  }
  const create = useMutation({ mutationFn: () => api.post('/water/products', payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: () => api.put(`/water/products/${form.id}`, payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/products/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  const editProduct = (p) => setForm({ id: p.id, name: p.name, unit_label: p.unit_label, units_per_case: String(p.units_per_case), cases_per_pallet: String(p.cases_per_pallet), min_qty: p.min_level ? String(p.min_level) : '', min_unit: 'adet' })

  return (
    <div style={{ maxWidth: '860px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">{form.id ? 'ÜRÜN DÜZENLE' : 'YENİ ÜRÜN'}</div>{form.id && <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>+ Yeni</button>}</div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Ürün adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 1.5 L Şişe Su" /></div>
          <div style={{ width: '80px' }}><label className="form-label">Birim</label><input className="form-input" value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Koli/adet</label><input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => setForm(f => ({ ...f, units_per_case: e.target.value }))} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Palet/koli</label><input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => setForm(f => ({ ...f, cases_per_pallet: e.target.value }))} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Min. stok</label><input type="number" min="0" className="form-input" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Min. birim</label><select className="form-select" value={form.min_unit} onChange={e => setForm(f => ({ ...f, min_unit: e.target.value }))}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={() => form.id ? update.mutate() : create.mutate()}>{form.id ? 'Güncelle' : 'Ekle'}</button>
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: '10px', color: 'var(--text3)' }}>Çevrimsiz ürün (damacana) için koli/palet değerlerini 1 yapın. Min. stok 0 = uyarı kapalı. Düzenlerken min. birim "adet" gösterilir.</div>
      </div>

      <div className="panel">
        <div className="panel-header"><div className="panel-title">ÜRÜNLER</div><div className="panel-subtitle">{products.length}</div></div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '12px' }}>
            <thead><tr><th>Ad</th><th>Birim</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min. eşik</th><th></th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td style={{ color: 'var(--text3)' }}>{p.unit_label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case} {p.unit_label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case * p.cases_per_pallet} {p.unit_label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.min_level ? 'var(--text)' : 'var(--text3)' }}>{p.min_level ? `${nf(p.min_level)} ${p.unit_label}` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => editProduct(p)} className="btn btn-ghost btn-sm">Düzenle</button>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Ürünü Sil', body: `"${p.name}" silinsin mi? (hareketi varsa silinemez)`, danger: true })) del.mutate(p.id) }} className="btn btn-danger btn-sm">Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
