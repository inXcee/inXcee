import { BLOCKS_BY_TYPE } from '../../shared/blocks.js'

// Imza zorunlu blok listesi. Bu blokların torba intake/delivery işlemlerinde
// imza canvas görünür ve zorunlu olur. Diğer bloklarda imza alınmaz.
// M ve S tipi bloklar tek kaynaktan (blocks.js) gelir; G ve C ise Y tipi
// olmasına rağmen iş kuralı gereği imza istenir (özel istisna).
export const SIGN_BLOCKS = new Set([
  ...BLOCKS_BY_TYPE.M,
  ...BLOCKS_BY_TYPE.S,
  'G', 'C',
])

export function blockNeedsSignature(block) {
  return SIGN_BLOCKS.has(block)
}
