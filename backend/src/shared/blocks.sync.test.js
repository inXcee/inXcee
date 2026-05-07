import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendBlocks = resolve(__dirname, 'blocks.js')
const frontendBlocks = resolve(__dirname, '../../../frontend/src/shared/blocks.js')

describe('shared/blocks.js — backend ↔ frontend sync', () => {
  it('backend ve frontend kopyalari birebir aynidir', () => {
    const a = readFileSync(backendBlocks, 'utf8')
    const b = readFileSync(frontendBlocks, 'utf8')
    if (a !== b) {
      throw new Error(
        'backend/src/shared/blocks.js ile frontend/src/shared/blocks.js farkli.\n' +
        'Bir tarafi guncelledikten sonra diger tarafi da kopyala (cp komutu).'
      )
    }
    expect(a).toBe(b)
  })
})
