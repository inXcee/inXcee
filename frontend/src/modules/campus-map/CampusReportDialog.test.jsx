import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import CampusReportDialog from './CampusReportDialog.jsx'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const stats = {
  M2: {
    block: 'M2', total_rooms: 2, total_beds: 12, occupied: 1, occupancy_pct: 8,
    empty_rooms: 1, full_rooms: 0, quarantine: 0, maintenance: 1,
    open_faults: 0, cleaning_total: 0, cleaning_done: 0, cleaning_pct: 0,
  },
}

const reportData = {
  scope: 'block',
  block: 'M2',
  permissions: { contact_details: true },
  rooms: [
    {
      id: 1, block: 'M2', room_no: '101', floor: 1, status: 'active',
      capacity: 6, active_beds: 6, occupied: 1, notes: '',
      occupants: [{
        personnel_id: 7, full_name: 'Ayşe Demir', company: 'Yapı AŞ',
        job_title: 'Kaynakçı', department_name: 'Saha', phone_number: '05320000000',
        check_in_date: '2026-01-02', assigned_at: '2026-07-01 09:00:00', bed_no: 1,
      }],
    },
    {
      id: 2, block: 'M2', room_no: '102', floor: 1, status: 'maintenance',
      capacity: 6, active_beds: 6, occupied: 0, notes: '', occupants: [],
    },
  ],
}

function renderDialog(props = {}, data = reportData) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api.get.mockResolvedValue({ data })
  return render(
    <QueryClientProvider client={client}>
      <CampusReportDialog
        stats={stats}
        selectedBlock="M2"
        role="campus_manager"
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('CampusReportDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seçili blok için oda, kişi ve firma önizlemesini gösterir', async () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Kampüs raporu oluştur' })
    expect(await within(dialog).findByText('2')).toBeInTheDocument()
    expect(within(dialog).getAllByText('1').length).toBeGreaterThanOrEqual(2)
    expect(api.get).toHaveBeenCalledWith('/campus-map/report-data', { params: { block: 'M2' } })
    expect(within(dialog).getByRole('radio', { name: /Seçili blok/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Telefon bilgisini/ })).toBeEnabled()
  })

  it('PDF ve bölüm seçeneklerini üretilen rapor yapılandırmasına taşır', async () => {
    const user = userEvent.setup()
    const onPrint = vi.fn()
    const onClose = vi.fn()
    renderDialog({ onPrint, onClose })
    await screen.findByText('CANLI ÖNİZLEME')
    await user.click(screen.getByRole('button', { name: /PDF/ }))
    await user.click(screen.getByRole('checkbox', { name: /Blok özeti/ }))
    await user.click(screen.getByRole('checkbox', { name: /Telefon bilgisini/ }))
    await user.click(screen.getByRole('button', { name: 'PDF oluştur' }))

    expect(onPrint).toHaveBeenCalledTimes(1)
    const [passedStats, , config] = onPrint.mock.calls[0]
    expect(passedStats).toEqual({ M2: stats.M2 })
    expect(config.block).toBe('M2')
    expect(config.rooms).toHaveLength(2)
    expect(config.options.sections.summary).toBe(false)
    expect(config.options.includeContact).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('vardiya sorumlusunda telefon seçeneğini kapalı tutar', async () => {
    renderDialog(
      { role: 'shift_supervisor' },
      { ...reportData, permissions: { contact_details: false } },
    )
    const contact = await screen.findByRole('checkbox', { name: /Telefon bilgisini/ })
    expect(contact).toBeDisabled()
  })
})
