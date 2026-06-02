import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  todayStr, KPI, Section, BarList, Stat, Empty, ModalShell, Label, ModalActions, EmptyState,
} from './shared.jsx'

describe('transport/shared', () => {
  it('todayStr ISO tarih (YYYY-MM-DD) döner', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('KPI etiket + değer + alt-metin gösterir', () => {
    render(<KPI label="VARDİYADA" value={12} color="var(--accent)" sub="%80 kapsama" />)
    expect(screen.getByText('VARDİYADA')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('%80 kapsama')).toBeInTheDocument()
  })

  it('Section başlık + içerik render eder', () => {
    render(<Section title="TEST BÖLÜM"><span>içerik</span></Section>)
    expect(screen.getByText('TEST BÖLÜM')).toBeInTheDocument()
    expect(screen.getByText('içerik')).toBeInTheDocument()
  })

  it('BarList en çok 15 öğe + fazlasını "+N daha" gösterir', () => {
    const items = Array.from({ length: 18 }, (_, i) => ({ label: `L${i}`, sub: 's', value: i + 1 }))
    render(<BarList items={items} />)
    expect(screen.getByText('+3 daha')).toBeInTheDocument()
  })

  it('Stat + Empty + EmptyState çökmeden render olur', () => {
    render(<><Stat label="Gün" value={5} /><Empty msg="kayıt yok" /><EmptyState icon="🚌" title="BOŞ" desc="yok" /></>)
    expect(screen.getByText('Gün')).toBeInTheDocument()
    expect(screen.getByText('kayıt yok')).toBeInTheDocument()
    expect(screen.getByText('BOŞ')).toBeInTheDocument()
  })

  it('ModalShell kapat + Label + ModalActions çalışır', () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    render(<ModalShell title="MODAL" onClose={onClose}><Label>ALAN</Label><ModalActions onClose={onClose} onSave={onSave} /></ModalShell>)
    expect(screen.getByText('MODAL')).toBeInTheDocument()
    expect(screen.getByText('ALAN')).toBeInTheDocument()
    fireEvent.click(screen.getByText('KAYDET'))
    expect(onSave).toHaveBeenCalled()
    fireEvent.click(screen.getByText('İPTAL'))
    expect(onClose).toHaveBeenCalled()
  })
})
