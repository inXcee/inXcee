import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { invalidateWaterQueries } from '../logic/waterQueryInvalidation.js'
import { todayStr } from '../logic/waterUi.js'
import WaterCollapsiblePanel from './WaterCollapsiblePanel.jsx'
import WaterModal from './WaterModal.jsx'

const STATUS_META = {
  critical: { label: 'Kontrol gerekli', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 9%, var(--surface))' },
  expired: { label: 'SKT geçti', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 9%, var(--surface))' },
  expiring: { label: 'SKT yaklaşıyor', color: 'var(--amber, #b45309)', background: 'color-mix(in srgb, var(--amber, #b45309) 11%, var(--surface))' },
  quarantined: { label: 'Karantina', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 9%, var(--surface))' },
  missing: { label: 'SKT eksik', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 9%, var(--surface))' },
  healthy: { label: 'Sağlıklı', color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 8%, var(--surface))' },
}

const FILTERS = [
  ['critical', 'Kritik'],
  ['expired', 'SKT geçti'],
  ['expiring', 'Yaklaşıyor'],
  ['quarantined', 'Karantina'],
  ['missing', 'SKT eksik'],
  ['healthy', 'Sağlıklı'],
  ['all', 'Tümü'],
]

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.healthy
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', minHeight: '24px', padding: '3px 8px',
      border: `1px solid color-mix(in srgb, ${meta.color} 42%, var(--border))`, borderRadius: '5px',
      color: meta.color, background: meta.background, fontSize: '10px', fontWeight: 750, whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

function daysLabel(row) {
  if (row.days_to_expiry == null) return 'Tarih yok'
  if (row.days_to_expiry < 0) return `${Math.abs(row.days_to_expiry)} gün geçti`
  if (row.days_to_expiry === 0) return 'Bugün'
  return `${row.days_to_expiry} gün kaldı`
}

function metric(label, value, color) {
  return (
    <div style={{ minWidth: '92px', padding: '2px 14px 2px 0' }}>
      <div style={{ fontSize: '9px', fontWeight: 750, color: 'var(--text3)' }}>{label}</div>
      <div style={{ marginTop: '2px', fontFamily: 'var(--mono)', fontSize: '19px', color }}>{value || 0}</div>
    </div>
  )
}

export default function WaterExpiryPanel({ alertSnapshot = null }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('critical')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const today = todayStr()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['water-lots', today],
    queryFn: () => api.get('/water/lots', { params: { today } }).then(response => response.data),
    enabled: open,
    refetchInterval: import.meta.env.MODE === 'test' ? false : (open ? 60000 : false),
  })
  const alertData = alertSnapshot
    ? { summary: alertSnapshot.lot_summary || {}, rows: alertSnapshot.lot_alerts || [] }
    : null
  const data = open ? (query.data || alertData) : (alertData || query.data)
  const summary = data?.summary || {}
  const allRows = data?.rows || []
  const detailLoading = open && query.isFetching && !query.data
  const rows = useMemo(() => {
    if (filter === 'all') return allRows
    if (filter === 'critical') return allRows.filter(row => row.health !== 'healthy')
    return allRows.filter(row => row.health === filter)
  }, [allRows, filter])

  const update = useMutation({
    mutationFn: payload => api.put(`/water/lots/${editing.id}`, payload).then(response => response.data),
    onSuccess: result => {
      invalidateWaterQueries(queryClient, 'lots')
      useToastStore.getState().addToast(
        result.matched ? `Lot güncellendi; ${result.matched} bekleyen dağıtım eşleşti.` : 'Lot bilgileri güncellendi.',
        'success',
      )
      setEditing(null)
      setForm(null)
    },
    onError: error => useToastStore.getState().addToast(
      error?.response?.data?.error || error?.message || 'Lot güncellenemedi.',
      'error',
    ),
  })

  const startEdit = (row, preferredStatus = row.lot_status) => {
    setEditing(row)
    setForm({
      lot_no: row.lot_no || '',
      production_date: row.production_date || '',
      expiry_date: row.expiry_date || '',
      lot_status: preferredStatus,
      lot_status_note: preferredStatus === row.lot_status ? (row.lot_status_note || '') : '',
    })
  }

  const save = () => {
    if (editing.expiry_tracking && !form.lot_no.trim()) {
      useToastStore.getState().addToast('Bu ürün için lot numarası zorunlu.', 'error')
      return
    }
    if (editing.expiry_tracking && !form.expiry_date) {
      useToastStore.getState().addToast('Bu ürün için SKT zorunlu.', 'error')
      return
    }
    if (form.lot_status === 'quarantined' && !form.lot_status_note.trim()) {
      useToastStore.getState().addToast('Karantina gerekçesini yazın.', 'error')
      return
    }
    update.mutate({ ...form, lot_no: form.lot_no.trim(), lot_status_note: form.lot_status_note.trim() })
  }

  const subtitle = !data
    ? 'Lot özeti yükleniyor'
    : summary.critical
      ? `${summary.critical} kritik lot · ${summary.expired || 0} geçmiş · ${summary.expiring || 0} yaklaşan`
      : summary.all
        ? `${summary.all} açık lot · kritik durum yok`
        : 'Takip edilen açık lot yok'

  return (
    <>
      <WaterCollapsiblePanel
        id="water-expiry-panel"
        open={open}
        onToggle={() => setOpen(value => !value)}
        title="Lot ve SKT Kontrolü"
        subtitle={subtitle}
        openLabel="Lotları göster"
        closeLabel="Lotları gizle"
        style={{ marginBottom: '16px', borderLeft: `5px solid ${summary.critical ? 'var(--red)' : 'var(--green)'}` }}
        beforeToggle={<StatusBadge status={summary.critical ? 'critical' : 'healthy'} />}
      >
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            {metric('SKT GEÇTİ', summary.expired, 'var(--red)')}
            {metric('YAKLAŞIYOR', summary.expiring, 'var(--amber, #b45309)')}
            {metric('KARANTİNA', summary.quarantined, 'var(--accent)')}
            {metric('SKT EKSİK', summary.missing, 'var(--red)')}
            {metric('SAĞLIKLI', summary.healthy, 'var(--green)')}
          </div>

          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '12px' }}>
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`}
                aria-label={`${label} filtresi`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '980px', width: '100%' }}>
              <thead>
                <tr>
                  <th>Durum</th><th>Ürün</th><th>Lot</th><th>İrsaliye / Giriş</th><th>Üretim</th><th>SKT</th>
                  <th style={{ textAlign: 'right' }}>Kalan</th><th>Açıklama</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ background: STATUS_META[row.health]?.background }}>
                    <td><StatusBadge status={row.health} /></td>
                    <td style={{ fontWeight: 650 }}>{row.brand_name ? `${row.brand_name} · ` : ''}{row.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.lot_no || '—'}</td>
                    <td><div style={{ fontFamily: 'var(--mono)' }}>{row.waybill_no || `Giriş #${row.id}`}</div><div style={{ color: 'var(--text3)', fontSize: '10px' }}>{row.move_date}</div></td>
                    <td style={{ fontFamily: 'var(--mono)', color: row.production_date ? 'var(--text2)' : 'var(--text3)' }}>{row.production_date || '—'}</td>
                    <td><div style={{ fontFamily: 'var(--mono)', color: ['expired', 'missing'].includes(row.health) ? 'var(--red)' : 'var(--text)' }}>{row.expiry_date || '—'}</div><div style={{ color: 'var(--text3)', fontSize: '10px' }}>{daysLabel(row)}</div></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 650 }}>{row.remaining_human}</td>
                    <td style={{ maxWidth: '210px', color: row.lot_status_note ? 'var(--text2)' : 'var(--text3)' }}>{row.lot_status_note || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Düzenle</button>
                      {row.lot_status === 'active'
                        ? <button type="button" className="btn btn-danger btn-sm" aria-label={`${row.lot_no || row.product_name} lotunu karantinaya al`} onClick={() => startEdit(row, 'quarantined')}>Karantina</button>
                        : <button type="button" className="btn btn-primary btn-sm" aria-label={`${row.lot_no || row.product_name} lotunu kullanıma aç`} onClick={() => startEdit(row, 'active')}>Kullanıma aç</button>}
                    </td>
                  </tr>
                ))}
                {!detailLoading && rows.length === 0 && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Bu filtrede açık lot bulunmuyor.</td></tr>
                )}
                {detailLoading && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Lot ayrıntıları güncelleniyor...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </WaterCollapsiblePanel>

      {editing && form && (
        <WaterModal title="Lot Bilgisi ve Kullanım Durumu" onClose={() => { setEditing(null); setForm(null) }} width="720px">
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ borderLeft: '4px solid var(--accent)', padding: '8px 12px', background: 'var(--surface2)' }}>
              <div style={{ fontWeight: 700 }}>{editing.brand_name ? `${editing.brand_name} · ` : ''}{editing.product_name}</div>
              <div style={{ marginTop: '3px', color: 'var(--text3)', fontSize: '11px' }}>{editing.waybill_no || `Giriş #${editing.id}`} · Kalan {editing.remaining_human}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <label className="form-label">Lot numarası{editing.expiry_tracking ? ' *' : ''}<input className="form-input" value={form.lot_no} onChange={event => setForm(value => ({ ...value, lot_no: event.target.value }))} /></label>
              <label className="form-label">Üretim tarihi<input type="date" className="form-input" value={form.production_date} onChange={event => setForm(value => ({ ...value, production_date: event.target.value }))} /></label>
              <label className="form-label">Son kullanma tarihi{editing.expiry_tracking ? ' *' : ''}<input type="date" className="form-input" value={form.expiry_date} onChange={event => setForm(value => ({ ...value, expiry_date: event.target.value }))} /></label>
            </div>
            <label className="form-label">Kullanım durumu<select className="form-select" value={form.lot_status} onChange={event => setForm(value => ({ ...value, lot_status: event.target.value }))}>
              <option value="active">Kullanıma açık</option>
              <option value="quarantined">Karantina / dağıtımı engelle</option>
            </select></label>
            <label className="form-label">Durum açıklaması{form.lot_status === 'quarantined' ? ' *' : ''}<textarea className="form-input" rows="3" value={form.lot_status_note} onChange={event => setForm(value => ({ ...value, lot_status_note: event.target.value }))} placeholder="Kontrol, hasar veya karantina gerekçesi" /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(null) }}>Vazgeç</button>
              <button type="button" className="btn btn-primary" disabled={update.isPending} onClick={save}>{update.isPending ? 'Kaydediliyor...' : 'Lotu Kaydet'}</button>
            </div>
          </div>
        </WaterModal>
      )}
    </>
  )
}
