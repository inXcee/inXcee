import { test, expect, request as pwRequest } from '@playwright/test'

const API = 'http://localhost:3001/api'
const PINNED = `UX Test ${Date.now()}`
let pinnedId

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  const token = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  const auth = { Authorization: `Bearer ${token}` }
  const w = await ctx.post(`${API}/avs-workers`, { headers: auth, data: { full_name: PINNED, role_label: 'Temizlik Görevlisi' } })
  pinnedId = (await w.json()).id
  await ctx.put(`${API}/avs-workers/${pinnedId}/pin`, { headers: auth, data: { new_pin: '1234' } })
  await ctx.dispose()
})

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
