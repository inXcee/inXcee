import os from 'node:os'
import { defineConfig } from 'vitest/config'

// Fork havuzu ZORUNLU. Varsayılan thread havuzunda suite TÜM testler geçtikten
// sonra kapanışta SIGSEGV veriyor (better-sqlite3 native modülü worker thread'de
// sökülürken). Sonuç exit 139 oluyor ve "testler geçti" ile "çöktü" ayırt
// edilemiyor.
//
// Bu sadece rahatsızlık değildi: sunucudaki pre-deploy-check.sh aynı suite'i
// koşuyor ve çökme deploy'u backend testlerinin ortasında durduruyordu
// (2026-08-09).
//
// Ama fork havuzu bedava değil — her fork uygulamayı ve native modülü baştan
// yükler. Canlı sunucu 2 çekirdekli / 4 GB; vitest orada 4 fork açıp makineyi
// dövüyordu ve deploy uzuyordu. Fork sayısı çekirdeğe bağlanır: küçük makinede
// 2, geliştirme makinesinde daha fazla.
// Bir çekirdek boşta bırakılır: küçük makinede (2 çekirdek → 2 fork) makineyi
// dövmez, geliştirme makinesinde (12 çekirdek → 11) hızı kısmaz. Sabit bir üst
// sınır koymak büyük makineyi boşuna yavaşlatıyordu (70 sn → 89 sn).
const cekirdek = os.cpus()?.length || 2
const maxForks = Math.max(2, cekirdek - 1)

export default defineConfig({
  test: {
    globalSetup: './src/test-setup.js',
    pool: 'forks',
    poolOptions: { forks: { maxForks, minForks: 1 } },
  },
})
