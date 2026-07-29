import { test, expect, request as pwRequest } from '@playwright/test'

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
  await ctx.post(`${API}/housekeeping/tasks/generate-daily`, { headers: auth })
  await ctx.dispose()
})

async function loginKiosk(page) {
  await page.goto('/avs-kiosk')
  await page.getByPlaceholder('Ad/soyad ara…').fill('UX Test')
  await page.getByRole('button', { name: new RegExp(PINNED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).click()
  }
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

  // Dokunmatik numpad ile 1-2-3-4 (4. hanede otomatik giris)
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  // Giris sonrasi alt nav gorunur
  await expect(page.getByRole('tab', { name: /Vardiya/ })).toBeVisible({ timeout: 10_000 })

  // Profil sekmesi nav taşmasıyla "Daha fazla" sheet'ine taşındı (10 sekme > 5 slot)
  await page.getByRole('button', { name: /Daha fazla/ }).click()
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
  await expect(page.getByRole('tab', { name: /Vardiya/ })).toBeVisible({ timeout: 10_000 })

  // "Kartlarım" nav taşmasında ("Daha fazla")
  await page.getByRole('button', { name: /Daha fazla/ }).click()
  await page.getByRole('menuitem', { name: /Kartlarım/ }).click()

  // İki ayrı kart + her birinin QR'ı (lazy üretilir)
  await expect(page.getByText('Giriş Kartı')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Yemek Kartı')).toBeVisible()
  await expect(page.locator('img[alt="access"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="meal"]')).toBeVisible()
})

test('temizlik fotoğrafı zorunlu + görevden konumlu arıza bildirimi', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await loginKiosk(page)
  await expectNoHorizontalOverflow(page, 360)
  await page.getByRole('tab', { name: /Görev/ }).click()
  await expectNoHorizontalOverflow(page, 360)

  const pendingRoom = page.locator('button').filter({ hasText: /^\d+$/ }).first()
  await expect(pendingRoom).toBeVisible({ timeout: 10_000 })
  await pendingRoom.click()

  const completeButton = page.getByRole('button', { name: /Tamamla/ })
  await expect(completeButton).toBeDisabled()
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: 'temizlik.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(page.getByText(/1\/3/)).toBeVisible()
  await expect(completeButton).toBeEnabled()
  await completeButton.click()
  await expect(page.getByText(/1\/3/)).not.toBeVisible({ timeout: 10_000 })

  const anotherRoom = page.locator('button').filter({ hasText: /^\d+$/ }).first()
  await anotherRoom.click()
  await page.getByRole('button', { name: /Arıza bildir/i }).click()
  await expect(page.getByText(/Temizlik görevinden bildiriliyor/)).toBeVisible()
  await page.setViewportSize({ width: 412, height: 850 })
  await expectNoHorizontalOverflow(page, 412)
  await page.getByPlaceholder(/Sorunu ve gördüğünüz durumu/).fill('Priz kapağı gevşemiş ve güvenli görünmüyor')
  await page.getByRole('button', { name: /Elektrik/ }).click()
  await page.getByRole('button', { name: /^Arıza Bildir$/ }).click()
  await expect(page.getByText(/^ARZ-\d+$/)).toBeVisible({ timeout: 10_000 })
})
