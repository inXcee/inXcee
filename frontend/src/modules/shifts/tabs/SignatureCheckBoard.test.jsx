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

const KAPSAMA = {
  days: GUNLER,
  today: GUNLER[1],
  summary: { expected: 2, checked: 1, clean: 0, warn: 1, missing: 1, pending: 0 },
  departments: [{
    id: 3, name: 'Kat Hizmetleri',
    cells: {
      [GUNLER[0]]: { status: 'missing', planned: 4 },
      [GUNLER[1]]: { status: 'warn', planned: 4, run_id: 7, source: 'telegram', checked_at: '2026-10-08 09:12:00', warnings: 2,
        findings: [{ kind: 'warn', name: 'Mehmet Kaya', text: 'imza yok' }] },
    },
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: KAPSAMA })
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
    await user.click(screen.getByRole('button', { name: /karşılaştır \(2 satır\)/ }))

    expect(api.post).toHaveBeenCalledWith('/shifts/schedule/signature-check', {
      rows: [
        { name: 'Ayşe Demir', date: GUNLER[0], mark: 'signed' },
        { name: 'Mehmet Kaya', date: GUNLER[0], mark: 'blank' },
      ],
      department_id: 3,
      save: true,
      source: 'web',
    })
    expect(await screen.findByText('Kontrol edilmesi gerekenler')).toBeInTheDocument()
    expect(screen.getByText(/imza yok — gelmedi mi/)).toBeInTheDocument()
    expect(screen.getByText('Çalışıyor ama föyde yok (1)')).toBeInTheDocument()
    expect(screen.getByText('Burak Föyde')).toBeInTheDocument()
  })

  it('haftalık ızgarayı günlere dağıtarak gönderir', async () => {
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    // userEvent.type sekmeyi odak değişimi sayar — yapıştırma gibi doğrudan ver.
    const alan = screen.getByLabelText('Föy satırları')
    alan.focus()
    await user.paste('Ayşe Demir\t✓\t\t')
    expect(screen.getByRole('button', { name: /\(2 satır · 2 gün\)/ })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /karşılaştır/ }))
    expect(api.post.mock.calls[0][1].rows).toEqual([
      { name: 'Ayşe Demir', date: GUNLER[0], mark: 'signed' },
      { name: 'Ayşe Demir', date: GUNLER[1], mark: 'blank' },
    ])
  })

  it('eşleşmeyen isim için öneriye tıklayınca föy metnini düzeltir', async () => {
    api.post.mockResolvedValueOnce({ data: {
      dates: [GUNLER[0]],
      summary: { rows: 1, matched: 0, signed_ok: 0, not_working_ok: 0, warnings: 0, unmatched: 1, duplicates: 0, not_on_sheet: 0 },
      items: [], duplicates: [], not_on_sheet: [],
      unmatched: [{ index: 0, name: 'Mehmt Kaya', reason: 'isim personel listesinde bulunamadı', candidates: [],
        suggestions: [{ id: 2, full_name: 'Mehmet Kaya', department: 'Kat Hizmetleri', is_active: true, score: 0.9 }] }],
    } })
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    await user.type(screen.getByLabelText('Föy satırları'), 'Mehmt Kaya - off')
    await user.click(screen.getByRole('button', { name: /karşılaştır/ }))
    await user.click(await screen.findByRole('button', { name: 'Mehmet Kaya?' }))
    expect(screen.getByLabelText('Föy satırları')).toHaveValue('Mehmet Kaya - off')
    expect(screen.queryByLabelText('Föy kontrol sonucu')).not.toBeInTheDocument()
  })

  it('raporu panoya kopyalar', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    await user.type(screen.getByLabelText('Föy satırları'), 'Mehmet Kaya - boş')
    await user.click(screen.getByRole('button', { name: /karşılaştır/ }))
    await user.click(await screen.findByRole('button', { name: /Raporu kopyala/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/• Mehmet Kaya — Boş: .*imza yok/))
  })

  it('föy takibi tablosu: gelmedi hücresi günü ve bölümü forma taşır', async () => {
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    expect(await screen.findByText(/kontrol 1\/2/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/shifts/schedule/signature-check/coverage', { params: { from: GUNLER[0], to: GUNLER[1] } })
    const uyarili = screen.getByRole('button', { name: `Kat Hizmetleri ${GUNLER[1]} kontrol edildi, uyarı var` })
    expect(uyarili.title).toMatch(/Telegram/)
    expect(uyarili.title).toMatch(/Mehmet Kaya: imza yok/)
    await user.selectOptions(screen.getByLabelText('Bölüm'), '')
    await user.click(screen.getByRole('button', { name: `Kat Hizmetleri ${GUNLER[0]} föy kontrol edilmedi` }))
    expect(screen.getByLabelText('Föy günü')).toHaveValue(GUNLER[0])
    expect(screen.getByLabelText('Bölüm')).toHaveValue('3')
  })

  it('"Föy takibine işle" kapatılınca kaydetmeden kontrol eder', async () => {
    const user = userEvent.setup()
    ciz()
    await user.click(screen.getByRole('button', { name: 'İmzalı föy kontrolü' }))
    await user.click(screen.getByLabelText('Föy takibine işle'))
    await user.type(screen.getByLabelText('Föy satırları'), 'Ayşe Demir')
    await user.click(screen.getByRole('button', { name: /karşılaştır/ }))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('save')
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
