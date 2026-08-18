import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { initDB } from './shared/db/index.js'
import { seedDev } from './shared/db/seed.js'

// HER KAYITLI GET UCUNU GERÇEKTEN ÇAĞIRAN DEĞİŞMEZ TEST.
//
// Bu oturumda dört hata aynı sınıftan çıktı: birim testi geçen ama bağlanmamış
// kod. En acıtanı `/api/laundry/card-coverage` idi — fonksiyon yazılmış, test
// edilmiş, ama routes.js'e import EDİLMEMİŞTİ. 2793 test geçiyordu; uç her
// çağrıda ReferenceError atıp 500 dönüyordu.
//
// Uç başına test yazmak 195 dosya demekti. Bunun yerine tek bir değişmez:
// kayıtlı her GET ucu çağrılır ve 500 DÖNMEMESİ beklenir. 4xx serbesttir —
// eksik parametre, bulunamayan kayıt, yetki: hepsi meşru cevaplardır. 500 ise
// neredeyse her zaman bir programlama hatasıdır.
//
// Kapsam bilerek GET ile sınırlı: POST/PUT/DELETE gövde ister ve veri değiştirir.

let adminToken

// Ağır/akış uçları: doğruluğu kendi testlerinde ölçülüyor, burada yalnız
// süreyi şişirirler. Atlananlar test çıktısında AÇIKÇA yazılır — sessiz
// kapsam daralması "hepsi denendi" gibi okunmasın.
const ATLA = [
  /\/metrics$/,                    // Bearer METRICS_TOKEN ister, ayrı testi var
  /\.pdf$/, /\.xlsx$/, /\.svg$/, /\.png$/, /\.zip$/, /\.csv$/,
  /\/export\//,
  /notifications\/stream$/,        // SSE — açık kalır
  /\/backup\/download/,
]

function kayitliGetUclari(expressApp) {
  const bulunan = []
  const gez = (stack, onek = '') => {
    for (const katman of stack || []) {
      if (katman.route) {
        const yol = onek + (katman.route.path === '/' ? '' : katman.route.path)
        if (katman.route.methods?.get) bulunan.push(yol)
        continue
      }
      if (katman.name === 'router' && katman.handle?.stack) {
        // Express, mount yolunu regexp'e çevirir; kaynağından geri okuyoruz.
        const kaynak = katman.regexp?.source || ''
        const parca = kaynak
          .replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/')
          .replace(/\$$/, '').replace(/\?\(\?=\/\|\$\)/, '')
        gez(katman.handle.stack, onek + (parca === '/' ? '' : parca))
      }
    }
  }
  gez(expressApp._router?.stack)
  return [...new Set(bulunan)]
}

// Yol parametrelerini gerçekçi bir değerle doldur: 1 numaralı kayıt çoğu
// tabloda vardır; yoksa 404 döner, o da kabul edilebilir bir cevaptır.
const doldur = (yol) => yol.replace(/:[A-Za-z_][\w]*/g, '1')

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  expect(adminToken).toBeTruthy()
})

describe('kayıtlı GET uçları', () => {
  it('hiçbiri 500 dönmez', async () => {
    const uclar = kayitliGetUclari(app).filter(y => y.startsWith('/api/'))
    expect(uclar.length).toBeGreaterThan(100)

    const atlanan = uclar.filter(y => ATLA.some(re => re.test(y)))
    const denenecek = uclar.filter(y => !ATLA.some(re => re.test(y)))

    const patlayan = []
    for (const yol of denenecek) {
      let res
      try {
        res = await request(app).get(doldur(yol)).set({ Authorization: `Bearer ${adminToken}` })
      } catch (err) {
        patlayan.push(`${yol} → istek atılamadı: ${err.message}`)
        continue
      }
      // 503 = bağımlılık yapılandırılmamış (push anahtarı, metrics token…) —
      // meşru bir cevap. 500 ise neredeyse her zaman programlama hatasıdır.
      if (res.status === 500 || res.status === 502 || res.status === 504) {
        patlayan.push(`${yol} → ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`)
      }
    }

    // Atlananlar sayıyla yazılır: kapsam daralması görünür olsun.
    process.stdout.write(
      `\n  [uç taraması] ${denenecek.length} uç denendi, ${atlanan.length} atlandı ` +
      `(ağır/akış: ${atlanan.join(', ') || 'yok'})\n`,
    )

    expect(patlayan).toEqual([])
  }, 300000)
})
