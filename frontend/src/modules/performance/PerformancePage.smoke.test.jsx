import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const kpiData = {
  period: '2026',
  summary: { reviewCount: 3, avgScore: 4.0, activeGoals: 2, goalCompletionRate: 40, positivePoints: 7 },
  departments: [
    { dept_id: 1, dept_name: 'Temizlik', reviewed_count: 2, avg_score: 3.5, avg_goal_progress: 50, positive_points: 5 },
    { dept_id: 2, dept_name: 'Güvenlik', reviewed_count: 1, avg_score: 5.0, avg_goal_progress: null, positive_points: 2 },
  ],
  goals: { open: 1, in_progress: 1, done: 2, cancelled: 1, onTime: 1, overdue: 1, completionRate: 40 },
  trend: [
    { period: '2025', avg_score: 2.0, review_count: 1 },
    { period: '2026', avg_score: 4.0, review_count: 3 },
  ],
  dimensions: { productivity: 4.0, teamwork: 4.0, attendance: 4.0, attitude: 4.0, skills: 4.0, initiative: 4.0, reliability: 4.0, communication: 4.0 },
}

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/performance/kpi')) return Promise.resolve({ data: kpiData })
      return Promise.resolve({ data: [] })
    }),
  },
}))

import PerformancePage from './PerformancePage.jsx'

describe('performance/KpiTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  async function openKpiTab() {
    renderWithProviders(<PerformancePage />)
    fireEvent.click(screen.getByText('📊 KPI / ANALİZ'))
  }

  it('özet kartları ve departman kıyasını render eder', async () => {
    await openKpiTab()
    expect(await screen.findByText('DEPARTMAN KIYAS — ORT. PUAN')).toBeInTheDocument()
    expect(screen.getByText('Temizlik')).toBeInTheDocument()
    expect(screen.getByText('Güvenlik')).toBeInTheDocument()
    expect(screen.getByText('ZAMANINDA')).toBeInTheDocument()
  })

  it('dönemsel trend ve boyut kırılımını gösterir', async () => {
    await openKpiTab()
    expect(await screen.findByText('DÖNEMSEL PUAN TRENDİ')).toBeInTheDocument()
    expect(screen.getByText('BOYUT KIRILIMI (1-5)')).toBeInTheDocument()
    expect(screen.getByText(/2026 \(3\)/)).toBeInTheDocument()
  })
})
