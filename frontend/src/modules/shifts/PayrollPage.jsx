import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

const KIND_LABELS = {
  damage: '🔧 Hasar', discipline: '⚠ Disiplin', late: '⏰ Geç gelme',
  advance: '💵 Avans', tax: '📜 Vergi', other: '➕ Diğer',
}

export default function PayrollPage() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(thisMonth())
  const [showDeductions, setShowDeductions] = useState(false)
  const [addForm, setAddForm] = useState({ staff_id: '', staff_name: '', kind: 'damage', amount: '', description: '' })
  const [staffSearch, setStaffSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-detailed', month],
    queryFn: () => api.get(`/shifts/payroll-detailed?month=${month}`).then(r => r.data),
  })
  const { data: deductions = [] } = useQuery({
    queryKey: ['deductions', month],
    queryFn: () => api.get(`/shifts/deductions?period=${month}`).then(r => r.data),
    enabled: showDeductions,
  })
  const { data: staffResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })

  const addMut = useMutation({
    mutationFn: () => api.post('/shifts/deductions', {
      staff_id: +addForm.staff_id, period: month,
      kind: addForm.kind, amount: parseFloat(addForm.amount), description: addForm.description,
    }),
    onSuccess: () => {
      toast('Kesinti eklendi')
      setAddForm({ staff_id: '', staff_name: '', kind: 'damage', amount: '', description: '' })
      setStaffSearch('')
      qc.invalidateQueries({ queryKey: ['deductions'] })
      qc.invalidateQueries({ queryKey: ['payroll-detailed'] })
    },
    onError: toastErr,
  })
  const delDeduct = useMutation({
    mutationFn: (id) => api.delete(`/shifts/deductions/${id}`),
    onSuccess: () => {
      toast('Silindi')
      qc.invalidateQueries({ queryKey: ['deductions'] })
      qc.invalidateQueries({ queryKey: ['payroll-detailed'] })
    },
    onError: toastErr,
  })

  function exportCsv() {
    if (!data?.rows?.length) { toast('Veri yok', 'error'); return }
    const headers = [
      ['id', 'ID'], ['full_name', 'Ad Soyad'], ['tc_no', 'TC'],
      ['dept_name', 'Departman'], ['position', 'Pozisyon'],
      ['worked_days', 'Çalışılan Gün'], ['absent_days', 'Devamsızlık'],
      ['leave_days', 'İzin Gün'], ['overtime_hours', 'Mesai (saat)'],
      ['holiday_days', 'Tatilde Çalışma'], ['weighted_days', 'Ağırlıklı Gün'],
      ['sgk_days', 'SGK Gün'], ['total_deductions', 'Kesinti (₺)'], ['salary', 'Maaş (₺)'],
    ]
    const csv = [headers.map(h => h[1]).join(';')]
      .concat(data.rows.map(r => headers.map(h => {
        const v = r[h[0]] ?? ''
        return typeof v === 'string' && (v.includes(';') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v
      }).join(';')))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bordro-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('CSV indirildi')
  }

  return (
    <div style={{ maxWidth: 1400 }} className="fade-up">
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>BORDRO ÖZETİ</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
            VARDİYA + MESAİ + TATİL + İZİN — AYLIK KİŞİ BAZI
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)}
            style={{ width: 'auto', fontSize: 12, borderRadius: 10 }} />
          <button onClick={() => setShowDeductions(d => !d)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>
            {showDeductions ? '↩ BORDRO' : '💵 KESİNTİLER'}
          </button>
          <button onClick={exportCsv} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>📊 CSV İNDİR</button>
        </div>
      </div>

      {showDeductions && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 10 }}>+ YENİ KESİNTİ ({month})</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8 }}>
            <div>
              <input className="form-input" placeholder="Personel ara…" value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)} style={{ fontSize: 12 }} />
              {addForm.staff_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', marginTop: 3 }}>✓ {addForm.staff_name}</div>}
              {!addForm.staff_id && staffSearch.length >= 2 && (
                <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {staffResults.map(s => (
                    <button key={s.id} onClick={() => { setAddForm({ ...addForm, staff_id: s.id, staff_name: s.full_name }); setStaffSearch('') }}
                      style={{ padding: '4px 8px', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select className="form-select" value={addForm.kind} onChange={e => setAddForm({ ...addForm, kind: e.target.value })} style={{ fontSize: 12 }}>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="form-input" type="number" step="0.01" placeholder="Miktar (₺)" value={addForm.amount}
              onChange={e => setAddForm({ ...addForm, amount: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Açıklama" value={addForm.description}
              onChange={e => setAddForm({ ...addForm, description: e.target.value })} style={{ fontSize: 12 }} />
            <button onClick={() => addMut.mutate()} disabled={!addForm.staff_id || !addForm.amount || addMut.isPending}
              className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>+ EKLE</button>
          </div>
          {!deductions.length ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)', textAlign: 'center', padding: 10 }}>Bu ay kesinti yok</div>
          ) : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                  <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TİP</th>
                  <th style={{ padding: 6, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>₺</th>
                  <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>AÇIKLAMA</th>
                  <th style={{ padding: 6 }} />
                </tr>
              </thead>
              <tbody>
                {deductions.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}><strong>{d.full_name}</strong></td>
                    <td style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 10 }}>{KIND_LABELS[d.kind] || d.kind}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>-{d.amount.toFixed(2)}</td>
                    <td style={{ padding: 6, fontSize: 11, color: 'var(--text3)' }}>{d.description || '—'}</td>
                    <td style={{ padding: 6 }}>
                      <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Kesinti silinecek', confirmLabel: 'Sil' })) delDeduct.mutate(d.id) }}
                        className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 40, color: 'var(--text3)' }}>Yükleniyor…</div>
      ) : !data?.rows?.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          Veri yok
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEP</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>ÇLŞ</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>YOK</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>İZN</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>MSI</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--purple)' }}>TTL</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)' }}>SGK</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>KSN</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>MAAŞ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>
                    <strong>{r.full_name}</strong>
                    {r.tc_no && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>{r.tc_no}</div>}
                  </td>
                  <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{r.worked_days}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.absent_days > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.absent_days}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{r.leave_days}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.overtime_hours > 0 ? 'var(--accent)' : 'var(--text4)' }}>{r.overtime_hours}h</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: r.holiday_days > 0 ? 'var(--purple)' : 'var(--text4)' }}>{r.holiday_days}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{r.sgk_days}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: r.total_deductions > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.total_deductions > 0 ? '-' + r.total_deductions.toFixed(0) : '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.salary ? `${r.salary} ₺` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface2)', fontWeight: 700, borderTop: '2px solid var(--accent)' }}>
                <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10 }} colSpan={2}>TOPLAM ({data.rows.length} kişi)</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.worked_days, 0)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.absent_days, 0)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.leave_days, 0)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.overtime_hours, 0)}h</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.holiday_days, 0)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{data.rows.reduce((s, r) => s + r.sgk_days, 0)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>-{data.rows.reduce((s, r) => s + (r.total_deductions || 0), 0).toFixed(0)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        Açıklama: ÇLŞ=çalışılan gün, YOK=devamsız, İZN=izin günü, MSI=mesai saati, TTL=tatil günü çalışma (multiplier ile çarpılır), SGK=SGK gün sayısı (çalışılan+izin), KSN=toplam kesinti. Bordro hesaplaması için CSV'yi muhasebe yazılımına aktarın.
      </div>
    </div>
  )
}
