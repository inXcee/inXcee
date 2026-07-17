import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import ScheduleShareModal from './ScheduleShareModal.jsx'

const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12']

describe('ScheduleShareModal smoke', () => {
  it('PDF ve görsel çıktı ayarlarını gösterir', () => {
    renderWithProviders(
      <ScheduleShareModal
        onClose={() => {}}
        weekStart={WEEK[0]}
        weekEnd={WEEK[6]}
        weekDays={WEEK}
        staffGrid={[]}
        visibleGrid={[]}
        gridSearch=""
        statusFilter="all"
        deptFilter=""
        shiftDefs={[]}
      />
    )

    expect(screen.getByText('ÇIKTI MERKEZİ')).toBeInTheDocument()
    expect(screen.getByText('PDF / Yazdır')).toBeInTheDocument()
    expect(screen.getByText('Çizelge PNG')).toBeInTheDocument()
    // İçerik / gün / imza kontrolleri
    expect(screen.getByText('İçerik')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İmza' })).toBeInTheDocument()
    expect(screen.getByText('İzin / OFF / raporlu özetini göster')).toBeInTheDocument()
    expect(screen.getByText('Ayarları Sıfırla')).toBeInTheDocument()
  })
})
