// Imza zorunlu blok listesi. Bu blokların torba intake/delivery işlemlerinde
// imza canvas görünür ve zorunlu olur. Diğer bloklarda imza alınmaz.
export const SIGN_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3', 'G', 'C'])

export function blockNeedsSignature(block) {
  return SIGN_BLOCKS.has(block)
}
