// RoomsSection alt bileşenlerinin paylaştığı sabitler ve pure helper'lar.
// RoomCard, PremiumGarmentsCard ve RoomDetailPanel ortak kullanır.

export const STATUS_LABEL = {
  dirty: 'Sepette', pending_collection: 'Bekliyor', washing: 'Yıkanıyor',
  ironing: 'Ütüde', ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
}

export const STATUS_COLOR = {
  dirty: 'var(--accent)', pending_collection: 'var(--accent3)', washing: 'var(--blue)',
  ironing: '#a78bfa', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

export function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffH = (Date.now() - d.getTime()) / 36e5
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}dk önce`
  if (diffH < 24) return `${Math.round(diffH)}sa önce`
  const diffD = diffH / 24
  if (diffD < 30) return `${Math.round(diffD)}g önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })
}
