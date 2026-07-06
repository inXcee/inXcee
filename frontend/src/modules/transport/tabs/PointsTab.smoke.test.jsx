import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), delete: vi.fn(() => Promise.resolve({})) },
}))

import PointsTab from './PointsTab.jsx'

describe('PointsTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('durak yokken boş durum + DURAK ekle butonu', async () => {
    renderWithProviders(<PointsTab />)
    expect(await screen.findByText('HENÜZ DURAK YOK')).toBeInTheDocument()
    expect(screen.getByText('+ DURAK')).toBeInTheDocument()
  })

  it('+ DURAK tıklanınca form modalı açılır', async () => {
    renderWithProviders(<PointsTab />)
    await screen.findByText('HENÜZ DURAK YOK')
    fireEvent.click(screen.getByText('+ DURAK'))
    expect(await screen.findByText('YENİ DURAK')).toBeInTheDocument()
  })
})
