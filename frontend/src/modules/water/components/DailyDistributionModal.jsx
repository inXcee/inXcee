import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { invalidateWaterQueries } from '../logic/waterQueryInvalidation.js'
import {
  baseEquivalent,
  defaultUnitForProduct,
  humanQty,
  smartQty,
  unitOptionsForProduct,
} from '../logic/waterUnits.js'
import {
  calcText,
  dayLong,
  downloadCsv,
  movementTime,
  nf,
  shiftIsoDay,
} from '../logic/waterUi.js'
import WaterModal from './WaterModal.jsx'

const toastOk = message => useToastStore.getState().addToast(message, 'success')
const toastErr = message => useToastStore.getState().addToast(message, 'error')
const errMsg = (error, fallback) => error?.response?.data?.error || error?.message || fallback

export default function DailyDistributionModal({ day, from, to, onDayChange, onClose }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['water-daily-ledger', day],
    enabled: !!day,
    queryFn: () => api.get('/water/movements', { params: { type: 'out', from: day, to: day, limit: 600 } }).then(r => r.data),
  })
  // Günün gelen irsaliyeleri — defter tek başına dağıtım değil, giriş de gösterir
  const { data: inRows = [], isLoading: inLoading } = useQuery({
    queryKey: ['water-daily-ledger-in', day],
    enabled: !!day,
    queryFn: () => api.get('/water/movements', { params: { type: 'in', from: day, to: day, limit: 300 } }).then(r => r.data),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['water-products'],
    enabled: !!editing,
    queryFn: () => api.get('/water/products').then(r => r.data),
  })
  const { data: zones = [] } = useQuery({
    queryKey: ['water-zones'],
    enabled: !!editing,
    queryFn: () => api.get('/water/zones').then(r => r.data),
  })

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('tr')
    if (!needle) return rows
    return rows.filter(r => [
      r.zone_name, r.product_name, r.brand_name, r.source_waybills,
      r.created_by_name, r.created_by_username, r.note, r.input_unit, r.qty_human,
    ].some(v => String(v || '').toLocaleLowerCase('tr').includes(needle)))
  }, [rows, filter])

  const visibleInRows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('tr')
    if (!needle) return inRows
    return inRows.filter(r => [
      r.waybill_no, r.product_name, r.brand_name, r.lot_no,
      r.created_by_name, r.created_by_username, r.note, r.input_unit, r.qty_human,
    ].some(v => String(v || '').toLocaleLowerCase('tr').includes(needle)))
  }, [inRows, filter])
  const inTotal = useMemo(() => visibleInRows.reduce((sum, r) => sum + Number(r.qty_base || 0), 0), [visibleInRows])

  const stats = useMemo(() => {
    const byZone = new Map()
    const byProduct = new Map()
    let total = 0, pending = 0
    visibleRows.forEach(r => {
      const qty = Number(r.qty_base || 0)
      total += qty
      pending += Number(r.unallocated_base || 0)
      const zoneKey = r.zone_id || r.zone_name || 'unknown'
      const zone = byZone.get(zoneKey) || { key: zoneKey, zone_name: r.zone_name || 'Bölge yok', total: 0, count: 0, products: new Map() }
      zone.total += qty
      zone.count += 1
      const zoneProduct = zone.products.get(r.product_id) || { product: r, total: 0 }
      zoneProduct.total += qty
      zone.products.set(r.product_id, zoneProduct)
      byZone.set(zoneKey, zone)

      const product = byProduct.get(r.product_id) || { product: r, total: 0, count: 0, zones: new Set() }
      product.total += qty
      product.count += 1
      if (r.zone_name) product.zones.add(r.zone_name)
      byProduct.set(r.product_id, product)
    })
    return {
      total,
      zoneCount: byZone.size,
      productCount: byProduct.size,
      recordCount: visibleRows.length,
      pending,
      zones: [...byZone.values()].sort((a, b) => b.total - a.total),
      products: [...byProduct.values()].sort((a, b) => b.total - a.total),
    }
  }, [visibleRows])

  const selectedProduct = products.find(p => String(p.id) === String(editing?.product_id))
  const editCalc = editing ? smartQty(editing.input_qty, selectedProduct, editing.input_unit) : null
  const prevDay = shiftIsoDay(day, -1)
  const nextDay = shiftIsoDay(day, 1)
  const canPrev = !from || prevDay >= from
  const canNext = !to || nextDay <= to

  const invalidate = () => invalidateWaterQueries(qc, 'distribution')
  const updateMovement = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/water/movements/${id}`, payload),
    onSuccess: (_, vars) => {
      invalidate()
      toastOk('Dağıtım kaydı güncellendi')
      setEditing(null)
      if (vars?.payload?.move_date && vars.payload.move_date !== day) onDayChange?.(vars.payload.move_date)
    },
    onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')),
  })
  const deleteMovement = useMutation({
    mutationFn: (id) => api.delete(`/water/movements/${id}`),
    onSuccess: () => { invalidate(); toastOk('Dağıtım kaydı silindi'); setEditing(null) },
    onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const startEdit = (r) => setEditing({
    id: r.id,
    move_date: r.move_date || day,
    zone_id: r.zone_id || '',
    product_id: r.product_id || '',
    input_qty: r.input_qty || '',
    input_unit: r.input_unit || defaultUnitForProduct(r),
    note: r.note || '',
  })
  const saveEdit = () => {
    if (!editing?.zone_id) return toastErr('Bölge seçin')
    if (!editing?.product_id) return toastErr('Ürün seçin')
    if (!editCalc?.valid) return toastErr(editCalc?.error || 'Geçerli miktar girin')
    updateMovement.mutate({
      id: editing.id,
      payload: {
        zone_id: +editing.zone_id,
        product_id: +editing.product_id,
        move_date: editing.move_date,
        input_qty: editCalc.input_qty,
        input_unit: editCalc.input_unit,
        note: editing.note?.trim() || undefined,
      },
    })
  }
  const exportCsv = () => {
    downloadCsv(`su-gunluk-defter-${day}.csv`,
      ['Tür', 'Tarih', 'Saat', 'Bölge', 'Marka', 'Ürün', 'Girilen', 'Hesaplanan', 'Baz karşılığı', 'İrsaliye', 'Kaydı Giren', 'Not'],
      [
        ...visibleInRows.map(r => [
          'GELEN', r.move_date, movementTime(r.created_at), '', r.brand_name, r.product_name,
          `${nf(r.input_qty)} ${r.input_unit}`, r.qty_human || humanQty(r, r.qty_base),
          baseEquivalent(r, r.qty_base) || '', r.waybill_no || '', r.created_by_name || r.created_by_username || '', r.note || '',
        ]),
        ...visibleRows.map(r => [
          'DAĞITIM', r.move_date, movementTime(r.created_at), r.zone_name, r.brand_name, r.product_name,
          `${nf(r.input_qty)} ${r.input_unit}`, r.qty_human || humanQty(r, r.qty_base),
          baseEquivalent(r, r.qty_base) || '', r.source_waybills || '', r.created_by_name || r.created_by_username || '', r.note || '',
        ]),
      ])
  }

  return (
    <WaterModal title={`${day} - GÜNLÜK DEFTER`} onClose={onClose} width="1160px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '22px' }}>{dayLong(day)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '11px' }}>O günün gelen irsaliyeleri + dağıtım kayıtları, irsaliye bağlantıları ve kaydı giren</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(78px, 1fr))', gap: '8px' }}>
            {[
              ['Gelen', nf(inTotal), inTotal > 0 ? 'var(--green)' : 'var(--text3)'],
              ['Dağıtılan', nf(stats.total), 'var(--accent)'],
              ['Bölge', nf(stats.zoneCount), 'var(--teal)'],
              ['Ürün', nf(stats.productCount), 'var(--green)'],
              ['Kayıt', nf(stats.recordCount + visibleInRows.length), 'var(--text)'],
              ['Bekleyen', nf(stats.pending), stats.pending > 0 ? 'var(--red)' : 'var(--text3)'],
            ].map(([name, value, color]) => (
              <div key={name} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', padding: '7px 9px', borderRadius: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{name}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
          <button className="btn btn-ghost btn-sm" type="button" disabled={!canPrev} onClick={() => onDayChange?.(prevDay)}>‹ Önceki</button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={!canNext} onClick={() => onDayChange?.(nextDay)}>Sonraki ›</button>
          <input
            className="form-input"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Bölge, ürün, irsaliye, kişi ara..."
            style={{ minWidth: '240px', flex: '1 1 260px', fontSize: '12px' }}
          />
          <button className="btn btn-ghost btn-sm" type="button" disabled={!visibleRows.length} onClick={exportCsv}>CSV</button>
        </div>

        {editing && (
          <div style={{ border: '1px solid rgba(20,184,166,.45)', background: 'rgba(20,184,166,.07)', borderRadius: '8px', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
              <strong style={{ fontSize: '12px' }}>Kayıt #{editing.id} düzenleniyor</strong>
              <span style={{ color: editCalc?.error ? 'var(--red)' : 'var(--text3)', fontSize: '11px' }}>{editCalc?.valid ? calcText(selectedProduct, editCalc) : editCalc?.error || 'Miktar girince hesaplanır'}</span>
            </div>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Tarih
              <input type="date" className="form-input" value={editing.move_date} onChange={e => setEditing(v => ({ ...v, move_date: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Bölge
              <select className="form-select" value={editing.zone_id} onChange={e => setEditing(v => ({ ...v, zone_id: e.target.value }))} style={{ fontSize: '12px' }}>
                <option value="">Seçin</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Ürün
              <select className="form-select" value={editing.product_id} onChange={e => {
                const product = products.find(p => String(p.id) === e.target.value)
                setEditing(v => ({ ...v, product_id: e.target.value, input_unit: defaultUnitForProduct(product) }))
              }} style={{ fontSize: '12px' }}>
                <option value="">Seçin</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Miktar
              <input className="form-input" value={editing.input_qty} onChange={e => setEditing(v => ({ ...v, input_qty: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Birim
              <select className="form-select" value={editing.input_unit} onChange={e => setEditing(v => ({ ...v, input_unit: e.target.value }))} style={{ fontSize: '12px' }}>
                {unitOptionsForProduct(selectedProduct).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Not
              <input className="form-input" value={editing.note} onChange={e => setEditing(v => ({ ...v, note: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(null)}>Vazgeç</button>
              <button className="btn btn-primary btn-sm" type="button" disabled={updateMovement.isPending} onClick={saveEdit}>{updateMovement.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
            </div>
          </div>
        )}

        {(isLoading || inLoading) ? (
          <div style={{ padding: '18px', color: 'var(--text3)' }}>Günlük kayıtlar yükleniyor...</div>
        ) : (
          <>
        {visibleInRows.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)', marginBottom: '6px' }}>
              GELEN (İRSALİYE) — {visibleInRows.length} kayıt
            </div>
            <div style={{ border: '1px solid rgba(34,197,94,.35)', borderRadius: '8px', overflow: 'auto', maxHeight: '32vh' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '860px' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '70px' }}>Saat</th>
                    <th style={{ minWidth: '110px' }}>İrsaliye</th>
                    <th style={{ minWidth: '170px' }}>Ürün</th>
                    <th style={{ textAlign: 'right', minWidth: '90px' }}>Girilen</th>
                    <th style={{ textAlign: 'right', minWidth: '130px' }}>Hesaplanan</th>
                    <th style={{ textAlign: 'right', minWidth: '110px' }}>İrsaliyede kalan</th>
                    <th style={{ minWidth: '110px' }}>Kaydı giren</th>
                    <th style={{ minWidth: '110px' }}>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInRows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{movementTime(r.created_at) || '--:--'}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>#{r.id}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.waybill_no ? 'var(--text)' : 'var(--amber, #b45309)' }}>{r.waybill_no || 'irsaliyesiz'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.product_name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{r.brand_name || 'Marka yok'}{r.lot_no ? ` · Lot ${r.lot_no}` : ''}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(r.input_qty)} {r.input_unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>
                        <div>{r.qty_human || humanQty(r, r.qty_base)}</div>
                        {baseEquivalent(r, r.qty_base) && <div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>= {baseEquivalent(r, r.qty_base)}</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: (r.remaining_base || 0) > 0 ? 'var(--teal)' : 'var(--text3)' }}>{r.remaining_human || nf(r.remaining_base)}</td>
                      <td>{r.created_by_name || r.created_by_username || '-'}</td>
                      <td style={{ color: r.note ? 'var(--text2)' : 'var(--text3)' }}>{r.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rows.length === 0 && visibleInRows.length === 0 && inRows.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Bu gün için giriş veya dağıtım kaydı yok.</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '14px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Bu gün dağıtım kaydı yok.</div>
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Filtreye uygun dağıtım kaydı yok.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, .65fr)', gap: '14px' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '58vh' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '980px' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '76px' }}>Saat</th>
                    <th style={{ minWidth: '160px' }}>Kime / nereye</th>
                    <th style={{ minWidth: '160px' }}>Ürün</th>
                    <th style={{ textAlign: 'right', minWidth: '90px' }}>Girilen</th>
                    <th style={{ textAlign: 'right', minWidth: '112px' }}>Hesaplanan</th>
                    <th style={{ minWidth: '150px' }}>İrsaliye</th>
                    <th style={{ minWidth: '120px' }}>Kaydı giren</th>
                    <th style={{ minWidth: '120px' }}>Not</th>
                    <th style={{ minWidth: '120px' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => {
                    const pending = Number(r.unallocated_base || 0)
                    return (
                    <tr key={r.id} style={{ background: pending > 0 ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{movementTime(r.created_at) || '--:--'}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>#{r.id}</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.zone_name || '-'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.product_name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{r.brand_name || 'Marka yok'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(r.input_qty)} {r.input_unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.qty_human || humanQty(r, r.qty_base)}</td>
                      <td style={{ color: r.source_waybills || pending > 0 ? 'var(--text2)' : 'var(--text3)', fontSize: '10px' }}>
                        {r.source_waybills || '-'}
                        {pending > 0 && <div style={{ color: 'var(--red)', fontWeight: 800, marginTop: '3px' }}>-{r.unallocated_human || humanQty(r, pending)} irsaliye bekliyor</div>}
                      </td>
                      <td>{r.created_by_name || r.created_by_username || '-'}</td>
                      <td style={{ color: r.note ? 'var(--text2)' : 'var(--text3)' }}>{r.note || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => startEdit(r)}>Düzenle</button>
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            disabled={deleteMovement.isPending}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Dağıtım Kaydını Sil', body: `${r.zone_name || '-'} / ${r.product_name} kaydı silinsin mi?`, danger: true })) deleteMovement.mutate(r.id)
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>BÖLGE TOPLAMI</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '240px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {stats.zones.map(z => (
                        <tr key={z.key}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{z.zone_name}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '9px' }}>
                              {[...z.products.values()].sort((a, b) => b.total - a.total).slice(0, 2).map(p => `${p.product.product_name}: ${nf(p.total)}`).join(' · ')}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(z.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>ÜRÜN TOPLAMI</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '240px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {stats.products.map(p => (
                        <tr key={p.product.product_id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{p.product.brand_name ? `${p.product.brand_name} · ` : ''}{p.product.product_name}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{p.count} kayıt · {p.zones.size} bölge</div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{humanQty(p.product, p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </WaterModal>
  )
}
