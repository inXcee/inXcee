import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getLaundrySettings: vi.fn(() => Promise.resolve({})),
    getRooms: vi.fn(() => Promise.resolve([
      { id: 1, block: 'M1', room_no: '101' },
      { id: 2, block: 'A', room_no: '5' },
    ])),
    getRoomOccupant: vi.fn(() => Promise.resolve({})),
    createItem: vi.fn(() => Promise.resolve({ id: 1 })),
    addPremiumGarments: vi.fn(() => Promise.resolve({})),
  },
}))

import NewItemModal, { CLOTHING_ICONS } from './NewItemModal.jsx'
import PremiumSection from './newItem/PremiumSection.jsx'
import RegularSection from './newItem/RegularSection.jsx'
import { DEFAULT_CLOTHING_TYPES } from './newItem/constants.js'

describe('NewItemModal smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('başlık + oda seçimi + kaydet butonu render olur', () => {
    renderWithProviders(<NewItemModal onClose={() => {}} />)
    expect(screen.getByText('YENİ ÇAMAŞIR KAYDI')).toBeInTheDocument()
    expect(screen.getByText('ODA SEÇİMİ')).toBeInTheDocument()
    expect(screen.getByText(/\+ KAYDET/)).toBeInTheDocument()
  })

  it('CLOTHING_ICONS re-export korunur (dış importlar kırılmaz)', () => {
    expect(CLOTHING_ICONS['Gömlek']).toBe('👔')
  })
})

describe('PremiumSection smoke', () => {
  it('başlık + hızlı giriş + tip seçimi render olur', () => {
    renderWithProviders(
      <PremiumSection
        clothingTypes={DEFAULT_CLOTHING_TYPES}
        premiumRows={[]} removePremiumRow={() => {}}
        quickPremium="" setQuickPremium={() => {}}
        parsedPremiumList={[]}
        addQuickPremiumRow={() => {}}
        gType="" setGType={() => {}}
        gForm={{ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' }}
        setGForm={() => {}} gQty={1} setGQty={() => {}}
        canAddPremium={false} addPremiumRow={() => {}}
      />
    )
    expect(screen.getByText('★ PREMIUM PARÇALAR')).toBeInTheDocument()
    expect(screen.getByText('⚡ HIZLI GİRİŞ')).toBeInTheDocument()
    expect(screen.getByText('TİP SEÇ')).toBeInTheDocument()
  })
})

describe('RegularSection smoke', () => {
  it('kıyafet çipleri + boş durumda adet stepper render olur', () => {
    renderWithProviders(
      <RegularSection
        clothingTypes={DEFAULT_CLOTHING_TYPES}
        clothing={[]} totalCount={1}
        quickCloth="" setQuickCloth={() => {}}
        parsedClothList={[]}
        addQuickClothing={() => {}}
        addClothing={() => {}} removeClothing={() => {}} updateClothing={() => {}}
        itemCount={1} setItemCount={() => {}}
      />
    )
    expect(screen.getByText(/Gömlek/)).toBeInTheDocument()
    expect(screen.getByText(/Kıyafet seçilmedi/)).toBeInTheDocument()
  })
})
