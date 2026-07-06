import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CsvImport from './CsvImport.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { post: vi.fn(() => Promise.resolve({ data: {} })), get: vi.fn(() => Promise.resolve({ data: [] })) },
}))

function renderModal(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CsvImport onClose={() => {}} {...props} />
    </QueryClientProvider>
  )
}

describe('CsvImport smoke', () => {
  it('başlığı ve dosya seç butonunu gösterir', () => {
    renderModal()
    expect(screen.getByText('EXCEL / CSV TOPLU KAYIT')).toBeInTheDocument()
    expect(screen.getByText('EXCEL / CSV DOSYA SEÇ')).toBeInTheDocument()
    expect(screen.getByText(/AD SOYAD \(zorunlu\)/)).toBeInTheDocument()
  })

  it('kapat butonu onClose çağırır', () => {
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <CsvImport onClose={onClose} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByText('KAPAT'))
    expect(onClose).toHaveBeenCalled()
  })
})
