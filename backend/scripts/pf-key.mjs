// Özel finans kasası API anahtarları — yalnız sunucuda, elle.
//
//   node --env-file=../.env scripts/pf-key.mjs create hermes read,write
//   node --env-file=../.env scripts/pf-key.mjs list
//   node --env-file=../.env scripts/pf-key.mjs revoke 3
//
// Anahtar yalnız oluşturulurken bir kez gösterilir; kasada SHA-256 özeti tutulur.
// Kasa dosyası: PRIVATE_FINANCE_DB_PATH, yoksa DB_PATH'in yanındaki finance-vault.db.
import { createApiKey, listApiKeys, revokeApiKey, vaultPath } from '../src/modules/private-finance/vault.js'

const [cmd, a, b] = process.argv.slice(2)
if (!process.env.DB_PATH && !process.env.PRIVATE_FINANCE_DB_PATH) {
  process.stderr.write('DB_PATH ya da PRIVATE_FINANCE_DB_PATH gerekli (--env-file=../.env)\n')
  process.exit(2)
}
process.stderr.write(`kasa: ${vaultPath()}\n`)
if (cmd === 'create') {
  const k = createApiKey(a, (b || 'read').split(','))
  process.stdout.write(`${JSON.stringify(k)}\n`)
} else if (cmd === 'list') {
  process.stdout.write(`${JSON.stringify(listApiKeys(), null, 1)}\n`)
} else if (cmd === 'revoke') {
  process.stdout.write(revokeApiKey(Number(a)) ? 'iptal edildi\n' : 'bulunamadı / zaten iptal\n')
} else {
  process.stderr.write('kullanım: pf-key.mjs create <ad> <read,write> | list | revoke <id>\n')
  process.exit(2)
}
