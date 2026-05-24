import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TMP = resolve(__dirname, '.tmp')

export default async function globalSetup() {
  if (existsSync(TMP)) {
    try { rmSync(TMP, { recursive: true, force: true }) }
    catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e }
  }
  mkdirSync(TMP, { recursive: true })
  mkdirSync(resolve(TMP, 'uploads'), { recursive: true })
}
