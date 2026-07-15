import { memo, useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import {
  createMatrixDraftState,
  matrixDraftReducer,
  matrixPasteChanges,
  nextMatrixPosition,
} from '../logic/waterMatrix.js'
import {
  coerceUnitForProduct,
  humanQty,
  productInputUnit,
  smartQty,
  unitLabel,
  unitOptionsForProduct,
} from '../logic/waterUnits.js'
import {
  buildWaterExcelWorkbook,
  loadWaterExcelReportData,
  saveWaterExcelReport,
} from '../logic/waterExcelExport.js'
import { invalidateWaterQueries } from '../logic/waterQueryInvalidation.js'

const toastOk = (message) => useToastStore.getState().addToast(message, 'success')
const toastErr = (message) => useToastStore.getState().addToast(message, 'error')
const errMsg = (error, fallback) => error?.response?.data?.error || error?.message || fallback
const todayStr = () => new Date().toLocaleDateString('sv-SE')
const nf = (value) => new Intl.NumberFormat('tr-TR').format(value || 0)
const calcText = (product, parsed) => {
  if (!parsed?.valid) return ''
  const baseLabel = product?.unit_label || 'adet'
  return `${nf(parsed.input_qty)} ${unitLabel(parsed.input_unit)} = ${nf(parsed.base)} ${baseLabel}`
}
const cellKey = (zoneId, productId) => `${zoneId}:${productId}`
const brandKey = (id) => id == null ? 'null' : String(id)

const BRAND_TINT = [
  { bg: 'rgba(29,158,117,.12)', fg: '#0f6e56' },
  { bg: 'rgba(55,138,221,.12)', fg: '#185fa5' },
  { bg: 'rgba(239,159,39,.14)', fg: '#854f0b' },
  { bg: 'rgba(212,90,48,.12)', fg: '#993c1d' },
  { bg: 'rgba(127,119,221,.12)', fg: '#534ab7' },
]

const EMPTY_MATRIX_ROW = Object.freeze({})

const WaterMatrixRow = memo(function WaterMatrixRow({
  row,
  zoneIndex,
  columns,
  cellValues,
  dayMap,
  productUnits,
  brandColor,
  onOpenZone,
  onChangeCell,
  onPasteCell,
  onKeyDownCell,
  registerInput,
}) {
  return (
    <tr data-testid={`water-matrix-row-${row.zone_id}`}>
      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        <button
          type="button"
          onClick={() => onOpenZone(row)}
          title={`${row.zone_name} geçmişini aç`}
          style={{
            border: '1px solid var(--border)',
            background: row.visible_base ? 'rgba(20,184,166,.08)' : row.visible_draft ? 'rgba(34,197,94,.08)' : 'var(--surface2)',
            color: 'var(--text)',
            borderRadius: '7px',
            padding: '5px 8px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '11px',
            textAlign: 'left',
            maxWidth: '190px',
            width: '100%',
          }}
        >
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.zone_name}</span>
          <span style={{ display: 'block', color: 'var(--text3)', fontSize: '9px', fontWeight: 500 }}>geçmişi aç · ay {nf(row.visible_base)} · bugün {nf(row.visible_day)}</span>
        </button>
      </td>
      {columns.map((product, productIndex) => {
        const key = cellKey(row.zone_id, product.product_id)
        const monthBase = row.cells?.[product.product_id]?.base || 0
        const dayBase = dayMap[key] || 0
        const raw = cellValues[String(product.product_id)] || ''
        const inputUnit = productInputUnit(product, productUnits)
        const parsed = smartQty(raw, product, inputUnit)
        const active = parsed.valid
        const pending = String(raw).trim() !== ''
        const startsBrand = productIndex === 0 || brandKey(columns[productIndex - 1]?.brand_id) !== brandKey(product.brand_id)
        const tint = brandColor.get(brandKey(product.brand_id))
        return (
          <td
            key={product.product_id}
            style={{
              textAlign: 'right',
              verticalAlign: 'top',
              borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)',
              background: active ? 'rgba(34,197,94,.08)' : pending ? 'rgba(239,68,68,.05)' : startsBrand ? tint?.bg : undefined,
            }}
          >
            <div title={monthBase ? humanQty(product, monthBase) : ''} style={{ fontFamily: 'var(--mono)', color: monthBase ? 'var(--text)' : 'var(--text3)' }}>{monthBase ? nf(monthBase) : '·'}</div>
            <input
              ref={element => registerInput(key, element)}
              type="text"
              inputMode="decimal"
              className="form-input"
              value={raw}
              aria-label={`${row.zone_name} - ${product.name} dağıtım miktarı`}
              data-matrix-cell={key}
              onChange={event => onChangeCell(row.zone_id, product.product_id, event.target.value)}
              onPaste={event => onPasteCell(event, zoneIndex, productIndex)}
              onKeyDown={event => onKeyDownCell(event, zoneIndex, productIndex)}
              placeholder="0 / 3p"
              style={{ width: '66px', height: '26px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', padding: '2px 5px', marginTop: '3px' }}
            />
            {active && <div style={{ fontSize: '9px', color: 'var(--green)', marginTop: '2px', whiteSpace: 'nowrap' }} title={calcText(product, parsed)}>= {nf(parsed.base)}</div>}
            {pending && parsed.error && <div style={{ fontSize: '9px', color: 'var(--red)', marginTop: '2px', lineHeight: 1.2 }} title={parsed.error}>{parsed.error}</div>}
            {dayBase > 0 && <div style={{ fontSize: '9px', color: 'var(--teal)', marginTop: '2px' }}>bugün {nf(dayBase)}</div>}
          </td>
        )
      })}
      <td style={{ textAlign: 'right', verticalAlign: 'top', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)' }}>
        <div style={{ color: row.visible_base ? 'var(--teal)' : 'var(--text3)' }}>{row.visible_base ? nf(row.visible_base) : '·'}</div>
        {row.visible_draft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(row.visible_draft)}</div>}
      </td>
    </tr>
  )
}, (previous, next) => (
  previous.zoneIndex === next.zoneIndex
  && previous.columns === next.columns
  && previous.cellValues === next.cellValues
  && previous.dayMap === next.dayMap
  && previous.productUnits === next.productUnits
  && previous.brandColor === next.brandColor
  && previous.row.zone_id === next.row.zone_id
  && previous.row.zone_name === next.row.zone_name
  && previous.row.cells === next.row.cells
  && previous.row.visible_base === next.row.visible_base
  && previous.row.visible_day === next.row.visible_day
  && previous.row.visible_draft === next.row.visible_draft
  && previous.onOpenZone === next.onOpenZone
  && previous.onChangeCell === next.onChangeCell
  && previous.onPasteCell === next.onPasteCell
  && previous.onKeyDownCell === next.onKeyDownCell
  && previous.registerInput === next.registerInput
))

function WaterBoard({ from, to, label, lowItems = [], onOpenZone }) {
  const qc = useQueryClient()
  const [day, setDay] = useState(() => {
    const t = todayStr()
    return (t >= from && t <= to) ? t : from
  })
  const [matrixDraft, dispatchMatrix] = useReducer(matrixDraftReducer, undefined, createMatrixDraftState)
  const cells = matrixDraft.cells
  const [productUnits, setProductUnits] = useState({})
  const [exporting, setExporting] = useState(false)
  const [zoneFilter, setZoneFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [zoneSort, setZoneSort] = useState('total_desc')
  const [zoneActivity, setZoneActivity] = useState('all')
  const inputRefs = useRef({})
  const matrixRowsRef = useRef([])
  const matrixColumnsRef = useRef([])

  const pivotQuery = useQuery({
    queryKey: ['water-pivot', from, to],
    queryFn: () => api.get('/water/pivot', { params: { from, to } }).then(r => r.data),
  })
  const { data: pivot, isLoading } = pivotQuery
  const { data: dayRows = [] } = useQuery({
    queryKey: ['water-day', day],
    queryFn: () => api.get('/water/movements', { params: { type: 'out', from: day, to: day } }).then(r => r.data),
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['water-templates'],
    queryFn: () => api.get('/water/templates').then(r => r.data),
  })

  const columnsById = useMemo(() => new Map((pivot?.columns || []).map(c => [c.product_id, c])), [pivot])
  const brandColor = useMemo(() => {
    const map = new Map()
    ;(pivot?.brands || []).forEach((b, i) => map.set(brandKey(b.brand_id), b.color ? { bg: `${b.color}18`, fg: b.color } : BRAND_TINT[i % BRAND_TINT.length]))
    return map
  }, [pivot])
  const orderedCols = useMemo(
    () => (pivot?.brands || []).flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [pivot, columnsById],
  )
  const visibleBrandGroups = useMemo(() => (pivot?.brands || [])
    .filter(b => brandFilter === 'all' || brandKey(b.brand_id) === brandFilter)
    .map(b => ({ ...b, product_ids: b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean).map(p => p.product_id) }))
    .filter(b => b.product_ids.length > 0), [pivot, columnsById, brandFilter])
  const visibleCols = useMemo(
    () => visibleBrandGroups.flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [visibleBrandGroups, columnsById],
  )
  const zones = pivot?.rows || []

  // O gün zaten girilmiş dağıtım (mükerrer girişi görmek için)
  const dayMap = useMemo(() => {
    const m = {}
    dayRows.forEach(r => { const k = cellKey(r.zone_id, r.product_id); m[k] = (m[k] || 0) + (r.qty_base || 0) })
    return m
  }, [dayRows])

  // Taslak (yazılan) miktarlar — matris girişi her zaman base birim (adet/şişe) = Excel ham sayısı
  const inputUnitFor = (product) => productInputUnit(product, productUnits)

  const draft = useMemo(() => {
    const byCell = {}, byZone = {}, byProduct = {}
    let total = 0
    Object.entries(cells).forEach(([z, rowCells]) => {
      Object.entries(rowCells).forEach(([p, raw]) => {
        const product = columnsById.get(+p)
        const parsed = smartQty(raw, product, inputUnitFor(product))
        if (!parsed.valid) return
        const key = cellKey(z, p)
        byCell[key] = parsed
        byZone[z] = (byZone[z] || 0) + parsed.base
        byProduct[p] = (byProduct[p] || 0) + parsed.base
        total += parsed.base
      })
    })
    return { byCell, byZone, byProduct, total, count: Object.keys(byCell).length }
  }, [cells, columnsById, productUnits])

  const brandStats = useMemo(() => (pivot?.brands || []).map(b => {
    const ids = b.product_ids || []
    const total = zones.reduce((sum, row) => sum + ids.reduce((s, pid) => s + (row.cells?.[pid]?.base || 0), 0), 0)
    const today = zones.reduce((sum, row) => sum + ids.reduce((s, pid) => s + (dayMap[cellKey(row.zone_id, pid)] || 0), 0), 0)
    const draftTotal = ids.reduce((sum, pid) => sum + (draft.byProduct[pid] || 0), 0)
    return { ...b, key: brandKey(b.brand_id), total, today, draftTotal, productCount: ids.length }
  }), [pivot, zones, dayMap, draft])

  const visibleZoneRows = useMemo(() => {
    const needle = zoneFilter.trim().toLocaleLowerCase('tr')
    const rows = zones.map((row, index) => {
      const visibleBase = visibleCols.reduce((sum, c) => sum + (row.cells?.[c.product_id]?.base || 0), 0)
      const visibleDay = visibleCols.reduce((sum, c) => sum + (dayMap[cellKey(row.zone_id, c.product_id)] || 0), 0)
      const visibleDraft = visibleCols.reduce((sum, c) => sum + (draft.byCell[cellKey(row.zone_id, c.product_id)]?.base || 0), 0)
      return { ...row, _index: index, visible_base: visibleBase, visible_day: visibleDay, visible_draft: visibleDraft }
    }).filter(row => {
      if (needle && !String(row.zone_name || '').toLocaleLowerCase('tr').includes(needle)) return false
      if (zoneActivity === 'with_month') return row.visible_base > 0
      if (zoneActivity === 'with_day') return row.visible_day > 0
      if (zoneActivity === 'with_draft') return row.visible_draft > 0
      if (zoneActivity === 'empty') return row.visible_base === 0 && row.visible_day === 0 && row.visible_draft === 0
      return true
    })
    const byName = (a, b) => String(a.zone_name || '').localeCompare(String(b.zone_name || ''), 'tr')
    rows.sort((a, b) => {
      if (zoneSort === 'name_asc') return byName(a, b)
      if (zoneSort === 'name_desc') return byName(b, a)
      if (zoneSort === 'total_asc') return (a.visible_base - b.visible_base) || byName(a, b)
      if (zoneSort === 'day_desc') return (b.visible_day - a.visible_day) || byName(a, b)
      if (zoneSort === 'draft_desc') return (b.visible_draft - a.visible_draft) || byName(a, b)
      return (b.visible_base - a.visible_base) || byName(a, b)
    })
    return rows
  }, [zones, visibleCols, dayMap, draft, zoneFilter, zoneSort, zoneActivity])

  const visibleTotals = useMemo(() => {
    const byProduct = {}
    let month = 0, today = 0, draftTotal = 0
    visibleCols.forEach(c => { byProduct[c.product_id] = { month: 0, today: 0, draft: 0 } })
    visibleZoneRows.forEach(row => {
      month += row.visible_base || 0
      today += row.visible_day || 0
      draftTotal += row.visible_draft || 0
      visibleCols.forEach(c => {
        const bucket = byProduct[c.product_id]
        bucket.month += row.cells?.[c.product_id]?.base || 0
        bucket.today += dayMap[cellKey(row.zone_id, c.product_id)] || 0
        bucket.draft += draft.byCell[cellKey(row.zone_id, c.product_id)]?.base || 0
      })
    })
    return { byProduct, month, today, draft: draftTotal }
  }, [visibleCols, visibleZoneRows, dayMap, draft])

  matrixRowsRef.current = visibleZoneRows
  matrixColumnsRef.current = visibleCols

  const saveBatch = useMutation({
    mutationFn: (lines) => api.post('/water/distribute/batch', { move_date: day, lines }),
    onSuccess: (r) => {
      invalidateWaterQueries(qc, 'distribution')
      toastOk(`${r.data.count} dağıtım kaydedildi (${day})`)
      dispatchMatrix({ type: 'clear' })
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const updateCell = useCallback((zoneId, productId, value) => {
    dispatchMatrix({ type: 'set-cell', zoneId, productId, value })
  }, [])

  const registerInput = useCallback((key, element) => {
    if (element) inputRefs.current[key] = element
    else delete inputRefs.current[key]
  }, [])

  const handlePaste = useCallback((event, zoneIndex, productIndex) => {
    const text = event.clipboardData?.getData('text')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return
    event.preventDefault()
    const pasted = matrixPasteChanges(text, matrixRowsRef.current, matrixColumnsRef.current, zoneIndex, productIndex)
    if (!pasted.changes.length) return
    dispatchMatrix({ type: 'merge-cells', changes: pasted.changes })
    const changedRows = new Set(pasted.changes.map(change => String(change.zoneId))).size
    toastOk(`${changedRows} satır yapıştırıldı`)
  }, [])

  const focusMatrixCell = useCallback((rowIndex, columnIndex) => {
    const zone = matrixRowsRef.current[rowIndex]
    const product = matrixColumnsRef.current[columnIndex]
    if (!zone || !product) return
    const input = inputRefs.current[cellKey(zone.zone_id, product.product_id)]
    input?.focus()
    input?.select()
  }, [])

  const handleCellKeyDown = useCallback((event, rowIndex, columnIndex) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('tr') === 'z' && !event.shiftKey) {
      event.preventDefault()
      dispatchMatrix({ type: 'undo' })
      return
    }
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowLeft' && (event.currentTarget.selectionStart || 0) > 0) return
    if (event.key === 'ArrowRight' && (event.currentTarget.selectionEnd || 0) < event.currentTarget.value.length) return

    const next = nextMatrixPosition({
      key: event.key,
      rowIndex,
      columnIndex,
      rowCount: matrixRowsRef.current.length,
      columnCount: matrixColumnsRef.current.length,
      shiftKey: event.shiftKey,
    })
    if (!next) return
    event.preventDefault()
    focusMatrixCell(next.rowIndex, next.columnIndex)
  }, [focusMatrixCell])

  const openZone = useCallback((zone) => onOpenZone?.(zone), [onOpenZone])

  const save = () => {
    const lines = Object.entries(draft.byCell).map(([k, parsed]) => {
      const [zone_id, product_id] = k.split(':')
      return { zone_id: +zone_id, product_id: +product_id, input_qty: parsed.input_qty, input_unit: parsed.input_unit }
    })
    if (lines.length === 0) return toastErr('Önce hücrelere miktar girin')
    saveBatch.mutate(lines)
  }

  const setAllInputUnits = (unit) => {
    if (unit === 'default') { setProductUnits({}); return }
    const next = {}
    orderedCols.forEach(c => { next[c.product_id] = coerceUnitForProduct(unit, c) })
    setProductUnits(next)
  }

  // Şablon uygula: hücreleri varsayılan miktarla doldur + ürün birimini şablona ayarla
  const applyTemplate = (tplId) => {
    const tpl = templates.find(t => t.id === +tplId)
    if (!tpl) return
    setProductUnits(prev => {
      const next = { ...prev }
      tpl.lines.forEach(l => { next[l.product_id] = coerceUnitForProduct(l.default_unit, columnsById.get(l.product_id) || {}) })
      return next
    })
    dispatchMatrix({
      type: 'merge-cells',
      changes: tpl.lines
        .filter(line => line.default_qty != null)
        .map(line => ({ zoneId: line.zone_id, productId: line.product_id, value: String(line.default_qty) })),
    })
    const filled = tpl.lines.filter(l => l.default_qty != null).length
    toastOk(`"${tpl.name}" uygulandı — ${filled}/${tpl.lines.length} hücre dolduruldu`)
  }

  const exportExcel = async () => {
    if (!pivot) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const reportData = await loadWaterExcelReportData(api, { from, to })
      const report = buildWaterExcelWorkbook(ExcelJS, {
        pivot,
        columns: orderedCols,
        ...reportData,
        from,
        to,
        label,
      })
      await saveWaterExcelReport(report.workbook, report.filename)
      toastOk(`${report.sheetNames.length} sayfalık detaylı Excel hazırlandı`)
    } catch (error) {
      toastErr(errMsg(error, 'Excel oluşturulamadı'))
    } finally {
      setExporting(false)
    }
  }
  return (
    <div className="panel" data-testid="water-board">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div className="panel-title">INDEX — DAĞITIM YERİ MATRİSİ</div>
          <div className="panel-subtitle">{visibleZoneRows.length}/{zones.length} dağıtım yeri · görünür toplam {nf(visibleTotals.month)} · bugün {nf(visibleTotals.today)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Gün girişi:</span>
          <input type="date" className="form-input" min={from} max={to} value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
          {templates.length > 0 && (
            <select className="form-select" aria-label="Şablon uygula" value="" onChange={e => { if (e.target.value) applyTemplate(e.target.value) }} style={{ width: 'auto', fontSize: '12px' }}>
              <option value="">🗂 Şablon…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.lines.length})</option>)}
            </select>
          )}
          <span style={{ width: '1px', height: '22px', background: 'var(--border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Hücre birimi:</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAllInputUnits('default')}>Baz</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAllInputUnits('palet')}>Palet</button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Son taslak değişikliğini geri al"
            title="Son taslak değişikliğini geri al (Ctrl+Z)"
            onClick={() => dispatchMatrix({ type: 'undo' })}
            disabled={!matrixDraft.history.length}
          >
            Geri Al
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting || !pivot}>⬇ {exporting ? '…' : 'Excel'}</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saveBatch.isPending || draft.count === 0}>
            {saveBatch.isPending ? 'Kaydediliyor…' : draft.count ? `${draft.count} Hücreyi Kaydet` : 'Kaydet'}
          </button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--surface), var(--surface2))' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => setBrandFilter('all')}
              className="btn btn-ghost btn-sm"
              style={{ borderColor: brandFilter === 'all' ? 'var(--accent)' : 'var(--border)', background: brandFilter === 'all' ? 'rgba(59,130,246,.09)' : 'var(--surface)' }}
            >
              Tüm Markalar · {nf(pivot?.grandTotal)}
            </button>
            {brandStats.map(b => {
              const c = brandColor.get(b.key)
              const selected = brandFilter === b.key
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBrandFilter(selected ? 'all' : b.key)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '2px',
                    minHeight: '38px',
                    borderColor: selected ? c?.fg : 'var(--border)',
                    background: selected ? c?.bg : 'var(--surface)',
                    color: selected ? c?.fg : 'var(--text)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: c?.fg }} />{b.brand_name}
                  </span>
                  <span style={{ fontSize: '9px', color: selected ? c?.fg : 'var(--text3)' }}>{b.productCount} ürün · {nf(b.total)} · bugün {nf(b.today)}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', alignItems: 'end', marginTop: '10px' }}>
            <div>
              <label className="form-label">Dağıtım yeri ara</label>
              <input className="form-input" aria-label="Dağıtım yeri ara" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} placeholder="OTC, FPU, yemekhane..." style={{ fontSize: '12px' }} />
            </div>
            <div>
              <label className="form-label">Marka</label>
              <select className="form-select" aria-label="Marka" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="all">Tüm markalar</option>
                {brandStats.map(b => <option key={b.key} value={b.key}>{b.brand_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Sırala</label>
              <select className="form-select" aria-label="Sırala" value={zoneSort} onChange={e => setZoneSort(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="total_desc">Çok dağıtılan</option>
                <option value="total_asc">Az dağıtılan</option>
                <option value="day_desc">Bugün hareketli</option>
                <option value="draft_desc">Giriş yazılan</option>
                <option value="name_asc">A-Z dağıtım yeri</option>
                <option value="name_desc">Z-A dağıtım yeri</option>
              </select>
            </div>
            <div>
              <label className="form-label">Göster</label>
              <select className="form-select" aria-label="Göster" value={zoneActivity} onChange={e => setZoneActivity(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="all">Tüm yerler</option>
                <option value="with_month">Bu ay hareketli</option>
                <option value="with_day">Bugün verilmiş</option>
                <option value="with_draft">Giriş yazılan</option>
                <option value="empty">Hareketsiz</option>
              </select>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => { setZoneFilter(''); setBrandFilter('all'); setZoneSort('total_desc'); setZoneActivity('all') }}
            >
              Temizle
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11px', color: 'var(--text3)' }}>
            <span>Üst sayı ay toplamı</span>
            <span>Alt kutu <b>{day}</b> girişi</span>
            <span><b>3p</b>, <b>3 palet</b>, <b>10 koli</b> otomatik çarpılır</span>
            {visibleTotals.draft > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>taslak +{nf(visibleTotals.draft)}</span>}
          </div>
        </div>

        {lowItems.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--red)', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,.06)' }}>
            ⚠ Düşük stok: {lowItems.map(p => `${p.name} (${p.balance_human})`).join(' · ')}
          </div>
        )}

        {pivotQuery.isError ? (
          <div style={{ padding: '18px 20px', borderTop: '1px solid var(--border)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>Dağıtım matrisi alınamadı.</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => pivotQuery.refetch()} disabled={pivotQuery.isFetching}>
              {pivotQuery.isFetching ? 'Deneniyor...' : 'Tekrar dene'}
            </button>
          </div>
        ) : isLoading ? <div style={{ padding: '20px', color: 'var(--text3)' }}>Yükleniyor…</div> : !orderedCols.length ? (
          <div style={{ padding: '20px', color: 'var(--text3)' }}>Ürün tanımı yok — ⚙ Ayarlar’dan ekleyin.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(760, 250 + visibleCols.length * 108) }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--surface)', textAlign: 'left', minWidth: '176px' }}>DAĞITIM YERİ</th>
                  {visibleBrandGroups.map(b => {
                    if (!b.product_ids.length) return null
                    const c = brandColor.get(brandKey(b.brand_id))
                    return <th key={b.brand_id ?? 'none'} colSpan={b.product_ids.length} style={{ textAlign: 'center', background: c?.bg, color: c?.fg, fontWeight: 800, borderLeft: `3px solid ${c?.fg || 'var(--border)'}`, boxShadow: `inset 0 -2px 0 ${c?.fg || 'var(--border)'}` }}>{b.brand_name}</th>
                  })}
                  <th rowSpan={2} style={{ textAlign: 'right', minWidth: '64px', background: 'var(--surface2)' }}>TOPLAM</th>
                </tr>
                <tr>
                  {visibleCols.map((c, prodIdx) => {
                    const startsBrand = prodIdx === 0 || brandKey(visibleCols[prodIdx - 1]?.brand_id) !== brandKey(c.brand_id)
                    const tint = brandColor.get(brandKey(c.brand_id))
                    return (
                    <th key={c.product_id} style={{ textAlign: 'right', minWidth: '96px', borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)', background: startsBrand ? tint?.bg : undefined }} title={`${c.brand_name} · ${c.name}`}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>{c.name}</div>
                      <select
                        className="form-select"
                        value={inputUnitFor(c)}
                        onChange={e => setProductUnits(prev => ({ ...prev, [c.product_id]: e.target.value }))}
                        style={{ height: '24px', minHeight: 0, fontSize: '10px', padding: '2px 4px', textAlign: 'right' }}
                      >
                        {unitOptionsForProduct(c).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleZoneRows.map((row, zoneIndex) => (
                  <WaterMatrixRow
                    key={row.zone_id}
                    row={row}
                    zoneIndex={zoneIndex}
                    columns={visibleCols}
                    cellValues={cells[String(row.zone_id)] || EMPTY_MATRIX_ROW}
                    dayMap={dayMap}
                    productUnits={productUnits}
                    brandColor={brandColor}
                    onOpenZone={openZone}
                    onChangeCell={updateCell}
                    onPasteCell={handlePaste}
                    onKeyDownCell={handleCellKeyDown}
                    registerInput={registerInput}
                  />
                ))}
                {visibleZoneRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '18px', color: 'var(--text3)' }}>Filtreye uygun dağıtım yeri yok</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface2)', fontWeight: 700 }}>GENEL TOPLAM</td>
                  {visibleCols.map((c, prodIdx) => {
                    const startsBrand = prodIdx === 0 || brandKey(visibleCols[prodIdx - 1]?.brand_id) !== brandKey(c.brand_id)
                    const tint = brandColor.get(brandKey(c.brand_id))
                    const colBase = visibleTotals.byProduct[c.product_id]?.month || 0
                    const colDraft = visibleTotals.byProduct[c.product_id]?.draft || 0
                    return (
                      <td key={c.product_id} style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)' }}>
                        {nf(colBase)}{colDraft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(colDraft)}</div>}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)' }}>
                    {nf(visibleTotals.month)}{visibleTotals.draft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(visibleTotals.draft)}</div>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(WaterBoard)
