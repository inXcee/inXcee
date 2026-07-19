import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import LiveOccupancyBoard from './LiveOccupancyBoard.jsx'

describe('LiveOccupancyBoard smoke', () => {
  it('canlı kontrol çubuğunu ve özet sayaçlarını gösterir', () => {
    renderWithProviders(<LiveOccupancyBoard onPersonClick={() => {}} />)
    // Bugün + canlı modda başlar → CANLI çipi
    expect(screen.getByText(/CANLI/)).toBeInTheDocument()
    expect(screen.getByText(/kişi sahada/)).toBeInTheDocument()
    expect(screen.getByText(/boş nokta/)).toBeInTheDocument()
    expect(screen.getByText('SAAT')).toBeInTheDocument()
  })
})
