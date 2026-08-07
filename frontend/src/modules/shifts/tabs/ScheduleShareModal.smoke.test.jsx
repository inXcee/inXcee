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
    // "PDF / Yazdır" tek düğmeydi ve aslında yalnız yazdırma önizlemesi açıyordu;
    // gerçek PDF indirmesi ayrı bir eylem olduğu için ikisi ayrıldı.
    expect(screen.getByText('Yazdır')).toBeInTheDocument()
    expect(screen.getByText(/İmza PDF indir/)).toBeInTheDocument()
    expect(screen.getByText('Çizelge PNG')).toBeInTheDocument()
    expect(screen.getByText('İmza PNG')).toBeInTheDocument()
    expect(screen.getByText('Tek sayfa PNG, birden fazla bölüm veya sayfa tek ZIP paketi olur.')).toBeInTheDocument()
    // İçerik / gün / imza kontrolleri
    expect(screen.getByText('İçerik')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İmza' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Haftalık Föy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Günlük Liste' })).toBeInTheDocument()
    expect(screen.getByText('Az sayfa modu: personeller birleşik listelenir, bölüm adı grubun üstünde tek şerit olarak gösterilir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Az Sayfa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bölüm Bazlı' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ekonomik 25' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dengeli 18' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rahat 12' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '25 - ekonomik / az sayfa' })).toBeInTheDocument()
    expect(screen.getByText('Bölüm adını personel grubunun üstünde şerit olarak göster')).toBeInTheDocument()
    expect(screen.getByText('Çalışma noktası ve görev bilgisi')).toBeInTheDocument()
    expect(screen.getByText('Ayarları Sıfırla')).toBeInTheDocument()
  })
})
