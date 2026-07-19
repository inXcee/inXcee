import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import TaskPhotoGallery from './TaskPhotoGallery.jsx'

const task = { id: 5, area: 'M1 Oda 101', block: 'M1', floor: 1 }

describe('housekeeping/TaskPhotoGallery smoke', () => {
  it('başlığı ve kapat butonunu gösterir, kapatınca onClose çağrılır', () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskPhotoGallery task={task} isManager onClose={onClose} onChanged={() => {}} />)
    expect(screen.getByText(/M1 Oda 101/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('✕ KAPAT'))
    expect(onClose).toHaveBeenCalled()
  })

  it('yönetici için yeni fotoğraf ekleme bölümünü gösterir', () => {
    renderWithProviders(<TaskPhotoGallery task={task} isManager onClose={() => {}} onChanged={() => {}} />)
    expect(screen.getByText('YENİ FOTOĞRAF EKLE')).toBeInTheDocument()
  })
})
