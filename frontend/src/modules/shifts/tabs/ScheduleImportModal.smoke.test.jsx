import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ScheduleImportModal from './ScheduleImportModal.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

function renderModal(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ScheduleImportModal onClose={() => {}} allStaff={[]} shiftDefs={[]} weekDays={['2026-06-08']} {...props} />
    </QueryClientProvider>
  )
}

describe('ScheduleImportModal smoke', () => {
  it('başlık + dosya girişi + format açıklamasıyla render olur', () => {
    renderModal()
    expect(screen.getByText('EXCEL AKTAR')).toBeInTheDocument()
    expect(screen.getByText(/KAMP ALANI ÇİZELGE/)).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
  })

  it('İptal butonu onClose çağırır', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByText('Iptal'))
    expect(onClose).toHaveBeenCalled()
  })
})
