import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

export default function PayrollPage() {
  const [month, setMonth] = useState(thisMonth())
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', month],
    queryFn: () => api.get(`/shifts/payroll-export?month=${month}`).then(r => r.data),
  })

  function exportCsv() {
    if (!data?.rows?.length) { toast('Veri yok', 'error'); return }
    const headers = [
      ['id', 'ID'], ['full_name', 'Ad Soyad'], ['tc_no', 'TC'],
      ['dept_name', 'Departman'], ['position', 'Pozisyon'],
      ['worked_days', 'Çalışılan Gün'], ['absent_days', 'Devamsızlık'],
      ['leave_days', 'İzin Gün'], ['overtime_hours', 'Mesai (saat)'],
      ['holiday_days', 'Tatilde Çalışma'], ['salary', 'Maaş (₺)'],
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
          <button onClick={exportCsv} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>📊 CSV İNDİR</button>
        </div>
      </div>

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
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        Açıklama: ÇLŞ=çalışılan gün, YOK=devamsız, İZN=izin günü, MSI=mesai saati, TTL=tatil günü çalışma (multiplier ile çarpılır). Bordro hesaplaması için CSV'yi muhasebe yazılımına aktarın.
      </div>
    </div>
  )
}
