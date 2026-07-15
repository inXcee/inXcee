import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  WATER_EXCEL_SHEETS,
  buildWaterExcelWorkbook,
  loadWaterExcelReportData,
  safeExcelText,
  waterExcelFilename,
} from './waterExcelExport.js'

const PRODUCTS = [
  {
    product_id: 1,
    name: 'Damacana',
    brand_id: 1,
    brand_name: 'Mila Su',
    unit_label: 'adet',
    units_per_case: 1,
    cases_per_pallet: 36,
    min_level: 72,
    lead_time_days: 5,
    safety_stock_days: 2,
    expiry_tracking: true,
    expiry_warning_days: 30,
  },
  {
    product_id: 2,
    name: '0.33 L Su',
    brand_id: 1,
    brand_name: 'Mila Su',
    unit_label: 'koli',
    units_per_case: 1,
    cases_per_pallet: 180,
    min_level: 360,
    lead_time_days: 10,
    safety_stock_days: 4,
    expiry_tracking: true,
    expiry_warning_days: 45,
  },
]

function reportOptions(overrides = {}) {
  return {
    from: '2026-07-01',
    to: '2026-07-31',
    label: 'Temmuz 2026',
    generatedAt: new Date('2026-07-15T09:30:00+03:00'),
    columns: PRODUCTS,
    pivot: {
      brands: [{ brand_id: 1, brand_name: 'Mila Su', product_ids: [1, 2] }],
      rows: [{
        zone_id: 10,
        zone_name: '=FORMULA',
        total_base: 1908,
        cells: { 1: { base: 108 }, 2: { base: 1800 } },
      }],
      colTotals: { 1: { base: 108 }, 2: { base: 1800 } },
      grandTotal: 1908,
    },
    summary: {
      totals: {
        period_in: 2200,
        period_out: 2300,
        period_net: -100,
        balance: -30,
        low_count: 1,
        period_return: 18,
        outstanding: 44,
      },
      stock: [
        {
          ...PRODUCTS[0],
          id: 1,
          total_in: 100,
          total_out: 130,
          period_in: 50,
          period_out: 80,
          period_net: -30,
          balance: -30,
          negative: true,
          low: true,
          balance_human: '-30 adet',
          deficit_human: '30 adet',
        },
        {
          ...PRODUCTS[1],
          id: 2,
          total_in: 2200,
          total_out: 1800,
          period_in: 2150,
          period_out: 2220,
          period_net: -70,
          balance: 400,
          negative: false,
          low: false,
          balance_human: '2 palet 40 koli',
        },
      ],
      daily: [
        { move_date: '2026-07-01', in_base: 200, out_base: 100 },
        { move_date: '2026-07-02', in_base: 50, out_base: 80 },
      ],
      zones: [{
        zone_name: 'FPU Yemekhane',
        brand_name: 'Mila Su',
        product_name: 'Damacana',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        total_out: 108,
      }],
    },
    forecast: {
      date: '2026-07-31',
      window: 30,
      target_days: 30,
      totals: { order_count: 1, overdue_order_count: 1, due_soon_order_count: 0, soon_count: 1 },
      rows: [{
        product_id: 1,
        product_name: 'Damacana',
        brand_name: 'Mila Su',
        balance: 10,
        avg_daily: 3,
        days_of_cover: 3,
        lead_time_days: 5,
        safety_stock_days: 2,
        order_by_date: '2026-07-27',
        stockout_date: '2026-08-03',
        order_urgency: 'overdue',
        needs_order: true,
        suggested_base: 80,
        suggested_human: '80 adet',
      }],
    },
    outRows: [{
      move_date: '2026-07-15',
      created_at: '2026-07-15 10:25:00',
      zone_name: 'FPU Yemekhane',
      brand_name: 'Mila Su',
      product_name: 'Damacana',
      input_qty: 2.5,
      input_unit: 'palet',
      qty_base: 90,
      source_waybills: 'IRS-1',
      created_by_name: 'Vardiya Amiri',
      note: '@risk',
    }],
    inRows: [{
      id: 20,
      move_date: '2026-07-15',
      waybill_no: 'IRS-1',
      brand_name: 'Mila Su',
      product_name: 'Damacana',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 36,
      input_qty: 3,
      input_unit: 'palet',
      qty_base: 108,
      intake_allocated_base: 90,
      remaining_base: 18,
      lot_no: 'LOT-DAM-01',
      production_date: '2026-06-15',
      expiry_date: '2026-08-05',
      lot_status: 'active',
      created_by_name: 'Müdür',
    }],
    lotSummary: { all: 1, critical: 1, expired: 0, expiring: 1, quarantined: 0, missing: 0, healthy: 0 },
    lotRows: [{
      id: 20,
      health: 'expiring',
      brand_name: 'Mila Su',
      product_name: 'Damacana',
      lot_no: 'LOT-DAM-01',
      waybill_no: 'IRS-1',
      move_date: '2026-07-15',
      production_date: '2026-06-15',
      expiry_date: '2026-08-05',
      remaining_base: 18,
      remaining_human: '18 adet',
      days_to_expiry: 5,
      lot_status_note: '',
    }],
    returnRows: [{
      move_date: '2026-07-15',
      brand_name: 'Mila Su',
      product_name: 'Damacana',
      input_qty: 18,
      input_unit: 'adet',
      qty_base: 18,
    }],
    pendingRows: [{
      move_date: '2026-07-10',
      zone_name: 'FPU Yemekhane',
      product_name: 'Damacana',
      qty_base: 108,
      allocated_base: 90,
      unallocated_base: 18,
      waiting_days: 5,
    }],
    adjustmentRows: [{
      move_date: '2026-07-14',
      product_name: 'Damacana',
      direction: 'out',
      signed_base: -2,
      reason: 'fire_kirik',
      note: 'Kırık',
    }],
    ...overrides,
  }
}

describe('waterExcelExport', () => {
  it('protects user controlled cells from spreadsheet formula injection', () => {
    expect(safeExcelText('Normal metin')).toBe('Normal metin')
    expect(safeExcelText('=1+1')).toBe("'=1+1")
    expect(safeExcelText('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)")
    expect(safeExcelText(null)).toBe('')
  })

  it('loads every dataset needed by the detailed report', async () => {
    const api = {
      get: vi.fn((url, config) => {
        if (url === '/water/summary') return Promise.resolve({ data: { totals: { period_in: 1 } } })
        if (url === '/water/forecast') return Promise.resolve({ data: { rows: [{ product_id: 7 }] } })
        if (url === '/water/movements' && config.params.type === 'out') return Promise.resolve({ data: [{ id: 1 }] })
        if (url === '/water/movements' && config.params.type === 'in') return Promise.resolve({ data: [{ id: 2 }] })
        if (url === '/water/lots') return Promise.resolve({ data: { rows: [{ id: 8 }], summary: { critical: 1 } } })
        if (url === '/water/returns') return Promise.resolve({ data: [{ id: 3 }] })
        if (url === '/water/pending') return Promise.resolve({ data: { rows: [{ id: 4 }] } })
        if (url === '/water/adjustments') return Promise.resolve({ data: { rows: [{ id: 5 }] } })
        throw new Error(`Unexpected URL: ${url}`)
      }),
    }

    const result = await loadWaterExcelReportData(api, { from: '2026-07-01', to: '2026-07-31' })

    expect(api.get).toHaveBeenCalledTimes(8)
    expect(result).toMatchObject({
      forecast: { rows: [{ product_id: 7 }] },
      outRows: [{ id: 1 }],
      inRows: [{ id: 2 }],
      lotRows: [{ id: 8 }],
      lotSummary: { critical: 1 },
      returnRows: [{ id: 3 }],
      pendingRows: [{ id: 4 }],
      adjustmentRows: [{ id: 5 }],
    })
  })

  it('builds the complete 15-sheet closing workbook and control center', () => {
    const report = buildWaterExcelWorkbook(ExcelJS, reportOptions())

    expect(report.sheetNames).toEqual(WATER_EXCEL_SHEETS)
    expect(report.filename).toBe('su-takip-detayli-2026-07-01_2026-07-31.xlsx')
    expect(report.checks).toEqual({ negativeStock: 1, overduePending: 1, lowStock: 1, overdueOrders: 1, criticalLots: 1, periodDeficits: 2 })

    const control = report.workbook.getWorksheet('Kontrol')
    expect(control.getCell('A1').value).toContain('SU TAKİP KONTROL PANELİ')
    expect(control.getCell('B8').value).toBe(1)
    expect(control.getCell('C8').value).toBe('KONTROL')
    expect(control.getCell('A16').value).toMatchObject({ text: 'Aylık Özet', hyperlink: "#'Aylık Özet'!A1" })
    expect(control.getCell('A17').value).toMatchObject({ text: 'Sipariş Planı', hyperlink: "#'Sipariş Planı'!A1" })

    const orderPlan = report.workbook.getWorksheet('Sipariş Planı')
    expect(orderPlan.getCell('A5').value).toBe('GECİKMİŞ')
    expect(orderPlan.getCell('G5').value).toBe(5)
    expect(orderPlan.getCell('H5').value).toBe(2)
    expect(orderPlan.getCell('I5').value).toBe('2026-07-27')

    const lots = report.workbook.getWorksheet('Lot & SKT')
    expect(lots.getCell('A3').value).toBe('SKT YAKLAŞIYOR')
    expect(lots.getCell('D3').value).toBe('LOT-DAM-01')
    expect(lots.getCell('K3').value).toBe(5)
  })

  it('keeps editable formulas, exact decimals and safe text in report cells', () => {
    const report = buildWaterExcelWorkbook(ExcelJS, reportOptions())
    const index = report.workbook.getWorksheet('INDEX')
    const daily = report.workbook.getWorksheet('Günlük Çizelge')
    const distributions = report.workbook.getWorksheet('Dağıtım Defteri')

    expect(index.getCell('A6').value).toBe("'=FORMULA")
    expect(index.getCell('D6').value).toEqual({ formula: 'SUM(B6:C6)', result: 1908 })
    expect(index.getCell('B7').value).toEqual({ formula: 'SUM(B6:B6)', result: 108 })
    expect(index.getCell('D7').value).toEqual({ formula: 'SUM(D6:D6)', result: 1908 })
    expect(index.views[0]).toMatchObject({ state: 'frozen', ySplit: 5, xSplit: 1 })

    expect(daily.getCell('E3').value).toEqual({ formula: 'C3-D3', result: 100 })
    expect(daily.getCell('F4').value).toEqual({ formula: 'F3+E4', result: 70 })
    expect(distributions.getCell('F3').value).toBe(2.5)
    expect(distributions.getCell('F3').numFmt).toBe('#,##0.##')
    expect(distributions.getCell('K3').value).toBe("'@risk")
  })

  it('configures every sheet for printing and serializes a valid xlsx package', async () => {
    const report = buildWaterExcelWorkbook(ExcelJS, reportOptions())

    report.workbook.eachSheet(sheet => {
      expect(sheet.pageSetup.orientation).toBe('landscape')
      expect(sheet.pageSetup.fitToWidth).toBe(1)
      expect(sheet.pageSetup.printArea).toMatch(/^A1:/)
      expect(sheet.headerFooter.oddFooter).toContain('Sayfa &P / &N')
    })

    const buffer = await report.workbook.xlsx.writeBuffer()
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(buffer)

    expect(buffer.byteLength).toBeGreaterThan(20_000)
    expect(reopened.worksheets.map(sheet => sheet.name)).toEqual(WATER_EXCEL_SHEETS)
    expect(reopened.getWorksheet('INDEX').getCell('D6').value.formula).toBe('SUM(B6:C6)')
  })

  it('uses a stable filename for the selected date range', () => {
    expect(waterExcelFilename('2026-01-01', '2026-01-31')).toBe('su-takip-detayli-2026-01-01_2026-01-31.xlsx')
  })
})
