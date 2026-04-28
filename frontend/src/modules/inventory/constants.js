export const CATEGORIES = [
  { key: 'laundry', label: 'Çamaşır', color: 'var(--blue)', icon: '♨', bg: 'rgba(52,152,219,.08)' },
  { key: 'maintenance', label: 'Bakım', color: 'var(--amber)', icon: '⚙', bg: 'rgba(240,165,0,.08)' },
  { key: 'housekeeping', label: 'Temizlik', color: 'var(--green)', icon: '◈', bg: 'rgba(39,201,106,.08)' },
  { key: 'general', label: 'Genel', color: 'var(--purple)', icon: '▨', bg: 'rgba(155,89,182,.08)' },
]

export const UNITS = ['adet', 'kg', 'litre', 'paket', 'kutu', 'set', 'metre', 'g', 'ml']

export const MOVE_LABEL = { in: 'GİRİŞ', out: 'ÇIKIŞ', count: 'SAYIM', initial: 'KAYIT' }
export const MOVE_COLOR = { in: 'var(--green)', out: 'var(--red)', count: 'var(--blue)', initial: 'var(--text3)' }

export const TABS = [
  { key: 'stock', label: 'STOK', icon: '▦' },
  { key: 'receipt', label: 'MAL GIRIS', icon: '↓' },
  { key: 'checkouts', label: 'TESLIMLER', icon: '→' },
  { key: 'suppliers', label: 'TEDARIKCI', icon: '⛓' },
  { key: 'po', label: 'SIPARIS', icon: '📦' },
  { key: 'requests', label: 'TALEPLER', icon: '📝' },
  { key: 'lots', label: 'LOT/SKT', icon: '⏳' },
  { key: 'reports', label: 'RAPOR', icon: '📊' },
  { key: 'history', label: 'HAREKETLER', icon: '↺' },
]

export const INIT_F = { item_name: '', quantity: 0, unit: 'adet', reorder_threshold: 0, category: 'general', location: '', unit_price: 0 }

export const fmt = d => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
export const fmtDate = d => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
export const money = v => v > 0 ? v.toLocaleString('tr-TR', { minimumFractionDigits: 0 }) + ' TL' : '-'
export const cat = key => CATEGORIES.find(c => c.key === key)
