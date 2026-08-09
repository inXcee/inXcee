import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './src/test-setup.js',
    // Fork havuzu ZORUNLU. Varsayılan thread havuzunda suite TÜM testler
    // geçtikten sonra kapanışta SIGSEGV veriyor (better-sqlite3 native modülü
    // worker thread'de sökülürken). Sonuç exit 139 oluyor ve "testler geçti" ile
    // "çöktü" ayırt edilemiyor.
    //
    // Bu sadece rahatsızlık değildi: sunucudaki pre-deploy-check.sh aynı suite'i
    // koşuyor ve çökme deploy'u backend testlerinin ortasında sessizce
    // durduruyordu — PM2 reload adımına hiç gelinmiyor, systemd yine de
    // "success" diyordu (2026-08-09, commit 206f588a canlıya çıkmadı).
    pool: 'forks',
  },
})
