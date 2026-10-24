// Web "Saha takibi" (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md §Hedefler 7): o gün kim kaç yeri temizledi
// ve kaçı kapıdaki QR ile doğrulandı; blok başına etiket kapsaması ve açık yanlış-kapı kayıtları. QR zorunluluğunu
// yalnız müdür değiştirir (onay penceresiyle).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { parseSqlUtc } from '../../shared/logic/localDate.js'

const MODES = { off: 'Kapalı', verified_labels: 'Doğrulanmış etiketli kapılarda zorunlu' }
const LABEL_COLUMNS = [
  ['verified', 'Doğrulandı'], ['installed', 'Asılı'], ['printed', 'Basıldı'], ['stale', 'Eski'],
  ['damaged', 'Hasarlı'], ['removed', 'Kaldırıldı'], ['none', 'Kayıt yok'],
]

const hhmm = value => {
  const date = parseSqlUtc(value)
  return date ? date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'
}
const qrPercent = row => (row.cleaned > 0 ? `%${Math.round((row.qr_verified * 100) / row.cleaned)}` : '—')

export default function FieldTrackingPanel({ canManage = false }) {
  const qc = useQueryClient()
  const [date, setDate] = useState('')
  const reportQuery = useQuery({
    queryKey: ['field-report', date],
    queryFn: () => api.get(`/housekeeping/field-report${date ? `?date=${date}` : ''}`).then(r => r.data),
    refetchInterval: 60000,
  })
  const enforcement = useMutation({
    mutationFn: mode => api.put('/housekeeping/field-qr-enforcement', { mode }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['field-report'] }),
  })
  const report = reportQuery.data

  async function changeMode(mode) {
    if (!report || mode === report.enforcement) return
    const ok = await confirmDialog({
      title: 'QR zorunluluğu',
      body: mode === 'verified_labels'
        ? "Etiketi doğrulanmış kapılarda temizlikçi kapıdaki QR'ı okutmadan işaret yapamayacak. Etiketi olmayan kapılar etkilenmez."
        : 'QR okutma zorunluluğu kalkacak; temizlikçiler panodan da işaretleyebilir.',
      confirmLabel: 'Değiştir',
    })
    if (ok) enforcement.mutate(mode)
  }

  if (reportQuery.isLoading) {
    return <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)' }}>Saha takibi yükleniyor…</div>
  }
  if (reportQuery.isError || !report) {
    return <div className="panel" style={{ padding: '30px', textAlign: 'center' }}>Saha takibi alınamadı.</div>
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: '14px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="panel-title">📍 SAHA TAKİBİ</div>
            <div className="panel-subtitle" style={{ marginTop: '5px', maxWidth: '640px' }}>
              Temizlikçinin işareti, kapıdaki QR okutulduktan sonraki 60 dakika içinde verildiyse "QR ile" sayılır.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="form-input" aria-label="Tarih" value={date || report.date}
              onChange={event => setDate(event.target.value)} style={{ width: '160px' }} />
            {canManage ? (
              <select className="form-select" aria-label="QR zorunluluğu" value={report.enforcement}
                disabled={enforcement.isPending} onChange={event => changeMode(event.target.value)} style={{ width: '290px' }}>
                {Object.entries(MODES).map(([value, label]) => <option key={value} value={value}>QR zorunluluğu: {label}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{`QR zorunluluğu: ${MODES[report.enforcement] || report.enforcement}`}</span>
            )}
          </div>
        </div>
        {report.mismatches_open > 0 && (
          <div className="alert alert-warn" style={{ marginTop: '12px' }}>
            {`⚠ ${report.mismatches_open} yanlış kapı kaydı açık — QR Basım & Kurulum sayfasından düzeltin.`}
          </div>
        )}
        {enforcement.isError && (
          <div className="alert alert-danger" style={{ marginTop: '12px' }}>
            {enforcement.error?.response?.data?.error || 'Ayar kaydedilemedi.'}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: '14px', overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Personel</th><th>Temizlendi</th><th>Temizlenemedi</th><th>QR ile</th><th>QR %</th><th>İlk</th><th>Son</th></tr>
          </thead>
          <tbody>
            {report.workers.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)' }}>Bu gün saha işareti yok.</td></tr>
            )}
            {report.workers.map(row => (
              <tr key={row.worker_id}>
                <td>{row.full_name}</td>
                <td>{row.cleaned}</td>
                <td>{row.skipped}</td>
                <td>{row.qr_verified}</td>
                <td>{qrPercent(row)}</td>
                <td>{hhmm(row.first_at)}</td>
                <td>{hhmm(row.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <div className="panel-title" style={{ padding: '14px 16px 0' }}>🏷 KAPI ETİKETİ KAPSAMASI</div>
        <table className="data-table">
          <thead>
            <tr><th>Blok</th><th>Yer</th>{LABEL_COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {report.blocks.map(row => (
              <tr key={row.block}>
                <td>{row.block}</td>
                <td>{row.locations}</td>
                {LABEL_COLUMNS.map(([key]) => <td key={key}>{row[key] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
