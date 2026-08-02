import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BlockHeatmap } from './BlockHeatmap.jsx'

vi.mock('../../hooks/useReveal.js', () => ({ useReveal: () => [{ current: null }, true] }))

describe('BlockHeatmap', () => {
  it('22 blok hücresi render eder', () => {
    render(<BlockHeatmap blocks={[]} reduced />)
    expect(screen.getAllByTestId('heat-cell')).toHaveLength(22)
  })
  it('blok adını gösterir (M1)', () => {
    render(<BlockHeatmap blocks={[]} reduced />)
    expect(screen.getByText('M1')).toBeInTheDocument()
  })
})
