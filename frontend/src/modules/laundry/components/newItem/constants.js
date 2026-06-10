// NewItemModal sabitleri — kıyafet tipleri, ikonlar, beden/renk/desen listeleri
export const DEFAULT_CLOTHING_TYPES = [
  'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Polar','Mont','Hırka',
  'Body','İçlik','Alt Eşofman','Üst Eşofman','Boxer','Külot','Çorap',
  'Havlu Tkm','El Havlusu','Ayak Havlusu','Büyük Havlu','Ceket',
  'Yastık K.','İş Mont','İş Pantalonu','Şort','Atlet','Diğer',
]

export const CLOTHING_ICONS = {
  'Pantolon':      '👖',
  'Gömlek':        '👔',
  'T-Shirt':       '👕',
  'Kazak':         '🧥',
  'Sweat':         '👕',
  'Polar':         '🧥',
  'Mont':          '🧥',
  'Hırka':         '🧶',
  'Body':          '🩲',
  'İçlik':         '🩳',
  'Alt Eşofman':   '🩲',
  'Üst Eşofman':   '👕',
  'Boxer':         '🩲',
  'Külot':         '🩲',
  'Çorap':         '🧦',
  'Havlu Tkm':     '🏖️',
  'El Havlusu':    '🧻',
  'Ayak Havlusu':  '🧻',
  'Büyük Havlu':   '🛁',
  'Ceket':         '🥼',
  'Yastık K.':     '🛏️',
  'İş Mont':       '🦺',
  'İş Pantalonu':  '👖',
  'Şort':          '🩳',
  'Atlet':         '👕',
  'Diğer':         '📦',
}

export const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']

export const COLOR_PALETTE = [
  { name: 'Beyaz',    hex: '#f0f0f0' },
  { name: 'Siyah',    hex: '#222222' },
  { name: 'Gri',      hex: '#888888' },
  { name: 'Füme',     hex: '#4a4a4a' },
  { name: 'Lacivert', hex: '#1a2e5e' },
  { name: 'Mavi',     hex: '#2563eb' },
  { name: 'Açık Mavi',hex: '#7ec8e3' },
  { name: 'Kırmızı',  hex: '#dc2626' },
  { name: 'Yeşil',    hex: '#16a34a' },
  { name: 'Sarı',     hex: '#eab308' },
  { name: 'Turuncu',  hex: '#ea580c' },
  { name: 'Kahve',    hex: '#92400e' },
  { name: 'Bej',      hex: '#d4b896' },
  { name: 'Mor',      hex: '#7c3aed' },
  { name: 'Pembe',    hex: '#ec4899' },
]

export const PATTERN_LIST = [
  { name: 'Çizgili', bg: 'repeating-linear-gradient(90deg,#f0f0f0 0 4px,#1a2e5e 4px 8px)' },
  { name: 'Benekli', bg: 'radial-gradient(circle,#1a2e5e 2px,transparent 2px) 0 0/8px 8px,#f0f0f0' },
  { name: 'Kareli',  bg: 'repeating-conic-gradient(#888 0% 25%,#f0f0f0 0% 50%) 0 0/8px 8px' },
  { name: 'Renkli',  bg: 'repeating-linear-gradient(90deg,#e74c3c 0 6px,#f0a500 6px 12px,#2563eb 12px 18px,#16a34a 18px 24px)' },
]
