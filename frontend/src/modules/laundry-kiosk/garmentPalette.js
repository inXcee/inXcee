// Kıyafet rengi ve deseni — TEK kaynak. Eskiden GarmentPicker.jsx bileşeninin
// içindeydi; renk/desen okuyan yedi dosya bir UI bileşenini import etmek
// zorunda kalıyordu. Sabitler burada, çizim yapan yerler bunu kullanır.

export const COLORS = [
  { key: 'white',    label: 'Beyaz',    hex: '#f8fafc', chipBg: '#f1f5f9', chipText: '#1e293b' },
  { key: 'black',    label: 'Siyah',    hex: '#0f172a', chipBg: '#1e293b', chipText: '#e2e8f0' },
  { key: 'gray',     label: 'Gri',      hex: '#94a3b8', chipBg: '#334155', chipText: '#e2e8f0' },
  { key: 'navy',     label: 'Lacivert', hex: '#1d4ed8', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'blue',     label: 'Mavi',     hex: '#3b82f6', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'red',      label: 'Kırmızı',  hex: '#dc2626', chipBg: '#7f1d1d', chipText: '#fca5a5' },
  { key: 'green',    label: 'Yeşil',    hex: '#16a34a', chipBg: '#14532d', chipText: '#86efac' },
  { key: 'yellow',   label: 'Sarı',     hex: '#ca8a04', chipBg: '#422006', chipText: '#fde68a' },
  { key: 'orange',   label: 'Turuncu',  hex: '#ea580c', chipBg: '#431407', chipText: '#fed7aa' },
  { key: 'purple',   label: 'Mor',      hex: '#7c3aed', chipBg: '#3b0764', chipText: '#ddd6fe' },
  { key: 'pink',     label: 'Pembe',    hex: '#db2777', chipBg: '#500724', chipText: '#fbcfe8' },
  { key: 'brown',    label: 'Kahve',    hex: '#92400e', chipBg: '#451a03', chipText: '#fed7aa' },
  { key: 'charcoal', label: 'Füme',     hex: '#4b5563', chipBg: '#1f2937', chipText: '#d1d5db' },
]

export const PATTERNS = [
  { key: 'solid',     label: 'Düz',         css: { background: '#475569' } },
  { key: 'striped-h', label: 'Çizgili',      css: { backgroundImage: 'repeating-linear-gradient(0deg,#dc2626 0px,#dc2626 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'striped-v', label: 'Dikey Çizgi',  css: { backgroundImage: 'repeating-linear-gradient(90deg,#1d4ed8 0px,#1d4ed8 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'checked',   label: 'Kareli',       css: { backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px),repeating-linear-gradient(90deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px)', backgroundColor: '#1e3a5f' } },
  { key: 'plaid',     label: 'Ekose',        css: { backgroundImage: 'repeating-linear-gradient(0deg,rgba(220,38,38,.7),rgba(220,38,38,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(90deg,rgba(29,78,216,.7),rgba(29,78,216,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(0deg,rgba(22,163,74,.4),rgba(22,163,74,.4) 12px,transparent 12px,transparent 24px)', backgroundColor: '#f8fafc' } },
  { key: 'colorful',  label: 'Renkli/Baskı', css: { background: 'conic-gradient(#7c3aed 0deg 60deg,#ec4899 60deg 120deg,#f59e0b 120deg 180deg,#10b981 180deg 240deg,#3b82f6 240deg 300deg,#ef4444 300deg 360deg)' } },
]
