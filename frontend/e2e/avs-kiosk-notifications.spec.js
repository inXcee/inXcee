import { test, expect, request as pwRequest } from '@playwright/test'

// Bildirim akışı (header zili) regresyon guard'ı:
// login → zil görünür → panel açılır → seed'lenen duyuru feed'de görünür → kapanır.
const API = `${process.env.E2E_BACKEND_URL || `http://localhost:${process.env.E2E_BACKEND_PORT || '3001'}`}/api`
const WORKER = `Notif Test ${Date.now()}`
const ANN_TITLE = `E2E Duyuru ${Date.now()}`
let workerId

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  const token = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  const auth = { Authorization: `Bearer ${token}` }
  const w = await ctx.post(`${API}/avs-workers`, { headers: auth, data: { full_name: WORKER, role_label: 'Temizlik Görevlisi' } })
  workerId = (await w.json()).id
  await ctx.put(`${API}/avs-workers/${workerId}/pin`, { headers: auth, data: { new_pin: '1234' } })
  // Feed'in dolması için aktif bir duyuru
  await ctx.post(`${API}/announcements`, { headers: auth, data: { title: ANN_TITLE, body: 'E2E bildirim akışı testi içeriği' } })
  await ctx.dispose()
})

async function loginKiosk(page) {
  await page.goto('/avs-kiosk')
  await page.getByPlaceholder('Ad/soyad ara…').fill('Notif Test')
  await page.getByRole('button', { name: new RegExp(WORKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  await expect(page.getByRole('tab', { name: /Vardiya/ })).toBeVisible({ timeout: 10_000 })
}

test('bildirim zili: panel açılır + seed duyuru feed\'de görünür + kapanır', async ({ page }) => {
  await loginKiosk(page)

  // Header zili görünür (aria-label "Bildirimler")
  const bell = page.getByRole('button', { name: 'Bildirimler' })
  await expect(bell).toBeVisible()

  // Panel açılır (dialog) + seed'lenen duyuru içeride
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Bildirimler' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText(ANN_TITLE)).toBeVisible({ timeout: 10_000 })

  // Kapat → panel kapanır
  await page.getByRole('button', { name: 'Kapat' }).click()
  await expect(panel).toBeHidden()
})
