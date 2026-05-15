import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import EmptyState from '../../shared/components/EmptyState.jsx'
import { useStickyForm, StickyDraftBanner } from '../../shared/hooks/useStickyForm.jsx'

const CATEGORIES = [
  { value: 'food', label: 'Yemek', color: '#f97316' },
  { value: 'cleaning', label: 'Temizlik', color: '#3b82f6' },
  { value: 'laundry', label: 'Çamaşır', color: '#8b5cf6' },
  { value: 'maintenance', label: 'Bakım', color: '#ef4444' },
  { value: 'utilities', label: 'Faturalar', color: '#22c55e' },
  { value: 'staff', label: 'Personel', color: '#eab308' },
  { value: 'other', label: 'Diğer', color: '#64748b' },
]

function fmt(n) {
  if (n == null) return '-'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState({ category: '', from: '', to: '' })
  const initialForm = {
    category: 'food', description: '', amount: '', expense_date: new Date().toISOString().slice(0,10),
    invoice_no: '', company_id: '', notes: '',
  }
  const [form, setForm] = useState(initialForm)
  const sticky = useStickyForm('expense', form, setForm, initialForm)

  const params = new URLSearchParams()
  Object.entries(filter).forEach(([k, v]) => v && params.set(k, v))

  const { data: rows = [] } = useQuery({
    queryKey: ['expenses', params.toString()],
    queryFn: () => api.get(`/expenses?${params}`).then(r => r.data),
  })
  const { data: summary } = useQuery({
    queryKey: ['expenses-summary', 6],
    queryFn: () => api.get('/expenses/summary?months=6').then(r => r.data),
  })
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies?active=1').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/expenses', {
      ...form,
      amount: +form.amount,
      company_id: form.company_id || null,
    }),
    onSuccess: () => {
      setShowForm(false)
      setForm(initialForm)
      sticky.clear()
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expenses-summary'] })
      toast({ kind: 'success', text: 'Gider kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/expenses/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses-summary'] }); toast({ kind: 'success', text: 'Silindi' }) },
  })

  async function handleDelete(e) {
    const ok = await confirmDialog({ title: 'Gider sil', body: `"${e.description}" silinsin mi?`, danger: true })
    if (ok) delMut.mutate(e.id)
  }

  const maxMonthly = Math.max(...(summary?.monthly?.map(m => m.total) || [1]))

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>BÜTÇE / MALİYET</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            GIDER TAKIBI · KISI BASINA AYLIK MALIYET
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ YENİ GİDER</button>
      </div>

      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="Bu ay toplam" value={fmt(summary.this_month_total)} color="orange" />
            <Stat label="Aktif sakin" value={summary.active_residents} />
            <Stat label="Kişi başı (bu ay)" value={fmt(summary.per_resident)} color="green" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="panel">
              <div style={{ height: 2, background: 'var(--accent)' }} />
              <div className="panel-header"><div className="panel-title">SON 6 AY</div></div>
              <div className="panel-body">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
                  {(summary.monthly || []).map(m => {
                    const h = maxMonthly > 0 ? (m.total / maxMonthly) * 140 : 0
                    return (
                      <div key={m.month} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', marginBottom: 4 }}>
                          {fmt(m.total)}
                        </div>
                        <div style={{ height: h, background: 'var(--accent)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 4, letterSpacing: 1 }}>
                          {m.month}
                        </div>
                      </div>
                    )
                  })}
                  {(summary.monthly || []).length === 0 && (
                    <div style={{ flex: 1, textAlign: 'center', color: 'var(--text3)', alignSelf: 'center' }}>Veri yok</div>
                  )}
                </div>
              </div>
            </div>
            <div className="panel">
              <div style={{ height: 2, background: 'var(--accent)' }} />
              <div className="panel-header"><div className="panel-title">BU AY KATEGORİ DAĞILIMI</div></div>
              <div className="panel-body">
                {(summary.by_category || []).length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>Bu ay gider yok</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {summary.by_category.map(c => {
                      const cat = CATEGORIES.find(x => x.value === c.category)
                      const pct = (c.total / summary.this_month_total) * 100
                      return (
                        <div key={c.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                            <span>{cat?.label || c.category}</span>
                            <span style={{ fontFamily: 'var(--mono)' }}>{fmt(c.total)} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: cat?.color || '#666' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header"><div className="panel-title">YENİ GİDER</div></div>
          <div className="panel-body">
            <StickyDraftBanner hasDraft={sticky.hasDraft} onRestore={sticky.restore} onDiscard={sticky.discard} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label">KATEGORİ *</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AÇIKLAMA *</label>
                <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">TUTAR (₺) *</label>
                <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">TARİH *</label>
                <input className="form-input" type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">FATURA NO</label>
                <input className="form-input" value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">FİRMA</label>
                <select className="form-select" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}>
                  <option value="">—</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">NOTLAR</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!form.description || !form.amount || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>İPTAL</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="panel-title">GİDERLER ({rows.length})</div>
          <div style={{ flex: 1 }} />
          <select className="form-select" style={{ width: 140 }} value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))}>
            <option value="">Tüm kategoriler</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input className="form-input" style={{ width: 130 }} type="date" value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
          <input className="form-input" style={{ width: 130 }} type="date" value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <EmptyState icon="💰" title="Gider yok" hint="Filtreleri değiştir veya 'Yeni Gider' butonunu kullan" />
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>Tarih</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Kategori</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Açıklama</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Firma</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Fatura</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Tutar</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(e => {
                    const cat = CATEGORIES.find(c => c.value === e.category)
                    return (
                      <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{e.expense_date}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 11, background: cat?.color + '22', color: cat?.color }}>
                            {cat?.label || e.category}
                          </span>
                        </td>
                        <td style={{ padding: 8 }}>{e.description}</td>
                        <td style={{ padding: 8, fontSize: 12 }}>{e.company_name || '-'}</td>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{e.invoice_no || '-'}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(e.amount)}</td>
                        <td style={{ padding: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(e)} style={{ color: 'var(--red, #ef4444)' }}>Sil</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  const c = color === 'orange' ? 'var(--orange, #f97316)' : color === 'green' ? 'var(--green, #22c55e)' : 'var(--text)'
  return (
    <div className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: c, fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  )
}
