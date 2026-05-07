// AVSKAMP yatakhane bloklari — tek kaynakli config.
//
// Bloklar 3 tipe ayrilir:
//   M (Merkezi)  → ortak banyo/WC, 6 kisilik
//   S (Sosyal)   → ozel banyo, 6 kisilik (S2 kat 2 = 4 kisilik istisna)
//   Y (Yeni)     → ozel banyo, kapasite=1 placeholder (yatak sayilari sonradan girilecek)
//
// CapacityPage ve HousekeepingPage bu dosyayi tek kaynak olarak import eder.

export const BLOCKS = [
  // M tipi — ortak banyo
  { block: 'M1', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M2', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M3', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },

  // S tipi — ozel banyo
  { block: 'S1', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },
  { block: 'S2', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6, capacityException: { floor: 2, capacity: 4 } },
  { block: 'S3', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },

  // Y tipi — ozel banyo, placeholder kapasite
  { block: 'A',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A1', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A2', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A3', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A4', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'B',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'C',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'E',  type: 'Y', floors: 3, perFloor: 20, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'G',  type: 'Y', floors: 3, perFloor: 20, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'F',  type: 'Y', floors: 3, perFloor: 10, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'D',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 101 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'H',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 1   }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'J',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 1   }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
]

export const BLOCK_BY_NAME = Object.fromEntries(BLOCKS.map(b => [b.block, b]))

export const BLOCKS_BY_TYPE = {
  M: BLOCKS.filter(b => b.type === 'M').map(b => b.block),
  S: BLOCKS.filter(b => b.type === 'S').map(b => b.block),
  Y: BLOCKS.filter(b => b.type === 'Y').map(b => b.block),
}

export function getBlockConfig(name) {
  return BLOCK_BY_NAME[name]
}

// Bir kat icin beklenen oda numaralari array'i (ghost cell render etmek icin)
export function expectedRoomNos(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const start = cfg.startNo[floor]
  if (start == null) return []
  return Array.from({ length: cfg.perFloor }, (_, i) => start + i)
}

// Kat kapasitesi (S2 kat 2 = 4 istisnasi dahil)
export function getCapacity(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return 0
  if (cfg.capacityException?.floor === floor) return cfg.capacityException.capacity
  return cfg.defaultCapacity
}

// Kat chip etiketi: "101-130" veya "1-20"
export function getFloorLabel(blockName, floor) {
  const nos = expectedRoomNos(blockName, floor)
  if (nos.length === 0) return ''
  return `${nos[0]}–${nos[nos.length - 1]}`
}

// Blok tipine göre vurgu rengi (UI'da accent olarak kullanılır)
export function blockColor(blockName) {
  const t = BLOCK_BY_NAME[blockName]?.type
  if (t === 'M') return 'var(--blue)'
  if (t === 'S') return 'var(--purple)'
  if (t === 'Y') return 'var(--green)'
  return 'var(--text2)'
}
