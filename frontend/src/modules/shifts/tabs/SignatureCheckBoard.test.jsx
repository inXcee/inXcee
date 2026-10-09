import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SignatureCheckBoard from './SignatureCheckBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const GUNLER = ['2026-10-07', '2026-10-08']

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SignatureCheckBoard weekDays={GUNLER} departments={[{ id: 3, name: 'Kat Hizmetleri' }]} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: {
    dates: [GUNLER[0]],
    summary: { rows: 2, matched: 2, signed_ok: 1, not_working_ok: 0, warnings: 1, missing_signature: 1, mark_mismatch: 0, signed_not_working: 0, unmatched: 0, duplicates: 0, not_on_sheet: 1 },
    items: [
      { index: 0, staff_id: 1, full_name: 'Ayşe Demir', mark: 'signed', level: 'ok', verdict: 'ok', text: 'imzalı' },
      { index: 1, staff_id: 2, full_name: 'Mehmet Kaya', mark: 'blank', level: 'warn', verdict: 'missing_signature', text: 'çizelgede çalışıyor ama imza yok — gelmedi mi, imzayı mı unuttu?' },
    ],
    unmatched: [],
    duplicates: [],
    not_on_sheet: [{ staff_id: 9, full_name: 'Burak Föyde', department: 'Kat Hizmetleri', date: GUNLER[0] }],
  } })
})

describe('İmzalı föy kontrolü paneli', () => {
  it('kapalı başlar, istek atmaz', () => {
    ciz()
    expect(screen.queryByLabelText('Föy satırları')).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('satırları ayrıştırıp gönderir, uyarıları ve föyde olmayanı gösterir', async () => {
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    await user.type(screen.getByLabelText('Föy satırları'), 'Ayşe Demir{enter}Mehmet Kaya - boş')
    await user.selectOptions(screen.getByLabelText('Bölüm'), '3')
    await user.click(screen.getByRole('button', { name: /karşılaştır \(2 kişi\)/ }))

    expect(api.post).toHaveBeenCalledWith('/shifts/schedule/signature-check', {
      rows: [
        { name: 'Ayşe Demir', date: GUNLER[0], mark: 'signed' },
        { name: 'Mehmet Kaya', date: GUNLER[0], mark: 'blank' },
      ],
      department_id: 3,
    })
    expect(await screen.findByText('Kontrol edilmesi gerekenler')).toBeInTheDocument()
    expect(screen.getByText(/imza yok — gelmedi mi/)).toBeInTheDocument()
    expect(screen.getByText('Çalışıyor ama föyde yok (1)')).toBeInTheDocument()
    expect(screen.getByText('Burak Föyde')).toBeInTheDocument()
  })

  it('anlaşılmayan işaret varken göndermez', async () => {
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    await user.type(screen.getByLabelText('Föy satırları'), 'Ayşe Demir - belki')
    expect(screen.getByText(/Satır 1: işaret anlaşılmadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /karşılaştır/ })).toBeDisabled()
  })
})
