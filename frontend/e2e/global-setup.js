import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TMP = resolve(__dirname, '.tmp')

export default async function globalSetup() {
  mkdirSync(TMP, { recursive: true })
  mkdirSync(resolve(TMP, 'uploads'), { recursive: true })
}
