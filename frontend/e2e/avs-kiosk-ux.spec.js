import { test, expect, request as pwRequest } from '@playwright/test'
import Database from 'better-sqlite3'

const API = `${process.env.E2E_BACKEND_URL || `http://localhost:${process.env.E2E_BACKEND_PORT || '3001'}`}/api`
const PINNED = `UX Test ${Date.now()}`
let pinnedId
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlY7QAAAABJRU5ErkJggg==', 'base64')

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  const token = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  const auth = { Authorization: `Bearer ${token}` }
  const w = await ctx.post(`${API}/avs-workers`, { headers: auth, data: { full_name: PINNED, role_label: 'Temizlik Görevlisi' } })
  pinnedId = (await w.json()).id
  await ctx.put(`${API}/avs-workers/${pinnedId}/pin`, { headers: auth, data: { new_pin: '1234' } })
  await ctx.dispose()
})

// /avs-kiosk = ortak tablet, /saha = personelin kendi telefonu (kişisel oturum); giriş ekranı aynı
async function loginKiosk(page, path = '/avs-kiosk') {
  await page.goto(path)
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).click()
  }
  // PIN 4 ya da 6 haneli olabildiği için giriş artık açık basışla yapılır (8b763ab6).
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  await expect(page.getByRole('tab', { name: /Ana Sayfa/ })).toBeVisible({ timeout: 10_000 })
}

async function expectNoHorizontalOverflow(page, viewportWidth) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth)
}

test('numpad ile giris + alt nav ile sekme gezme + varsayilan TR', async ({ page }) => {
  await page.goto('/avs-kiosk')
  // Varsayilan TR (localStorage temiz) — baslik Turkce
  await expect(page.getByRole('heading', { name: 'AVS Personel Kiosk' })).toBeVisible()

  // Isimle ara + sec
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()

  // Dokunmatik numpad ile 1-2-3-4, sonra Giriş Yap (PIN 4 ya da 6 haneli olabilir)
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  // Giris sonrasi alt nav gorunur; temizlik grubunda Odalar + Çamaşır önde, Vardiya "Daha fazla"da (saha ekranı)
  await expect(page.getByRole('tab', { name: /Ana Sayfa/ })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('tab', { name: /Odalar/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Çamaşır/ })).toBeVisible()

  // Profil sekmesi nav taşmasıyla "Daha fazla" sheet'ine taşındı (10 sekme > 5 slot)
  await page.getByRole('button', { name: /Daha fazla/ }).click()
  await expect(page.getByRole('menuitem', { name: /Vardiya/ })).toBeVisible()
  await page.getByRole('menuitem', { name: /Profil/ }).click()
  await expect(page.getByText('Kişisel Bilgiler')).toBeVisible({ timeout: 10_000 })
})

test('Kartlarım: giriş + yemek kartı ayrı görünür (QR ile)', async ({ page }) => {
  await page.goto('/avs-kiosk')
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  await expect(page.getByRole('tab', { name: /Ana Sayfa/ })).toBeVisible({ timeout: 10_000 })

  // "Kartlarım" nav taşmasında ("Daha fazla")
  await page.getByRole('button', { name: /Daha fazla/ }).click()
  await page.getByRole('menuitem', { name: /Kartlarım/ }).click()

  // İki ayrı kart + her birinin QR'ı (lazy üretilir)
  await expect(page.getByText('Giriş Kartı')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Yemek Kartı')).toBeVisible()
  await expect(page.locator('img[alt="access"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="meal"]')).toBeVisible()
})

// Temizlik grubunda Görevler'in yerini Odalar panosu aldı (docs/saha-ekrani.md): görev önceden üretilmez,
// oda işaretlenince açılır; fotoğraf isteğe bağlı, eklenirse temizlik kanıtı olarak kaydedilir.
test('Odalar panosu (/saha): fotoğraflı temizlendi + geri al + doluluk + odadan konumlu arıza bildirimi', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await loginKiosk(page, '/saha')
  await page.getByRole('tab', { name: /Odalar/ }).click()
  // Blok çipinde ad + sayaç var; A1–A4 de olduğu için adı tam "A" olan çip seçilir
  const blockA = page.locator('button[aria-pressed]').filter({ has: page.getByText('A', { exact: true }) })
  await blockA.click()
  await expect(blockA).toHaveAttribute('aria-pressed', 'true')

  // Kutucuğun adı oda no + durum: "101" → "101, temizlendi" / "101, dolu"
  const tile = page.getByRole('button', { name: /^\d+$/ }).first()
  await expect(tile).toBeVisible({ timeout: 10_000 })
  await expectNoHorizontalOverflow(page, 360)
  const roomNo = await tile.getAttribute('aria-label')
  const sheet = page.getByRole('dialog', { name: `A-${roomNo}` })

  await tile.click()
  await sheet.locator('input[type="file"]').setInputFiles({ name: 'temizlik.png', mimeType: 'image/png', buffer: PNG })
  await expect(sheet.getByRole('button', { name: 'Fotoğrafı kaldır' })).toBeVisible()
  await sheet.getByRole('button', { name: /Temizlendi$/ }).click()
  const toast = page.getByRole('status').filter({ hasText: `A-${roomNo} temizlendi` })
  await expect(toast).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: `${roomNo}, temizlendi` })).toBeVisible()

  await toast.getByRole('button', { name: /Geri al/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Geri alındı' })).toBeVisible()
  const idleTile = page.getByRole('button', { name: roomNo, exact: true })
  await expect(idleTile).toBeVisible()

  await idleTile.click()
  await sheet.getByRole('button', { name: /Dolu$/ }).click()
  await expect(sheet.getByRole('button', { name: /Dolu$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: `${roomNo}, dolu` })).toBeVisible()

  await sheet.getByRole('button', { name: /Arıza bildir/ }).click()
  await expect(page.getByPlaceholder('Konum yaz veya yukarıdan seç')).toHaveValue(`A Oda ${roomNo}`)
  await page.setViewportSize({ width: 412, height: 850 })
  await expectNoHorizontalOverflow(page, 412)
  await page.getByPlaceholder(/Sorunu ve gördüğünüz durumu/).fill('Priz kapağı gevşemiş ve güvenli görünmüyor')
  await page.getByRole('button', { name: /Elektrik/ }).click()
  await page.getByRole('button', { name: /^Arıza Bildir$/ }).click()
  await expect(page.getByText(/^ARZ-\d+$/)).toBeVisible({ timeout: 10_000 })
})

// Oda QR'ı (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md): kapıdaki etiket telefon kamerasıyla okutulunca
// /saha?qr= ile o odanın sayfası "QR ile doğrulandı" açılır; sakin portalı adresi (/r/token) saha oturumlu telefonda
// saha ekranına döner. Token yalnız etikette: test onu E2E veritabanından salt okunur okur.
test('QR okutma: /saha?qr= odanın sayfasını doğrulanmış açar; portal görevliyi sahaya yollar', async ({ page }) => {
  const ctx = await pwRequest.newContext()
  const admin = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  await ctx.post(`${API}/location-portal/locations/generate-missing`, { headers: { Authorization: `Bearer ${admin}` }, data: { block: 'A' } })
  await ctx.dispose()
  const db = new Database(process.env.E2E_DB_PATH, { readonly: true, fileMustExist: true })
  const { token } = db.prepare(`
    SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
    WHERE sl.qr_location='A-101' AND q.status='active'
  `).get()
  db.close()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/saha?qr=${encodeURIComponent(`https://avskamp.com/r/${token}`)}`)
  await expect(page).not.toHaveURL(/qr=/)
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  for (const digit of ['1', '2', '3', '4']) await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).click()
  await page.getByRole('button', { name: 'Giriş Yap' }).click()

  const sheet = page.getByRole('dialog', { name: 'A-101' })
  await expect(sheet.getByText(/QR ile doğrulandı/)).toBeVisible({ timeout: 10_000 })
  await sheet.getByRole('button', { name: /Temizlendi$/ }).click()
  await expect(page.getByRole('button', { name: /^101, temizlendi, QR ile doğrulandı/ })).toBeVisible({ timeout: 10_000 })
  const toast = page.getByRole('status').filter({ hasText: 'A-101 temizlendi' })
  await toast.getByRole('button', { name: /Geri al/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Geri alındı' })).toBeVisible()

  await page.goto(`/r/${token}`)
  await expect(page).toHaveURL(/\/saha$/, { timeout: 10_000 })
  await expect(page.getByRole('dialog', { name: 'A-101' })).toBeVisible({ timeout: 10_000 })
})
