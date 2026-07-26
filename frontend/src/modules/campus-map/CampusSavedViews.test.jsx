import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampusSavedViews from './CampusSavedViews.jsx'

describe('CampusSavedViews', () => {
  beforeEach(() => localStorage.clear())

  it('görünümü kullanıcı bazında kaydeder, uygular ve siler', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <CampusSavedViews
        userKey="manager-7"
        view={{ mode: 'faults', typeFilter: 'A', showLabels: false, heatCloud: true }}
        onApply={onApply}
      />,
    )

    await user.click(screen.getByText('＋ GÖRÜNÜMÜ KAYDET'))
    await user.type(screen.getByLabelText('Görünüm adı'), 'Sabah turu')
    await user.click(screen.getByText('✓'))

    expect(JSON.parse(localStorage.getItem('yys-campus-views:manager-7'))).toEqual([
      expect.objectContaining({
        name: 'Sabah turu',
        value: { mode: 'faults', typeFilter: 'A', showLabels: false, heatCloud: true },
      }),
    ])

    await user.click(screen.getByText('Sabah turu'))
    expect(onApply).toHaveBeenCalledWith({ mode: 'faults', typeFilter: 'A', showLabels: false, heatCloud: true })

    await user.click(screen.getByLabelText('Sabah turu görünümünü sil'))
    expect(screen.queryByText('Sabah turu')).not.toBeInTheDocument()
  })
})
