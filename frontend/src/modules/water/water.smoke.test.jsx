import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../shared/store/authStore.js'

vi.mock('../../shared/components/ConfirmDialog.jsx', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, confirmDialog: vi.fn(() => Promise.resolve(true)) }
})

const PRODUCTS = [
  { id: 1, name: 'Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, is_active: 1, min_level: 0, lead_time_days: 5, safety_stock_days: 2, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 1 },
  { id: 2, name: '0.5 L', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 140, is_active: 1, min_level: 0, lead_time_days: 10, safety_stock_days: 4, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 0 },
]

const DAILY_ROWS = [
  {
    id: 9,
    type: 'out',
    move_date: '2026-07-01',
    created_at: '2026-07-01 08:15:00',
    zone_id: 1,
    zone_name: 'OTC Kamp AlanÄ±',
    product_id: 1,
    product_name: 'Damacana',
    brand_name: 'MÄ°LA SU',
    unit_label: 'damacana',
    units_per_case: 1,
    cases_per_pallet: 36,
    input_qty: 91,
    input_unit: 'adet',
    qty_base: 91,
    qty_human: '91 damacana',
    source_waybills: 'IRS-001: 91',
    created_by_name: 'KampÃ¼s MÃ¼dÃ¼rÃ¼',
  },
]

let reconciliationLocked = false
const DEFAULT_PIVOT_ROWS = [{ zone_id: 1, zone_name: 'OTC Kamp Alanı', cells: { 1: { base: 91, human: '91 damacana' } }, total_base: 91 }]
let pivotRows = DEFAULT_PIVOT_ROWS

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url, config = {}) => {
      const p = config.params || {}
      if (url === '/water/summary') return Promise.resolve({ data: {
        stock: [{ product_id: 2, name: '0.5 L', unit_label: 'koli', total_in: 280, total_out: 5, balance: 275, balance_human: '1 palet 135 koli', min_level: 0, low: false }],
        zones: [{ zone_id: 1, zone_name: 'OTC Kamp AlanÄ±', product_id: 1, product_name: 'Damacana', total_out: 91 }],
        daily: [{ move_date: '2026-07-01', in_base: 280, out_base: 91 }],
        totals: { period_in: 280, period_out: 91, balance: 275, low_count: 0, period_return: 10, outstanding: 90 },
        deposit: [{ product_id: 1, name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', total_in: 100, total_return: 10, period_return: 10, outstanding: 90 }],
        group: 'day',
      } })
      if (url === '/water/pivot') return Promise.resolve({ data: {
        from: p.from, to: p.to,
        brands: [{ brand_id: 1, brand_name: 'MİLA SU', product_ids: [1, 2] }],
        columns: [
          { product_id: 1, name: 'Damacana', unit_label: 'damacana', brand_id: 1, brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 36, lead_time_days: 5, safety_stock_days: 2 },
          { product_id: 2, name: '0.5 L', unit_label: 'koli', brand_id: 1, brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 140, lead_time_days: 10, safety_stock_days: 4 },
        ],
        rows: pivotRows,
        colTotals: { 1: { base: 91, human: '2 palet 19 damacana' }, 2: { base: 0, human: '0 koli' } },
        grandTotal: 91,
      } })
      if (url === '/water/movements' && p.type === 'in') return Promise.resolve({ data: [
        { id: 5, product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, qty_base: 290 },
      ] })
      if (url === '/water/movements' && p.type === 'out' && (p.zone_id || p.from === '2026-07-01')) return Promise.resolve({ data: DAILY_ROWS })
      if (url === '/water/movements') return Promise.resolve({ data: [] })
      if (url === '/water/products') return Promise.resolve({ data: PRODUCTS })
      if (url === '/water/zones') return Promise.resolve({ data: [{ id: 1, name: 'OTC Kamp Alanı', code: 'OTC' }] })
      if (url === '/water/returns') return Promise.resolve({ data: [] })
      if (url === '/water/brands') return Promise.resolve({ data: [{ id: 1, name: 'MİLA SU' }] })
      if (url === '/water/trends') return Promise.resolve({ data: {
        from: '2026-02-01', to: '2026-07-09', months: 6,
        monthly: [{ month: '2026-06', in_base: 280, out_base: 91 }, { month: '2026-07', in_base: 0, out_base: 30 }],
        zones: [{ zone_id: 1, zone_name: 'OTC Kamp Alanı', total: 121 }],
        products: [{ product_id: 1, name: 'Damacana', brand_name: 'MİLA SU', out: 121, out_human: '121 damacana' }],
      } })
      if (url === '/water/forecast') return Promise.resolve({ data: {
        date: '2026-07-09', window: 30, target_days: 30,
        rows: [
          { product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', balance: 10, balance_human: '10 damacana', avg_daily: 3, avg_daily_human: '3 damacana', days_of_cover: 3, stockout_date: '2026-07-12', lead_time_days: 5, safety_stock_days: 2, reorder_point_days: 7, order_due_in_days: -4, order_by_date: '2026-07-05', order_urgency: 'overdue', needs_order: true, suggested_base: 80, suggested_human: '80 damacana', confidence: 'ok' },
          { product_id: 2, product_name: '0.5 L', brand_name: 'MİLA SU', unit_label: 'koli', balance: 970, balance_human: '970 koli', avg_daily: 1, avg_daily_human: '1 koli', days_of_cover: 970, stockout_date: '2029-01-01', lead_time_days: 10, safety_stock_days: 4, reorder_point_days: 14, order_due_in_days: 956, order_by_date: '2029-02-19', order_urgency: 'planned', needs_order: false, suggested_base: 0, suggested_human: null, confidence: 'ok' },
        ],
        order_suggestions: [{ product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', suggested_human: '80 damacana', days_of_cover: 3, lead_time_days: 5, safety_stock_days: 2, order_due_in_days: -4, order_by_date: '2026-07-05', order_urgency: 'overdue' }],
        totals: { products: 2, order_count: 1, overdue_order_count: 1, due_soon_order_count: 0, soon_count: 1 },
      } })
      if (url === '/water/review') return Promise.resolve({ data: {
        rows: [{ movement_id: 5, move_date: '2026-07-04', zone_name: 'OTC Kamp Alanı', product_name: 'Damacana', brand_name: 'MİLA SU', created_by_name: 'Müdür', qty_base: 8, unallocated_base: 8, qty_human: '8 damacana', unallocated_human: '8 damacana' }],
        count: 1,
      } })
      if (url === '/water/adjustments') return Promise.resolve({ data: {
        rows: [{ id: 1, product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', move_date: '2026-07-05', direction: 'out', qty_base: 3, input_qty: 3, input_unit: 'adet', reason: 'fire_kirik', note: 'kırık', signed_base: -3, signed_human: '−3 damacana', qty_human: '3 damacana' }],
        reasons: [{ key: 'fire_kirik', label: 'Fire / kırık' }, { key: 'sayim_farki', label: 'Sayım farkı' }],
      } })
      if (url === '/water/templates') return Promise.resolve({ data: [
        { id: 1, name: 'FPU Rutin', lines: [{ id: 1, template_id: 1, zone_id: 1, product_id: 1, default_qty: 5, default_unit: 'adet', zone_name: 'OTC Kamp Alanı', product_name: 'Damacana', unit_label: 'damacana' }] },
      ] })
      if (url === '/water/pending') return Promise.resolve({ data: {
        date: '2026-07-09',
        rows: [{ movement_id: 9, move_date: '2026-07-03', zone_name: 'OTC Kamp Alanı', product_name: 'Damacana', brand_name: 'MİLA SU',
          qty_base: 20, allocated_base: 5, unallocated_base: 15, waiting_days: 6, source_waybills: 'IRS-1: 5',
          qty_human: '20 damacana', allocated_human: '5 damacana', unallocated_human: '15 damacana', severity: 'overdue' }],
        totals: { count: 1, overdue: 1, unallocated_base: 15 },
      } })
      if (url === '/water/reconciliation') return Promise.resolve({ data: {
        month: '2026-07', locked: reconciliationLocked, closure: reconciliationLocked ? { month: '2026-07', is_locked: 1 } : null,
        reasons: [{ key: 'fire_kirik', label: 'Fire / kırık' }, { key: 'sayim_farki', label: 'Sayım farkı' }],
        rows: [{ product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana',
          opening_base: 100, month_in: 50, month_out: 30, month_adjust: 0, month_return: 0, system_base: 120,
          counted_base: null, diff_base: null, reason: null, status: 'pending',
          opening_human: '100 damacana', month_in_human: '50 damacana', month_out_human: '30 damacana',
          month_adjust_human: null, month_return_human: '0 damacana', system_human: '120 damacana', counted_human: null, diff_human: null }],
        totals: { products: 1, counted: 0, pending: 1, mismatch: 0, system_base: 120 },
      } })
      if (url === '/water/alerts') return Promise.resolve({ data: {
        date: '2026-07-09', month: '2026-07',
        summary: { pending: 1, negative: 1, over: 0, low: 0, idle_zones: 1, lot_critical: 0, total: 3 },
        pending_waybill: [{ product_id: 1, product_name: 'Damacana', count: 2, unallocated_base: 5, unallocated_human: '5 damacana', oldest_date: '2026-07-05', waiting_days: 4 }],
        negative_stock: [{ product_id: 2, product_name: '0.5 L', balance: -10, balance_human: '-10 koli', deficit_human: '10 koli' }],
        over_distributed: [],
        low_stock: [],
        idle_zones: [{ zone_id: 2, zone_name: 'Boş Bölge' }],
        lot_alerts: [],
        lot_summary: { all: 0, critical: 0, expired: 0, expiring: 0, quarantined: 0, missing: 0, healthy: 0 },
      } })
      if (url === '/water/truck-arrivals') return Promise.resolve({ data: [
        {
          id: 1,
          arrival_date: '2026-07-10',
          arrival_start_time: '08:00',
          arrival_end_time: '12:00',
          arrival_window: '08:00-12:00',
          mail_deadline_date: '2026-07-10',
          mail_deadline_time: '17:00',
          mail_deadline_label: '2026-07-10 17:00',
          reminder_start_time: '08:00',
          reminder_end_time: '17:00',
          reminder_interval_minutes: 60,
          supplier_name: 'MILA SU',
          brand_id: 1,
          brand_name: 'MILA SU',
          driver_name: 'Ahmet Yilmaz',
          driver_tc: '12345678901',
          driver_phone: '0555 111 22 33',
          plate: '34 ABC 123',
          trailer_plate: '34 DRS 456',
          identity_type: 'tc',
          visit_company: 'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.',
          host_person_name: 'Sercan Sucu',
          host_person_phone: '0539 111 33 44',
          entry_reason: 'SU AMAÇLI NAKLİYE',
          work_area: 'FPU KAMP ALANI',
          center_email: 'merkez@example.com',
          status: 'planned',
          status_label: 'Planlandi',
          missing_mail_fields: [],
          mail_checklist: [
            { key: 'center_email', label: 'Ana merkez e-postası', ok: true, value: 'merkez@example.com' },
            { key: 'driver_name', label: 'Tırcı adı', ok: true, value: 'Ahmet Yilmaz' },
            { key: 'driver_tc', label: 'Sicil / Arşiv TC', ok: true, value: '12345678901' },
          ],
          mail_ready: true,
          mail_required: true,
          deadline_passed: false,
          mail_phase: 'queued',
          mail_phase_label: 'Mail sırada',
          mail_severity: 'info',
          mail_notice: 'Mail kalıcı gönderim kuyruğunda · deneme 0/5',
          mail_queue: { job_id: 501, status: 'pending', attempts: 0, max_attempts: 5, active: true, failed: false },
          mail_delivery_snapshot: {
            version: 1,
            to: 'merkez@example.com',
            subject: 'Su amaçlı nakliye personel giriş talebi - 2026-07-10 - 34 ABC 123',
            body: 'Merhaba,\\n\\n10.07.2026 tarihinde Ahmet Yilmaz isimli kişinin su amaçlı nakliyesi olacaktır.',
            snapshot_at: '2026-07-09 16:30:00',
            message_id: null,
          },
          mail_record_changed: false,
          arrival_phase: 'today',
          arrival_phase_label: 'Bugün gelecek',
          arrival_severity: 'warning',
          arrival_notice: '2 sa sonra geliş aralığı başlayacak',
          next_check_time: '11:00',
          check_plan_label: '08:00-17:00 / 60 dk',
          vehicle_summary: '34 ABC 123 / 34 DRS 456',
          gate_entry: {
            full_name: 'Ahmet Yilmaz', identity_type: 'tc', identity_label: 'T.C. Kimlik',
            identity_no: '12345678901', phone: '0555 111 22 33', plate: '34 ABC 123',
            trailer_plate: '34 DRS 456', visit_company: 'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.',
            host_person_name: 'Sercan Sucu', host_person_phone: '0539 111 33 44',
            entry_date: '2026-07-10', entry_start_time: '08:00', entry_end_time: '12:00',
            entry_reason: 'SU AMAÇLI NAKLİYE', work_area: 'FPU KAMP ALANI', ready: true, missing_fields: [],
          },
          mail_subject: 'Su amaçlı nakliye personel giriş talebi - 2026-07-10 - 34 ABC 123',
          mail_body: 'Merhaba,\\n\\n10.07.2026 tarihinde Ahmet Yilmaz isimli kişinin su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.',
          mail_preview: {
            to: 'merkez@example.com',
            subject: 'Su amaçlı nakliye personel giriş talebi - 2026-07-10 - 34 ABC 123',
            body: 'Merhaba,\\n\\n10.07.2026 tarihinde Ahmet Yilmaz isimli kişinin su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.',
            ready: true,
            missing_fields: [],
          },
          action_items: ['Bugün 17:00 öncesi mail gönderimi kapatılmalı'],
          photo_count: 1,
        },
      ] })
      if (url === '/water/waybill-photos') return Promise.resolve({ data: [
        { id: 1, truck_arrival_id: 1, waybill_no: 'IRS-2026-1', move_date: '2026-07-10', photo_url: '/uploads/irsaliye.jpg', plate: '34 ABC 123', uploaded_by_name: 'Mudur' },
      ] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ids: [1], count: 1 } })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import WaterPage from './WaterPage.jsx'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

describe('WaterPage tek-ekran pano smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDialog.mockResolvedValue(true)
    reconciliationLocked = false
    pivotRows = DEFAULT_PIVOT_ROWS
  })

  it('tir on bildirim ve irsaliye foto arsivi paneli render olur', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('PERSONEL / TIR GİRİŞİ VE MAİL DOSYASI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeni Giriş Hazırla' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kayıt ve Çıktılar' })).toBeInTheDocument()
    expect(await screen.findByText(/TIR \/.*TAK/)).toBeInTheDocument()
    expect((await screen.findAllByText('34 ABC 123')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('IRS-2026-1')).length).toBeGreaterThan(0)
    expect(screen.getByText(/mail bekliyor/)).toBeInTheDocument()
    expect(screen.getByText('Ana merkez mail taslağı')).toBeInTheDocument()
    expect(screen.getByText('Gönderim kaydı v1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeDisabled()
    expect(screen.getByText('Personel giriş / güvenlik bilgileri')).toBeInTheDocument()
    expect(screen.getByText('PERSONEL GİRİŞ KARTI')).toBeInTheDocument()
    expect(screen.getByText('PERSONEL GİRİŞİ VE ÇIKTI MERKEZİ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF Hazırla' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Excel Hazırla' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'PNG Hazırla' })).toBeEnabled()
    expect(screen.getByText('Çıktıya hazır')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF İndir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excel İndir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PNG Görsel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument()
    expect(screen.getAllByText('FPU KAMP ALANI').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue(/Personel ve araç girişinin sağlanması/)).toBeInTheDocument()
    expect(screen.getByText('Taslağı Kopyala')).toBeInTheDocument()
    expect(screen.getByText('İş #501 · 0/5 deneme')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aksiyon/ })).toBeInTheDocument()
    expect(screen.getByText(/Saatlik kontrol plan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Toplu kontrol/ })).toBeInTheDocument()
    expect(screen.getByText('Eksik bilgi listesi')).toBeInTheDocument()
    expect(screen.getByText(/Bugün 17:00 öncesi mail/)).toBeInTheDocument()
    expect(screen.getByText(/Foto Y/)).toBeInTheDocument()
  })

  it('pano: KPI + INDEX matris + dağıtım yeri satırı gösterir', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('INDEX — DAĞITIM YERİ MATRİSİ')).toBeInTheDocument()
    expect(screen.getByText('Ay Dağıtım')).toBeInTheDocument()
    expect((await screen.findAllByText('OTC Kamp Alanı')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('water-board')).toBeInTheDocument()
    expect(screen.getByLabelText('Dağıtım yeri ara')).toBeInTheDocument()
    expect(screen.getByLabelText('Sırala')).toBeInTheDocument()
    expect(screen.getByText(/Tüm Markalar/)).toBeInTheDocument()
    // dağıtım yeri toplamı (91) matriste
    expect((await screen.findAllByText('91')).length).toBeGreaterThan(0)
  })

  it('matriste klavye gezinme, geri alma, Excel yapıştırma ve toplu kayıt çalışır', async () => {
    renderWithProviders(<WaterPage />)
    const board = await screen.findByTestId('water-board')
    const first = await screen.findByLabelText('OTC Kamp Alanı - Damacana dağıtım miktarı')
    const second = screen.getByLabelText('OTC Kamp Alanı - 0.5 L dağıtım miktarı')
    const undo = screen.getByRole('button', { name: 'Son taslak değişikliğini geri al' })

    expect(undo).toBeDisabled()
    fireEvent.change(first, { target: { value: '2,5' } })
    expect(await within(board).findByText('Tam damacana gerekli')).toBeInTheDocument()
    expect(within(board).getByRole('button', { name: 'Kaydet' })).toBeDisabled()

    fireEvent.change(first, { target: { value: '3p' } })
    expect(await screen.findByText('= 108')).toBeInTheDocument()
    expect(undo).toBeEnabled()

    fireEvent.keyDown(first, { key: 'Tab' })
    expect(second).toHaveFocus()

    fireEvent.click(undo)
    expect(first).toHaveValue('2,5')
    fireEvent.click(undo)
    expect(first).toHaveValue('')

    fireEvent.paste(first, { clipboardData: { getData: () => '2\t3' } })
    expect(first).toHaveValue('2')
    expect(second).toHaveValue('3')

    fireEvent.click(screen.getByRole('button', { name: '2 Hücreyi Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/water/distribute/batch', expect.objectContaining({
      lines: [
        { zone_id: 1, product_id: 1, input_qty: 2, input_unit: 'adet' },
        { zone_id: 1, product_id: 2, input_qty: 3, input_unit: 'koli' },
      ],
    })))
  })

  it('kaydedilmemiş dağıtım varken ay değişimini korur ve onaydan sonra taslağı temizler', async () => {
    renderWithProviders(<WaterPage />)
    const first = await screen.findByLabelText('OTC Kamp Alanı - Damacana dağıtım miktarı')
    fireEvent.change(first, { target: { value: '2' } })
    expect(screen.getByRole('button', { name: '1 Hücreyi Kaydet' })).toBeEnabled()

    confirmDialog.mockResolvedValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Önceki su takip ayı' }))
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Kaydedilmemiş su dağıtımı',
    })))
    expect(screen.getByLabelText('OTC Kamp Alanı - Damacana dağıtım miktarı')).toHaveValue('2')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Önceki su takip ayı' })).toBeEnabled())

    confirmDialog.mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Önceki su takip ayı' }))
    const previousMonth = new Date()
    previousMonth.setDate(1)
    previousMonth.setMonth(previousMonth.getMonth() - 1)
    const expectedDay = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-01`
    await waitFor(() => expect(first).not.toBeInTheDocument())
    const nextBoard = screen.getByTestId('water-board')
    await waitFor(() => expect(within(nextBoard).getByDisplayValue(expectedDay)).toBeInTheDocument())
    expect(await screen.findByLabelText('OTC Kamp Alanı - Damacana dağıtım miktarı')).toHaveValue('')
    expect(within(nextBoard).getByRole('button', { name: 'Kaydet' })).toBeDisabled()
  })

  it('büyük dağıtım matrisini pencereleyip kaydırılan satırları getirir', async () => {
    pivotRows = Array.from({ length: 80 }, (_, index) => ({
      zone_id: index + 1,
      zone_name: `Bölge ${String(index + 1).padStart(3, '0')}`,
      cells: {},
      total_base: 0,
    }))

    renderWithProviders(<WaterPage />)
    const viewport = await screen.findByTestId('water-matrix-viewport')
    await screen.findByTestId('water-matrix-row-1')
    expect(screen.getAllByTestId(/^water-matrix-row-/).length).toBeLessThan(80)
    expect(screen.queryByTestId('water-matrix-row-70')).not.toBeInTheDocument()

    const windowEdge = screen.getByLabelText('Bölge 012 - Damacana dağıtım miktarı')
    windowEdge.focus()
    fireEvent.keyDown(windowEdge, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByLabelText('Bölge 013 - Damacana dağıtım miktarı')).toHaveFocus())

    viewport.scrollTop = 68 * 82
    fireEvent.scroll(viewport)

    expect(await screen.findByTestId('water-matrix-row-70')).toBeInTheDocument()
    expect(screen.queryByTestId('water-matrix-row-1')).not.toBeInTheDocument()
  })

  it('detaylı Excel düğmesi tüm rapor verisini yükleyip dosyayı indirir', async () => {
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn(() => 'blob:water-report')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      renderWithProviders(<WaterPage />)
      const board = await screen.findByTestId('water-board')
      const exportButton = within(board).getByRole('button', { name: /Excel/ })
      await waitFor(() => expect(exportButton).toBeEnabled())
      fireEvent.click(exportButton)

      await waitFor(() => expect(createObjectURL).toHaveBeenCalled(), { timeout: 10000 })
      expect(click).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:water-report')
      expect(api.get).toHaveBeenCalledWith('/water/movements', {
        params: { type: 'out', from: expect.any(String), to: expect.any(String), limit: 1000 },
      })
      expect(api.get).toHaveBeenCalledWith('/water/adjustments', {
        params: { from: expect.any(String), to: expect.any(String) },
      })
    } finally {
      click.mockRestore()
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL)
      else delete URL.createObjectURL
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL)
      else delete URL.revokeObjectURL
    }
  }, 15000)

  it('dağıtım yeri satırı tıklanınca dağıtım geçmişi modalı açılır', async () => {
    renderWithProviders(<WaterPage />)
    const zoneButtons = await screen.findAllByText('OTC Kamp Alanı')
    fireEvent.click(zoneButtons[0])
    expect(await screen.findByText(/DAĞITIM GEÇMİŞİ/)).toBeInTheDocument()
    expect(screen.getByText('Son 7 gün')).toBeInTheDocument() // W4 yeni sekme
    expect(screen.getByText('Günlük ortalama')).toBeInTheDocument() // W4 yeni istatistik
    expect(screen.getByText('BEKLENEN AYLIK TÜKETİM')).toBeInTheDocument() // W4 karşılaştırma
    expect(screen.getAllByText('Tüm geçmiş').length).toBeGreaterThan(0)
    const overlay = screen.getByTestId('water-modal-overlay')
    const sheet = screen.getByTestId('water-bottom-sheet')
    expect(overlay).toHaveStyle('position: fixed')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet.style.position).toBe('fixed')
    expect(sheet.style.bottom).toBe('0px')
    expect(sheet.style.height).toBe('min(86vh, 860px)')
  })

  it('gelen tır ve boş iade panelleri render olur', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText(/GELEN TIR/)).toBeInTheDocument()
    expect(screen.getByText('+ Ürün satırı')).toBeInTheDocument() // W6 çok-satırlı form
    expect(screen.getByText(/İrsaliyeyi Kaydet/)).toBeInTheDocument()
    expect(screen.getByText('BOŞ İADE — DEPOZİTO')).toBeInTheDocument()
    // depozito kartı (dolaşımda 90)
    expect((await screen.findAllByText('90')).length).toBeGreaterThan(0)
  })

  it('uyarı merkezi bandı kartları gösterir ve tıklanınca detay açılır', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('BUGÜN YAPILACAKLAR')).toBeInTheDocument()
    // benzersiz kart etiketi (KPI şeridiyle çakışmaz)
    const pendingCard = await screen.findByText('İrsaliye Bekleyen')
    fireEvent.click(pendingCard)
    // detay listesinde bekleyen dağıtım satırı görünür
    expect(await screen.findByText(/Damacana — 5 damacana \(2 kayıt, 4 gün\)/)).toBeInTheDocument()
  })

  it('ay kapanışı paneli açılınca uyuşturma satırı + sistem kalanı gösterir', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/AY KAPANIŞI/)
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç')) // panel varsayılan kapalı
    expect(await within(panel).findByText('120')).toBeInTheDocument() // sistem kalanı = 100 + 50 - 30
    expect(within(panel).getByLabelText('Damacana sayım')).toBeInTheDocument()
    expect(within(panel).getByText('📄 PDF Özet')).toBeInTheDocument() // W9 PDF butonu
  })

  it('kilitli ayda sayımı salt okunur gösterir ve kilit açıklamasını sunar', async () => {
    reconciliationLocked = true
    useAuthStore.setState({ user: { role: 'campus_manager', username: 'mudur' } })
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/AY KAPANIŞI/)
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç'))

    expect(await within(panel).findByRole('status')).toHaveTextContent(/Bu ay kilitli/)
    expect(within(panel).getByLabelText('Damacana sayım')).toBeDisabled()
    expect(within(panel).getByRole('button', { name: /Kilidi Aç/ })).toBeInTheDocument()
    useAuthStore.setState({ user: null })
  })

  it('trend paneli açılınca aylık akış + bölge/ürün analizini gösterir', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText('📈 TREND & ANALİZ')
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç'))
    expect(await within(panel).findByText('EN ÇOK TÜKETEN BÖLGELER')).toBeInTheDocument()
    expect(within(panel).getByText('2026-06')).toBeInTheDocument()
    expect(within(panel).getByText('121 damacana')).toBeInTheDocument()
  })

  it('öngörü paneli sipariş önerisi ve gün-yeter gösterir', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/SİPARİŞ ÖNERİLERİ/)
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç'))
    expect(await within(panel).findByText('ÖNERİLEN SİPARİŞLER')).toBeInTheDocument()
    expect(within(panel).getAllByText(/80 damacana/).length).toBeGreaterThan(0) // önerilen sipariş miktarı
    expect(within(panel).getByText('3g')).toBeInTheDocument() // gün yeter (tablo)
    expect(within(panel).getByText('5g + 2g')).toBeInTheDocument()
    expect(within(panel).getAllByText(/4g gecikti/).length).toBeGreaterThan(0)
  })

  it('irsaliye bekleyenler paneli bekleyen dağıtımı ve gecikmeyi listeler', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/İRSALİYE BEKLEYEN DAĞITIMLAR/)
    const panel = title.closest('.panel')
    expect(api.get.mock.calls.some(([url]) => url === '/water/pending')).toBe(false)
    fireEvent.click(within(panel).getByText('▼ Aç'))
    await waitFor(() => expect(api.get.mock.calls.some(([url]) => url === '/water/pending')).toBe(true))
    expect(await within(panel).findByText('OTC Kamp Alanı')).toBeInTheDocument()
    expect(within(panel).getByText('6g')).toBeInTheDocument() // 6 gündür bekliyor
    expect(within(panel).getByText('IRS-1: 5')).toBeInTheDocument() // kısmi eşleşen irsaliye
  })

  it('şablon seçici board’da görünür ve Ayarlar şablon sekmesi listeler', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByLabelText('Şablon uygula')).toBeInTheDocument() // board header select
    fireEvent.click(await screen.findByText('⚙ Ayarlar'))
    fireEvent.click(await screen.findByText('🗂 Şablonlar'))
    // şablon kartındaki benzersiz satır çipi (board option'ıyla çakışmaz)
    expect(await screen.findByText(/OTC Kamp Alanı · Damacana · 5 adet/)).toBeInTheDocument()
  })

  it('müdür kontrol bekleyen bandını ve toplu onay butonunu görür', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager', username: 'mudur' } })
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText(/kontrol bekliyor/)).toBeInTheDocument()
    expect(screen.getByText('✓ Toplu Onayla')).toBeInTheDocument()
    useAuthStore.setState({ user: null })
  })

  it('müdür 🛠 Düzeltme modalını açar ve düzeltme listesini gösterir', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager', username: 'mudur' } })
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByText('🛠 Düzeltme'))
    expect(await screen.findByText('STOK DÜZELTME / SAYIM FİŞİ')).toBeInTheDocument()
    expect(await screen.findByText('−3 damacana')).toBeInTheDocument() // işaretli etki
    useAuthStore.setState({ user: null })
  })

  it('ürün ayarlarında kritik stok, tedarik planı ve marka renk seçici var', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByText('⚙ Ayarlar'))
    fireEvent.click(await screen.findByText('💧 Ürünler & Marka'))
    expect(await screen.findByText('MARKALAR (TEDARİKÇİ)')).toBeInTheDocument()
    expect(await screen.findByLabelText('MİLA SU rengi')).toBeInTheDocument() // W8 marka renk seçici
    expect(screen.getAllByText('Kritik').length).toBeGreaterThan(0) // W8 kritik stok
    expect(screen.getByText('Tedarik gün')).toBeInTheDocument()
    expect(screen.getByText('Emniyet gün')).toBeInTheDocument()
    expect(screen.getAllByText('5g + 2g').length).toBeGreaterThan(0)
  })

  it('Ayarlar modalı dağıtım yerlerini açar, Metinden modalı açılır', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByText('⚙ Ayarlar'))
    expect(await screen.findByText('📍 Dağıtım Yerleri')).toBeInTheDocument()
    fireEvent.click(screen.getByText('✕ Kapat'))
    fireEvent.click(screen.getByText('📝 Metinden'))
    expect(await screen.findByText('METİNDEN DAĞITIM')).toBeInTheDocument()
  })
})

describe('WaterPage gunluk defter smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gun karti tiklaninca gunluk dagitim defteri acilir', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByTestId('water-day-2026-07-01'))
    expect(await screen.findByText(/DEFTER/)).toBeInTheDocument()
    expect(screen.getByText('IRS-001: 91')).toBeInTheDocument()
    expect(screen.getByText('08:15')).toBeInTheDocument()
  })
})
