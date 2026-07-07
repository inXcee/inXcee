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
const fmtDate = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}` }
const nf = (n) => new Intl.NumberFormat('tr-TR').format(n || 0)

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
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ozet' && <OzetTab />}
      {tab === 'giris' && <MovementTab kind="in" />}
      {tab === 'dagitim' && <MovementTab kind="out" />}
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

  const { data, isLoading } = useQuery({
    queryKey: ['water-summary', from, to],
    queryFn: () => api.get('/water/summary', { params: { from, to } }).then(r => r.data),
  })

  const chartData = useMemo(() => (data?.daily || []).map(d => ({
    date: fmtDate(d.move_date), Giriş: d.in_base, Dağıtım: d.out_base,
  })), [data])

  // Bölgeleri bölge×ürün matrisine çevir
  const zoneMatrix = useMemo(() => {
    const zones = {}
    ;(data?.zones || []).forEach(z => {
      if (!zones[z.zone_id]) zones[z.zone_id] = { name: z.zone_name, items: [] }
      zones[z.zone_id].items.push(z)
    })
    return Object.values(zones)
  }, [data])

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Tarih aralığı:</label>
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
      </div>

      {isLoading ? <div style={{ color: 'var(--text3)', padding: '20px' }}>Yükleniyor…</div> : (
        <>
          {/* KPI kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              ['Toplam Giriş', data?.totals.total_in, 'var(--green)'],
              ['Toplam Dağıtım', data?.totals.total_out, 'var(--accent)'],
              ['Kalan Stok', data?.totals.balance, 'var(--teal)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color, marginTop: '4px' }}>{nf(val)}</div>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>adet (tüm ürünler)</div>
              </div>
            ))}
          </div>

          {/* Günlük grafik */}
          {chartData.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>GÜNLÜK GİRİŞ / DAĞITIM (adet)</div>
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

          {/* Ürün stok tablosu */}
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
                </tr></thead>
                <tbody>
                  {(data?.stock || []).map(p => (
                    <tr key={p.product_id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_in)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_out)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: p.balance < 0 ? 'var(--red)' : 'var(--teal)' }}>{nf(p.balance)}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text3)' }}>{p.balance_human}</td>
                    </tr>
                  ))}
                  {(data?.stock || []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bölge bazlı dağıtım */}
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

// ─────────────────────── GİRİŞ / DAĞITIM ───────────────────────
function MovementTab({ kind }) {
  const qc = useQueryClient()
  const isIn = kind === 'in'
  const [form, setForm] = useState({ product_id: '', zone_id: '', input_qty: '', input_unit: 'koli', move_date: todayStr(), waybill_no: '', note: '' })

  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data), enabled: !isIn })
  const { data: movements = [] } = useQuery({
    queryKey: ['water-movements', kind],
    queryFn: () => api.get('/water/movements', { params: { type: kind } }).then(r => r.data),
  })

  const save = useMutation({
    mutationFn: (payload) => api.post(isIn ? '/water/intake' : '/water/distribute', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['water-movements', kind] })
      qc.invalidateQueries({ queryKey: ['water-summary'] })
      toastOk(isIn ? 'Giriş kaydedildi' : 'Dağıtım kaydedildi')
      setForm(f => ({ ...f, input_qty: '', waybill_no: '', note: '' }))
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/movements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-movements', kind] }); qc.invalidateQueries({ queryKey: ['water-summary'] }); toastOk('Silindi') },
    onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!isIn && !form.zone_id) return toastErr('Bölge seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({
      product_id: +form.product_id,
      ...(isIn ? {} : { zone_id: +form.zone_id }),
      input_qty: Number(form.input_qty), input_unit: form.input_unit,
      move_date: form.move_date, waybill_no: form.waybill_no, note: form.note,
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '16px', alignItems: 'start' }}>
      {/* Form */}
      <div className="panel">
        <div className="panel-header"><div className="panel-title">{isIn ? 'YENİ GİRİŞ' : 'YENİ DAĞITIM'}</div></div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label className="form-label">Ürün</label>
            <select className="form-select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
              <option value="">Seçin…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {!isIn && (
            <div>
              <label className="form-label">Bölge</label>
              <select className="form-select" value={form.zone_id} onChange={e => setForm(f => ({ ...f, zone_id: e.target.value }))}>
                <option value="">Seçin…</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label className="form-label">Miktar</label>
              <input type="number" min="0" step="any" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Birim</label>
              <select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>
                {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Tarih</label>
            <input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} />
          </div>
          {isIn && (
            <div>
              <label className="form-label">İrsaliye No</label>
              <input className="form-input" value={form.waybill_no} onChange={e => setForm(f => ({ ...f, waybill_no: e.target.value }))} placeholder="IRS-2026-…" />
            </div>
          )}
          <div>
            <label className="form-label">Not (opsiyonel)</label>
            <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : (isIn ? 'Girişi Kaydet' : 'Dağıtımı Kaydet')}
          </button>
        </div>
      </div>

      {/* Son hareketler */}
      <div className="panel">
        <div className="panel-header"><div className="panel-title">SON {isIn ? 'GİRİŞLER' : 'DAĞITIMLAR'}</div><div className="panel-subtitle">{movements.length} kayıt</div></div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px' }}>
            <thead><tr>
              <th>Tarih</th><th>Ürün</th>{!isIn && <th>Bölge</th>}<th>Miktar</th>{isIn && <th>İrsaliye</th>}<th></th>
            </tr></thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                  <td>{m.product_name}</td>
                  {!isIn && <td>{m.zone_name || '—'}</td>}
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({m.qty_human})</span></td>
                  {isIn && <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{m.waybill_no || '—'}</td>}
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Kaydı Sil', body: 'Bu hareket silinsin mi?', danger: true })) del.mutate(m.id) }}
                      style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── BÖLGELER ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })

  const create = useMutation({
    mutationFn: (payload) => api.post('/water/zones', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); setForm({ name: '', code: '', note: '' }); toastOk('Bölge eklendi') },
    onError: (e) => toastErr(errMsg(e, 'Eklenemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/zones/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); toastOk('Silindi') },
    onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  return (
    <div style={{ maxWidth: '700px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">YENİ BÖLGE</div></div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Bölge adı</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. A Blok Yemekhane" /></div>
          <div style={{ width: '110px' }}><label className="form-label">Kod</label>
            <input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">Not</label>
            <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
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
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Bölgeyi Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }}
                      className="btn btn-danger btn-sm">Sil</button>
                  </td>
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

// ─────────────────────────── ÜRÜNLER ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', unit_label: 'şişe', units_per_case: '12', cases_per_pallet: '70' })
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })

  const create = useMutation({
    mutationFn: (payload) => api.post('/water/products', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); qc.invalidateQueries({ queryKey: ['water-products'] }); setForm({ name: '', unit_label: 'şişe', units_per_case: '12', cases_per_pallet: '70' }); toastOk('Ürün eklendi') },
    onError: (e) => toastErr(errMsg(e, 'Eklenemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); toastOk('Silindi') },
    onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  return (
    <div style={{ maxWidth: '760px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">YENİ ÜRÜN</div></div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Ürün adı</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 1.5 L Şişe Su" /></div>
          <div style={{ width: '90px' }}><label className="form-label">Birim adı</label>
            <input className="form-input" value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} /></div>
          <div style={{ width: '90px' }}><label className="form-label">Koli/adet</label>
            <input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => setForm(f => ({ ...f, units_per_case: e.target.value }))} /></div>
          <div style={{ width: '90px' }}><label className="form-label">Palet/koli</label>
            <input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => setForm(f => ({ ...f, cases_per_pallet: e.target.value }))} /></div>
          <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim(), units_per_case: +form.units_per_case, cases_per_pallet: +form.cases_per_pallet })}>Ekle</button>
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: '10px', color: 'var(--text3)' }}>
          "Koli/adet" = 1 kolide kaç adet · "Palet/koli" = 1 palette kaç koli. Çevrimsiz ürün (damacana) için ikisini de 1 yapın.
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><div className="panel-title">ÜRÜNLER</div><div className="panel-subtitle">{products.length}</div></div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '12px' }}>
            <thead><tr><th>Ad</th><th>Birim</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th></th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td style={{ color: 'var(--text3)' }}>{p.unit_label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case} {p.unit_label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case * p.cases_per_pallet} {p.unit_label}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Ürünü Sil', body: `"${p.name}" silinsin mi? (hareketi varsa silinemez)`, danger: true })) del.mutate(p.id) }}
                      className="btn btn-danger btn-sm">Sil</button>
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
