import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import AvsSelfServicePage from './AvsSelfServicePage.jsx'
import ShiftsTab from './tabs/ShiftsTab.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import MealsTab from './tabs/MealsTab.jsx'
import QuickFaultTab from './tabs/QuickFaultTab.jsx'

const idleQuery = { isLoading: false, isError: false, data: undefined, refetch: () => {} }

describe('AvsSelfServicePage smoke', () => {
  it('token yokken login ekranı render olur (isim arama + giriş butonu)', () => {
    renderWithProviders(<AvsSelfServicePage />)
    expect(screen.getByPlaceholderText(/ad\/soyad ara/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /giriş yap/i })).toBeInTheDocument()
  })
})

describe('AVS sekme parçaları smoke', () => {
  it('ShiftsTab vardiya satırlarını render eder', () => {
    renderWithProviders(
      <ShiftsTab
        query={{ ...idleQuery, data: { shifts: [{ work_date: '2026-06-10', status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }] } }}
        data={{ shifts: [{ work_date: '2026-06-10', status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }] }}
      />
    )
    expect(screen.getByText(/Gündüz/)).toBeInTheDocument()
  })

  it('TasksTab housekeeping görev listesi render eder', () => {
    const data = { type: 'housekeeping', items: [{ id: 1, area: 'Oda', block: 'M1', floor: 1, task_type: 'temizlik', completed_at: null }] }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data} completeTask={{ mutate: () => {}, isPending: false }} />
    )
    expect(screen.getByText(/Oda · M1/)).toBeInTheDocument()
  })

  it('MealsTab yarın seçimi 4 öğün butonu render eder', () => {
    renderWithProviders(
      <MealsTab menuToday={[]} mealSel={{ lunch: 1 }} setMealSel={{ mutate: () => {}, isPending: false }} />
    )
    expect(screen.getAllByRole('button').length).toBe(4)
  })

  it('QuickFaultTab form alanlarını render eder', () => {
    renderWithProviders(
      <QuickFaultTab
        faultForm={{ location: '', description: '', priority: 'medium' }}
        setFaultForm={() => {}} faultPhoto={null} setFaultPhoto={() => {}}
        faultSuccess={false} setFaultSuccess={() => {}} faultError=""
        submitFault={{ mutate: () => {}, isPending: false }} myFaults={[]}
      />
    )
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2)
  })
})
